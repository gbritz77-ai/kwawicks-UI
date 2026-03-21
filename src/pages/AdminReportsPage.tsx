import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { hasAnyRole } from "../api/auth";
import { reportsApi } from "../api/reportsApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientsApi } from "../api/clientsApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import type {
  RevenueSummaryResponse,
  OutstandingPaymentsResponse,
  DriverPerformanceResponse,
  ReturnsSummaryResponse,
  DeliveryStatusSummaryResponse,
  InvoiceItem,
  SpeciesRevenueResponse,
} from "../api/reportsApi";
import type { ClientDto } from "../api/clientsApi";

type Tab = "revenue" | "outstanding" | "drivers" | "returns" | "deliveries" | "invoices" | "statement" | "species";

export default function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFinancialUser = hasAnyRole("Owner", "Finance");
  const defaultTab: Tab = isFinancialUser ? "revenue" : "drivers";
  const tab = (searchParams.get("tab") as Tab) || defaultTab;

  function setTab(t: Tab) {
    setSearchParams(t === defaultTab ? {} : { tab: t }, { replace: true });
  }
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [revenue, setRevenue] = useState<RevenueSummaryResponse | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingPaymentsResponse | null>(null);
  const [drivers, setDrivers] = useState<DriverPerformanceResponse | null>(null);
  const [returns, setReturns] = useState<ReturnsSummaryResponse | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryStatusSummaryResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | "OutForDelivery" | "Delivered">("All");
  const [invoices, setInvoices] = useState<InvoiceItem[] | null>(null);
  const [invoicePayFilter, setInvoicePayFilter] = useState<"" | "Pending" | "Paid">("");
  const [invoiceCustomer, setInvoiceCustomer] = useState("");
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [speciesRevenue, setSpeciesRevenue] = useState<SpeciesRevenueResponse | null>(null);
  const [allSpecies, setAllSpecies] = useState<SpeciesResponse[]>([]);
  const [stmtCustomer, setStmtCustomer] = useState("");
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (tab === "revenue") setRevenue(await reportsApi.getRevenue(from || undefined, to || undefined));
      if (tab === "outstanding") setOutstanding(await reportsApi.getOutstandingPayments());
      if (tab === "drivers") setDrivers(await reportsApi.getDriverPerformance(from || undefined, to || undefined));
      if (tab === "returns") {
        const [ret, spc] = await Promise.all([
          reportsApi.getReturns(from || undefined, to || undefined),
          allSpecies.length ? Promise.resolve(allSpecies) : speciesApi.list(),
        ]);
        setReturns(ret);
        if (!allSpecies.length) setAllSpecies(spc);
      }
      if (tab === "deliveries") setDeliveries(await reportsApi.getDeliveryStatus(from || undefined, to || undefined));
      if (tab === "invoices") {
        const [inv, cls] = await Promise.all([
          reportsApi.getInvoices({ customerId: invoiceCustomer || undefined, paymentStatus: invoicePayFilter || undefined, from: from || undefined, to: to || undefined }),
          clients.length ? Promise.resolve(clients) : clientsApi.list(),
        ]);
        setInvoices(inv);
        if (!clients.length) setClients(cls);
      }
      if (tab === "statement" && !clients.length) {
        setClients(await clientsApi.list());
      }
      if (tab === "species") setSpeciesRevenue(await reportsApi.getSpeciesRevenue(from || undefined, to || undefined));
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
        {(["revenue", "outstanding", "invoices", "drivers", "returns", "deliveries", "species", "statement"] as Tab[])
          .filter(t => {
            const financialTabs: Tab[] = ["revenue", "outstanding", "invoices", "species", "statement"];
            return isFinancialUser || !financialTabs.includes(t);
          })
          .map((t) => (
          <button key={t} style={tab === t ? { ...s.tab, ...s.tabActive } : s.tab} onClick={() => setTab(t)}>
            {t === "revenue" && "Revenue"}
            {t === "outstanding" && "Outstanding"}
            {t === "invoices" && "Invoices"}
            {t === "drivers" && "Driver Performance"}
            {t === "returns" && "Returns"}
            {t === "deliveries" && "Deliveries"}
            {t === "species" && "Species Revenue"}
            {t === "statement" && "Customer Statement"}
          </button>
        ))}
      </div>

      {/* Date filter (not shown for outstanding or statement) */}
      {tab !== "outstanding" && tab !== "statement" && (
        <div style={s.filterRow}>
          <label style={s.label}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
          <label style={s.label}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
          <button style={s.applyBtn} onClick={load}>Apply</button>
        </div>
      )}

      {error && !loading && (() => {
        const hasData =
          (tab === "revenue" && revenue) ||
          (tab === "outstanding" && outstanding) ||
          (tab === "drivers" && drivers) ||
          (tab === "returns" && returns) ||
          (tab === "deliveries" && deliveries) ||
          (tab === "invoices" && invoices) ||
          (tab === "species" && speciesRevenue);
        return !hasData ? <p style={s.error}>{error}</p> : null;
      })()}
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
          <ScrollTable>
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
          </ScrollTable>
        </div>
      )}

      {/* Outstanding */}
      {tab === "outstanding" && outstanding && !loading && (
        <OutstandingTable
          outstanding={outstanding}
          fmt={fmt}
          onConfirmed={load}
        />
      )}

      {/* Invoices */}
      {tab === "invoices" && (
        <InvoicesTab
          invoices={invoices}
          clients={clients}
          payFilter={invoicePayFilter}
          setPayFilter={setInvoicePayFilter}
          customer={invoiceCustomer}
          setCustomer={setInvoiceCustomer}
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
          loading={loading}
          onApply={load}
          fmt={fmt}
          onConfirmed={load}
        />
      )}

      {/* Driver Performance */}
      {tab === "drivers" && drivers && !loading && (
        <div>
          <ScrollTable>
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
          </ScrollTable>
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

            <ScrollTable>
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
                      <Td>{o.customerName || o.customerId}</Td>
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
            </ScrollTable>
          </div>
        );
      })()}

      {/* Returns */}
      {tab === "returns" && returns && !loading && (
        <div>
          <ScrollTable>
            <thead>
              <tr>
                <Th>Species</Th><Th>Dead</Th><Th>Mutilated</Th><Th>Not Wanted</Th><Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {returns.items.map((r) => (
                <tr key={r.speciesId}>
                  <Td>{allSpecies.find((s) => s.speciesId === r.speciesId)?.name ?? r.speciesId}</Td>
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
          </ScrollTable>
        </div>
      )}

      {/* Species Revenue */}
      {tab === "species" && speciesRevenue && !loading && (() => {
        const grandTotal = speciesRevenue.items.reduce((s, i) => s + i.totalRevenue, 0);
        const fmtMonth = (m: string) => {
          const [y, mo] = m.split("-");
          return new Date(Number(y), Number(mo) - 1).toLocaleString("en-ZA", { month: "short", year: "2-digit" });
        };
        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Species" value={String(speciesRevenue.items.length)} />
              <KpiCard label="Total Revenue" value={fmt(grandTotal)} highlight />
            </div>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Species</Th>
                  <Th>Total Qty</Th>
                  <Th>Total Revenue</Th>
                  <Th>% of Total</Th>
                  {speciesRevenue.months.map((m) => <Th key={m}>{fmtMonth(m)}</Th>)}
                </tr>
              </thead>
              <tbody>
                {speciesRevenue.items.map((item) => (
                  <tr key={item.speciesId}>
                    <Td><strong>{item.speciesName}</strong></Td>
                    <Td>{item.totalQty}</Td>
                    <Td>{fmt(item.totalRevenue)}</Td>
                    <Td style={{ color: "#64748b" }}>
                      {grandTotal > 0 ? `${((item.totalRevenue / grandTotal) * 100).toFixed(1)}%` : "—"}
                    </Td>
                    {speciesRevenue.months.map((m) => (
                      <Td key={m} style={{ color: "#64748b" }}>
                        {item.revenueByMonth[m] ? fmt(item.revenueByMonth[m]) : "—"}
                      </Td>
                    ))}
                  </tr>
                ))}
                {speciesRevenue.items.length === 0 && (
                  <tr><td colSpan={4 + speciesRevenue.months.length} style={s.emptyCell}>No data for selected period</td></tr>
                )}
              </tbody>
            </ScrollTable>
          </div>
        );
      })()}

      {/* Customer Statement */}
      {tab === "statement" && (
        <div>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
            Generate a statement for a customer showing all their invoices and outstanding balance.
          </p>
          <div style={s.filterRow}>
            <label style={s.label}>Customer</label>
            <select
              value={stmtCustomer}
              onChange={(e) => setStmtCustomer(e.target.value)}
              style={s.select}
            >
              <option value="">— Select customer —</option>
              <option value="ALL">All Customers</option>
              {clients.map((c) => (
                <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
              ))}
            </select>
            <label style={s.label}>From</label>
            <input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)} style={s.dateInput} />
            <label style={s.label}>To</label>
            <input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)} style={s.dateInput} />
            <button
              style={{ ...s.applyBtn, opacity: stmtCustomer ? 1 : 0.5 }}
              disabled={!stmtCustomer}
              onClick={() => {
                const p = new URLSearchParams({ customerId: stmtCustomer });
                if (stmtFrom) p.set("from", stmtFrom);
                if (stmtTo) p.set("to", stmtTo);
                window.open(`/app/statement?${p}`, "_blank");
              }}
            >
              Generate Statement ↗
            </button>
          </div>
          {!clients.length && !loading && (
            <p style={s.muted}>Loading customers…</p>
          )}
        </div>
      )}
    </div>
  );
}

