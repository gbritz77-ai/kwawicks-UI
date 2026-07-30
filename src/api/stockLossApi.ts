import { api } from "./apiClient";

export type StockLossDto = {
  lossId: string;
  speciesId: string;
  speciesName: string;
  qty: number;
  notes: string;
  recordedByUserId: string;
  createdAt: string;
  qtyOnHandHubAfter: number;
};

export type RecordStockLossRequest = {
  speciesId: string;
  qty: number;
  adjustmentType?: "Over" | "Under";
  notes?: string;
};

export const stockLossApi = {
  record: (req: RecordStockLossRequest) =>
    api.post<StockLossDto>("/api/stock-losses", req),

  list: (params?: { speciesId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.speciesId) qs.set("speciesId", params.speciesId);
    if (params?.from)      qs.set("from", params.from);
    if (params?.to)        qs.set("to", params.to);
    const q = qs.toString();
    return api.get<StockLossDto[]>(`/api/stock-losses${q ? `?${q}` : ""}`);
  },
};
