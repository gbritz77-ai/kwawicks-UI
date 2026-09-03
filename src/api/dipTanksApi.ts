import { api } from "./apiClient";

export type DipTankDto = {
  tankId: string;
  name: string;
  description: string;
  siteId: string;
  fuelType: string;
  capacityLitres: number;
  lowQtyLitres: number | null;
  isActive: boolean;
};

export type CreateDipTankRequest = {
  name: string;
  description?: string;
  siteId?: string;
  fuelType?: string;
  capacityLitres: number;
  lowQtyLitres?: number | null;
};

export type DipReadingDto = {
  readingId: string;
  tankId: string;
  readingLitres: number;
  readingMm: number | null;
  pctFull: number | null;
  notes: string;
  recordedBy: string;
  recordedAt: string;
};

export type CreateDipReadingRequest = {
  tankId: string;
  readingLitres: number;
  readingMm?: number | null;
  notes?: string;
};

export type TankSummaryDto = {
  tankId: string;
  currentLitres: number | null;
  pctFull: number | null;
  isLow: boolean;
  lastReadingAt: string | null;
};

export type LoadTankRequest = {
  litres: number;
  costPerLitre?: number | null;
  notes?: string;
  supplier?: string;
};

export const dipTanksApi = {
  listTanks: () => api.get<DipTankDto[]>("/api/dip-tanks"),
  createTank: (req: CreateDipTankRequest) => api.post<DipTankDto>("/api/dip-tanks", req),
  getSummary: () => api.get<TankSummaryDto[]>("/api/dip-tanks/summary"),
  listReadings: () => api.get<DipReadingDto[]>("/api/dip-tanks/readings"),
  createReading: (req: CreateDipReadingRequest) => api.post<DipReadingDto>("/api/dip-tanks/readings", req),
  loadTank: (tankId: string, req: LoadTankRequest) => api.post<DipReadingDto>(`/api/dip-tanks/${tankId}/load`, req),
  getFuelSuppliers: () => api.get<string[]>("/api/dip-tanks/fuel-suppliers"),
  addFuelSupplier: (supplier: string) => api.post<string[]>("/api/dip-tanks/fuel-suppliers", { supplier }),
};
