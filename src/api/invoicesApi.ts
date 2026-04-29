import { api } from "./apiClient";

// ── Hub-side: create invoice directly ──────────────────────────────────────

export type CreateInvoiceLine = {
  speciesId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type CreateInvoiceRequest = {
  customerId: string;
  hubId: string;
  deliveryAddressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  lines: CreateInvoiceLine[];
  clientPhone?: string;
};

// ── Driver-side: create invoice from delivery order ────────────────────────

export type CreateInvoiceFromDeliveryLine = {
  speciesId: string;
  deliveredQty: number;
  returnedDeadQty: number;
  returnedMutilatedQty: number;
  returnedNotWantedQty: number;
  unitPrice: number;
  vatRate: number;
};

export type CreateInvoiceFromDeliveryRequest = {
  createdByDriverId: string;
  lines: CreateInvoiceFromDeliveryLine[];
  clientPhone?: string;
};

// ── Response types ─────────────────────────────────────────────────────────

export type InvoiceLineResponse = {
  speciesId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
};

export type InvoiceResponse = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  hubId: string;
  deliveryOrderId: string;
  createdByDriverId: string;
  status: string;
  paymentType: string;
  paymentStatus: string;
  receiptS3Key: string;
  subTotal: number;
  vatTotal: number;
  grandTotal: number;
  lines: InvoiceLineResponse[];
  createdAt: string;
  updatedAt: string;
};

export type ReceiptUploadUrlResponse = {
  presignedUrl: string;
  s3Key: string;
  expiresAt: string;
};

// ── Recon ──────────────────────────────────────────────────────────────────

export type ReconInvoiceItem = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  saleType: string;
  paymentType: string;
  paymentStatus: string;
  grandTotal: number;
  receiptS3Key: string;
  createdAt: string;
  reconReference: string;
  reconNotes: string;
  reconciledAt: string | null;
  daysOutstanding: number;
};

export type ReconRequest = {
  referenceNumber?: string;
  notes?: string;
  receivedAt?: string; // ISO date string
};

// ── API ────────────────────────────────────────────────────────────────────

export const invoicesApi = {
  create: (req: CreateInvoiceRequest) =>
    api.post<{ invoiceId: string }>("/api/invoices", req),

  createFromDelivery: (deliveryOrderId: string, req: CreateInvoiceFromDeliveryRequest) =>
    api.post<{ invoiceId: string }>(`/api/delivery-orders/${deliveryOrderId}/invoice`, req),

  get: (invoiceId: string) =>
    api.get<InvoiceResponse>(`/api/invoices/${invoiceId}`),

  recordPayment: (invoiceId: string, paymentType: string, splitPayments?: { method: string; amount: number }[]) =>
    api.post<void>(`/api/invoices/${invoiceId}/payment`, { paymentType, splitPayments }),

  confirmPayment: (invoiceId: string) =>
    api.put<void>(`/api/invoices/${invoiceId}/confirm-payment`, {}),

  getReceiptUploadUrl: (invoiceId: string) =>
    api.get<ReceiptUploadUrlResponse>(`/api/invoices/${invoiceId}/receipt-upload-url`),

  getReceiptViewUrl: (invoiceId: string) =>
    api.get<{ url: string }>(`/api/invoices/${invoiceId}/receipt-view-url`),

  /** Owner only: update prices on existing invoice lines. Resends WhatsApp automatically. */
  updateLines: (invoiceId: string, lines: { speciesId: string; unitPriceIncl: number }[]) =>
    api.patch<{ invoice: InvoiceResponse; whatsAppSent: boolean; whatsAppError?: string }>(
      `/api/invoices/${invoiceId}/lines`,
      { lines }
    ),

  /** Finance: list invoices for reconciliation */
  getReconList: (params?: { paymentType?: string; reconStatus?: string; from?: string; to?: string; amount?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.paymentType)   qs.set("paymentType", params.paymentType);
    if (params?.reconStatus)   qs.set("reconStatus",  params.reconStatus);
    if (params?.from)          qs.set("from",         params.from);
    if (params?.to)            qs.set("to",           params.to);
    if (params?.amount != null) qs.set("amount",      String(params.amount));
    if (params?.search)        qs.set("search",       params.search);
    const q = qs.toString();
    return api.get<ReconInvoiceItem[]>(`/api/invoices/recon${q ? `?${q}` : ""}`);
  },

  /** Finance: mark an invoice as reconciled */
  recon: (invoiceId: string, req: ReconRequest) =>
    api.put<void>(`/api/invoices/${invoiceId}/recon`, req),

  /** List all invoices for a specific customer */
  listByClient: (customerId: string) =>
    api.get<InvoiceResponse[]>(`/api/invoices?customerId=${encodeURIComponent(customerId)}`),
};
