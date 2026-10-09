import { createHmac, timingSafeEqual } from "node:crypto";
const keyIdPattern = /^[A-Za-z0-9_-]{1,16}$/;
function signature(payload: Buffer, secret: string, keyId?: string) {
  return createHmac("sha256", secret).update(keyId ? "nisaab360:student-card:v2:" + keyId + ":" : "nisaab360:student-card:v1:").update(payload).digest().subarray(0,16);
}
function currentKey() {
  const secret=process.env.STUDENT_QR_SIGNING_SECRET;
  if(!secret)return null;
  const id=process.env.STUDENT_QR_KEY_ID || "v1";
  if(secret.length<32 || !keyIdPattern.test(id))throw new Error("Invalid student QR signing configuration");
  return {id,secret};
}
export function createStudentVerificationToken(studentId:number,institutionId:number,createdAt:Date) {
  const payload=Buffer.alloc(16);payload.writeUInt32BE(studentId,0);payload.writeUInt32BE(institutionId,4);payload.writeBigUInt64BE(BigInt(createdAt.getTime()),8);
  const key=currentKey();
  const secret=key?.secret || process.env.JWT_SECRET;
  if(!secret)throw new Error("Student verification signing is not configured");
  const token=Buffer.concat([payload,signature(payload,secret,key?.id)]).toString("base64url");
  return key ? key.id + "." + token : token;
}
export function readStudentVerificationToken(token:string) {
  if(!/^(?:[A-Za-z0-9_-]{1,16}\.)?[A-Za-z0-9_-]{43}$/.test(token))return null;
  const pieces=token.split("."),id=pieces.length===2?pieces[0]:undefined,encoded=pieces.at(-1)!;
  const bytes=Buffer.from(encoded,"base64url");if(bytes.length!==32 || bytes.toString("base64url")!==encoded)return null;
  const key=currentKey();let secret:string|undefined;
  if(id) {
    if(id===key?.id)secret=key.secret;
    else {
      const oldKeys:unknown=JSON.parse(process.env.STUDENT_QR_PREVIOUS_KEYS || "[]");
      if(!Array.isArray(oldKeys) || oldKeys.length>3)throw new Error("Invalid previous QR keys");
      const old=oldKeys.find(entry=>entry && entry.id===id && typeof entry.secret==="string" && entry.secret.length>=32 && typeof entry.expiresAt==="string" && Date.parse(entry.expiresAt)>Date.now());
      secret=old?.secret;
    }
  } else {
    if(key && !(Date.parse(process.env.STUDENT_QR_LEGACY_VALID_UNTIL || "")>Date.now()))return null;
    secret=process.env.STUDENT_QR_LEGACY_SECRET || process.env.JWT_SECRET;
  }
  if(!secret)return null;
  const payload=bytes.subarray(0,16);if(!timingSafeEqual(bytes.subarray(16),signature(payload,secret,id)))return null;
  const studentId=payload.readUInt32BE(0),institutionId=payload.readUInt32BE(4),createdAt=Number(payload.readBigUInt64BE(8));
  if(!studentId || studentId>2147483647 || !institutionId || institutionId>2147483647 || !Number.isSafeInteger(createdAt))return null;
  return {studentId,institutionId,createdAt};
}
