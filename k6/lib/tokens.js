/** Init-context token loading: no login traffic during the benchmark. */
import { SharedArray } from 'k6/data';
import encoding from 'k6/encoding';

export function loadTokens() {
  const role = (__ENV.TEST_ROLE || 'STUDENT').toUpperCase();
  if (!['STUDENT', 'STAFF', 'INSTITUTION', 'MIXED'].includes(role)) throw new Error('TEST_ROLE must be STUDENT, STAFF, INSTITUTION, or MIXED');
  return new SharedArray(`prepared-${role}-tokens`, () => {
    let parsed;
    try {
      parsed = JSON.parse(open(import.meta.resolve('../tokens.json')).replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('Missing or invalid tokens.json. Run npm.cmd run k6:tokens from the project root.');
    }
    const selected = (parsed.tokens || []).filter((entry) => role === 'MIXED'
      ? ['STUDENT', 'STAFF'].includes(entry.roleHint) : entry.roleHint === role);
    if (!selected.length) throw new Error(`No ${role} tokens. Run npm.cmd run k6:tokens.`);
    return selected.map((entry) => {
      const expiration = Date.parse(entry.expiresAt);
      if (!entry.accessToken || !Number.isFinite(expiration) || expiration <= Date.now() + 60_000) {
        throw new Error('Tokens expired or expire within one minute. Run npm.cmd run k6:tokens.');
      }
      let payload;
      try { payload = JSON.parse(encoding.b64decode(entry.accessToken.split('.')[1], 'rawurl', 's')); }
      catch { throw new Error('Invalid prepared token payload'); }
      if (payload.role !== entry.roleHint || !Number.isSafeInteger(payload.userId) || payload.userId <= 0 || !Number.isFinite(payload.exp)) throw new Error('Invalid prepared identity');
      return { token: entry.accessToken, role: entry.roleHint, user: entry.emailOrUsername,
        identity: `${payload.role}:${payload.userId}`, expiresAt: Math.min(expiration, payload.exp * 1000) };
    });
  });
}

export function validateTokenCapacity(tokens, plan) {
  if (!tokens.length || new Set(tokens.map(t => t.identity)).size !== tokens.length) {
    throw new Error('Prepared account pool must be nonempty and contain distinct identities.');
  }
  if (tokens.length < plan.vus && __ENV.ALLOW_ACCOUNT_REUSE !== 'true') {
    throw new Error(`Need at least ${plan.vus} distinct prepared accounts, or explicitly enable ALLOW_ACCOUNT_REUSE for a shared-account workload.`);
  }
  if (tokens.some(t => t.expiresAt <= Date.now() + (plan.totalSeconds + 120) * 1000)) {
    throw new Error('Prepared tokens must remain valid for the full workload plus two minutes.');
  }
}

export function pickToken(tokens, vu) {
  if (!tokens.length) throw new Error('No prepared tokens');
  return tokens[(vu - 1) % tokens.length];
}