function InvoicesTab({
  invoices, clients, payFilter, setPayFilter, customer, setCustomer,
  from, setFrom, to, setTo, loading, onApply, fmt, onConfirmed,
}: {
  invoices: InvoiceItem[] | null;
  clients: ClientDto[];
  payFilter: "" | "Pending" | "Paid";
  setPayFilter: (v: "" | "Pending" | "Paid") => void;
  customer: string;
  setCustomer: (v: string) => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  loading: boolean;
  onApply: () => void;
  fmt: (n: number) => string;
  onConfirmed: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const clientMap = Object.fromEntries(clients.map((c) => [c.clientId, c.clientName]));

  async function handleConfirm(invoiceId: string) {
    setConfirming(invoiceId);
    try {
      await invoicesApi.confirmPayment(invoiceId);
      onConfirmed();
    } finally {
      setConfirming(null);
    }
  }

  async function handleViewReceipt(invoiceId: string) {
    setViewingReceipt(invoiceId);
    try {
      const { url } = await invoicesApi.getReceiptViewUrl(invoiceId);
      setReceiptUrl(url);
    } finally {
      setViewingReceipt(null);
    }
  }

  const totalPending = invoices?.filter((i) => i.paymentStatus === "Pending").reduce((s, i) => s + i.grandTotal, 0) ?? 0;
  const totalPaid    = invoices?.filter((i) => i.paymentStatus === "Paid").reduce((s, i) => s + i.grandTotal, 0) ?? 0;

  return (
    <div>
      {/* Filters */}
      <div style={{ ...s.filterRow, marginBottom: 16 }}>
        <label style={s.label}>Customer</label>
        <select
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          style={{ ...s.dateInput, minWidth: 180 }}
        >
          <option value="">All customers</option>
          {clients.map((c) => (
            <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
          ))}
        </select>

        <label style={s.label}>From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
        <label style={s.label}>To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
        <button style={s.applyBtn} onClick={onApply}>Apply</button>
      </div>

      {/* Payment status toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["", "Pending", "Paid"] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setPayFilter(v); onApply(); }}
            style={{
              ...s.tab,
              ...(payFilter === v ? s.tabActive : {}),
              ...(v === "Pending" && payFilter === "Pending" ? { background: "#92400e", borderColor: "#92400e" } : {}),
            }}
          >
            {v === "" ? "All" : v}
          </button>
        ))}
      </div>

      {loading && <p style={s.muted}>Loading…</p>}

      {invoices && !loading && (
        <>
          <div style={s.kpiRow}>
            <KpiCard label="Total invoices" value={String(invoices.length)} />
            <KpiCard label="Pending" value={fmt(totalPending)} />
            <KpiCard label="Paid" value={fmt(totalPaid)} highlight />
          </div>

          <ScrollTable>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Driver</Th>
                <Th>Payment Type</Th>
                <Th>Status</Th>
                <Th>Sub-total</Th>
                <Th>VAT</Th>
                <Th>Grand Total</Th>
                <Th>Date</Th>
                <Th>Receipt</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const payColor = inv.paymentStatus === "Paid" ? "#166534" : "#854d0e";
                const payBg    = inv.paymentStatus === "Paid" ? "#dcfce7" : "#fef9c3";
                const hasReceipt = !!inv.receiptS3Key;
                return (
                  <tr key={inv.invoiceId}>
                    <Td><span style={s.mono}>{inv.invoiceId.slice(0, 8)}…</span></Td>
                    <Td>{clientMap[inv.customerId] ?? inv.customerId}</Td>
                    <Td style={{ color: "#64748b", fontSize: 13 }}>{inv.createdByDriverId || "—"}</Td>
                    <Td>{inv.paymentType || "—"}</Td>
                    <Td>
                      <span style={{ ...s.badge, background: payBg, color: payColor }}>
                        {inv.paymentStatus}
                      </span>
                    </Td>
                    <Td>{fmt(inv.subTotal)}</Td>
                    <Td>{fmt(inv.vatTotal)}</Td>
                    <Td><strong>{fmt(inv.grandTotal)}</strong></Td>
                    <Td style={{ color: "#64748b", fontSize: 13 }}>
                      {new Date(inv.createdAt).toLocaleDateString("en-ZA")}
                    </Td>
                    <Td>
                      {hasReceipt ? (
                        <button
                          disabled={viewingReceipt === inv.invoiceId}
                          onClick={() => handleViewReceipt(inv.invoiceId)}
                          style={s.viewBtn}
                        >
                          {viewingReceipt === inv.invoiceId ? "…" : "View POP"}
                        </button>
                      ) : "—"}
                    </Td>
                    <Td>
                      {inv.paymentStatus === "Pending" ? (
                        <button
                          disabled={confirming === inv.invoiceId}
                          onClick={() => handleConfirm(inv.invoiceId)}
                          style={s.confirmBtn}
                        >
                          {confirming === inv.invoiceId ? "…" : "Confirm"}
                        </button>
                      ) : "—"}
                    </Td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr><td colSpan={11} style={s.emptyCell}>No invoices found</td></tr>
              )}
            </tbody>
          </ScrollTable>
        </>
      )}

      {/* Receipt image modal */}
      {receiptUrl && (
        <div style={s.modalOverlay} onClick={() => setReceiptUrl(null)}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Proof of Payment</strong>
              <button onClick={() => setReceiptUrl(null)} style={s.modalClose}>✕</button>
            </div>
            <img src={receiptUrl} alt="Proof of payment" style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8, display: "block" }} />
            <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 10, fontSize: 13, color: "#2563eb" }}>
              Open full size ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function OutstandingTable({
  outstanding,
  fmt,
  onConfirmed,
}: {
  outstanding: OutstandingPaymentsResponse;
  fmt: (n: number) => string;
  onConfirmed: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  async function handleConfirm(invoiceId: string) {
    setConfirming(invoiceId);
    try {
      await invoicesApi.confirmPayment(invoiceId);
      onConfirmed();
    } finally {
      setConfirming(null);
    }
  }

  async function handleViewReceipt(invoiceId: string) {
    setViewingReceipt(invoiceId);
    try {
      const { url } = await invoicesApi.getReceiptViewUrl(invoiceId);
      setReceiptUrl(url);
    } finally {
      setViewingReceipt(null);
    }
  }

  return (
    <div>
      <div style={s.kpiRow}>
        <KpiCard label="Outstanding invoices" value={String(outstanding.count)} />
        <KpiCard label="Total outstanding" value={fmt(outstanding.totalOutstanding)} highlight />
      </div>
      <ScrollTable>
        <thead>
          <tr>
            <Th>Invoice</Th><Th>Customer</Th><Th>Type</Th><Th>Amount</Th><Th>Days outstanding</Th><Th>Receipt</Th><Th>Action</Th>
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
              <Td>
                {i.receiptS3Key ? (
                  <button
                    disabled={viewingReceipt === i.invoiceId}
                    onClick={() => handleViewReceipt(i.invoiceId)}
                    style={s.viewBtn}
                  >
                    {viewingReceipt === i.invoiceId ? "…" : "View POP"}
                  </button>
                ) : "—"}
              </Td>
              <Td>
                <button
                  disabled={confirming === i.invoiceId}
                  onClick={() => handleConfirm(i.invoiceId)}
                  style={s.confirmBtn}
                >
                  {confirming === i.invoiceId ? "Confirming…" : "Confirm Payment"}
                </button>
              </Td>
            </tr>
          ))}
          {outstanding.items.length === 0 && (
            <tr><td colSpan={7} style={s.emptyCell}>No outstanding payments</td></tr>
          )}
        </tbody>
      </ScrollTable>

      {receiptUrl && (
        <div style={s.modalOverlay} onClick={() => setReceiptUrl(null)}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Proof of Payment</strong>
              <button onClick={() => setReceiptUrl(null)} style={s.modalClose}>✕</button>
            </div>
            <img src={receiptUrl} alt="Proof of payment" style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8, display: "block" }} />
            <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 10, fontSize: 13, color: "#2563eb" }}>
              Open full size ↗
            </a>
          </div>
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

