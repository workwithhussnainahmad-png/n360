import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const DOWNLOAD_DIRECTORY = path.join(process.cwd(), "public", "downloads");
const LINK_PATH = path.join(DOWNLOAD_DIRECTORY, "app-link.txt");

export async function GET() {
  try {
    const url = await readFile(LINK_PATH, "utf-8");
    if (!url || !url.trim()) throw new Error("Link not found");

    return NextResponse.redirect(url.trim(), 302);
  } catch {
    return NextResponse.json({ error: "The Android app is not available yet." }, { status: 404 });
  }
}

export const POST = requireRole(["SUPER_ADMIN", "EMPLOYEE"], async (req: NextRequest) => {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Provide a valid download link." }, { status: 400 });
    }

    // Scheme allow-list — see the identical note in download-software/route.ts.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Provide a valid URL." }, { status: 400 });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "Provide an http or https URL." }, { status: 400 });
    }

    await mkdir(DOWNLOAD_DIRECTORY, { recursive: true });
    await writeFile(LINK_PATH, url.trim(), "utf-8");

    return NextResponse.json({ message: "App download link updated successfully." });
  } catch (error) {
    console.error("Android app link update failed", error);
    return NextResponse.json({ error: "Could not update the app download link." }, { status: 500 });
  }
});
