import { NextResponse } from 'next/server';

/**
 * Request-body size limits.
 *
 * App Router route handlers have no built-in body cap: `await req.json()`
 * buffers whatever the client sends into the V8 heap. On a 4 vCPU / 8 GB box
 * that also runs Postgres and Valkey, a handful of concurrent multi-hundred-MB
 * posts is the cheapest available way to OOM the process — no authentication and
 * no rate-limit bucket needed if the route is unauthenticated.
 *
 * `DEFAULT_MAX_BODY_BYTES` sits far above every legitimate payload in this app
 * (the largest is a 500-row student CSV import), so the cap is invisible to
 * clients while removing the exhaustion vector.
 */
export const DEFAULT_MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Auth payloads are a handful of short fields; nothing legitimate comes close. */
export const AUTH_MAX_BODY_BYTES = 16 * 1024;

export type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = { ok: false, status: 413, error: 'Request body too large' } satisfies JsonBodyResult<never>;
const INVALID_JSON = { ok: false, status: 400, error: 'Invalid JSON body' } satisfies JsonBodyResult<never>;

/** True when Content-Length alone already exceeds the cap. O(1), no body read. */
export function exceedsDeclaredBodyLimit(req: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): boolean {
  const declared = req.headers.get('content-length');
  if (!declared) return false;
  const length = Number(declared);
  return Number.isFinite(length) && length > maxBytes;
}

export function bodyTooLargeResponse() {
  return NextResponse.json({ error: TOO_LARGE.error }, { status: 413 });
}

/**
 * Bounded replacement for `await req.json()`. Rejects on the declared length when
 * present, and otherwise stops reading (and cancels the stream) the moment the
 * received bytes pass `maxBytes`, so a chunked body cannot get around the check.
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<JsonBodyResult<T>> {
  if (exceedsDeclaredBodyLimit(req, maxBytes)) return TOO_LARGE;

  const body = req.body;
  if (!body) return INVALID_JSON;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch {
    return INVALID_JSON;
  }

  if (total === 0) return INVALID_JSON;

  let text: string;
  if (chunks.length === 1) {
    text = new TextDecoder().decode(chunks[0]);
  } else {
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(merged);
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return INVALID_JSON;
  }
}
