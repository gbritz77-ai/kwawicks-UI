import { api } from "./apiClient";

export type CalculateRequest = {
  year: number;
  month: number;
  applyToSpecies: boolean;
};

export type CostContributionLineDto = {
  source: string;       // "ProcurementOrder" | "SlaughterBatch"
  sourceId: string;
  sourceRef: string;
  date: string;
  qty: number;
  unitCostExVat: number;
};

export type CostAverageRecordDto = {
  speciesId: string;
  speciesName: string;
  month: string;           // YYYY-MM
  totalQty: number;
  avgCostExVat: number;
  avgCostIncVat: number;
  vatRate: number;
  priorUnitCost: number;
  costDelta: number;       // avgCostExVat - priorUnitCost
  appliedToSpecies: boolean;
  calculatedAt: string;
  sources: CostContributionLineDto[];
};

export const costAveragesApi = {
  calculate: (req: CalculateRequest) =>
    api.post<CostAverageRecordDto[]>("/api/cost-averages/calculate", req),

  getHistory: (speciesId?: string) =>
    api.get<CostAverageRecordDto[]>(
      speciesId
        ? `/api/cost-averages?speciesId=${encodeURIComponent(speciesId)}`
        : "/api/cost-averages"
    ),
};
