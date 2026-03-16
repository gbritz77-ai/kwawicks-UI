import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { reportsApi } from "../api/reportsApi";
import type {
  RevenueSummaryResponse,
  OutstandingPaymentsResponse,
  DriverPerformanceResponse,
  ReturnsSummaryResponse,
  DeliveryStatusSummaryResponse,
} from "../api/reportsApi";

type Tab = "revenue" | "outstanding" | "drivers" | "returns" | "deliveries";

export default function AdminReportsPage() {
  const [tab, setTab] = useState<Tab>("revenue");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [revenue, setRevenue] = useState<RevenueSummaryResponse | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingPaymentsResponse | null>(null);
  const [drivers, setDrivers] = useState<DriverPerformanceResponse | null>(null);
  const [returns, setReturns] = useState<ReturnsSummaryResponse | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryStatusSummaryResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | "OutForDelivery" | "Delivered">("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (tab === "revenue") setRevenue(await reportsApi.getRevenue(from || undefined, to || undefined));
      if (tab === "outstanding") setOutstanding(await reportsApi.getOutstandingPayments());
      if (tab === "drivers") setDrivers(await reportsApi.getDriverPerformance(from || undefined, to || undefined));
      if (tab === "returns") setReturns(await reportsApi.getReturns(from || undefined, to || undefined));
      if (tab === "deliveries") setDeliveries(await reportsApi.getDeliveryStatus(from || undefined, to || undefined));
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  const fmt = (n: number) =>
    `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Reports</h2>

      {/* Tabs */}
      <div style={s.tabs}>
        {(["revenue", "outstanding", "drivers", "returns", "deliveries"] as Tab[]).map((t) => (
          <button key={t} style={tab === t ? { ...s.tab, ...s.tabActive } : s.tab} onClick={() => setTab(t)}>
            {t === "revenue" && "Revenue"}
            {t === "outstanding" && "Outstanding"}
            {t === "drivers" && "Driver Performance"}
            {t === "returns" && "Returns"}
            {t === "deliveries" && "Deliveries"}
          </button>
        ))}
      </div>

      {/* Date filter (not shown for outstanding) */}
      {tab !== "outstanding" && (
        <div style={s.filterRow}>
          <label style={s.label}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
          <label style={s.label}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
          <button style={s.applyBtn} onClick={load}>Apply</button>
        </div>
      )}

      {error && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading...</p>}

      {/* Revenue */}
      {tab === "revenue" && revenue && !loading && (
        <div>
          <div style={s.kpiRow}>
            <KpiCard label="Invoices" value={String(revenue.totalInvoices)} />
            <KpiCard label="Sub-total" value={fmt(revenue.totalSubTotal)} />
            <KpiCard label="VAT" value={fmt(revenue.totalVat)} />
            <KpiCard label="Grand Total" value={fmt(revenue.totalGrandTotal)} highlight />
          </div>
          <h3 style={s.subHeading}>By Payment Type</h3>
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Type</Th><Th>Count</Th><Th>Sub-total</Th><Th>Grand Total</Th>
              </tr>
            </thead>
            <tbody>
              {revenue.byPaymentType.map((r) => (
                <tr key={r.paymentType}>
                  <Td>{r.paymentType}</Td>
                  <Td>{r.count}</Td>
                  <Td>{fmt(r.subTotal)}</Td>
                  <Td>{fmt(r.grandTotal)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Outstanding */}
      {tab === "outstanding" && outstanding && !loading && (
        <div>
          <div style={s.kpiRow}>
            <KpiCard label="Outstanding invoices" value={String(outstanding.count)} />
            <KpiCard label="Total outstanding" value={fmt(outstanding.totalOutstanding)} highlight />
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Invoice</Th><Th>Customer</Th><Th>Type</Th><Th>Amount</Th><Th>Days outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {outstanding.items.map((i) => (
                <tr key={i.invoiceId}>
                  <Td><span style={s.mono}>{i.invoiceId.slice(0, 8)}…</span></Td>
                  <Td>{i.customerId}</Td>
                  <Td>{i.paymentType}</Td>
                  <Td>{fmt(i.grandTotal)}</Td>
                  <Td>
                    <span style={{ color: i.daysOutstanding > 30 ? "#dc2626" : i.daysOutstanding > 14 ? "#d97706" : "#16a34a" }}>
                      {i.daysOutstanding}d
                    </span>
                  </Td>
                </tr>
              ))}
              {outstanding.items.length === 0 && (
                <tr><td colSpan={5} style={s.emptyCell}>No outstanding payments</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver Performance */}
      {tab === "drivers" && drivers && !loading && (
        <div>
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Driver</Th><Th>Deliveries</Th><Th>Total Value</Th><Th>Dead</Th><Th>Mutilated</Th><Th>Not Wanted</Th>
              </tr>
            </thead>
            <tbody>
              {drivers.drivers.map((d) => (
                <tr key={d.driverId}>
                  <Td><strong>{d.driverName}</strong></Td>
                  <Td>{d.deliveriesCompleted}</Td>
                  <Td>{fmt(d.totalValue)}</Td>
                  <Td style={{ color: d.totalDeadReturns > 0 ? "#dc2626" : undefined }}>{d.totalDeadReturns}</Td>
                  <Td style={{ color: d.totalMutilatedReturns > 0 ? "#d97706" : undefined }}>{d.totalMutilatedReturns}</Td>
                  <Td>{d.totalNotWantedReturns}</Td>
                </tr>
              ))}
              {drivers.drivers.length === 0 && (
                <tr><td colSpan={6} style={s.emptyCell}>No data for selected period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Deliveries */}
      {tab === "deliveries" && deliveries && !loading && (() => {
        const visible = statusFilter === "All"
          ? deliveries.orders
          : deliveries.orders.filter((o) => o.status === statusFilter);

        function statusStyle(status: string) {
          if (status === "Delivered") return { color: "#166534", bg: "#dcfce7" };
          if (status === "OutForDelivery") return { color: "#1d4ed8", bg: "#dbeafe" };
          return { color: "#92400e", bg: "#fef9c3" };
        }

        return (
          <div>
            {/* Clickable KPI cards act as filters */}
            <div style={s.kpiRow}>
              <KpiCard
                label="All"
                value={String(deliveries.orders.length)}
                active={statusFilter === "All"}
                onClick={() => setStatusFilter("All")}
              />
              <KpiCard
                label="Open"
                value={String(deliveries.openCount)}
                active={statusFilter === "Open"}
                color="#92400e"
                bg="#fef9c3"
                onClick={() => setStatusFilter("Open")}
              />
              <KpiCard
                label="In Transit"
                value={String(deliveries.inTransitCount)}
                active={statusFilter === "OutForDelivery"}
                color="#1d4ed8"
                bg="#dbeafe"
                onClick={() => setStatusFilter("OutForDelivery")}
              />
              <KpiCard
                label="Delivered"
                value={String(deliveries.deliveredCount)}
                active={statusFilter === "Delivered"}
                color="#166534"
                bg="#dcfce7"
                onClick={() => setStatusFilter("Delivered")}
              />
            </div>

            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Showing {visible.length} order{visible.length !== 1 ? "s" : ""}
              {statusFilter !== "All" ? ` · ${statusFilter === "OutForDelivery" ? "In Transit" : statusFilter}` : ""}
            </p>

            <table style={s.table}>
              <thead>
                <tr>
                  <Th>Status</Th><Th>Customer</Th><Th>Driver</Th><Th>Address</Th><Th>Items</Th><Th>Invoice</Th><Th>Amount</Th><Th>Payment</Th><Th>Pay Status</Th><Th>Created</Th><Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const { color, bg } = statusStyle(o.status);
                  const label = o.status === "OutForDelivery" ? "In Transit" : o.status;
                  const payColor = o.paymentStatus === "Paid" ? "#166534" : o.paymentStatus === "Pending" ? "#854d0e" : undefined;
                  const payBg   = o.paymentStatus === "Paid" ? "#dcfce7" : o.paymentStatus === "Pending" ? "#fef9c3" : undefined;
                  return (
                    <tr key={o.deliveryOrderId}>
                      <Td><span style={{ ...s.badge, background: bg, color }}>{label}</span></Td>
                      <Td>{o.customerId}</Td>
                      <Td>{o.driverName || "—"}</Td>
                      <Td style={{ color: "#64748b", fontSize: 13 }}>{o.deliveryAddress}</Td>
                      <Td>{o.totalItems}</Td>
                      <Td style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>
                        {o.invoiceId ? o.invoiceId.slice(0, 8) + "…" : "—"}
                      </Td>
                      <Td>{o.grandTotal > 0 ? fmt(o.grandTotal) : "—"}</Td>
                      <Td>{o.paymentType || "—"}</Td>
                      <Td>
                        {o.paymentStatus
                          ? <span style={{ ...s.badge, background: payBg, color: payColor }}>{o.paymentStatus}</span>
                          : "—"}
                      </Td>
                      <Td style={{ color: "#64748b", fontSize: 13 }}>{new Date(o.createdAt).toLocaleDateString("en-ZA")}</Td>
                      <Td style={{ color: "#64748b", fontSize: 13 }}>{new Date(o.updatedAt).toLocaleDateString("en-ZA")}</Td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={11} style={s.emptyCell}>No orders match this filter</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Returns */}
      {tab === "returns" && returns && !loading && (
        <div>
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Species</Th><Th>Dead</Th><Th>Mutilated</Th><Th>Not Wanted</Th><Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {returns.items.map((r) => (
                <tr key={r.speciesId}>
                  <Td>{r.speciesId}</Td>
                  <Td style={{ color: r.deadQty > 0 ? "#dc2626" : undefined }}>{r.deadQty}</Td>
                  <Td style={{ color: r.mutilatedQty > 0 ? "#d97706" : undefined }}>{r.mutilatedQty}</Td>
                  <Td>{r.notWantedQty}</Td>
                  <Td><strong>{r.totalReturns}</strong></Td>
                </tr>
              ))}
              {returns.items.length === 0 && (
                <tr><td colSpan={5} style={s.emptyCell}>No returns for selected period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, highlight, active, color, bg, onClick }: {
  label: string; value: string; highlight?: boolean;
  active?: boolean; color?: string; bg?: string; onClick?: () => void;
}) {
  const background = active && bg ? bg : highlight ? "#166534" : "#f8fafc";
  const textColor = active && color ? color : highlight ? "#fff" : "#1e293b";
  return (
    <div
      onClick={onClick}
      style={{
        ...s.kpi,
        background,
        color: textColor,
        cursor: onClick ? "pointer" : "default",
        outline: active ? `2px solid ${color ?? "#15803d"}` : "none",
        outlineOffset: 2,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={s.th}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <td style={{ ...s.td, ...style }}>{children}</td>;
}

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 20px", maxWidth: 960, margin: "0 auto" },
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#1e293b" },
  subHeading: { fontSize: 16, fontWeight: 600, margin: "20px 0 10px", color: "#334155" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  tab: {
    padding: "8px 18px", borderRadius: 8, border: "1px solid #cbd5e1",
    background: "#f1f5f9", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#475569"
  },
  tabActive: { background: "#15803d", color: "#fff", borderColor: "#15803d" },
  filterRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  label: { fontSize: 13, color: "#64748b", fontWeight: 500 },
  dateInput: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 },
  applyBtn: {
    padding: "7px 16px", borderRadius: 6, border: "none",
    background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500
  },
  kpiRow: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 },
  kpi: { flex: "1 1 160px", borderRadius: 10, padding: "16px 20px", minWidth: 140 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", fontWeight: 600, color: "#475569", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b" },
  emptyCell: { padding: "24px 12px", color: "#94a3b8", textAlign: "center" },
  mono: { fontFamily: "monospace", fontSize: 12 },
  badge: { padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  error: { color: "#dc2626", marginBottom: 12 },
  muted: { color: "#94a3b8" },
};
