// Bounded read-only wire checks through Caddy, using prepared tokens; never k6.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8'));
const request = (account, encoding) => new Promise((resolve, reject) => {
  const req = http.get(`http://127.0.0.1:3000/api/${account.roleHint.toLowerCase()}/dashboard`, {
    headers: { authorization: `Bearer ${account.accessToken}`, 'accept-encoding': encoding },
  }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    res.on('error', reject);
  });
  req.setTimeout(15000, () => req.destroy(new Error('Functional transport read timed out')));
  req.on('error', reject);
});
for (const role of ['STAFF', 'STUDENT']) {
  const account = tokens.find(token => token.roleHint === role);
  assert.ok(account);
  const identity = await request(account, 'identity');
  assert.equal(identity.status, 200);
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal(Number(identity.headers['content-length']), identity.body.length);
  const gzip = await request(account, 'gzip');
  assert.equal(gzip.status, 200);
  const decoded = gzip.headers['content-encoding'] === 'gzip' ? gunzipSync(gzip.body) : gzip.body;
  assert.deepEqual(decoded, identity.body, 'Wire encoding must preserve account-specific JSON');
  if (gzip.headers['content-length']) assert.equal(Number(gzip.headers['content-length']), gzip.body.length);
  if (identity.body.length >= 512) assert.equal(gzip.headers['content-encoding'], 'gzip');
  if (gzip.headers['content-encoding']) assert.ok(String(gzip.headers.vary).toLowerCase().includes('accept-encoding'));
  const refused = await request(account, 'gzip;q=0, identity');
  assert.equal(refused.headers['content-encoding'], undefined);
  assert.deepEqual(refused.body, identity.body);
  assert.ok(gzip.headers['x-perf-proxy-ms']);
}
console.log('Six live wire checks passed: identity/gzip equality, account-specific JSON, byte lengths, q=0 refusal and Caddy path. No writes, k6 or token generation.');
