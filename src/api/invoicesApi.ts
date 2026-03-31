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

// ── API ────────────────────────────────────────────────────────────────────

export const invoicesApi = {
  create: (req: CreateInvoiceRequest) =>
    api.post<{ invoiceId: string }>("/api/invoices", req),

  createFromDelivery: (deliveryOrderId: string, req: CreateInvoiceFromDeliveryRequest) =>
    api.post<{ invoiceId: string }>(`/api/delivery-orders/${deliveryOrderId}/invoice`, req),

  get: (invoiceId: string) =>
    api.get<InvoiceResponse>(`/api/invoices/${invoiceId}`),

  recordPayment: (invoiceId: string, paymentType: string) =>
    api.post<void>(`/api/invoices/${invoiceId}/payment`, { paymentType }),

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
};
