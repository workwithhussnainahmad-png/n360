# Payment gateway implementation and activation

Local implementation, 10 September 2026. No production database migration, build, deployment, GitHub push, or real provider payment was performed. Merchant credentials and provider acceptance testing are still required. Do not describe these adapters as bank-certified or live-tested.

## Implemented flow

Institutions save encrypted, tenant-bound credentials and select sandbox/production. Students and admission applicants see only gateways whose institution settings and server readiness checks pass. A checkout saves immutable order, institution, fee target, amount, environment, and credential snapshots before contacting the provider. The amount always comes from the database.

Verified callbacks or inquiries lock the payment and fee rows. Exact matching payments update the monthly ledger or admission fee and create a durable receipt in one transaction. Repeated notifications cannot credit twice. A payment for a changed, voided, or already paid fee is retained as REVIEW for institution reconciliation; it does not overwrite the fee. Sandbox confirmations retain a clearly labelled test receipt and never credit real fees. Manual admission actions also lock the application so they cannot overwrite a concurrent gateway verification.

Receipts are available in student, parent, institution fee and admission views, and the applicant portal. `/payments/<order>` supports printing/saving a receipt. Receipt APIs enforce institution and student/parent/applicant ownership; an order ID alone grants no access. Credential snapshots and raw provider payloads are never exposed by those APIs. An evidence digest, provider reference, and verification timestamp are retained.

## Supported products and evidence

| Gateway | Implemented product | What remains to validate with the provider |
| --- | --- | --- |
| Easypaisa | RSA-signed QR generation and v5 RSA transaction inquiry | Merchant-enabled endpoint hosts, registered RSA keys, exact signed inquiry envelope and signature encoding, real successful/pending/failed responses |
| JazzCash | Hosted MWALLET checkout, signed browser return, SOAP merchant notification and SOAP inquiry | Issued checkout/inquiry endpoints and SOAP action; merchant WSDL registration; fixed-width inquiry hash field names/padding and notification acknowledgement hash |
| HBL | Cybersource Secure Acceptance Hosted Checkout, **only for a compatible HBL-issued profile** | HBL must confirm this specific product is enabled; profile/access/signing keys, signed response fields, Merchant POST delivery and retries |

Easypaisa's public QR guide shows a nested `response` plus `signature` envelope. The inquiry guide's example is incomplete; the adapter requires the nested signed envelope and rejects unsupported responses. The RSA adapter deliberately does not send its envelope to the separately documented non-RSA v4 inquiry endpoint. The QR signature uses a single Base64 encoding of RSA-SHA256/PKCS#1 v1.5; inconsistent prose examples must be resolved against provider fixtures before activation.

JazzCash's public guide documents a 341-character inquiry response, but does not unambiguously explain hash normalization for its padded fields. The current adapter verifies the parsed, right-trimmed named fields and refuses a mismatching signature. Its merchant-owned `UpdatePaymentStatus` WSDL and padded acknowledgement need provider acceptance. Do not weaken signature checks to make a test succeed; update the adapter and add a captured, sanitized provider fixture if the documented contract differs.

HBL's product page mentions Cybersource but does not establish that every HBL merchant gets Secure Acceptance Hosted Checkout. Support for that specific profile is conditional, not a claim that arbitrary HBL API credentials will work. Other HBL products need their actual integration specification.

Official sources consulted:

