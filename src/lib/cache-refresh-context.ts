import { AsyncLocalStorage } from 'node:async_hooks';

// Read-data refreshes must not occupy the foreground request pool. Context
// propagates through nested reads without changing their authorization or TTL.
export const cacheRefreshContext = new AsyncLocalStorage<boolean>();
