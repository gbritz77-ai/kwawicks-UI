import { api } from "./apiClient";

export type HubSaleLineRequest = {
  speciesId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
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
};

export const hubSalesApi = {
  create: (req: CreateHubSaleRequest) =>
    api.post<{ invoiceId: string; whatsAppSent: boolean; whatsAppError?: string; creditCharged?: boolean; newCreditBalance?: number }>("/api/hub-sales", req),
};