- [Easypaisa Integration Guides](https://easypay.easypaisa.com.pk/easypay-merchant/faces/pg/site/IntegrationGuides.jsf): public Search results provide QR Integration Guide (pages 5–6), Inquire Mobile Account with RSA (pages 5–6), and separate REST without RSA and Hosted Checkout guides.
- [JazzCash v4.2 features and hashing](https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/features.html), [API references](https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html), and [official merchant integration PDF](https://sandbox.jazzcash.com.pk/SandboxDocumentation/Content/documentation/Payment%20Gateway%20Integration%20Guide%20for%20Merchants-v4.2.pdf), sections 7–8 (inquiry and IPN). The official HMAC example is covered by a test.
- [HBLPay Checkout](https://www.hbl.com/business/digital-payments/hblpay-checkout).
- [Cybersource Secure Acceptance Hosted Checkout](https://developer.cybersource.com/docs/cybs/en-us/sa/developer/all/sa-hosted/secure-acceptance.html) and [official endpoints](https://developer.cybersource.com/docs/cybs/en-us/endpoints/reference/all/na/endpoints/endpoints.html).

## Deployment configuration

Apply `0056_institution_payment_gateway.sql` and `0057_gateway_payment_attempts.sql` through the existing production migration runner before deploying callers of the new tables. Both are registered in `scripts/migrate-production.mjs`. Back up the database first. These migrations have not been applied to any existing database in this task.

Set these server variables through deployment secrets/configuration, not source control:

```dotenv
# Registered public LMS origin, HTTPS, no path. Used for provider return URLs.
PAYMENT_PUBLIC_ORIGIN=https://your-registered-payment-host.example
# Keep empty until the corresponding provider acceptance tests have passed.
PAYMENT_VERIFIED_GATEWAYS=
# Stable encryption secret; preserve it across deployments and retain secure backups.
STREAMING_CREDENTIALS_SECRET=
# At least 32 characters, shared only with the trusted reconciliation scheduler.
CRON_SECRET=

# Use merchant-issued URLs and the action from the issued SOAP contract.
JAZZCASH_CHECKOUT_URL=
JAZZCASH_INQUIRY_URL=
JAZZCASH_INQUIRY_SOAP_ACTION=
JAZZCASH_SANDBOX_CHECKOUT_URL=
JAZZCASH_SANDBOX_INQUIRY_URL=
JAZZCASH_SANDBOX_INQUIRY_SOAP_ACTION=

# RSA QR endpoint and /easypay-service/rest/v5/inquire-transaction.
EASYPAISA_QR_URL=
EASYPAISA_INQUIRY_URL=
EASYPAISA_SANDBOX_QR_URL=
EASYPAISA_SANDBOX_INQUIRY_URL=
```

The adapters allowlist official provider HTTPS hosts and reject redirects. If onboarding supplies a different official host, confirm it with the provider and update the allowlist and tests. Do not substitute a guessed endpoint. HBL Secure Acceptance uses Cybersource's fixed test and live `/pay` endpoints.

Save institution credentials in Settings → Payment gateways. Easypaisa needs account/store IDs, API username/password, institution RSA private key and provider public key. JazzCash needs merchant ID/password/integrity salt. HBL needs the compatible profile ID/access key/signing secret. No real credentials or keys have been supplied or fabricated.

Register these externally reachable URLs with the provider:

| Purpose | Path under PAYMENT_PUBLIC_ORIGIN |
| --- | --- |
| JazzCash browser return | `/api/payments/jazzcash/return` |
| JazzCash merchant SOAP service / WSDL | `/api/webhooks/jazzcash/soap` (GET returns WSDL, POST receives notification) |
| HBL browser receipt/cancel | `/api/payments/hblpay/return` |
| HBL Cybersource Merchant POST URL | `/api/webhooks/hbl-pay` |

Do not depend on browser returns for delivery. Enable JazzCash server notifications and the HBL Merchant POST URL. Easypaisa is confirmed by authenticated, signed server inquiry; the unsigned Easypaisa webhook cannot mark fees paid. Do not log checkout forms or notification bodies: official JazzCash forms include merchant authentication fields. Retain request IDs and redacted error metadata instead.

Schedule an authenticated POST to `/api/cron/payment-reconciliation` every minute, with `Authorization: Bearer <CRON_SECRET>`. It checks up to 12 pending Easypaisa/JazzCash attempts from the last seven days per run, with bounded concurrency and per-attempt throttling. Increase scheduling capacity if the pending queue grows. HBL recovery relies on provider Merchant POST delivery; its Hosted Checkout credentials do not provide a separate inquiry API. Monitor callback delivery and compare provider settlement reports daily. No external scheduler was configured by this task.

## Acceptance and operation

1. Save sandbox credentials and sandbox endpoints. Use the institution gateway dialog's sandbox checkout with an unpaid challan ID. All sandbox receipts must say the fee is unchanged.
2. With each provider, test paid, cancelled, declined, pending, expired, wrong amount, tampered signature, duplicate delivery, browser closure, delayed server notification, inquiry recovery, timeout and credential rotation. Confirm exact payloads and signatures with provider fixtures, especially the unresolved contracts above.
3. Verify both monthly and admission flows, linked-parent access, cross-tenant denial, receipt retention after configuration removal, and late payments after manual fee changes. Reconcile test references with the merchant portal.
4. After provider approval, save production credentials, select Production and enable the institution gateway. Add only accepted gateway IDs (`easypaisa,jazzcash,hblpay`) to `PAYMENT_VERIFIED_GATEWAYS`. Perform a provider-approved small live transaction and confirm receipt, fee balance and merchant settlement. The deployment flag is an operator attestation, not an automated certification.

Pending attempts are reused for 30 minutes to prevent duplicate initiation. Switching gateways during that window is blocked. A declined or ambiguous response remains unconfirmed; do not infer payment from the browser. Before retrying after expiry, check whether the payer was debited. Late verified payments still run the exact-balance checks. REVIEW receipts require human reconciliation/refund with the provider; no automated refund or ledger correction UI is implemented. The system supports whole-PKR challans, consistent with the existing ledger.

## Local verification

`npm run verify:payments` passed 27 tests covering cryptographic validation and isolated in-memory PostgreSQL-compatible settlement, including the actual new migration. It does not load `.env`, contact a real provider, or use the production database. `tsc --noEmit --incremental false` and targeted ESLint checks validate source without building the app. Mock cryptographic fixtures prove local behavior, not interoperability with a merchant account.

The existing dependency audit reports 12 findings, including a critical advisory against the existing Next.js 16.3.2 installation. Neither added payment dependency (`fast-xml-parser`, development-only `@electric-sql/pglite`) is listed. Framework/dependency remediation and its application-wide regression checks remain a separate deployment prerequisite; no blanket dependency downgrade or unrelated upgrade was applied here.
