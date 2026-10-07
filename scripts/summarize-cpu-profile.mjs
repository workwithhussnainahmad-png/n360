// Offline V8/pprof CPU summary. Does not execute the application or send traffic.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

const file = process.argv[2];
if (!file) throw new Error('Pass a .cpuprofile or a gzip protobuf pprof CPU profile');
const flat = new Map(), cumulative = new Map();
const categories = new Map();
const groups = { compression: /(?:compress\/|klauspost\/compress)/, syscalls: /(?:syscall\.|Syscall\d)/, garbageCollection: /(?:\(garbage collector\)|runtime\.(?:gc|scan|mark))/ };
let total = 0;
function sample(stack, weight) {
  total += weight;
  if (stack.length) flat.set(stack[0], (flat.get(stack[0]) || 0) + weight);
  for (const frame of new Set(stack)) cumulative.set(frame, (cumulative.get(frame) || 0) + weight);
  for (const [name, pattern] of Object.entries(groups)) if (stack.some(frame => pattern.test(frame))) categories.set(name, (categories.get(name) || 0) + weight);
}
const data = fs.readFileSync(file);
if (file.endsWith('.cpuprofile')) {
  const profile = JSON.parse(data.toString('utf8'));
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
  for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i];
    const stack = [];
    while (id) {
      const f = nodes.get(id).callFrame;
      stack.push(`${f.functionName || '(anonymous)'} ${f.url || ''}:${f.lineNumber + 1}`);
      id = parents.get(id);
    }
    sample(stack, profile.timeDeltas[i]);
  }
} else {
  // github.com/google/pprof/proto/profile.proto: only CPU sample/function fields.
  function varint(buffer, cursor) {
    let value = 0n, shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (cursor.offset >= buffer.length) throw new Error('Truncated varint');
      const byte = buffer[cursor.offset++];
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return Number(value);
      shift += 7n;
    }
    throw new Error('Invalid varint');
  }
  function message(buffer) {
    const fields = new Map(), cursor = { offset: 0 };
    while (cursor.offset < buffer.length) {
      const tag = varint(buffer, cursor), number = Math.floor(tag / 8), wire = tag % 8;
      let value;
      if (wire === 0) value = varint(buffer, cursor);
      else if (wire === 2) {
        const length = varint(buffer, cursor), end = cursor.offset + length;
        if (end > buffer.length) throw new Error('Truncated field');
        value = buffer.subarray(cursor.offset, end); cursor.offset = end;
      } else if (wire === 1 || wire === 5) { cursor.offset += wire === 1 ? 8 : 4; continue; }
      else throw new Error(`Unsupported wire type ${wire}`);
      if (!fields.has(number)) fields.set(number, []);
      fields.get(number).push(value);
    }
    return fields;
  }
  function repeated(fields, number) {
    return (fields.get(number) || []).flatMap(value => {
      if (!Buffer.isBuffer(value)) return [value];
      const cursor = { offset: 0 }, values = [];
      while (cursor.offset < value.length) values.push(varint(value, cursor));
      return values;
    });
  }
  const profile = message(data[0] === 31 && data[1] === 139 ? gunzipSync(data) : data);
  const strings = (profile.get(6) || []).map(b => b.toString('utf8'));
  const types = (profile.get(1) || []).map(b => message(b));
  const cpu = types.findIndex(t => strings[t.get(2)?.[0]] === 'nanoseconds');
  if (cpu < 0) throw new Error('Profile has no CPU nanosecond samples');
  const functions = new Map((profile.get(5) || []).map(b => {
    const f = message(b); return [f.get(1)[0], strings[f.get(2)?.[0]] || '(unknown)'];
  }));
  const locations = new Map((profile.get(4) || []).map(b => {
    const l = message(b); return [l.get(1)[0], (l.get(4) || []).map(line => functions.get(message(line).get(1)[0]) || '(unknown)')];
  }));
  for (const b of profile.get(2) || []) {
    const s = message(b), stack = repeated(s, 1).flatMap(id => locations.get(id) || []);
    sample(stack, repeated(s, 2)[cpu]);
  }
}
const rank = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([frame, weight]) => ({ frame, percent: Math.round(weight / total * 10000) / 100 }));
console.log(JSON.stringify({ file, totalSampleWeight: total, flat: rank(flat), cumulative: rank(cumulative), categories: rank(categories), note: 'Cumulative/category rows overlap. V8 samples include idle time; Go CPU samples measure on-CPU execution.' }, null, 2));
