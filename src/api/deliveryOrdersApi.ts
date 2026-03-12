import { api } from "./apiClient";

export type DeliveryOrderStatus = "Open" | "OutForDelivery" | "Delivered";

export type DeliveryOrderLineDto = {
  speciesId: string;
  quantity: number;
  deliveredQty: number;
  returnedDeadQty: number;
  returnedMutilatedQty: number;
  returnedNotWantedQty: number;
};

export type DeliveryOrderResponse = {
  deliveryOrderId: string;
  invoiceId: string;
  hubId: string;
  customerId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  status: DeliveryOrderStatus;
  deliveryAddressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  lines: DeliveryOrderLineDto[];
  createdAt: string;
  updatedAt: string;
};

export type CreateDeliveryOrderLine = {
  speciesId: string;
  quantity: number;
};

export type CreateDeliveryOrderRequest = {
  customerId: string;
  hubId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  deliveryAddressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  lines: CreateDeliveryOrderLine[];
};

export const deliveryOrdersApi = {
  list: (params?: { driverId?: string; hubId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.hubId) qs.set("hubId", params.hubId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return api.get<DeliveryOrderResponse[]>(`/api/delivery-orders${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<DeliveryOrderResponse>(`/api/delivery-orders/${id}`),
  create: (body: CreateDeliveryOrderRequest) =>
    api.post<{ deliveryOrderId: string }>("/api/delivery-orders", body),
  updateStatus: (id: string, status: string) =>
    api.put<void>(`/api/delivery-orders/${id}/status`, { status }),
};
