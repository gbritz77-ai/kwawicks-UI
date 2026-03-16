import { api } from "./apiClient";

// ── Admin types ──────────────────────────────────────────────────────────────
export type PaymentTypeBreakdown = {
  paymentType: string;
  count: number;
  subTotal: number;
  grandTotal: number;
};

export type RevenueSummaryResponse = {
  from?: string;
  to?: string;
  totalInvoices: number;
  totalSubTotal: number;
  totalVat: number;
  totalGrandTotal: number;
  byPaymentType: PaymentTypeBreakdown[];
};

export type OutstandingPaymentItem = {
  invoiceId: string;
  customerId: string;
  paymentType: string;
  grandTotal: number;
  createdAt: string;
  daysOutstanding: number;
  receiptS3Key: string;
};

export type OutstandingPaymentsResponse = {
  count: number;
  totalOutstanding: number;
  items: OutstandingPaymentItem[];
};

export type DriverPerformanceItem = {
  driverId: string;
  driverName: string;
  deliveriesCompleted: number;
  totalValue: number;
  totalDeadReturns: number;
  totalMutilatedReturns: number;
  totalNotWantedReturns: number;
};

export type DriverPerformanceResponse = {
  from?: string;
  to?: string;
  drivers: DriverPerformanceItem[];
};

export type ReturnsSummaryItem = {
  speciesId: string;
  deadQty: number;
  mutilatedQty: number;
  notWantedQty: number;
  totalReturns: number;
};

export type ReturnsSummaryResponse = {
  from?: string;
  to?: string;
  items: ReturnsSummaryItem[];
};

// ── Admin: Delivery Status Summary ───────────────────────────────────────────
export type DeliveryStatusItem = {
  deliveryOrderId: string;
  status: string;
  customerId: string;
  customerName: string;
  driverName: string;
  deliveryAddress: string;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  invoiceId: string;
  paymentType: string;
  paymentStatus: string;
  grandTotal: number;
};

export type DeliveryStatusSummaryResponse = {
  from?: string;
  to?: string;
  openCount: number;
  inTransitCount: number;
  deliveredCount: number;
  orders: DeliveryStatusItem[];
};

// ── Admin: Invoices ───────────────────────────────────────────────────────────
export type InvoiceLineItem = {
  speciesId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
};

export type InvoiceItem = {
  invoiceId: string;
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
  createdAt: string;
  updatedAt: string;
  lines: InvoiceLineItem[];
};

// ── Admin: Customer Statement ─────────────────────────────────────────────────
export type CustomerStatementLine = {
  invoiceId: string;
  date: string;
  paymentType: string;
  paymentStatus: string;
  subTotal: number;
  vatTotal: number;
  grandTotal: number;
};

export type CustomerStatementResponse = {
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  from?: string;
  to?: string;
  generatedAt: string;
  lines: CustomerStatementLine[];
  totalSubTotal: number;
  totalVat: number;
  totalGrandTotal: number;
  totalPaid: number;
  totalOutstanding: number;
};

// ── Driver types ─────────────────────────────────────────────────────────────
export type MyDeliveryItem = {
  deliveryOrderId: string;
  invoiceId: string;
  customerId: string;
  deliveryAddress: string;
  completedAt: string;
  grandTotal: number;
  paymentType: string;
  paymentStatus: string;
};

// ── API ──────────────────────────────────────────────────────────────────────
function dateParams(from?: string, to?: string) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  return p.toString() ? `?${p}` : "";
}

export const reportsApi = {
  getRevenue: (from?: string, to?: string) =>
    api.get<RevenueSummaryResponse>(`/api/reports/revenue${dateParams(from, to)}`),

  getOutstandingPayments: () =>
    api.get<OutstandingPaymentsResponse>("/api/reports/outstanding-payments"),

  getDriverPerformance: (from?: string, to?: string) =>
    api.get<DriverPerformanceResponse>(`/api/reports/driver-performance${dateParams(from, to)}`),

  getReturns: (from?: string, to?: string) =>
    api.get<ReturnsSummaryResponse>(`/api/reports/returns${dateParams(from, to)}`),

  getDeliveryStatus: (from?: string, to?: string) =>
    api.get<DeliveryStatusSummaryResponse>(`/api/reports/delivery-status${dateParams(from, to)}`),

  getInvoices: (params?: { customerId?: string; paymentStatus?: string; from?: string; to?: string }) => {
    const p = new URLSearchParams();
    if (params?.customerId) p.set("customerId", params.customerId);
    if (params?.paymentStatus) p.set("paymentStatus", params.paymentStatus);
    if (params?.from) p.set("from", params.from);
    if (params?.to) p.set("to", params.to);
    const qs = p.toString() ? `?${p}` : "";
    return api.get<InvoiceItem[]>(`/api/reports/invoices${qs}`);
  },

  getMyDeliveries: (from?: string, to?: string) =>
    api.get<MyDeliveryItem[]>(`/api/reports/my-deliveries${dateParams(from, to)}`),

  getCustomerStatement: (customerId: string, from?: string, to?: string) => {
    const p = new URLSearchParams({ customerId });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return api.get<CustomerStatementResponse>(`/api/reports/statement?${p}`);
  },
};
