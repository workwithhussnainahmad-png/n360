/** Internal transport envelope; never returned from Next's public GET handler. */
export class NativeHeaders {
  readonly values: Record<string, string>;
  constructor(values: Record<string,string> = {}) { this.values = values; }
  set(name: string, value: string) { this.values[name.toLowerCase()] = value; }
}
export type NativeJsonResponse = { status: number; body: string; headers: NativeHeaders };
