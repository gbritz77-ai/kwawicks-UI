import { api } from "./apiClient";

export type InboundShipmentLineDto = {
  speciesId: string;
  speciesName: string;
  orderedQty: number;
  unitCost: number;
  receivedQty: number;
  shortfallNotes: string;
};

export type InboundShipmentDto = {
  inboundShipmentId: string;
  supplierId: string;
  supplierName: string;
  hubId: string;
  status: string; // Open | Dispatched | Received
  transporterName: string;
  transporterContact: string;
  vehicleReg: string;
  notes: string;
  createdByUserId: string;
  expectedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  lines: InboundShipmentLineDto[];
  createdAt: string;
  updatedAt: string;
};

export type CreateInboundShipmentRequest = {
  supplierId: string;
  transporterName: string;
  transporterContact: string;
  vehicleReg: string;
  notes: string;
  expectedAt?: string | null;
  lines: { speciesId: string; orderedQty: number; unitCost: number }[];
};

export type ReceiveInboundShipmentLine = {
  speciesId: string;
  receivedQty: number;
  shortfallNotes: string;
};

export const inboundShipmentsApi = {
  list: (params?: { status?: string; supplierId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.supplierId) qs.set("supplierId", params.supplierId);
    const q = qs.toString();
    return api.get<InboundShipmentDto[]>(`/api/inbound-shipments${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<InboundShipmentDto>(`/api/inbound-shipments/${id}`),
  create: (req: CreateInboundShipmentRequest) =>
    api.post<InboundShipmentDto>("/api/inbound-shipments", req),
  update: (id: string, req: CreateInboundShipmentRequest) =>
    api.put<InboundShipmentDto>(`/api/inbound-shipments/${id}`, req),
  remove: (id: string) => api.del<void>(`/api/inbound-shipments/${id}`),
  dispatch: (id: string) => api.put<void>(`/api/inbound-shipments/${id}/dispatch`, {}),
  receive: (id: string, lines: ReceiveInboundShipmentLine[]) =>
    api.post<void>(`/api/inbound-shipments/${id}/receive`, { lines }),
};
