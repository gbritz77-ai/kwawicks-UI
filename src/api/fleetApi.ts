import { api } from "./apiClient";

export type LicenceHistoryEntry = {
  previousExpiry: string | null;
  newExpiry: string;
  cost: number | null;
  renewedAt: string;
  renewedBy: string;
};

export type VehicleDto = {
  vehicleId: string;
  fleetNumber: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
  fuelType: string;
  odoType: string;
  odometerKm: number | null;
  expectedConsumption: number | null;
  licenceExpiry: string | null;
  licenceRemindDays: number | null;
  lastServiceOdo: number | null;
  serviceInterval: number | null;
  serviceNotifyBefore: number | null;
  notes: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  licenceHistory: LicenceHistoryEntry[];
};

export type CreateVehicleRequest = {
  fleetNumber: string;
  registration?: string;
  make?: string;
  model?: string;
  year?: number | null;
  fuelType?: string;
  odoType?: string;
  odometerKm?: number | null;
  expectedConsumption?: number | null;
  licenceExpiry?: string | null;
  licenceCost?: number | null;
  licenceRemindDays?: number | null;
  lastServiceOdo?: number | null;
  serviceInterval?: number | null;
  serviceNotifyBefore?: number | null;
  notes?: string;
};

export type UpdateVehicleRequest = CreateVehicleRequest & { isActive?: boolean };

export const fleetApi = {
  list: (search?: string) =>
    api.get<VehicleDto[]>(`/api/fleet${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getById: (id: string) => api.get<VehicleDto>(`/api/fleet/${id}`),
  create: (req: CreateVehicleRequest) => api.post<VehicleDto>("/api/fleet", req),
  update: (id: string, req: UpdateVehicleRequest) => api.put<VehicleDto>(`/api/fleet/${id}`, req),
  deactivate: (id: string) => api.put<VehicleDto>(`/api/fleet/${id}`, { isActive: false }),
};
