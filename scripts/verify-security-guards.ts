import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { JWTPayload } from '@/lib/auth-types';
import { redis } from '@/lib/redis';
import { withRateLimit } from '@/lib/rate-limit';
import { ownedUploadFolder, ownsUploadPublicId } from '@/lib/upload-ownership';

async function main() {
  const first: JWTPayload = { userId: 41, role: 'STUDENT', institutionId: 7 };
  const second: JWTPayload = { userId: 41, role: 'STUDENT', institutionId: 8 };
  const staff: JWTPayload = { userId: 41, role: 'STAFF', institutionId: 7 };

  const firstFolder = ownedUploadFolder(first);
  assert.equal(firstFolder, 'lms-uploads/tenant-7/student/user-41');
  assert.equal(ownsUploadPublicId(first, `${firstFolder}/asset-1`), true);
  assert.equal(ownsUploadPublicId(second, `${firstFolder}/asset-1`), false, 'another tenant must not own the upload');
  assert.equal(ownsUploadPublicId(staff, `${firstFolder}/asset-1`), false, 'another role must not own the upload');
  assert.equal(ownsUploadPublicId(first, `${firstFolder}-spoof/asset-1`), false, 'folder boundaries must be exact');
  assert.equal(ownsUploadPublicId(first, `${firstFolder}/../asset-1`), false, 'path traversal segments must be rejected');

// Force this process through the same bounded fallback used when Valkey is unavailable.
// Disconnecting here cannot affect the application because verification runs in its own process.
  redis.disconnect();
  const request = new NextRequest('http://localhost/api/security-check', {
    method: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.10' },
  });
  const identity = `security-check-${Date.now()}`;
  for (let index = 0; index < 100; index += 1) {
    const result = await withRateLimit(request, 'api', identity);
    assert.equal(result.success, true, `request ${index + 1} should be inside the API limit`);
  }
  const rejected = await withRateLimit(request, 'api', identity);
  assert.equal(rejected.success, false, 'request 101 must be rate limited');
  assert.ok(rejected.retryAfterSeconds > 0, 'rate-limit response must include retry timing');

  const isolatedIdentity = await withRateLimit(request, 'api', `${identity}-other-user`);
  assert.equal(isolatedIdentity.success, true, 'one account must not consume another account rate limit');

  process.stdout.write('Security guard verification passed.\n');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
