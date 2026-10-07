// Isolated response-construction experiment; no HTTP or database traffic.
import assert from 'node:assert/strict';
const json = JSON.stringify({ firstName: 'علی 🎓', timetable: [], assignments: [], content: 'fixture'.repeat(128) });
const create = (lazy) => new Response(lazy ? new ReadableStream({
  pull(controller) { controller.enqueue(new TextEncoder().encode(json)); controller.close(); },
}, { highWaterMark: 0 }) : json, { headers: { 'content-type': 'application/json' } });
for (const lazy of [false, true]) {
  const response = create(lazy);
  assert.equal(await response.text(), json);
  assert.equal(await create(lazy).clone().text(), json);
}
for (let i = 0; i < 2000; i++) { create(false); create(true); }
await new Promise(resolve => setImmediate(resolve));
const results = [];
for (let round = 0; round < 4; round++) for (const lazy of round % 2 ? [true, false] : [false, true]) {
  const before = process.cpuUsage(), start = performance.now();
  for (let i = 0; i < 20000; i++) create(lazy);
  await new Promise(resolve => setImmediate(resolve));
  const cpu = process.cpuUsage(before);
  results.push({ round, mode: lazy ? 'lazy-stream' : 'string', cpuUsPerResponse: (cpu.user + cpu.system) / 20000, wallUsPerResponse: (performance.now() - start) * 1000 / 20000 });
}
console.log(JSON.stringify(results, null, 2));
