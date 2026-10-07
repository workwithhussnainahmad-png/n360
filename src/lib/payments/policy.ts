export const GATEWAYS = ["easypaisa", "jazzcash", "hblpay"] as const;
export type Gateway = typeof GATEWAYS[number];
export type PaymentEnvironment = "sandbox" | "production";

export function isGateway(value: unknown): value is Gateway {
  return typeof value === "string" && GATEWAYS.includes(value as Gateway);
}

export function validAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 21_474_836) {
    throw new Error("Invalid payment amount");
  }
  return amount;
}

// Never infer protocol support from the presence of merchant credentials.
export const adapterAvailable: Record<Gateway, boolean> = {
  jazzcash: true,
  easypaisa: true,
  hblpay: true,
};

export function settlementDecision(
  amount: number,
  target: { kind: "FEE"; status: string; totalAmount: number; paidAmount: number }
    | { kind: "ADMISSION"; status: string; feeStatus: string; amount: number },
): "PAID" | "REVIEW" {
  validAmount(amount);
  if (target.kind === "FEE") {
    return ["DUE", "PARTIAL"].includes(target.status)
      && target.totalAmount - target.paidAmount === amount ? "PAID" : "REVIEW";
  }
  return ["FEE_PENDING", "FEE_VERIFICATION"].includes(target.status)
    && ["PENDING", "REJECTED", "SUBMITTED"].includes(target.feeStatus)
    && target.amount === amount ? "PAID" : "REVIEW";
}
