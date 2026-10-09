import type { ActionResult } from './action-feedback';
import { ApiError } from './api-client';

/** Preserve existing success/catch semantics while transporting errors as plain data. */
export async function runAction<T, TArgs extends unknown[]>(action: (...args: TArgs) => Promise<ActionResult<T>>, ...args: TArgs): Promise<T> {
  const result = await action(...args);
  if (!result.ok) throw new ApiError(400, result);
  return result.data;
}
