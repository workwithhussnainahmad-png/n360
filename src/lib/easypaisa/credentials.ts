import { decryptStreamingCredentials, encryptStreamingCredentials } from "@/lib/streaming-credentials";
import { validateEasypaisaKeys, type EasypaisaCredentials } from "./protocol";

// Use the existing authenticated secret-storage implementation. Binding tenant ID
// inside the ciphertext also rejects a blob accidentally copied to another tenant.
export function encryptEasypaisaCredentials(institutionId: number, credentials: EasypaisaCredentials) {
  validateEasypaisaKeys(credentials);
  return encryptStreamingCredentials({ ...credentials, institutionId: String(institutionId), purpose: "easypaisa" });
}

export function decryptEasypaisaCredentials(institutionId: number, encrypted: string): EasypaisaCredentials {
  const value = decryptStreamingCredentials(encrypted);
  if (!value || value.institutionId !== String(institutionId) || value.purpose !== "easypaisa") {
    throw new Error("Easypaisa configuration unavailable");
  }
  const credentials = {
    accountNum: value.accountNum,
    storeId: value.storeId,
    username: value.username,
    password: value.password,
    privateKey: value.privateKey,
    easypaisaPublicKey: value.easypaisaPublicKey,
  };
  if (Object.values(credentials).some((field) => typeof field !== "string" || !field)) {
    throw new Error("Easypaisa configuration unavailable");
  }
  validateEasypaisaKeys(credentials);
  return credentials;
}
