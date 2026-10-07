import { NativeHeaders, type NativeJsonResponse } from './native-json-response';
// Reuse decoding/encoding of identical JSON. The tracked dashboard cache retains
// Redis's deadline and receives invalidations; response streams remain per-call.
const decoded = new Map<string, object>();
const responses = new WeakMap<object, Map<boolean, { body: string; status: number }>>();
const timetables = new WeakMap<object, string>();
const MAX_ENTRIES = 4096;
const MAX_JSON_LENGTH = 16_384;

// The standalone adapter can send this immutable JSON directly. Keep an ordinary
// independent Response stream for Next's normal request handler and other callers.
function serializedResponse(body: string, init: ResponseInit) {
  // The native adapter writes the immutable string directly. A string BodyInit
  // otherwise schedules an eager stream pull/UTF-8 encoding for every cache hit,
  // even though that body is never read. A zero-buffer stream does this work only
  // when Next, text(), clone(), or another ordinary Response consumer reads it.
  // Each response encodes its own bytes, so a reader cannot mutate another body.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }, { highWaterMark: 0 });
  return Object.defineProperty(new Response(stream, init), Symbol.for('nisaab360.serialized-json'), { value: body });
}

/** Dashboard callers treat these decoded payloads as immutable. */
export function decodeDashboardPayload<T extends object>(json: string): T {
  const hit = decoded.get(json);
  if (hit) return hit as T;
  const payload = JSON.parse(json) as T;
  if (payload && typeof payload === 'object' && json.length <= MAX_JSON_LENGTH) {
    if (decoded.size >= MAX_ENTRIES) decoded.delete(decoded.keys().next().value!);
    decoded.set(json, payload);
  }
  return payload;
}

function dashboardVariant(payload: object, coursesEnabled: boolean) {
  let variants = responses.get(payload);
  if (!variants) { variants = new Map(); responses.set(payload, variants); }
  let variant = variants.get(coursesEnabled);
  if (!variant) {
    const status = 'error' in payload ? 404 : 200;
    const body = JSON.stringify(status === 404 ? payload : { ...payload, coursesEnabled });
    variant = { status, body };
    variants.set(coursesEnabled, variant);
  }
  return variant;
}

export function nativeDashboardResponse(payload: object, coursesEnabled: boolean, headers: Record<string,string> = {}): NativeJsonResponse {
  const variant = dashboardVariant(payload, coursesEnabled);
  return { ...variant, headers: new NativeHeaders({ ...headers, 'content-type':'application/json' }) };
}

export function dashboardResponse(payload: object, coursesEnabled: boolean, headers?: Headers) {
  const variant = dashboardVariant(payload, coursesEnabled);
  // Never reuse a Response or its headers: each caller has its own CORS, timing
  // and request ID, and a response body stream can only be consumed once.
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return serializedResponse(variant.body, { status: variant.status, headers: responseHeaders });
}

/** Cache JSON encoding only; every authenticated call gets its own response. */
export function timetableResponse(timetable: object) {
  let body = timetables.get(timetable);
  if (body === undefined) { body = JSON.stringify({ timetable }); timetables.set(timetable, body); }
  return serializedResponse(body, { headers: { 'Content-Type': 'application/json' } });
}
