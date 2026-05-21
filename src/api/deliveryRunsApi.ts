import { api } from "./apiClient";

export type DeliveryRunAllocationLineDto = {
  speciesId: string;
  speciesName: string;
  qty: number;
  unitPrice: number;
  deliveredQty: number;
};

export type DeliveryRunAllocationDto = {
  deliveryOrderId: string;
  clientId: string;
  clientName: string;
  deliveryStatus: string; // Open | OutForDelivery | Delivered
  invoiceId: string;
  paymentType: string;
  lines: DeliveryRunAllocationLineDto[];
};

export type DeliveryRunDto = {
  deliveryRunId: string;
  hubId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  status: string; // Open | OutForDelivery | Completed
  notes: string;
  allocations: DeliveryRunAllocationDto[];
  createdAt: string;
  updatedAt: string;
};

export const deliveryRunsApi = {
  list: (params?: { driverId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return api.get<DeliveryRunDto[]>(`/api/delivery-runs${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<DeliveryRunDto>(`/api/delivery-runs/${id}`),
  create: (req: { hubId: string; assignedDriverId: string; assignedDriverName: string; notes: string }) =>
    api.post<DeliveryRunDto>("/api/delivery-runs", req),
  addAllocation: (id: string, req: { clientId: string; lines: { speciesId: string; qty: number; unitPrice: number }[] }) =>
    api.post<DeliveryRunDto>(`/api/delivery-runs/${id}/allocations`, req),
  removeAllocation: (id: string, deliveryOrderId: string) =>
    api.del<DeliveryRunDto>(`/api/delivery-runs/${id}/allocations/${deliveryOrderId}`),
  dispatch: (id: string) =>
    api.put<DeliveryRunDto>(`/api/delivery-runs/${id}/dispatch`, {}),
  confirmDelivery: (
    id: string,
    deliveryOrderId: string,
    req: { lines: { speciesId: string; deliveredQty: number; unitPrice: number }[]; paymentType: string },
  ) => api.post<DeliveryRunDto>(`/api/delivery-runs/${id}/allocations/${deliveryOrderId}/confirm-delivery`, req),
};
