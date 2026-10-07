import assert from 'node:assert/strict';
import {
  encodeAdmissionFileAsset,
  decodeAdmissionFileAsset,
  hasExactFolderPrefix,
  parseAdmissionUploadCompletion,
} from '../src/lib/admission-files';
import { institutionPublicUrl, parseInstitutionHostname, validateInstitutionSlug } from '../src/lib/institution-domain';
import { admissionReviewActionSchema } from '../src/lib/validators/admission-review';
import { admissionConfigurationActionSchema, createAdmissionCycleSchema, createAdmissionOfferingSchema, publicAdmissionApplicationSchema } from '../src/lib/validators/admissions';

function rejects(result: { success: boolean }, message: string) {
  assert.equal(result.success, false, message);
}

assert.deepEqual(validateInstitutionSlug(' NCS '), { ok: true, slug: 'ncs' });
assert.equal(validateInstitutionSlug('admin').ok, false, 'reserved system subdomains must be rejected');
assert.equal(validateInstitutionSlug('national--college').ok, false, 'ambiguous repeated hyphens must be rejected');
assert.deepEqual(parseInstitutionHostname('ncs.nisaab360.app:443', 'nisaab360.app'), {
  kind: 'institution', hostname: 'ncs.nisaab360.app', slug: 'ncs',
});
assert.equal(parseInstitutionHostname('staff.nisaab360.app', 'nisaab360.app').kind, 'system');
assert.equal(parseInstitutionHostname('nisaab360.app', 'nisaab360.app').kind, 'apex');
assert.equal(parseInstitutionHostname('ncs.example.com', 'nisaab360.app').kind, 'unknown');
assert.equal(
  institutionPublicUrl('NCS', '127.0.0.1:3000', 'http:'),
  'http://ncs.localhost:3000',
  'desktop localhost builds must open the local public institution website',
);

const configuredCycle = {
  action: 'createCycle', name: 'Fall 2027', academicYear: '2027-2028', opensOn: '2027-01-01',
  closesOn: '2027-02-01', instructions: '',
  requiredDocuments: [{ name: 'B-Form', instructions: 'Upload a clear copy' }],
  requiresTest: true, testScheduledAt: '2027-02-10T09:00:00+05:00', testLocation: 'Main campus', testInstructions: '',
  requiresInterview: false, interviewScheduledAt: '', interviewLocation: '', interviewInstructions: '',
  admissionFeeAmount: 25000, admissionFeeDueDays: 7,
  paymentMethods: [{ id: 'bank-1', providerName: 'Test Bank', accountTitle: 'National College', accountNumber: '1234567890', qrUrl: '' }],
  admissionFeeInstructions: 'Pay at the accounts office.',
} as const;
assert.equal(createAdmissionCycleSchema.safeParse(configuredCycle).success, true);
assert.equal(admissionConfigurationActionSchema.safeParse({
  ...configuredCycle, requiredDocuments: ['A', 'B', 'C'].map(name => ({ name, instructions: null })),
}).success, true, 'cycle creation accepts the one-character document names sent by the form');
assert.equal(admissionConfigurationActionSchema.safeParse({
  ...configuredCycle, action: 'updateCycle', cycleId: 1,
  requiredDocuments: [{ name: 'A', instructions: null }],
}).success, true, 'editing uses the same document-name rule');
rejects(createAdmissionCycleSchema.safeParse({
  ...configuredCycle, requiredDocuments: [{ name: '   ', instructions: null }],
}), 'whitespace-only document names remain invalid');
rejects(createAdmissionCycleSchema.safeParse({
  ...configuredCycle, requiredDocuments: [{ name: 'A'.repeat(161), instructions: null }],
}), 'document names retain the 160-character limit');
assert.equal(createAdmissionOfferingSchema.safeParse({
  action: 'createOffering', cycleId: 1, title: '1', description: '', capacity: 40,
}).success, true, 'single-character Pakistani class names must be accepted');
rejects(createAdmissionCycleSchema.safeParse({
  ...configuredCycle, opensOn: '2027-02-01', closesOn: '2027-01-01',
}), 'a cycle must not close before it opens');
rejects(createAdmissionCycleSchema.safeParse({
  ...configuredCycle, testScheduledAt: '', testLocation: '',
}), 'a required test must have a common schedule');
rejects(publicAdmissionApplicationSchema.safeParse({
  offeringId: 1, studentName: 'Student Name', dateOfBirth: '2015-01-01', gender: 'MALE',
  guardianName: 'Guardian Name', guardianEmail: 'not-an-email', guardianPhone: '03001234567',
  previousInstitution: '', notes: '',
}), 'applicant email validation must reject malformed addresses');

rejects(admissionReviewActionSchema.safeParse({ action: 'reviewFee', status: 'REJECTED', note: '' }), 'fee rejection must include a reason');
assert.equal(admissionReviewActionSchema.safeParse({
  action: 'scheduleAppointment', type: 'TEST', scheduledAt: '2027-01-05T10:00:00+05:00',
  location: 'Main campus', instructions: '',
}).success, true);

const asset = { publicId: 'admission-documents/12/34/56/generated-id', format: 'pdf', resourceType: 'image' as const };
assert.deepEqual(decodeAdmissionFileAsset(encodeAdmissionFileAsset(asset)), asset);
assert.equal(hasExactFolderPrefix(asset.publicId, 'admission-documents/12/34/56'), true);
assert.equal(hasExactFolderPrefix(asset.publicId, 'admission-documents/1'), false, 'tenant IDs must match a complete folder segment');
assert.equal(parseAdmissionUploadCompletion({ publicId: '../other-tenant/file', format: 'pdf', resourceType: 'image' }), null);
assert.equal(parseAdmissionUploadCompletion({ publicId: asset.publicId, format: 'exe', resourceType: 'raw' }), null);

process.stdout.write('Phase 10 admissions verification passed.\n');
