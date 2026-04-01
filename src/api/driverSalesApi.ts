import { api } from "./apiClient";

export type DriverSaleLineRequest = {
  speciesId: string;
  quantity: number;
  unitPrice: number;  // ex-VAT
  vatRate: number;
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
};

export const driverSalesApi = {
  create: (req: CreateDriverSaleRequest) =>
    api.post<{
      invoiceId: string;
      whatsAppSent: boolean;
      whatsAppError?: string;
      creditCharged?: boolean;
      newCreditBalance?: number;
    }>("/api/driver-sales", req),
};
