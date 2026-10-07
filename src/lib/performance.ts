/** Optional local diagnostics bridge installed by performance-preload.cjs. */
type PerformanceBridge = {
  measure<T>(phase: string, operation: () => Promise<T>): Promise<T>;
};

export function measurePerformancePhase<T>(phase: string, operation: () => Promise<T>): Promise<T> {
  const bridge = (globalThis as typeof globalThis & { __lmsPerformance?: PerformanceBridge }).__lmsPerformance;
  return bridge ? bridge.measure(phase, operation) : operation();
}
