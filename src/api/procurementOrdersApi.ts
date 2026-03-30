import { api } from "./apiClient";

export type ProcurementOrderLineDto = {
  speciesId: string;
  speciesName: string;
  orderedQty: number;
  unitCost: number;
};

export type ProcurementOrderDto = {
  procurementOrderId: string;
  supplierId: string;
  supplierName: string;
  supplierOrderReference: string;
  status: string;
  notes: string;
  invoiceS3Key: string;
  createdByUserId: string;
  lines: ProcurementOrderLineDto[];
  createdAt: string;
  updatedAt: string;
};

export type CreateProcurementOrderRequest = {
  supplierId: string;
  supplierOrderReference: string;
  notes: string;
  lines: { speciesId: string; orderedQty: number; unitCost: number }[];
};

export const procurementOrdersApi = {
  list: (params?: { status?: string; supplierId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.supplierId) qs.set("supplierId", params.supplierId);
    const q = qs.toString();
    return api.get<ProcurementOrderDto[]>(`/api/procurement-orders${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<ProcurementOrderDto>(`/api/procurement-orders/${id}`),
  create: (req: CreateProcurementOrderRequest) => api.post<ProcurementOrderDto>("/api/procurement-orders", req),
  update: (id: string, req: CreateProcurementOrderRequest) =>
    api.put<ProcurementOrderDto>(`/api/procurement-orders/${id}`, req),
  remove: (id: string) => api.del<void>(`/api/procurement-orders/${id}`),
  submit: (id: string) => api.put<void>(`/api/procurement-orders/${id}/submit`, {}),
  complete: (id: string) => api.put<void>(`/api/procurement-orders/${id}/complete`, {}),
  getInvoiceUploadUrl: (id: string) => api.get<{ uploadUrl: string; s3Key: string }>(`/api/procurement-orders/${id}/invoice-upload-url`),
};
