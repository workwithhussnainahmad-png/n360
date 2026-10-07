# Institution payment gateway audit

Historical audit before remediation. See [implementation and activation guide](payment-gateway-setup.md) for the subsequent local changes, test coverage, and remaining live-payment prerequisites.

Reviewed 2026-09-10. Verdict: the current checkout and callback implementations are not production-ready. Saving credentials and displaying gateway buttons does not establish that real payments work.

This review covers the current working tree, including existing uncommitted gateway changes. It does not establish what is deployed. No production database, merchant credentials, provider transaction, migration, deployment, Debug build, or Release build was used. Application code was not changed during this audit.

## Requested flow and current coverage

| Requirement | Current implementation | Result |
| --- | --- | --- |
| Institution configures its own gateways | Institution role checks, tenant-scoped encrypted credentials, three settings components | Present, but no merchant activation verification |
| Institution generates monthly challans | Existing `generateMonth` action in institution fees API | Present |
| Student sees configured gateways | Student fees API returns configured gateway names; client renders matching buttons | Present; configuration presence alone enables them |
| Student pays outstanding balance | Server reads invoice total minus paid amount and returns a form to POST to a gateway | Provider compatibility incomplete/unproven |
| Payment automatically verified | Three public callbacks update the fee/admission tables | Unsafe/incomplete |
| Payment receipt retained and accessible to all relevant roles | Monthly ledger and basic student receipt cards exist | Parent/institution gateway receipt history and admission receipts incomplete |
| Same process for admission fees | Applicant-authenticated initiation route reads the assigned admission fee | Same settlement defects; weaker state/amount protection |

## Findings

### Critical: Easypaisa accepts unauthenticated claims of successful payment

`src/app/api/webhooks/easypaisa/route.ts:18` explicitly labels its verification a mock. It checks submitted success fields and whether credentials exist, but never authenticates the callback or inquires with Easypaisa. The API proxy passes these public API requests through without requiring login, as callbacks normally need; therefore provider authentication must happen in the handler.

For monthly fees it trusts the submitted amount and inserts a ledger row. For admission fees it marks the fee VERIFIED without checking the amount at all. An institution having Easypaisa configured is enough to reach these writes. This can create false paid records without money moving.

The RSA/signature and exact-payment verifier in `src/lib/easypaisa/protocol.ts` is not imported by either checkout route or the callback. Its existence and passing unit tests do not protect the active payment routes. The active checkout uses only store ID, order ID, amount and merchant URL; configured account credentials and RSA keys are not used by that flow.

### High: HBL protocol is unsubstantiated

`src/app/api/student/fees/pay/route.ts:85` and the corresponding admission route POST generic fields to `https://hblpay.com/checkout`. The callback assumes JSON with `status: success` plus an `x-hbl-signature` HMAC header. Configuration asks only for merchant ID and a webhook secret.

The official HBL page confirms API/redirect integration and merchant onboarding, but does not document that endpoint, these fields, or this callback signature contract. No official integration specification or provider fixtures validating this implementation were found in the reviewed code. Treat this adapter as unverified scaffolding; obtain the HBL-issued integration pack for the institution's exact product before implementing its wire protocol.

### High: no persisted payment attempt or reliable reconciliation

Both initiation routes generate a timestamp-based reference and immediately return a redirect form. They save no order containing the target invoice/application, institution, gateway, merchant identity, expected amount/currency, attempt status, or provider reference.

Callbacks derive the target from supplied reference text; JazzCash additionally uses `pp_BillReference` preferentially. They cannot match a callback to an actual stored attempt and its original financial terms. There is no provider status inquiry or background recovery for a payment whose browser return is lost. The browser return URL is also the webhook URL, which returns JSON instead of a payment result/receipt page.

### High: admission settlement ignores amount and current workflow state

All three callbacks set the admission payment to VERIFIED and the application to FEE_VERIFIED without comparing paid amount with `admissionFeePayments.amount`. They also do not restrict the update to an eligible current state.

A delayed or replayed success can overwrite a later state such as ENROLLED, WITHDRAWN, or REFUND_REQUIRED. A previously paid fee record can be overwritten with a new reference. No dedicated immutable receipt/payment-attempt history is created, and the normal admission event/audit trail is bypassed.

### High: settlement concurrency and retry behavior are incomplete

Monthly callbacks read the invoice before entering their database transaction, calculate a new paid total from that snapshot, and then overwrite the total. Two distinct successful payments handled concurrently can both insert ledger rows but lose one increment in the invoice balance.

There is an existing unique constraint on `(institution_id, receipt_number)`. It can prevent inserting an identical monthly receipt twice, but the handler then returns an internal error rather than acknowledging an already-processed callback. This is not complete idempotency. There is no unique stored gateway order/attempt and no controlled handling of multiple successful attempts for one balance. Callbacks can also update an invoice that was voided after checkout started.

### High: payment values are not fully validated

Monthly callbacks do not require an exact match to the original amount or currency. Easypaisa/HBL use `parseInt`, which truncates fractional values and accepts malformed numeric prefixes. JazzCash divides a parsed amount by 100 even though the ledger stores whole PKR integers. Positive, finite, supported amounts and matching merchant/currency must be required before settlement.

