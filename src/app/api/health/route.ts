import { withApiPolicy } from '@/lib/api-policy';
export { corsPreflight as OPTIONS } from '@/lib/cors';
/**
 * Liveness probe used by Docker healthchecks; keep dispatch and response cheap.
 *
 * `no-store` matters here: without it a CDN or intermediary is free to cache
 * "ok" and keep reporting a dead replica as healthy.
 *
 * The `timestamp` field is kept — nothing parses it, but it is the only way to
 * tell a live probe from a cached one when debugging, and one Date allocation
 * per probe is not a measurable cost.
 */
export const GET = withApiPolicy(async () => {
  return new Response(`{"status":"ok","timestamp":"${new Date().toISOString()}"}`, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
});
