import { api } from "./apiClient";

export type BelowCostLineDto = {
  speciesId: string;
  speciesName: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  shortfall: number;
};

export type PriceApprovalDto = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  saleType: string;
  paymentType: string;
  grandTotal: number;
  priceApprovalStatus: string;
  createdAt: string;
  belowCostLines: BelowCostLineDto[];
};

export type AmendPriceLine = {
  speciesId: string;
  newUnitPrice: number;
};

export const priceApprovalsApi = {
  getPending: () =>
    api.get<PriceApprovalDto[]>("/api/price-approvals"),

  approve: (invoiceId: string) =>
    api.post<void>(`/api/price-approvals/${invoiceId}/approve`, {}),

  amend: (invoiceId: string, lines: AmendPriceLine[]) =>
    api.post<void>(`/api/price-approvals/${invoiceId}/amend`, { lines }),
};
