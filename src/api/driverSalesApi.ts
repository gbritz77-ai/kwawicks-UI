import { api } from "./apiClient";

export type DriverSaleLineRequest = {
  speciesId: string;
  quantity: number;
  unitPrice: number;  // ex-VAT
  vatRate: number;
};

export type SplitPaymentLineRequest = {
  method: string;  // Cash | Card | EFT
  amount: number;
};

export type CreateDriverSaleRequest = {
  customerId?: string;
  newClient?: {
    clientName: string;
    clientType: number;
    isWalkIn: boolean;
  };
  hubId: string;
  paymentType: string;
  lines: DriverSaleLineRequest[];
  splitPayments?: SplitPaymentLineRequest[];
};

export const driverSalesApi = {
  create: (req: CreateDriverSaleRequest) =>
    api.post<{
      invoiceId: string;
      otpSent: boolean;
      awaitingOtp: boolean;
      creditCharged?: boolean;
      newCreditBalance?: number;
      belowCostFlagged?: boolean;
    }>("/api/driver-sales", req),
};
