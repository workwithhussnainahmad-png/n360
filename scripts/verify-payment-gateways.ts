import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { db as productionDb } from "../src/db";
import { encryptGatewayCredentials, decryptGatewayCredentials } from "../src/lib/payment-credentials";
import { startPayment, processJazzCashCallback, processHblCallback, processJazzCashNotification, checkPayment } from "../src/lib/payments/service";
import { jazzCashHash, verifyJazzCash, pakistanTimestamp, parseJazzCashForm } from "../src/lib/payments/jazzcash";
import { parseJazzCashSoap, verifyJazzCashUpdate, verifyInquiryResult } from "../src/lib/payments/jazzcash-soap";
import { hblCheckout, verifyHbl, orderUuid } from "../src/lib/payments/hbl-cybersource";
import { signedRequest, signedResponse, qrImage } from "../src/lib/payments/easypaisa";
import { signRequestJson } from "../src/lib/easypaisa/protocol";
import { accountPaymentScope } from "../src/lib/payments/receipt-scope";
import { gatewayReadiness, activeGateways } from "../src/lib/payments/config";

const jazz = { merchantId: "TESTMER1", password: "testpass", hashKey: "test-only-integrity-key" };
const hbl = { integration: "cybersource-hosted" as const, profileId: "test-profile", accessKey: "test-access", secretKey: "test-only-secret" };
const now = new Date("2026-09-10T12:00:00Z");
const order = { id: "T000000000000000001", amount: 1500, merchantId: jazz.merchantId, createdAt: now, expiresAt: new Date(now.getTime() + 1800000), returnUrl: "https://student.example.com/api/payments/jazzcash/return" };
function signedJazz(overrides: Record<string, string> = {}, id = order.id) {
  const fields = { pp_TxnRefNo: id, pp_MerchantID: jazz.merchantId, pp_BillReference: id, pp_Amount: "150000", pp_TxnCurrency: "PKR", pp_ResponseCode: "000", pp_RetreivalReferenceNo: "123456789012", ...overrides };
  return { ...fields, pp_SecureHash: jazzCashHash(fields, jazz.hashKey) };
}
function signedHbl(id: string, overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = { signed_field_names: "", decision: "ACCEPT", reason_code: "100", req_reference_number: id,
    req_amount: "1500.00", req_currency: "PKR", req_profile_id: hbl.profileId, req_access_key: hbl.accessKey,
    req_transaction_uuid: orderUuid(id), req_transaction_type: "sale", transaction_id: `provider-${id}`, ...overrides };
  fields.signed_field_names = Object.keys(fields).join(",");
  fields.signature = createHmac("sha256", hbl.secretKey).update(fields.signed_field_names.split(",").map((name) => `${name}=${fields[name]}`).join(",")).digest("base64");
  return fields;
}

