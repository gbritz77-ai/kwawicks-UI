import { api } from "./apiClient";

export type PettyCashEntryDto = {
  entryId: string;
  type: "In" | "Out";
  amount: number;
  description: string;
  category: string;
  recipientName: string;
  recordedBy: string;
  entryDate: string;
  cashupId: string;
  assignedDriverId: string;
  slipS3Key: string;
  slipUploadUrl?: string;
  createdAtUtc: string;
};

export type PettyCashSummaryDto = {
  currentBalance: number;
  totalInSinceLastCashup: number;
  totalOutSinceLastCashup: number;
  openEntryCount: number;
  lastCashupDate: string | null;
  openEntries: PettyCashEntryDto[];
  cashFromHubSales: number;
  cashFromCreditDeposits: number;
  totalCashInCustody: number;
  hubSalesCashOverride: number | null;
  clientDepositsCashOverride: number | null;
};

export type PettyCashupDto = {
  cashupId: string;
  cashupDate: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  notes: string;
  closedBy: string;
  createdAtUtc: string;
  entries?: PettyCashEntryDto[];
};

export type CreatePettyCashEntryRequest = {
  type: "In" | "Out";
  amount: number;
  description: string;
  category: string;
  recipientName: string;
  entryDate: string;
  assignedDriverId?: string;
};

export type CreateCashupRequest = {
  actualBalance: number;
  notes: string;
  cashupDate: string;
};

export const CATEGORIES = ["Fuel", "Maintenance", "Supplies", "DriverExpense", "Other"] as const;
export type Category = typeof CATEGORIES[number];

export const pettyCashApi = {
  getSummary: () => api.get<PettyCashSummaryDto>("/api/petty-cash/summary"),
  listEntries: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString() ? `?${p}` : "";
    return api.get<PettyCashEntryDto[]>(`/api/petty-cash/entries${qs}`);
  },
  createEntry: (req: CreatePettyCashEntryRequest) =>
    api.post<PettyCashEntryDto>("/api/petty-cash/entries", req),
  listCashups: () => api.get<PettyCashupDto[]>("/api/petty-cash/cashups"),
  createCashup: (req: CreateCashupRequest) =>
    api.post<PettyCashupDto>("/api/petty-cash/cashups", req),
  // Driver-facing
  getMyEntries: () => api.get<PettyCashEntryDto[]>("/api/petty-cash/my-entries"),
  getSlipUploadUrl: (entryId: string) =>
    api.get<{ uploadUrl: string; s3Key: string }>(`/api/petty-cash/entries/${entryId}/slip-upload-url`),
  confirmSlipUploaded: (entryId: string, s3Key: string) =>
    api.put<PettyCashEntryDto>(`/api/petty-cash/entries/${entryId}/slip`, { s3Key }),
  clearAll: () => api.del<void>("/api/petty-cash/clear"),
  setFloat: (floatAmount: number) => api.post<void>("/api/petty-cash/set-float", { floatAmount }),
  setCashOverrides: (hubSalesCash: number | null, clientDepositsCash: number | null) =>
    api.put<void>("/api/petty-cash/cash-overrides", { hubSalesCash, clientDepositsCash }),
};
