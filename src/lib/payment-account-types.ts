export type PaymentAccount = {
  id: string;
  providerName: string;
  accountTitle: string;
  accountNumber: string;
  qrUrl: string | null;
};
