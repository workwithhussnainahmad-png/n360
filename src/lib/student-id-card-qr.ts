import QRCode from "qrcode";
import { createStudentVerificationToken } from "./student-verification-token";

export function studentVerificationUrl(student: { id: number; institutionId: number; createdAt: Date }, requestHost?: string | null) {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN || "nisaab360.app";
  let origin = new URL(domain.includes("://") ? domain : `https://${domain}`);
  if (requestHost) {
    const local = new URL(`http://${requestHost}`);
    if (local.hostname === "localhost" || local.hostname.endsWith(".localhost") || local.hostname === "127.0.0.1" || local.hostname === "[::1]") {
      // Local cards must verify against this local database, even when the
      // configured deployment domain points at production. Use the root host.
      origin = new URL(`http://localhost${local.port ? `:${local.port}` : ""}`);
    }
  }
  const url = new URL("/verify/student", origin);
  url.searchParams.set("token", createStudentVerificationToken(student.id, student.institutionId, student.createdAt));
  return url.toString();
}

const encoded = new Map<string, { image: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
const waiting: Array<() => void> = [];
let active = 0;
export class QrCapacityError extends Error {
  constructor() { super('Card generation is busy. Please try again shortly.'); }
}
async function acquire() {
  if (active < 2) { active++; return; }
  if (waiting.length >= 128) throw new QrCapacityError();
  await new Promise<void>(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else active--;
}
export async function studentIdCardQr(student: { id: number; institutionId: number; createdAt: Date }, requestHost?: string | null) {
  // URL includes tenant, student creation identity, origin and current signing key.
  // Only QR images are cached; card records and authorization remain fresh.
  const url = studentVerificationUrl(student, requestHost);
  const cached = encoded.get(url);
  if (cached && cached.expires > Date.now()) {
    encoded.delete(url); encoded.set(url, cached);
    return cached.image;
  }
  const existing = pending.get(url);
  if (existing) return existing;
  const task = (async () => {
    await acquire();
    try {
      const image = await QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M" });
      encoded.delete(url); encoded.set(url, { image, expires: Date.now() + 5 * 60_000 });
      while (encoded.size > 256) encoded.delete(encoded.keys().next().value!);
      return image;
    } finally { release(); }
  })().finally(() => pending.delete(url));
  pending.set(url, task);
  return task;
}
