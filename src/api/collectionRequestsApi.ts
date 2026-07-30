import { api } from "./apiClient";

export type CollectionRequestLineDto = {
  speciesId: string;
  speciesName: string;
  orderedQty: number;
  loadedQty: number;
  loadingNotes: string;
  receivedQty: number;
  discrepancyNotes: string;
  deadQty: number;
  shortQty: number;
  overQty: number;
};

export type CollectionAllocationLineDto = {
  speciesId: string;
  speciesName: string;
  qty: number;        // allocated qty (planned)
  unitPrice: number;
  deliveredQty: number; // actual delivered (0 = not yet invoiced)
  acceptedQty: number;  // for HUB allocations: qty hub staff counted (0 = not yet accepted)
};

export type CollectionDeliveryAllocationDto = {
  deliveryOrderId: string;
  clientId: string;
  clientName: string;
  /** Status of the linked delivery order e.g. OutForDelivery / Delivered / HubDirect */
  deliveryStatus: string;
  /** Payment type from the linked invoice once invoiced (Cash / EFT / Credit / "") */
  paymentType: string;
  /** Populated when paymentType === "Split" — the per-method breakdown (e.g. Cash 4000, EFT 2000) */
  splitPayments: { method: string; amount: number }[];
  /** For HUB allocations: "" or "Accepted" once hub staff have verified the stock */
  hubAcceptanceStatus: string;
  lines: CollectionAllocationLineDto[];
};

export type CollectionRoadsaleLineDto = {
  speciesId: string;
  speciesName: string;
  qty: number;
  unitPrice: number;
  paymentType: string; // Cash | EFT
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
  collectionDate: string | null;
  invoiceS3Key: string;
  deliveryNoteS3Key: string;
  shortfallFlagged: boolean;
  lines: CollectionRequestLineDto[];
  deliveryAllocations: CollectionDeliveryAllocationDto[];
  roadsideSales: CollectionRoadsaleLineDto[];
  createdAt: string;
  updatedAt: string;
};

export type CollectionShortfallLine = {
  speciesId: string;
  speciesName: string;
  orderedQty: number;
  loadedQty: number;
  shortfallQty: number;
  loadingNotes: string;
};

export type CollectionShortfallReportItem = {
  collectionRequestId: string;
  supplierName: string;
  assignedDriverName: string;
  collectionDate: string | null;
  createdAt: string;
  status: string;
  shortfallLines: CollectionShortfallLine[];
};

export type EditAllocationLine = {
  speciesId: string;
  qty: number;
  unitPrice: number;
};

export type AddDeliveryAllocationRequest = {
  clientId: string;
  lines: { speciesId: string; qty: number; unitPrice?: number }[];
};

export type CreateCollectionRequestRequest = {
  procurementOrderId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  hubId: string;
  notes: string;
  collectionDate?: string | null;
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
  hubConfirm: (id: string, lines: { speciesId: string; discrepancyNotes: string; deadQty: number; shortQty: number; overQty: number }[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/hub-confirm`, { lines }),
  financeAcknowledge: (id: string, invoiceS3Key: string) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/finance-acknowledge`, { invoiceS3Key }),
  getInvoiceUploadUrl: (id: string) => api.get<{ uploadUrl: string; s3Key: string }>(`/api/collection-requests/${id}/invoice-upload-url`),
  getDeliveryNoteUploadUrl: (id: string) => api.get<{ uploadUrl: string; s3Key: string }>(`/api/collection-requests/${id}/delivery-note-upload-url`),
  getDeliveryNoteViewUrl:   (id: string) => api.get<{ viewUrl: string }>(`/api/collection-requests/${id}/delivery-note-view-url`),
  addAllocation: (id: string, req: AddDeliveryAllocationRequest) =>
    api.post<CollectionRequestDto>(`/api/collection-requests/${id}/allocations`, req),
  editAllocation: (id: string, deliveryOrderId: string, lines: EditAllocationLine[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/allocations/${deliveryOrderId}`, { lines }),
  setRoadsideSales: (id: string, lines: { speciesId: string; qty: number; unitPrice: number; paymentType: string }[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/roadside-sales`, { lines }),
  confirmDelivery: (
    crId: string,
    deliveryOrderId: string,
    req: { lines: { speciesId: string; deliveredQty: number; unitPrice: number }[]; paymentType: string },
  ) => api.post<CollectionRequestDto>(`/api/collection-requests/${crId}/allocations/${deliveryOrderId}/confirm-delivery`, req),
  hubAccept: (id: string, lines: { speciesId: string; acceptedQty: number }[]) =>
    api.put<CollectionRequestDto>(`/api/collection-requests/${id}/allocations/HUB/accept`, { lines }),
  removeAllocation: (id: string, deliveryOrderId: string) =>
    api.del<CollectionRequestDto>(`/api/collection-requests/${id}/allocations/${deliveryOrderId}`),
  patchAllocationPayment: (
    crId: string,
    deliveryOrderId: string,
    req: { paymentType: string; receiptS3Key?: string },
  ) => api.patch<CollectionRequestDto>(`/api/collection-requests/${crId}/allocations/${deliveryOrderId}/payment`, req),
  getAllocationPopUploadUrl: (crId: string, deliveryOrderId: string) =>
    api.get<{ uploadUrl: string; s3Key: string }>(`/api/collection-requests/${crId}/allocations/${deliveryOrderId}/pop-upload-url`),
  shortfallReport: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const q = qs.toString();
    return api.get<CollectionShortfallReportItem[]>(`/api/collection-requests/shortfall-report${q ? `?${q}` : ""}`);
  },
};