test("JazzCash matches the official v4.2 hash vector", () => {
  assert.equal(jazzCashHash({ pp_MerchantID: "MER123", pp_OrderInfo: "A48cvE28", pp_Amount: "2995" }, "0F5DD14AE2").toLowerCase(), "c7689cda7474eb1adcd343fd0c0b676bad0ba66361cc46db589bdb0da4c1c867");
  assert.equal(pakistanTimestamp(now), "20260910170000");
});
test("JazzCash rejects forged and correctly signed mismatched payment terms", () => {
  assert.equal(verifyJazzCash(signedJazz(), order, jazz).paid, true);
  for (const overrides of [{ pp_Amount: "0" }, { pp_Amount: "150001" }, { pp_Amount: "150000junk" }, { pp_TxnCurrency: "USD" }, { pp_MerchantID: "OTHER" }, { pp_BillReference: "OTHER" }, { pp_TxnRefNo: "OTHER" }, { pp_RetreivalReferenceNo: "" }] as Record<string, string>[]) {
    assert.throws(() => verifyJazzCash(signedJazz(overrides), order, jazz));
  }
  assert.throws(() => verifyJazzCash({ ...signedJazz(), pp_Amount: "1" }, order, jazz));
  assert.throws(() => verifyJazzCash({ ...signedJazz(), pp_SecureHash: "" }, order, jazz));
  assert.equal(verifyJazzCash(signedJazz({ pp_ResponseCode: "110" }), order, jazz).paid, false);
  assert.throws(() => parseJazzCashForm("pp_Amount=1&pp_Amount=2"));
});
test("HBL Hosted Checkout requires signed identities, exact amount, sale acceptance", () => {
  const hblOrder = { ...order, merchantId: hbl.profileId };
  assert.equal(verifyHbl(signedHbl(order.id), hblOrder, hbl).paid, true);
  for (const overrides of [{ req_amount: "1.00" }, { req_currency: "USD" }, { req_profile_id: "other" }, { req_transaction_uuid: orderUuid("other") }, { req_reference_number: "other" }, { req_transaction_type: "authorization" }, { transaction_id: "" }] as Record<string, string>[]) {
    assert.throws(() => verifyHbl(signedHbl(order.id, overrides), hblOrder, hbl));
  }
  assert.equal(verifyHbl(signedHbl(order.id, { decision: "REVIEW" }), hblOrder, hbl).paid, false);
  assert.equal(verifyHbl(signedHbl(order.id, { decision: "CANCEL", reason_code: "200" }), hblOrder, hbl).paid, false);
  assert.throws(() => verifyHbl({ ...signedHbl(order.id), signed_field_names: "decision" }, hblOrder, hbl));
  const checkout = hblCheckout(hblOrder, hbl);
  assert.equal(checkout.transaction_type, "sale"); assert.equal(checkout.amount, "1500.00");
  assert.ok(checkout.signed_field_names.includes("override_custom_receipt_page"));
});
test("Easypaisa verifies exact signed envelopes and only permits PNG QR data", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const raw = '{ "responseCode": "0000", "qrCode": "fixture" }';
  const envelope = `{"response":${raw},"signature":${JSON.stringify(signRequestJson(raw, keys.privateKey))}}`;
  assert.equal(signedResponse(envelope, keys.publicKey).value.responseCode, "0000");
  assert.throws(() => signedResponse(envelope.replace("fixture", "tampered"), keys.publicKey));
  assert.throws(() => signedResponse('{"responseCode":"0000"}', keys.publicKey));
  assert.deepEqual(JSON.parse(signedRequest({ orderId: "ABC" }, keys.privateKey)).request, { orderId: "ABC" });
  assert.throws(() => qrImage("data:image/svg+xml;base64,AAAA")); assert.throws(() => qrImage("<svg/>"));
});
test("SOAP notifications reject XML entities, repeated fields, wrong order and date", () => {
  const fields = { pp_Version: "1.1", pp_TxnType: "MWALLET", pp_Password: jazz.password, pp_TxnRefNo: order.id,
    pp_TxnDateTime: pakistanTimestamp(now), pp_ResponseCode: "000", pp_RetreivalReferenceNo: "123456789012" };
  const signed = { ...fields, pp_SecureHash: jazzCashHash(fields, jazz.hashKey) };
  const xml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><UpdatePaymentStatus>${Object.entries(signed).map(([k,v]) => `<${k}>${v}</${k}>`).join("")}</UpdatePaymentStatus></s:Body></s:Envelope>`;
  assert.equal(verifyJazzCashUpdate(parseJazzCashSoap(xml), order, jazz).paid, true);
  assert.throws(() => parseJazzCashSoap(`<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>${xml}`));
  assert.throws(() => parseJazzCashSoap(xml.replace("</UpdatePaymentStatus>", "<pp_TxnRefNo>OTHER</pp_TxnRefNo></UpdatePaymentStatus>")));
  assert.throws(() => verifyJazzCashUpdate(signed, { ...order, createdAt: new Date(0) }, jazz));
  assert.throws(() => verifyInquiryResult("000" + " ".repeat(338), jazz.hashKey));
});

let pg: PGlite; let database: typeof productionDb; let counter = 100;
before(async () => {
  // No .env file, network database, migrations command or real provider is used by this suite.
  process.env.STREAMING_CREDENTIALS_SECRET = "local-tests-only-encryption-key-32-characters";
  process.env.PAYMENT_PUBLIC_ORIGIN = "https://student.example.com";
  process.env.PAYMENT_VERIFIED_GATEWAYS = "jazzcash,easypaisa,hblpay";
  process.env.JAZZCASH_CHECKOUT_URL = "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
  process.env.JAZZCASH_SANDBOX_CHECKOUT_URL = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
  process.env.JAZZCASH_INQUIRY_URL = "https://payments.jazzcash.com.pk/ExternalStatusService/StatusService_v11.svc";
  process.env.JAZZCASH_INQUIRY_SOAP_ACTION = "http://tempuri.org/IStatusService/DoPaymentStatusInquiryNew";
  pg = await PGlite.create(); database = drizzle(pg, { schema }) as unknown as typeof productionDb;
  // Existing application tables are fixtures; the NEW migration itself is executed unchanged.
  for (const table of [schema.institutions, schema.students, schema.feeInvoices, schema.feePayments, schema.admissionApplications,
    schema.admissionFeePayments, schema.admissionApplicationEvents, schema.institutionPaymentGateways, schema.parentStudents, schema.admissionEnrollments]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const type = column.columnType === "PgEnumColumn" ? "text" : column.getSQLType();
      return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}`;
    });
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await pg.exec(await readFile(new URL("../drizzle/0057_gateway_payment_attempts.sql", import.meta.url), "utf8"));
  await pg.exec("CREATE UNIQUE INDEX fixture_receipt_unique ON fee_payments(institution_id, receipt_number)");
  await pg.exec("INSERT INTO institutions(id,name) VALUES (1,'Test School'),(2,'Other School'); INSERT INTO students(id,institution_id,name) VALUES (1,1,'Student One'),(2,2,'Student Two')");
  await database.insert(schema.institutionPaymentGateways).values({ institutionId: 1, credentialsEncrypted: encryptGatewayCredentials(1, {
    jazzcash: jazz, hblpay: hbl, settings: { jazzcash: { enabled: true, environment: "production" }, hblpay: { enabled: true, environment: "production" } },
  }) });
});
after(async () => { await pg?.close(); });
async function invoice() {
  const id = counter++;
  await pg.query("INSERT INTO fee_invoices(id,institution_id,student_id,total_amount,paid_amount,status,billing_month) VALUES ($1,1,1,1500,0,'DUE','2026-09')", [id]);
  return id;
}
async function start(invoiceId: number, gateway: "jazzcash" | "hblpay" = "jazzcash") {
  return startPayment(1, { invoiceId, studentId: 1 }, gateway, false, database);
}

