import assert from 'node:assert/strict';
import {createStudentVerificationToken as create, readStudentVerificationToken as read} from '../src/lib/student-verification-token';
const names=['JWT_SECRET','STUDENT_QR_SIGNING_SECRET','STUDENT_QR_KEY_ID','STUDENT_QR_PREVIOUS_KEYS','STUDENT_QR_LEGACY_SECRET','STUDENT_QR_LEGACY_VALID_UNTIL'];
const before=names.map(name=>process.env[name]);
try {
  for(const name of names)delete process.env[name];
  process.env.JWT_SECRET='a'.repeat(32);
  const date=new Date('2026-01-01'),legacy=create(1,2,date);
  assert.ok(read(legacy));
  process.env.STUDENT_QR_SIGNING_SECRET='b'.repeat(32);process.env.STUDENT_QR_KEY_ID='first';
  const first=create(1,2,date);assert.ok(first.startsWith('first.'));assert.ok(read(first));assert.equal(read(legacy),null);
  process.env.JWT_SECRET='c'.repeat(32);assert.ok(read(first),'JWT rotation leaves dedicated cards valid');
  process.env.STUDENT_QR_LEGACY_SECRET='a'.repeat(32);process.env.STUDENT_QR_LEGACY_VALID_UNTIL=new Date(Date.now()+60000).toISOString();assert.ok(read(legacy));
  process.env.STUDENT_QR_LEGACY_VALID_UNTIL='2000-01-01';assert.equal(read(legacy),null);
  process.env.STUDENT_QR_SIGNING_SECRET='d'.repeat(32);process.env.STUDENT_QR_KEY_ID='second';
  process.env.STUDENT_QR_PREVIOUS_KEYS=JSON.stringify([{id:'first',secret:'b'.repeat(32),expiresAt:new Date(Date.now()+60000).toISOString()}]);
  assert.ok(read(first));assert.ok(read(create(3,2,date)));
  assert.equal(read('unknown.'+first.split('.')[1]),null);
  const altered=first.split('.');altered[1]=(altered[1][0]==='A'?'B':'A')+altered[1].slice(1);assert.equal(read(altered.join('.')),null);
  process.env.STUDENT_QR_PREVIOUS_KEYS=JSON.stringify([{id:'first',secret:'b'.repeat(32),expiresAt:'2000-01-01'}]);assert.equal(read(first),null);
  assert.equal(read('https://invalid'),null);
  console.log('QR keys: legacy migration/expiry, independent JWT rotation, old-key window, tamper and unknown-key rejection pass.');
} finally {for(const [i,name] of names.entries()){if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];}}
