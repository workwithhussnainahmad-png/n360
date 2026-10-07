/**
 * Trust boundary for the middleware → server-component session hand-off.
 *
 * `middleware.ts` verifies the JWT once per HTML navigation and forwards the
 * decoded payload to the render as `x-user-session` so `getSession()` does not
 * have to verify it again. That is a genuine optimisation, but the header is
 * indistinguishable from one a client sent: previously any request carrying
 * `x-user-session: {"userId":1,"role":"SUPER_ADMIN",...}` was accepted as that
 * user (and skipped the `verifyUserExists` liveness check with it).
 *
 * Two independent defences:
 *   1. `stripSessionHeaders()` removes both headers from every inbound request
 *      in middleware, so a client-supplied value never reaches a handler.
 *   2. Middleware signs the payload it forwards (`x-user-session-sig`) and
 *      `getSession()` refuses an unsigned or mis-signed header, falling back to
 *      full cookie verification. This keeps the hole closed even if a path ever
 *      slips out of the middleware matcher.
 *
 * WebCrypto is used because this module is imported from both the Edge runtime
 * (middleware) and the Node runtime (route handlers / RSC).
 */

import { getJwtSecret } from './jwt-secret';

export const SESSION_HEADER = 'x-user-session';
export const SESSION_SIG_HEADER = 'x-user-session-sig';

const encoder = new TextEncoder();

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = new Uint8Array(getJwtSecret()).buffer;
    keyPromise = crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
  }
  return keyPromise;
}

/** Drop any client-supplied session headers. Must run for every inbound request. */
export function stripSessionHeaders(headers: Headers) {
  headers.delete(SESSION_HEADER);
  headers.delete(SESSION_SIG_HEADER);
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** HMAC of the exact serialised payload middleware is about to forward. */
export async function signSessionPayload(serialized: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(serialized));
  return toBase64Url(signature);
}

/** True only when `signature` was produced by this deployment's key over `serialized`. */
export async function verifySessionPayload(serialized: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const raw = fromBase64Url(signature);
  if (!raw || raw.length !== 32) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await getKey(),
      new Uint8Array(raw).buffer,
      encoder.encode(serialized),
    );
  } catch {
    return false;
  }
}
