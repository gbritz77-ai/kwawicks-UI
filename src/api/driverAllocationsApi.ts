import { api } from "./apiClient";

export type DriverStockAllocationLineDto = {
  speciesId: string;
  speciesName: string;
  allocatedQty: number;
  soldQty: number;       // computed by backend: sum of sales for this species
  remainingQty: number;  // allocatedQty - soldQty
  unitPrice: number;
};

export type DriverSaleRecordDto = {
  saleId: string;
  speciesId: string;
  speciesName: string;
  qty: number;
  unitPrice: number;
  totalAmount: number;
  paymentType: string; // Cash | EFT
  customerName: string;
  soldAt: string;
};

export type DriverStockAllocationDto = {
  allocationId: string;
  driverId: string;
  driverName: string;
  hubId: string;
  status: string; // Active | Completed | Cancelled
  notes: string;
  lines: DriverStockAllocationLineDto[];
  sales: DriverSaleRecordDto[];
  createdAt: string;
  updatedAt: string;
};

export const driverAllocationsApi = {
  list: (params?: { driverId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return api.get<DriverStockAllocationDto[]>(`/api/driver-allocations${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<DriverStockAllocationDto>(`/api/driver-allocations/${id}`),
  create: (req: {
    driverId: string;
    driverName: string;
    hubId: string;
    notes: string;
    lines: { speciesId: string; qty: number; unitPrice: number }[];
  }) => api.post<DriverStockAllocationDto>("/api/driver-allocations", req),
  recordSale: (id: string, req: {
    speciesId: string;
    qty: number;
    unitPrice: number;
    paymentType: string;
    customerName: string;
  }) => api.post<DriverStockAllocationDto>(`/api/driver-allocations/${id}/sale`, req),
  complete: (id: string) => api.put<DriverStockAllocationDto>(`/api/driver-allocations/${id}/complete`, {}),
  cancel: (id: string) => api.put<DriverStockAllocationDto>(`/api/driver-allocations/${id}/cancel`, {}),
};
