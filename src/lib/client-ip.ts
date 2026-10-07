/**
 * Client IP resolution for rate limiting and audit logging.
 *
 * `X-Forwarded-For` is a list that each proxy *appends* to, so the left-most
 * entry is whatever the client claimed and the right-most entries were added by
 * infrastructure we control. Reading element 0 (the previous behaviour) therefore
 * let any client choose its own rate-limit bucket by sending a fake XFF, which
 * defeated every limiter and the login lockout with it.
 *
 * The edge now settles this: Caddy computes `{client_ip}` against its
 * `trusted_proxies` list and *replaces* both `X-Forwarded-For` and `X-Real-IP`
 * with that single value, so in production the header holds exactly one entry
 * and nothing a client sends survives. We still read `TRUSTED_PROXY_HOPS`
 * (default 1 — the right-most entry) so the value stays correct if the header is
 * ever appended to again, and normalise it to an actual IP literal so
 * attacker-controlled text can never reach a Valkey key or an audit-log row.
 */

const TRUSTED_PROXY_HOPS = (() => {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
})();

const IP_CHARS = /^[0-9a-fA-F.:]+$/;
const IPV4_WITH_PORT = /^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/;

export const UNKNOWN_IP = '0.0.0.0';

/** Strip brackets/ports and reject anything that is not an IP literal. */
export function normalizeIp(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end > 1) value = value.slice(1, end);
  } else if (IPV4_WITH_PORT.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }

  if (value.length > 45 || !IP_CHARS.test(value)) return null;
  return value.toLowerCase();
}

/**
 * `hops`-th entry counted from the right. Scans backwards with lastIndexOf so a
 * long header does not allocate an array of every entry.
 */
function entryFromRight(header: string, hops: number): string {
  let end = header.length;
  for (let i = 0; i < hops; i++) {
    const comma = header.lastIndexOf(',', end - 1);
    if (comma === -1) return header.slice(0, end);
    if (i === hops - 1) return header.slice(comma + 1, end);
    end = comma;
  }
  return header.slice(0, end);
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const candidate = normalizeIp(entryFromRight(forwarded, TRUSTED_PROXY_HOPS));
    if (candidate) return candidate;
  }

  // Caddy sets this too; unlike XFF it is a single value the edge overwrites.
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    const candidate = normalizeIp(realIp);
    if (candidate) return candidate;
  }

  return UNKNOWN_IP;
}
