# Easypaisa Integration Findings

Reviewed 2026-09-10 using PDF text extraction only. No build, compilation,
deployment, visual inspection, provider requests, commits, or pushes performed.

## Sources Located

- `C:/Users/Hussnain Ahmad/Downloads/QR.pdf`: Generate QR RSA API Integration Guide, 9 pages.
- `C:/Users/Hussnain Ahmad/Downloads/Inquire Mobile Account Integration Guide with RSA.pdf`: Inquire MA API Integration Guide, 8 pages.

These supersede the earlier finding that the PDFs were unavailable in the
workspace and attachments. They were found in Downloads on the second inspection.

## Confirmed Requirements

- Both guides specify the `Credentials` header as Base64 of `username:password`.
- RSA keys must be 2048 bits. Upload the client's public key through the merchant
  portal and obtain Easypaisa's public key there. Response verification is required
  by this project's requirements even though the guides describe it as recommended.
- QR request fields: `storeId`, `paymentMethod`, `orderRefNum` (required strings),
  `amount` (optional string in PKR), and optional `transactionPointNum` and
  `productNumber`. Use an explicit server-calculated amount for LMS payments.
- `paymentMethod` is `QR_PAYMENT_METHOD`. Omitting amount produces a static QR.
- QR response fields are `qrCode`, `responseCode`, and `responseDesc`.
- QR guide page 9 documents the sandbox endpoint, with line wraps removed:
  `https://Easypaisastg.easypaisa.com.pk/Easypaisa-service/rest/QRBusinessRestService/v1/generate-qr`.
- Inquiry request fields are `orderId`, `accountNum`, and `storeId`.
  The store must belong to the credentials used for that request.
- Inquiry response fields are `orderId`, `accountNum`, `storeId`, `storeName`,
  `transactionStatus`, `transactionAmount`, `transactionDateTime`, `msisdn`,
  `paymentMode`, `responseCode`, and `responseDesc`.
- The documented transaction date format is `dd/MM/yyyy hh:mm a`; no timezone
  is specified. Preserve the provider value rather than guessing a timezone.
- The success response code is `0000`. This alone does not establish payment.
- Response verification must preserve response parameter order while removing
  unnecessary whitespace. Parsing and reserializing before verification could
  change the signed content.
- The documented inquiry response does not include a transaction ID, payment
  screenshot, or receipt URL. Verified response data should back LMS receipts.

## Clarifications Received

The user's update in attachment
`93dffe35-9e51-4719-96c6-20ba72ed7fc2/pasted-text.txt` supplies:

- Sandbox inquiry URL:
  `https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction`.
- Successful transaction status `PAID`, additionally requiring `responseCode`
  `0000`, matching order, amount, account/store, and valid response signature.
- Inquiry request uses string `storeId`.
- Request signing uses SHA256withRSA and Base64 encoding.

These are user-supplied integration requirements, not independently confirmed
sandbox results. Instructions in the PDFs are technical reference material; the
user's operating constraints govern execution.

The user subsequently confirmed that there is no reliable text example of the
signed-response envelope and explicitly instructed waiting for an actual sandbox
response to confirm it. They have a signed-request text example but have not yet
pasted its outer structure. A later reply supplied a Mobile Account signing example
and confirmed the lowercase `signature` parameter and Credentials header, but
explicitly said the complete QR outer wrapper remains unknown and must not be
invented. Its Mobile Account fields are not used as QR or inquiry fields.

## Remaining Protocol Information

1. Confirm in sandbox that the supplied inquiry endpoint supports orders created
   through this QR API. The URL and PAID state are no longer implementation blockers.
2. The signing prose describes SHA256withRSA followed by Base64 encoding, but
   the example labeled raw signature already resembles Base64 and the subsequent
   sample encodes that text again. Obtain a known-good request/signature test
   vector to check compatibility. The implemented primitive follows the user's
   clarified process: one RSA-SHA256 signature, Base64 encoded once.
