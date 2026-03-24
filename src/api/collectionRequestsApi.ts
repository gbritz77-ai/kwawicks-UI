import { api } from "./apiClient";

export type CollectionRequestLineDto = {
  speciesId: string;
  speciesName: string;
  orderedQty: number;
  loadedQty: number;
  loadingNotes: string;
  receivedQty: number;
  discrepancyNotes: string;
};

export type CollectionRequestDto = {
  collectionRequestId: string;
  procurementOrderId: string;
  supplierId: string;
  supplierName: string;
  assignedDriverId: string;
  assignedDriverName: string;
  hubId: string;
  status: string;
  notes: string;
  invoiceS3Key: string;
  deliveryNoteS3Key: string;
  lines: CollectionRequestLineDto[];
  createdAt: string;
  updatedAt: string;
};

export type CreateCollectionRequestRequest = {
  procurementOrderId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  hubId: string;
  notes: string;
};

export const collectionRequestsApi = {
  list: (params?: { driverId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return api.get<CollectionRequestDto[]>(`/api/collection-requests${q ? `?${q}` : ""}`);
  },
  get: (id: string) => api.get<CollectionRequestDto>(`/api/collection-requests/${id}`),
  create: (req: CreateCollectionRequestRequest) => api.post<CollectionRequestDto>("/api/collection-requests", req),
  driverLoad: (id: string, lines: { speciesId: string; loadedQty: number; loadingNotes: string }[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/load`, { lines }),
  dispatch: (id: string) => api.put<CollectionRequestDto>(`/api/collection-requests/${id}/dispatch`, {}),
  arrive: (id: string) => api.put<CollectionRequestDto>(`/api/collection-requests/${id}/arrive`, {}),
  hubConfirm: (id: string, lines: { speciesId: string; receivedQty: number; discrepancyNotes: string }[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/hub-confirm`, { lines }),
  financeAcknowledge: (id: string, invoiceS3Key: string) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/finance-acknowledge`, { invoiceS3Key }),
  getInvoiceUploadUrl: (id: string) => api.get<{ uploadUrl: string; s3Key: string }>(`/api/collection-requests/${id}/invoice-upload-url`),
  getDeliveryNoteUploadUrl: (id: string) => api.get<{ uploadUrl: string; s3Key: string }>(`/api/collection-requests/${id}/delivery-note-upload-url`),
};
