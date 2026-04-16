import { api } from "./apiClient";

export type HubSaleLineRequest = {
  speciesId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type SplitPaymentLineRequest = {
  method: string;  // Cash | Card | EFT
  amount: number;
};

export type CreateHubSaleRequest = {
  customerId?: string;
  newClient?: {
    clientName: string;
    clientAddress?: string;
    clientCity?: string;
    clientProvince?: string;
    clientPostalCode?: string;
    clientContactDetails?: string;
    clientPhone?: string;
    clientType: number;
    isWalkIn: boolean;
  };
  staffMemberId?: string;
  hubId: string;
  paymentType: string;
  clientPhone?: string;
  lines: HubSaleLineRequest[];
  splitPayments?: SplitPaymentLineRequest[];
};

export const hubSalesApi = {
  create: (req: CreateHubSaleRequest) =>
    api.post<{ invoiceId: string; otpSent: boolean; awaitingOtp: boolean; creditCharged?: boolean; newCreditBalance?: number; belowCostFlagged?: boolean }>("/api/hub-sales", req),
};
