import { decryptStreamingCredentials, encryptStreamingCredentials } from "@/lib/streaming-credentials";

export interface GatewayCredentials {
  settings?: Partial<Record<"easypaisa" | "jazzcash" | "hblpay", { enabled: boolean; environment: "sandbox" | "production" }>>;
  easypaisa?: {
    accountNum: string;
    storeId: string;
    username: string;
    password: string;
    privateKey: string;
    easypaisaPublicKey: string;
  };
  jazzcash?: {
    merchantId: string;
    password: string;
    hashKey: string;
  };
  hblpay?: {
    integration: "cybersource-hosted";
    profileId: string;
    accessKey: string;
    secretKey: string;
  };
}

// Unified credentials storage helper
export function encryptGatewayCredentials(institutionId: number, credentials: GatewayCredentials) {
  const payload: Record<string, string> = {
    institutionId: String(institutionId),
    purpose: "payment-gateways"
  };
  
  if (credentials.easypaisa) payload.easypaisa = JSON.stringify(credentials.easypaisa);
  if (credentials.jazzcash) payload.jazzcash = JSON.stringify(credentials.jazzcash);
  if (credentials.hblpay) payload.hblpay = JSON.stringify(credentials.hblpay);
  if (credentials.settings) payload.settings = JSON.stringify(credentials.settings);
  
  return encryptStreamingCredentials(payload);
}

export function decryptGatewayCredentials(institutionId: number, encrypted: string): GatewayCredentials | null {
  try {
    const value = decryptStreamingCredentials(encrypted);
    if (!value || value.institutionId !== String(institutionId)) {
      return null;
    }
    // Retain configurations saved by the earlier tenant-bound Easypaisa module.
    if (value.purpose === "easypaisa") {
      return { easypaisa: { accountNum: value.accountNum, storeId: value.storeId, username: value.username,
        password: value.password, privateKey: value.privateKey, easypaisaPublicKey: value.easypaisaPublicKey } };
    }
    if (value.purpose !== "payment-gateways") return null;
    
    return {
      settings: value.settings ? JSON.parse(value.settings) : undefined,
      easypaisa: value.easypaisa ? JSON.parse(value.easypaisa) : undefined,
      jazzcash: value.jazzcash ? JSON.parse(value.jazzcash) : undefined,
      hblpay: value.hblpay ? JSON.parse(value.hblpay) : undefined,
    };
  } catch {
    return null;
  }
}
