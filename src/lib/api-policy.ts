import type { NextRequest } from 'next/server';
import { applyCorsHeaders } from './cors';
import { stripSessionHeaders } from './session-header';

/** Keep API transport policy in guarded routes so hot endpoints can skip Proxy. */
export function withApiPolicy<TContext>(handler: (req: NextRequest, context: TContext) => Promise<Response>) {
  return async (req: NextRequest, context: TContext) => {
    stripSessionHeaders(req.headers);
    return applyCorsHeaders(req, await handler(req, context));
  };
}