test("configuration is tenant-bound and saving credentials alone cannot enable payments", () => {
  const encrypted = encryptGatewayCredentials(1, { jazzcash: jazz });
  assert.equal(decryptGatewayCredentials(2, encrypted), null);
  assert.deepEqual(activeGateways({ jazzcash: jazz }), []);
  assert.equal(gatewayReadiness({ jazzcash: jazz, settings: { jazzcash: { enabled: true, environment: "sandbox" } } }, "jazzcash").ready, false);
});
test("monthly checkout persists original terms, reuses pending attempt, rejects another tenant", async () => {
  const id = await invoice(); const first = await start(id); const again = await start(id);
  assert.equal(first.attemptId, again.attemptId); assert.match(first.attemptId, /^[A-Za-z0-9]{1,20}$/);
  await assert.rejects(startPayment(1, { invoiceId: id, studentId: 2 }, "jazzcash", false, database));
  await assert.rejects(startPayment(2, { invoiceId: id, studentId: 2 }, "jazzcash", false, database));
  await assert.rejects(pg.query("UPDATE gateway_payment_attempts SET amount=1 WHERE id=$1", [first.attemptId]));
});
test("duplicate callbacks credit monthly fees exactly once and retain immutable receipt", async () => {
  const id = await invoice(); const { attemptId } = await start(id); const callback = signedJazz({}, attemptId);
  assert.equal((await processJazzCashCallback(callback, database)).status, "PAID");
  assert.equal((await processJazzCashCallback(callback, database)).status, "PAID");
  const paid = await pg.query<{ paid_amount: number }>("SELECT paid_amount FROM fee_invoices WHERE id=$1", [id]);
  assert.equal(paid.rows[0].paid_amount, 1500);
  assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1", [id])).rows.length, 1);
  await assert.rejects(pg.query("UPDATE gateway_payment_attempts SET provider_reference='changed' WHERE id=$1", [attemptId]));
});
test("forged and wrong-amount callbacks leave the ledger untouched", async () => {
  const id = await invoice(); const { attemptId } = await start(id);
  await assert.rejects(processJazzCashCallback(signedJazz({ pp_Amount: "1" }, attemptId), database));
  await assert.rejects(processJazzCashCallback({ ...signedJazz({}, attemptId), pp_SecureHash: "" }, database));
  assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1", [id])).rows.length, 0);
});
test("payments for changed or voided fees are retained for review without changing the fee", async () => {
  for (const update of ["status='VOID'", "paid_amount=100", "total_amount=2000"]) {
    const id = await invoice(); const { attemptId } = await start(id); await pg.exec(`UPDATE fee_invoices SET ${update} WHERE id=${id}`);
    assert.equal((await processJazzCashCallback(signedJazz({}, attemptId), database)).status, "REVIEW");
    assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1", [id])).rows.length, 0);
    assert.equal((await pg.query("SELECT receipt_number FROM gateway_payment_attempts WHERE id=$1", [attemptId])).rows.length, 1);
  }
});
test("a failed ledger write rolls back the receipt and balance together", async () => {
  const id = await invoice(); const { attemptId } = await start(id);
  await pg.exec(`CREATE FUNCTION fail_fixture_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test ledger failure'; END $$;
    CREATE TRIGGER fail_fixture BEFORE INSERT ON fee_payments FOR EACH ROW EXECUTE FUNCTION fail_fixture_payment();`);
  await assert.rejects(processJazzCashCallback(signedJazz({}, attemptId), database));
  await pg.exec("DROP TRIGGER fail_fixture ON fee_payments; DROP FUNCTION fail_fixture_payment()");
  const [attempt] = await database.select().from(schema.gatewayPaymentAttempts).where(eq(schema.gatewayPaymentAttempts.id, attemptId));
  assert.equal(attempt.status, "PENDING"); assert.equal(attempt.receiptNumber, null);
  assert.equal((await processJazzCashCallback(signedJazz({}, attemptId), database)).status, "PAID");
});
test("admission payment validates the amount and does not reopen an enrolled application", async () => {
  const id = counter++;
  await pg.query("INSERT INTO admission_applications(id,institution_id,applicant_id,student_name,status) VALUES ($1,1,77,'Applicant','FEE_PENDING')", [id]);
  await pg.query("INSERT INTO admission_fee_payments(id,institution_id,application_id,amount,status) VALUES ($1,1,$1,1500,'PENDING')", [id]);
  const { attemptId } = await startPayment(1, { applicationId: id, applicantId: 77 }, "jazzcash", false, database);
  await assert.rejects(processJazzCashCallback(signedJazz({ pp_Amount: "1" }, attemptId), database));
  await processJazzCashCallback(signedJazz({}, attemptId), database);
  await pg.query("UPDATE admission_applications SET status='ENROLLED' WHERE id=$1", [id]);
  await processJazzCashCallback(signedJazz({}, attemptId), database);
  assert.equal((await pg.query<{ status: string }>("SELECT status FROM admission_applications WHERE id=$1", [id])).rows[0].status, "ENROLLED");
  assert.equal((await pg.query("SELECT * FROM admission_application_events WHERE application_id=$1", [id])).rows.length, 1);
});
test("HBL hosted notifications settle through the same ledger and replay guard", async () => {
  const id = await invoice(); const { attemptId } = await start(id, "hblpay");
  assert.equal((await processHblCallback(signedHbl(attemptId), database)).status, "PAID");
  assert.equal((await processHblCallback(signedHbl(attemptId), database)).status, "PAID");
  assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1", [id])).rows.length, 1);
});
test("JazzCash SOAP notification recovers payment without a browser return", async () => {
  const id = await invoice(); const { attemptId } = await start(id);
  const [attempt] = await database.select().from(schema.gatewayPaymentAttempts).where(eq(schema.gatewayPaymentAttempts.id, attemptId));
  const fields = { pp_Version: "1.1", pp_TxnType: "MWALLET", pp_Password: jazz.password, pp_TxnRefNo: attemptId,
    pp_TxnDateTime: pakistanTimestamp(attempt.createdAt), pp_ResponseCode: "000", pp_RetreivalReferenceNo: "123456789012" };
  assert.match(await processJazzCashNotification({ ...fields, pp_SecureHash: jazzCashHash(fields, jazz.hashKey) }, database), /UpdatePaymentStatusResult/);
  assert.equal((await pg.query<{ paid_amount: number }>("SELECT paid_amount FROM fee_invoices WHERE id=$1", [id])).rows[0].paid_amount, 1500);
});


