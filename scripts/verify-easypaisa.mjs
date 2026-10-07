import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { credentialsHeader, generateQrPayload, inquireTransactionPayload, compactSignedJson, pkrMinorUnits, signRequestJson, verifyPayment, verifyResponseJson } from "../src/lib/easypaisa/protocol.ts";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const expected = { orderId: "LMS-TEST-1", storeId: "43", accountNum: "test-merchant", amount: 8500 };
const transaction = { ...expected, storeId: 43, transactionAmount: "8500.00", transactionStatus: "PAID", responseCode: "0000", storeName: "Test Store", paymentMode: "QR" };
function check(changes = {}, signatureKey = keys.privateKey) {
  const raw = JSON.stringify({ ...transaction, ...changes });
  return verifyPayment(raw, signRequestJson(raw, signatureKey), keys.publicKey, expected);
}

test("documented payloads include the server amount and institution identifiers", () => {
  assert.deepEqual(generateQrPayload(expected), { storeId: "43", paymentMethod: "QR_PAYMENT_METHOD", orderRefNum: "LMS-TEST-1", amount: "8500" });
  assert.deepEqual(inquireTransactionPayload(expected), { orderId: "LMS-TEST-1", storeId: "43", accountNum: "test-merchant" });
  assert.equal(credentialsHeader("partner", "pass:word"), Buffer.from("partner:pass:word").toString("base64"));
  assert.throws(() => credentialsHeader("bad:partner", "password"));
});
test("whitespace normalization preserves order and string contents", () => {
  const raw = '{ "z": "a  b", "a": "quote\\\" and \\\\" }';
  assert.deepEqual(JSON.parse(compactSignedJson(raw)), JSON.parse(raw));
  assert.ok(compactSignedJson(raw).startsWith('{"z":'));
});
test("valid signed paid response matches exact amount", () => {
  assert.equal(check().transactionAmount, "8500.00");
  assert.equal(check({ transactionAmount: 8500 }).transactionStatus, "PAID");
});
test("nonpaid statuses and unsuccessful response codes cannot settle", () => {
  for (const transactionStatus of ["PENDING", "FAILED", "BLOCKED", "EXPIRED", "REVERSED", "SUCCESS", "paid", null]) {
    assert.throws(() => check({ transactionStatus }));
  }
  assert.throws(() => check({ responseCode: "0010" }));
  assert.throws(() => check({ responseCode: 0 }));
});
test("wrong order, merchant, and store cannot settle", () => {
  assert.throws(() => check({ orderId: "another-order" }));
  assert.throws(() => check({ accountNum: "another-tenant" }));
  assert.throws(() => check({ storeId: 44 }));
  assert.throws(() => check({ storeId: null }));
});
test("underpayments, overpayments, and malformed amounts cannot settle", () => {
  for (const transactionAmount of ["5000", "8500.01", "8500.001", "8.5e3", "-8500", null, "", " 8500", "08500", {}, Infinity]) {
    assert.throws(() => check({ transactionAmount }));
  }
  assert.equal(pkrMinorUnits("0.10"), 10n);
  assert.equal(pkrMinorUnits("8500.00"), 850000n);
});
test("tampering, wrong public key, missing and double-encoded signatures fail", () => {
  const raw = JSON.stringify(transaction);
  const signature = signRequestJson(raw, keys.privateKey);
  assert.equal(verifyResponseJson(raw, signature, keys.publicKey), true);
  assert.equal(verifyResponseJson(raw.replace("8500.00", "5000.00"), signature, keys.publicKey), false);
  assert.equal(verifyResponseJson(raw, signature, otherKeys.publicKey), false);
  assert.equal(verifyResponseJson(raw, "", keys.publicKey), false);
  assert.equal(verifyResponseJson(raw, Buffer.from(signature).toString("base64"), keys.publicKey), false);
  assert.throws(() => check({}, otherKeys.privateKey));
});
test("non-2048-bit keys are rejected", () => {
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  assert.throws(() => signRequestJson("{}", weak.privateKey));
});
