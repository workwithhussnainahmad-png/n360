import { readinessPool } from '@/db';
import { redis } from '@/lib/redis';
import { withApiPolicy } from '@/lib/api-policy';
export { corsPreflight as OPTIONS } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export const GET = withApiPolicy(async () => {
  try {
    await readinessPool.query('select 1');
    let cache: 'ready' | 'degraded' = 'degraded';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (redis.status === 'ready' && await Promise.race([
        redis.ping(),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1000); }),
      ]) === 'PONG') cache = 'ready';
    } catch {} finally { clearTimeout(timer); }
    return Response.json({ status: cache === 'ready' ? 'ready' : 'degraded', database: 'ready', cache }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable', database: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
});