function ScrollTable({ children }: { children: React.ReactNode }) {
  return <div style={s.tableWrap}><table style={s.table}>{children}</table></div>;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={s.th}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <td style={{ ...s.td, ...style }}>{children}</td>;
}

const s: Record<string, CSSProperties> = {
  page: { padding: "20px 24px" },
  tableWrap: { overflowX: "auto" as const },
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
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", fontWeight: 600, color: "#475569", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b", whiteSpace: "nowrap" },
  emptyCell: { padding: "24px 12px", color: "#94a3b8", textAlign: "center" },
  mono: { fontFamily: "monospace", fontSize: 12 },
  badge: { padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  confirmBtn: {
    padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
    background: "#15803d", color: "#fff", fontSize: 13, fontWeight: 600,
  },
  viewBtn: {
    padding: "5px 12px", borderRadius: 6, border: "1px solid #2563eb", cursor: "pointer",
    background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600,
  },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
    zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20, overflowY: "auto",
  },
  modalBox: {
    background: "#fff", borderRadius: 12, padding: 20, maxWidth: 720, width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  modalClose: {
    background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#64748b",
  },
  select: {
    padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14,
    background: "#fff", minWidth: 200,
  },
  error: { color: "#dc2626", marginBottom: 12 },
  muted: { color: "#94a3b8" },
};
