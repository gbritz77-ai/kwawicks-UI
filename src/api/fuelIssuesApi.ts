import { api } from "./apiClient";

export type FuelIssueDto = {
  issueId: string;
  vehicleId: string;
  fleetNumber: string;
  tankId: string;
  tankName: string;
  siteId: string;
  siteName: string;
  litres: number;
  odometerKm: number | null;
  costPerLitre: number | null;
  totalCost: number | null;
  reference: string;
  issuedByName: string;
  issuedAt: string;
  slipS3Key: string | null;
  slipUrl: string | null;
};

export type CreateFuelIssueRequest = {
  vehicleId: string;
  tankId?: string;
  siteId?: string;
  litres: number;
  odometerKm?: number | null;
  costPerLitre?: number | null;
  reference?: string;
};

export type MonthlyFuelDto = {
  month: string;
  litres: number;
  cost: number | null;
  fillCount: number;
};

export type VehicleFuelReportDto = {
  vehicleId: string;
  fleetNumber: string;
  registration: string;
  odoType: string;
  expectedConsumption: number | null;
  fillCount: number;
  totalLitres: number;
  totalCost: number | null;
  avgConsumptionPer100: number | null;
  isOutOfRange: boolean;
  topIssuedBy: string;
  monthly: MonthlyFuelDto[];
};

export const fuelIssuesApi = {
  list: () => api.get<FuelIssueDto[]>("/api/fuel"),
  create: (req: CreateFuelIssueRequest) => api.post<FuelIssueDto>("/api/fuel", req),
  getSlipUploadUrl: (id: string, contentType: string) =>
    api.get<{ uploadUrl: string; s3Key: string }>(`/api/fuel/${id}/slip-upload-url?contentType=${encodeURIComponent(contentType)}`),
  confirmSlip: (id: string, s3Key: string) =>
    api.put<FuelIssueDto>(`/api/fuel/${id}/slip`, { s3Key }),
  getReport: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return api.get<VehicleFuelReportDto[]>(`/api/fuel/report${q.toString() ? "?" + q : ""}`);
  },
};