test("receipt scopes isolate institutions, students and linked parents", async () => {
  const id = await invoice(); const { attemptId } = await start(id);
  await pg.exec("INSERT INTO parent_students(id,institution_id,parent_id,student_id) VALUES (1,1,90,1),(2,2,91,1)");
  for (const [role, userId, tenant, count] of [["INSTITUTION",1,1,1],["INSTITUTION",1,2,0],["STUDENT",1,1,1],["STUDENT",2,1,0],["PARENT",90,1,1],["PARENT",91,1,0]] as const) {
    const scope = accountPaymentScope(role, userId, tenant); assert.ok(scope);
    assert.equal((await database.select().from(schema.gatewayPaymentAttempts).where(and(scope, eq(schema.gatewayPaymentAttempts.id, attemptId)))).length, count);
  }
  assert.equal(accountPaymentScope("TEACHER",1,1), null);
});

test("sandbox success retains a test receipt without changing real fees", async () => {
  const [original] = await database.select().from(schema.institutionPaymentGateways).where(eq(schema.institutionPaymentGateways.institutionId, 1));
  try {
    await database.update(schema.institutionPaymentGateways).set({ credentialsEncrypted: encryptGatewayCredentials(1, { jazzcash: jazz, settings: { jazzcash: { enabled: false, environment: "sandbox" } } }) }).where(eq(schema.institutionPaymentGateways.institutionId,1));
    const id = await invoice(); const { attemptId } = await startPayment(1, { invoiceId: id, studentId: 1 }, "jazzcash", true, database);
    assert.equal((await processJazzCashCallback(signedJazz({}, attemptId), database)).status,"REVIEW");
    assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1",[id])).rows.length,0);
    assert.equal((await pg.query<{paid_amount:number}>("SELECT paid_amount FROM fee_invoices WHERE id=$1",[id])).rows[0].paid_amount,0);
  } finally { await database.update(schema.institutionPaymentGateways).set({ credentialsEncrypted: original.credentialsEncrypted }).where(eq(schema.institutionPaymentGateways.institutionId,1)); }
});