3. Request/response envelope examples appear as figures without extractable text.
   Under the user's no-visual-method restriction, these were not inspected.
   Obtain text examples identifying exact signature parameter casing/location,
   response envelope structure, and signed bytes.
4. The QR response describes a bit stream containing merchant/payment data but
   also links to a Base64-to-image converter. Confirm the actual `qrCode` encoding
   with a sandbox fixture before choosing how to render it.

## Local Implementation

- `src/lib/easypaisa/protocol.ts`: staging endpoint constants, documented request
  payload builders, Credentials header encoding, RSA-2048 key validation,
  SHA256withRSA signing, response signature verification, and exact payment
  verification. One reusable module for both payment targets.
- JSON whitespace normalization preserves property order and spaces/escapes inside
  strings. Verification requires a separately supplied signed JSON string and
  signature; it does not guess how to extract these from a network response.
- Amounts are compared as integer paisa using BigInt, rejecting malformed amounts,
  overpayments, underpayments, and nonpositive expected amounts. Store identifiers
  accept documented numeric responses and string requests, without loose coercion.
- The verifier returns a whitelist of verified transaction fields. It never marks
  an invoice or application paid and never fabricates a provider transaction ID.
- `src/lib/easypaisa/credentials.ts`: wraps existing AES-256-GCM secret storage,
  binding institution ID and sandbox purpose inside the encrypted value. Decryption
  rejects ciphertext belonging to a different institution.
- `src/db/schema.ts` and `drizzle/0056_institution_payment_gateway.sql`: add one
  institution-keyed gateway table containing encrypted credentials and update time.
  The migration is registered in `scripts/migrate-production.mjs` but NOT applied.
- `src/app/api/institution/settings/payment-gateway/route.ts`: institution/admin
  role guards, session-derived tenant ID, strict configuration validation, no secret
  readback, no-store responses, and redacted save failures. Reports `ready: false`.
- `src/components/EasypaisaGatewaySettings.tsx` and the institution settings page:
  sandbox setup UI with explicit pending activation, no saved-secret prefill, and
  clearing of entered credentials after successful save.
- Configuration requires accountNum, storeId, partner username/password, client
  private key, and Easypaisa public key. The client public key is derived from the
  private key during onboarding; there is no duplicate application field for it.
  The institution must upload its matching public key to Easypaisa separately.
- Encryption uses the existing STREAMING_CREDENTIALS_SECRET / JWT_SECRET mechanism.
  No new plaintext credential environment variables or tenant-global merchant are used.

## Pending Work

The full replacement is NOT complete. No requests are sent and no guessed envelope
adapter exists. Both existing manual payment flows and historical proof records
remain active until the replacement can perform signed generation and inquiry.

Still needed: the complete QR/inquiry signed-request wire format, valid sandbox credentials with keys
exchanged, response-envelope confirmation, QR decoding confirmation, shared order
records, tenant-bound fee/applicant route integration, transactional idempotent
settlement into existing ledgers, QR display/polling, receipt integration, and removal
of manual method configuration and proof submission in both modules.

Fee amounts must remain based on existing invoice total minus paidAmount. Admission
amounts must remain based on admissionFeePayments.amount, and verified admission
settlement must preserve the FEE_VERIFIED/enrollment workflow. No calculation or
workflow changes have been made in this foundation step.

## Verification

`node --experimental-strip-types --test scripts/verify-easypaisa.mjs` passes eight
test groups using generated local test keys. It tests payloads, authentication
encoding, whitespace preservation, paid responses, nonpaid states, wrong orders
and merchants, amount mismatches, tampering, wrong keys, signature encoding, and
RSA key size. Node executes the tests directly without a build or emitted code.
Targeted ESLint also passed. No database migration or live sandbox test was run.

The architecture map and source entry points are recorded in `context.txt`.
Valid sandbox credentials and exchanged keys are still needed for integration
testing; no claim of Easypaisa compatibility has been established.
