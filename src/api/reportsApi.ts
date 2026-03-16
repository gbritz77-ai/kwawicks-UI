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

  getMyDeliveries: (from?: string, to?: string) =>
    api.get<MyDeliveryItem[]>(`/api/reports/my-deliveries${dateParams(from, to)}`),
};
