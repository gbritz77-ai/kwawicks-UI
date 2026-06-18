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

export const fuelIssuesApi = {
  list: () => api.get<FuelIssueDto[]>("/api/fuel"),
  create: (req: CreateFuelIssueRequest) => api.post<FuelIssueDto>("/api/fuel", req),
};
