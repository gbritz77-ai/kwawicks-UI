import { api } from "./apiClient";

export type SlaughterYieldLineRequest = {
  speciesId: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
};

export type CreateSlaughterRequest = {
  sourceSpeciesId: string;
  sourceQty: number;
  sourceUnitCost?: number;
  yields: SlaughterYieldLineRequest[];
  notes?: string;
};

export type SlaughterYieldLineDto = {
  speciesId: string;
  speciesName: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
};

export type SlaughterBatchDto = {
  batchId: string;
  slaughteredAtUtc: string;
  sourceSpeciesId: string;
  sourceSpeciesName: string;
  sourceQty: number;
  sourceUnitCost: number;
  totalInputCost: number;
  notes?: string;
  yields: SlaughterYieldLineDto[];
};

export const slaughterApi = {
  create: (req: CreateSlaughterRequest) =>
    api.post<SlaughterBatchDto>("/api/slaughter", req),

  list: () =>
    api.get<SlaughterBatchDto[]>("/api/slaughter"),

  get: (batchId: string) =>
    api.get<SlaughterBatchDto>(`/api/slaughter/${batchId}`),
};