test("Easypaisa QR and signed inquiry settle only after exact amount verification", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const credentials = { accountNum: "TESTACCOUNT", storeId: "123", username: "test", password: "test", privateKey: keys.privateKey, easypaisaPublicKey: keys.publicKey };
  const [original] = await database.select().from(schema.institutionPaymentGateways).where(eq(schema.institutionPaymentGateways.institutionId,1));
  const originalFetch = globalThis.fetch; let amount = "1.00";
  process.env.EASYPAISA_QR_URL = "https://easypay.easypaisa.com.pk/easypay-service/rest/QRBusinessRestService/v1/generate-qr";
  process.env.EASYPAISA_INQUIRY_URL = "https://easypay.easypaisa.com.pk/easypay-service/rest/v5/inquire-transaction";
  globalThis.fetch = async (_url, options) => {
    const { request } = JSON.parse(String(options?.body));
    const response = request.paymentMethod ? { responseCode: "0000", qrCode: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=" } :
      { responseCode: "0000", transactionStatus: "PAID", orderId: request.orderId, accountNum: credentials.accountNum, storeId: credentials.storeId, transactionAmount: amount };
    const raw = JSON.stringify(response);
    return new Response(JSON.stringify({ response, signature: signRequestJson(raw, keys.privateKey) }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    await database.update(schema.institutionPaymentGateways).set({ credentialsEncrypted: encryptGatewayCredentials(1, { easypaisa: credentials, settings: { easypaisa: { enabled: true, environment: "production" } } }) }).where(eq(schema.institutionPaymentGateways.institutionId,1));
    const id = await invoice(); const { attemptId } = await startPayment(1,{ invoiceId: id, studentId: 1 },"easypaisa",false,database);
    await assert.rejects(checkPayment(attemptId,database));
    assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1",[id])).rows.length,0);
    amount = "1500.00";
    await pg.query("UPDATE gateway_payment_attempts SET last_checked_at=NULL WHERE id=$1",[attemptId]);
    assert.equal((await checkPayment(attemptId,database)).status,"PAID");
    assert.equal((await checkPayment(attemptId,database)).status,"PAID");
    assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1",[id])).rows.length,1);
  } finally {
    globalThis.fetch = originalFetch;
    await database.update(schema.institutionPaymentGateways).set({ credentialsEncrypted: original.credentialsEncrypted }).where(eq(schema.institutionPaymentGateways.institutionId,1));
  }
});


test("late payment on an already enrolled admission is retained without reverting state", async () => {
  const id = counter++;
  await pg.query("INSERT INTO admission_applications(id,institution_id,applicant_id,student_name,status) VALUES ($1,1,77,'Applicant','FEE_PENDING')",[id]);
  await pg.query("INSERT INTO admission_fee_payments(id,institution_id,application_id,amount,status) VALUES ($1,1,$1,1500,'PENDING')",[id]);
  const { attemptId } = await startPayment(1,{ applicationId: id, applicantId: 77 },"jazzcash",false,database);
  await pg.query("UPDATE admission_applications SET status='ENROLLED' WHERE id=$1",[id]);
  await pg.query("UPDATE admission_fee_payments SET status='VERIFIED' WHERE application_id=$1",[id]);
  assert.equal((await processJazzCashCallback(signedJazz({},attemptId),database)).status,"REVIEW");
  assert.equal((await pg.query<{status:string}>("SELECT status FROM admission_applications WHERE id=$1",[id])).rows[0].status,"ENROLLED");
  assert.equal((await pg.query("SELECT * FROM admission_application_events WHERE application_id=$1",[id])).rows.length,0);
});

test("two confirmed orders cannot credit the same invoice twice", async () => {
  const id = await invoice(); const { attemptId } = await start(id);
  const [original] = await database.select().from(schema.gatewayPaymentAttempts).where(eq(schema.gatewayPaymentAttempts.id,attemptId));
  const lateId = `T${String(counter++).padStart(18,"0")}`;
  await database.insert(schema.gatewayPaymentAttempts).values({ ...original, id: lateId, createdAt: new Date(Date.now()-3600000), expiresAt: new Date(Date.now()-1800000) });
  const outcomes = await Promise.all([processJazzCashCallback(signedJazz({},attemptId),database),processJazzCashCallback(signedJazz({},lateId),database)]);
  assert.deepEqual(outcomes.map((r)=>r.status).sort(),["PAID","REVIEW"]);
  assert.equal((await pg.query("SELECT * FROM fee_payments WHERE invoice_id=$1",[id])).rows.length,1);
  assert.equal((await pg.query<{paid_amount:number}>("SELECT paid_amount FROM fee_invoices WHERE id=$1",[id])).rows[0].paid_amount,1500);
});