JazzCash does calculate and compare an HMAC, which is a useful foundation, but that alone does not address order persistence, amount matching, state protection or retries. Its reference format `FEE-<id>-<timestamp>` / `ADM-<id>-<timestamp>` also needs validation against the contracted API's field rules. The indexed official v4.2 PDF describes a 20-character transaction-reference field; generated references exceed 20 characters once the local ID has three digits. The PDF download was rejected, so reconfirm the complete character restrictions with the merchant integration pack.

### High: configuration is reported as production-ready without validation

`src/app/api/institution/settings/payment-gateway/route.ts` returns `environment: production` and `ready: true` without any merchant test or activation state. The student and applicant pages display gateways based on decrypted credential presence.

Easypaisa settings validate strings but do not call the existing RSA key validator. The unified encryption wrapper uses purpose `payment-gateways`; the older Easypaisa wrapper uses purpose `easypaisa`. Previously saved credentials using the older format will not decrypt through the new wrapper without migration/re-entry. This is a compatibility risk if the earlier format was deployed; deployment was not checked.

### Medium: receipt access does not meet the requested flow

- Student monthly fees show saved receipt number, amount, method, and time from `feePayments`, provided settlement actually succeeds.
- Parent fees load invoices and manual `feePaymentSubmissions`, not gateway `feePayments`; there is no gateway receipt detail view there.
- Institution fees GET returns invoices, submissions and totals, but not the gateway ledger receipt history.
- Applicant admission UI shows fee status and source bank but does not render the saved transaction reference as a complete receipt.
- Admission callbacks overwrite the existing fee record instead of retaining each verified transaction as an immutable receipt.

A stored LMS receipt based on authenticated provider data can satisfy the receipt requirement; a gateway-provided PDF or screenshot is not necessary. It must identify the institution, payer/target, fee period or application, amount/currency, gateway, order/provider reference, and verified time. Authorized viewers must see the same record.

## Required implementation

1. Stop exposing unverified gateways as ready. The unauthenticated Easypaisa settlement route should be disabled until authenticated verification is connected.
2. Confirm each institution's merchant product, sandbox/live credentials, registered HTTPS return/notification URLs, and the official request/response specification. Do not infer a production endpoint by renaming a sandbox hostname.
3. Add shared payment-attempt and verified-receipt storage for monthly and admission fees, with tenant/target relationships and unique gateway references. Persist the server-calculated amount and merchant identity before checkout.
4. Implement provider adapters from the matching official specifications: initialization, authenticated callback processing, transaction inquiry and normalized verification results.
5. Settle inside one transaction with a locked or conditionally updated attempt and target. Validate institution, merchant, target, exact amount/currency and eligible state. Repeated notifications must return success without recording money twice. Route excess/late payments to reconciliation instead of discarding real money or reopening completed admissions.
6. Update the existing monthly ledger or admission fee and event trail, and create an immutable receipt in that same transaction. Preserve the existing manual enrollment step after FEE_VERIFIED.
7. Provide success/pending/failed result pages, refresh/polling and recovery for missed callbacks. Add authorized receipt history/detail views for student, linked parent, institution and admission applicant; retain access after admission enrollment under the appropriate account relationship.
8. Validate success, failure, cancellation, forged callback, wrong tenant/order/merchant/amount/currency, duplicate callback, simultaneous payments, changed/voided fees, admission state preservation, lost browser return, and receipt authorization. Only mark a gateway live after provider acceptance testing.

## Official documentation checked

- [JazzCash official API reference](https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html): retrieved; documents transaction references, amount/currency, integrity hashes and a Retrieve operation. This supports using authenticated provider responses and recovery queries; it is not evidence the current adapter has passed merchant acceptance tests.
- [JazzCash official merchant integration PDF](https://payments.jazzcash.com.pk/SandboxDocumentation/Content/documentation/Payment%20Gateway%20Integration%20Guide%20for%20Merchants-v4.2.pdf): search-indexed field information was available, but direct access returned Request Rejected. Full version-specific constraints still need confirmation.
- [Easypaisa official integration guides](https://easypay.easypaisa.com.pk/easypay-merchant/faces/pg/site/IntegrationGuides.jsf): located through the official site; direct retrieval timed out. [Merchant portal](https://merchantportal.easypaisa.com.pk/) lists QR integration. Neither establishes the wire format for the current redirect/callback code. Existing local `docs/easypaisa-integration-findings.md` records earlier QR/inquiry investigation, but its implementation description is stale relative to today's active routes.
- [HBL official eCommerce Checkout](https://www.hbl.com/business/digital-payments/hblpay-checkout): retrieved; describes merchant integration through APIs or redirection and provider transaction history. It does not substantiate the generic endpoint/HMAC protocol used in this code.

## Verification performed

Ran `node --experimental-strip-types --test scripts/verify-easypaisa.mjs`: all eight existing local tests passed using generated keys. These test the disconnected protocol helpers, not real provider compatibility or active callback safety. No build, provider transaction, database change or deployment was performed. The only change from this audit is this report.
