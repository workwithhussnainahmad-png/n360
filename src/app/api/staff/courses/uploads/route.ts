import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveCourseStreamingSettings } from "@/lib/course-streaming";
import { getTenantContext, requireRole } from "@/lib/rbac";

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  contentType: z.string().trim().regex(/^video\//),
}).strict();

function muxAuthorization(credentials: Record<string, string>) {
  return `Basic ${Buffer.from(`${credentials.tokenId}:${credentials.tokenSecret}`).toString("base64")}`;
}

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid video file and enter a lecture title" }, { status: 400 });
  const institutionId = getTenantContext(session);
  const settings = await getEffectiveCourseStreamingSettings(institutionId, session.userId);
  if (!settings) return NextResponse.json({ error: "Course streaming is not configured" }, { status: 409 });

  if (settings.provider === "MUX") {
    if (!settings.credentials.signingKeyId || !settings.credentials.signingPrivateKey) {
      return NextResponse.json(
        { error: "Protected Mux playback is not ready. Save the institution Mux credentials again with System Write permission." },
        { status: 409 },
      );
    }
    const response = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization: muxAuthorization(settings.credentials),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cors_origin: "*",
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ["signed"],
          video_quality: "plus",
          passthrough: `nisaab360:${institutionId}:${session.userId}`,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => null) as { data?: { id?: string; url?: string } } | null;
    if (!response.ok || !payload?.data?.id || !payload.data.url) {
      return NextResponse.json({ error: "Mux could not create a protected upload. Confirm Video Write permission." }, { status: 502 });
    }
    return NextResponse.json({ provider: "MUX", uploadId: payload.data.id, uploadUrl: payload.data.url, uploadMethod: "PUT", headers: { "Content-Type": parsed.data.contentType } });
  }

  const { libraryId, apiKey } = settings.credentials;
  const create = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ title: parsed.data.title }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const video = await create.json().catch(() => null) as { guid?: string } | null;
  if (!create.ok || !video?.guid) return NextResponse.json({ error: "Bunny Stream could not create the video" }, { status: 502 });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const signature = crypto.createHash("sha256").update(`${libraryId}${apiKey}${expires}${video.guid}`).digest("hex");
  return NextResponse.json({
    provider: "BUNNY",
    uploadId: video.guid,
    uploadUrl: "https://video.bunnycdn.com/tusupload",
    uploadMethod: "TUS",
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expires),
      VideoId: video.guid,
      LibraryId: libraryId,
    },
  });
});

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim();
  if (!uploadId || uploadId.length > 300) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const institutionId = getTenantContext(session);
  const settings = await getEffectiveCourseStreamingSettings(institutionId, session.userId);
  if (!settings) return NextResponse.json({ error: "Course streaming is not configured" }, { status: 409 });

  if (settings.provider === "MUX") {
    const authorization = muxAuthorization(settings.credentials);
    const uploadResponse = await fetch(`https://api.mux.com/video/v1/uploads/${encodeURIComponent(uploadId)}`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const upload = await uploadResponse.json().catch(() => null) as { data?: { status?: string; asset_id?: string; error?: { message?: string } } } | null;
    if (!uploadResponse.ok) return NextResponse.json({ error: "Mux could not check this upload" }, { status: 502 });
    if (upload?.data?.status === "errored") return NextResponse.json({ status: "ERROR", error: upload.data.error?.message || "Mux could not process this video" });
    if (!upload?.data?.asset_id) return NextResponse.json({ status: "PROCESSING" });
    const assetResponse = await fetch(`https://api.mux.com/video/v1/assets/${encodeURIComponent(upload.data.asset_id)}`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const asset = await assetResponse.json().catch(() => null) as { data?: { status?: string; playback_ids?: Array<{ id?: string; policy?: string }>; errors?: { messages?: string[] } } } | null;
    if (!assetResponse.ok) return NextResponse.json({ error: "Mux could not check the uploaded asset" }, { status: 502 });
    if (asset?.data?.status === "errored") return NextResponse.json({ status: "ERROR", error: asset.data.errors?.messages?.[0] || "Mux could not encode this video" });
    const playbackId = asset?.data?.playback_ids?.find((item) => item.policy === "signed")?.id;
    if (asset?.data?.status !== "ready" || !playbackId) return NextResponse.json({ status: "PROCESSING" });
    return NextResponse.json({ status: "READY", videoUrl: `https://stream.mux.com/${playbackId}.m3u8` });
  }

  const { libraryId, apiKey } = settings.credentials;
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(uploadId)}`, {
    headers: { AccessKey: apiKey, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const video = await response.json().catch(() => null) as { status?: number; encodeProgress?: number; transcodingMessages?: Array<{ message?: string; level?: number }> } | null;
  if (!response.ok) return NextResponse.json({ error: "Bunny Stream could not check this upload" }, { status: 502 });
  if (video?.status === 5 || video?.status === 6) return NextResponse.json({ status: "ERROR", error: video.transcodingMessages?.at(-1)?.message || "Bunny Stream could not encode this video" });
  if (video?.status !== 4) return NextResponse.json({ status: "PROCESSING", progress: video?.encodeProgress || 0 });
  return NextResponse.json({ status: "READY", videoUrl: `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(uploadId)}` });
});
