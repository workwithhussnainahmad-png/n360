import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { db } from "@/db";
import {
  courseClasses,
  courseLectures,
  courses,
  students,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { getEffectiveCourseStreamingSettings } from "@/lib/course-streaming";

function bunnyVideoId(value: string) {
  try {
    const url = new URL(value);
    if (
      !["iframe.mediadelivery.net", "video.bunnycdn.com", "dash.bunny.net"].includes(
        url.hostname.toLowerCase(),
      )
    ) {
      return null;
    }
    return (
      url.pathname
        .split("/")
        .filter(Boolean)
        .reverse()
        .find((part) => /^[0-9a-f-]{32,36}$/i.test(part)) || null
    );
  } catch {
    return null;
  }
}

function muxReference(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const part = url.pathname.split("/").filter(Boolean).at(-1)?.split(".")[0];
    if (!part) return null;
    if (["player.mux.com", "stream.mux.com"].includes(host)) {
      return { kind: "playback" as const, id: part };
    }
    if (host === "dashboard.mux.com") {
      return { kind: "asset" as const, id: part };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveBunnyPlayback(
  videoUrl: string,
  credentials: Record<string, string>,
) {
  const videoId = bunnyVideoId(videoUrl);
  const libraryId = credentials.libraryId;
  const apiKey = credentials.apiKey;
  const cdnHostname = credentials.cdnHostname;
  const tokenAuthKey = credentials.tokenAuthKey;
  if (!videoId || !libraryId || !apiKey || !cdnHostname || !tokenAuthKey) {
    throw new Error("This lecture does not match the configured Bunny library");
  }
  const response = await fetch(
    `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
    {
      headers: { AccessKey: apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error("Bunny could not verify this lecture video");
  const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const allowedPath = `/${videoId}/`;
  const parameterData = `token_path=${allowedPath}`;
  const token = crypto
    .createHash("sha256")
    .update(`${tokenAuthKey}${allowedPath}${expires}${parameterData}`)
    .digest("base64url");
  return `https://${cdnHostname}/${encodeURIComponent(videoId)}/playlist.m3u8?token=${token}&token_path=${encodeURIComponent(allowedPath)}&expires=${expires}`;
}

async function resolveMuxPlayback(
  videoUrl: string,
  credentials: Record<string, string>,
) {
  const reference = muxReference(videoUrl);
  const tokenId = credentials.tokenId;
  const tokenSecret = credentials.tokenSecret;
  if (!reference || !tokenId || !tokenSecret) {
    throw new Error("This lecture does not match the configured Mux account");
  }
  const authorization = `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
  const endpoint =
    reference.kind === "asset"
      ? `https://api.mux.com/video/v1/assets/${encodeURIComponent(reference.id)}`
      : `https://api.mux.com/video/v1/playback-ids/${encodeURIComponent(reference.id)}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Mux could not verify this lecture video");
  const payload = (await response.json()) as {
    data?: { id?: string; policy?: string; playback_ids?: Array<{ id?: string; policy?: string }> };
  };
  const playback = reference.kind === "playback"
    ? { id: reference.id, policy: payload.data?.policy }
    : payload.data?.playback_ids?.find((item) => item.policy === "signed") || payload.data?.playback_ids?.find((item) => item.id);
  const playbackId = playback?.id;
  if (!playbackId) throw new Error("This Mux asset has no public playback ID");
  if (playback.policy !== "signed") return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
  const signingKeyId = credentials.signingKeyId;
  const encodedPrivateKey = credentials.signingPrivateKey;
  if (!signingKeyId || !encodedPrivateKey) throw new Error("Mux protected playback is not configured. Save the institution Mux credentials again.");
  const pem = Buffer.from(encodedPrivateKey, "base64").toString("utf8");
  const privateKey = await importPKCS8(pem, "RS256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: signingKeyId })
    .setSubject(playbackId)
    .setAudience("v")
    .setExpirationTime("12h")
    .sign(privateKey);
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8?token=${encodeURIComponent(token)}`;
}

export const GET = requireRole(
  ["STUDENT"],
  async (_req: NextRequest, { session, params }) => {
    const lectureId = Number((await params).id);
    if (!Number.isInteger(lectureId) || lectureId <= 0) {
      return NextResponse.json({ error: "Invalid lecture" }, { status: 400 });
    }
    const institutionId = getTenantContext(session);
    const [student] = await db
      .select({ classId: students.classId })
      .from(students)
      .where(
        and(
          eq(students.id, session.userId),
          eq(students.institutionId, institutionId),
        ),
      )
      .limit(1);
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const [lecture] = await db
      .select({
        videoUrl: courseLectures.videoUrl,
        courseStaffId: courses.staffId,
      })
      .from(courseLectures)
      .innerJoin(courses, eq(courses.id, courseLectures.courseId))
      .innerJoin(courseClasses, eq(courseClasses.courseId, courses.id))
      .where(
        and(
          eq(courseLectures.id, lectureId),
          eq(courses.institutionId, institutionId),
          eq(courses.isActive, true),
          eq(courseClasses.classId, student.classId),
        ),
      )
      .limit(1);
    if (!lecture) {
      return NextResponse.json(
        { error: "Lecture is not available for your class" },
        { status: 403 },
      );
    }

    const settings = await getEffectiveCourseStreamingSettings(institutionId, lecture.courseStaffId);
    if (!settings) {
      return NextResponse.json(
        { error: "Courses are not enabled by your institution" },
        { status: 409 },
      );
    }

    try {
      const playbackUrl =
        settings.provider === "BUNNY"
          ? await resolveBunnyPlayback(lecture.videoUrl, settings.credentials)
          : await resolveMuxPlayback(lecture.videoUrl, settings.credentials);
      return NextResponse.json(
        { playbackUrl, provider: settings.provider, playbackType: "hls" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to prepare this lecture",
        },
        { status: 502 },
      );
    }
  },
);
