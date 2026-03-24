import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { hasAnyRole } from "../api/auth";
import { reportsApi } from "../api/reportsApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientsApi } from "../api/clientsApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { whatsappApi } from "../api/whatsappApi";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto } from "../api/procurementOrdersApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";
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

type Tab = "revenue" | "outstanding" | "drivers" | "returns" | "deliveries" | "invoices" | "statement" | "species" | "supplier-spend" | "margin" | "load-discrepancy";

export default function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFinancialUser    = hasAnyRole("Owner", "Finance");
  const isProcurementUser  = hasAnyRole("Owner", "Finance", "Procurement");
  const defaultTab: Tab = isFinancialUser ? "revenue" : isProcurementUser ? "supplier-spend" : "drivers";
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
  const [poData, setPoData]   = useState<ProcurementOrderDto[]   | null>(null);
  const [crData, setCrData]   = useState<CollectionRequestDto[]  | null>(null);
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
      if (tab === "supplier-spend") setPoData(await procurementOrdersApi.list());
      if (tab === "margin" && !allSpecies.length) setAllSpecies(await speciesApi.list());
      if (tab === "load-discrepancy") setCrData(await collectionRequestsApi.list());
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
        {(["revenue", "outstanding", "invoices", "drivers", "returns", "deliveries", "species", "statement", "supplier-spend"] as Tab[])
          .filter(t => {
            const financialTabs: Tab[] = ["revenue", "outstanding", "invoices", "species", "statement"];
            const procurementTabs: Tab[] = ["supplier-spend", "margin", "load-discrepancy"];
            if (procurementTabs.includes(t)) return isProcurementUser;
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
            {t === "supplier-spend" && "💼 Supplier Spend"}
            {t === "margin"            && "📊 Cost vs Sell Margin"}
            {t === "load-discrepancy"  && "⚠ Load Discrepancy"}
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
  const [waModal, setWaModal] = useState<{ invoiceId: string; customerId: string } | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ success: boolean; message: string } | null>(null);

  const clientMap = Object.fromEntries(clients.map((c) => [c.clientId, c.clientName]));
  const clientPhoneMap = Object.fromEntries(clients.map((c) => [c.clientId, c.clientPhone ?? ""]));

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
                <Th>WhatsApp</Th>
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
                    <Td>
                      <button
                        onClick={() => {
                          setWaModal({ invoiceId: inv.invoiceId, customerId: inv.customerId });
                          setWaPhone(clientPhoneMap[inv.customerId] ?? "");
                          setWaResult(null);
                        }}
                        style={s.waBtn}
                      >
                        📱 WhatsApp
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr><td colSpan={12} style={s.emptyCell}>No invoices found</td></tr>
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

      {/* ── Supplier Spend by Month ── */}
      {tab === "supplier-spend" && poData && !loading && (() => {
        const nonDraft = poData.filter(p => p.status !== "Draft");
        const filtered = nonDraft.filter(p => {
          const d = p.createdAt.slice(0, 10);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return true;
        });

        // Aggregate: supplier → month → { orders, units, value }
        type Row = { supplier: string; month: string; orders: number; units: number; value: number };
        const map = new Map<string, Row>();
        for (const po of filtered) {
          const month = po.createdAt.slice(0, 7); // "YYYY-MM"
          const key   = `${po.supplierName}||${month}`;
          const poValue = po.lines.reduce((s, l) => s + l.orderedQty * (l.unitCost ?? 0), 0);
          const poUnits = po.lines.reduce((s, l) => s + l.orderedQty, 0);
          const existing = map.get(key) ?? { supplier: po.supplierName || po.supplierId, month, orders: 0, units: 0, value: 0 };
          map.set(key, { ...existing, orders: existing.orders + 1, units: existing.units + poUnits, value: existing.value + poValue });
        }
        const rows = [...map.values()].sort((a, b) => b.month.localeCompare(a.month) || a.supplier.localeCompare(b.supplier));

        const totalValue  = rows.reduce((s, r) => s + r.value, 0);
        const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
        const totalUnits  = rows.reduce((s, r) => s + r.units,  0);
        const suppliers   = new Set(rows.map(r => r.supplier)).size;

        const formatMonth = (m: string) => {
          const [y, mo] = m.split("-");
          return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
        };

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Total Spend (excl. VAT)" value={fmt(totalValue)} highlight />
              <KpiCard label="Suppliers"               value={String(suppliers)} />
              <KpiCard label="Orders"                  value={String(totalOrders)} />
              <KpiCard label="Total Units"             value={totalUnits.toLocaleString()} />
            </div>
            {rows.length === 0 ? (
              <p style={s.muted}>No submitted orders for the selected period.</p>
            ) : (
              <ScrollTable>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th>Supplier</Th>
                    <Th>Orders</Th>
                    <Th>Units</Th>
                    <Th>Total Value (excl. VAT)</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <Td>{formatMonth(r.month)}</Td>
                      <Td style={{ fontWeight: 600 }}>{r.supplier}</Td>
                      <Td>{r.orders}</Td>
                      <Td>{r.units.toLocaleString()}</Td>
                      <Td style={{ fontWeight: 700, color: "#166534" }}>{fmt(r.value)}</Td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                    <Td style={{ fontWeight: 700 }}>TOTAL</Td>
                    <Td>—</Td>
                    <Td>{totalOrders}</Td>
                    <Td>{totalUnits.toLocaleString()}</Td>
                    <Td style={{ fontWeight: 800, color: "#166534" }}>{fmt(totalValue)}</Td>
                  </tr>
                </tbody>
              </ScrollTable>
            )}
          </div>
        );
      })()}

      {/* ── Cost vs Sell Price Margin ── */}
      {tab === "margin" && !loading && (() => {
        const rows = allSpecies
          .filter(sp => sp.isActive)
          .map(sp => {
            const cost   = Number(sp.unitCost   ?? 0);
            const sell   = Number(sp.sellPrice  ?? 0);
            const margin = sell > 0 ? ((sell - cost) / sell) * 100 : null;
            const rand   = sell - cost;
            return { name: sp.name, cost, sell, rand, margin };
          })
          .sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999));

        const avgMargin = rows.filter(r => r.margin !== null).reduce((s, r) => s + (r.margin ?? 0), 0) / (rows.filter(r => r.margin !== null).length || 1);

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Active Species"   value={String(rows.length)} />
              <KpiCard label="Avg Gross Margin" value={`${avgMargin.toFixed(1)}%`} highlight />
              <KpiCard label="Best Margin"      value={rows[0]?.margin != null ? `${rows[0].margin.toFixed(1)}%` : "—"} />
              <KpiCard label="Lowest Margin"    value={rows[rows.length - 1]?.margin != null ? `${rows[rows.length - 1].margin!.toFixed(1)}%` : "—"} />
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              ⚠ Unit cost and sell price are excl. VAT. Margin = (Sell − Cost) / Sell × 100.
            </p>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Species</Th>
                  <Th>Unit Cost (excl. VAT)</Th>
                  <Th>Sell Price (excl. VAT)</Th>
                  <Th>Margin (R)</Th>
                  <Th>Margin (%)</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const good = (r.margin ?? 0) >= 20;
                  const warn = (r.margin ?? 0) > 0 && (r.margin ?? 0) < 20;
                  const bad  = (r.margin ?? 0) <= 0;
                  const color = good ? "#166534" : warn ? "#92400e" : "#dc2626";
                  const bg    = good ? "#f0fdf4"  : warn ? "#fefce8"  : "#fef2f2";
                  return (
                    <tr key={i}>
                      <Td style={{ fontWeight: 600 }}>{r.name}</Td>
                      <Td>{fmt(r.cost)}</Td>
                      <Td>{r.sell > 0 ? fmt(r.sell) : <span style={{ color: "#94a3b8" }}>Not set</span>}</Td>
                      <Td style={{ fontWeight: 700, color }}>{r.sell > 0 ? fmt(r.rand) : "—"}</Td>
                      <Td>
                        {r.margin !== null ? (
                          <span style={{ background: bg, color, padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>
                            {r.margin.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
          </div>
        );
      })()}

      {/* ── Load Discrepancy ── */}
      {tab === "load-discrepancy" && crData && !loading && (() => {
        // Only CRs that have been loaded (Loading or beyond)
        const loaded = crData.filter(cr => {
          const d = cr.createdAt.slice(0, 10);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return ["Loading","InTransit","ArrivedAtHub","HubConfirmed","FinanceAcknowledged"].includes(cr.status);
        });

        type DriverRow = { driver: string; collections: number; orderedTotal: number; loadedTotal: number; shortTotal: number };
        const driverMap = new Map<string, DriverRow>();
        for (const cr of loaded) {
          const key = cr.assignedDriverName || cr.assignedDriverId || "Unknown";
          const ordered = cr.lines.reduce((s, l) => s + l.orderedQty, 0);
          const loadedQ = cr.lines.reduce((s, l) => s + l.loadedQty,  0);
          const short   = Math.max(0, ordered - loadedQ);
          const existing = driverMap.get(key) ?? { driver: key, collections: 0, orderedTotal: 0, loadedTotal: 0, shortTotal: 0 };
          driverMap.set(key, { ...existing, collections: existing.collections + 1, orderedTotal: existing.orderedTotal + ordered, loadedTotal: existing.loadedTotal + loadedQ, shortTotal: existing.shortTotal + short });
        }
        const rows = [...driverMap.values()].sort((a, b) => b.shortTotal - a.shortTotal);
        const totalShort   = rows.reduce((s, r) => s + r.shortTotal, 0);
        const totalOrdered = rows.reduce((s, r) => s + r.orderedTotal, 0);
        const pctShort     = totalOrdered > 0 ? (totalShort / totalOrdered * 100) : 0;

        // Per-species discrepancy
        type SpecRow = { species: string; orderedTotal: number; loadedTotal: number; shortTotal: number; occurrences: number };
        const specMap = new Map<string, SpecRow>();
        for (const cr of loaded) {
          for (const l of cr.lines) {
            const short = Math.max(0, l.orderedQty - l.loadedQty);
            const existing = specMap.get(l.speciesId) ?? { species: l.speciesName || l.speciesId, orderedTotal: 0, loadedTotal: 0, shortTotal: 0, occurrences: 0 };
            specMap.set(l.speciesId, { ...existing, orderedTotal: existing.orderedTotal + l.orderedQty, loadedTotal: existing.loadedTotal + l.loadedQty, shortTotal: existing.shortTotal + short, occurrences: existing.occurrences + (short > 0 ? 1 : 0) });
          }
        }
        const specRows = [...specMap.values()].sort((a, b) => b.shortTotal - a.shortTotal);

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Collections Reviewed" value={String(loaded.length)} />
              <KpiCard label="Total Short-loaded"    value={totalShort.toLocaleString()} highlight />
              <KpiCard label="Short-load Rate"       value={`${pctShort.toFixed(1)}%`} />
              <KpiCard label="Drivers"               value={String(rows.length)} />
            </div>

            <h3 style={s.subHeading}>By Driver</h3>
            {rows.length === 0 ? <p style={s.muted}>No data for this period.</p> : (
              <ScrollTable>
                <thead><tr><Th>Driver</Th><Th>Collections</Th><Th>Ordered</Th><Th>Loaded</Th><Th>Short</Th><Th>Short %</Th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const pct = r.orderedTotal > 0 ? r.shortTotal / r.orderedTotal * 100 : 0;
                    const color = pct === 0 ? "#166534" : pct < 5 ? "#92400e" : "#dc2626";
                    return (
                      <tr key={i}>
                        <Td style={{ fontWeight: 600 }}>{r.driver}</Td>
                        <Td>{r.collections}</Td>
                        <Td>{r.orderedTotal.toLocaleString()}</Td>
                        <Td>{r.loadedTotal.toLocaleString()}</Td>
                        <Td style={{ fontWeight: 700, color: r.shortTotal > 0 ? "#dc2626" : "#166534" }}>{r.shortTotal.toLocaleString()}</Td>
                        <Td><span style={{ background: pct === 0 ? "#f0fdf4" : pct < 5 ? "#fefce8" : "#fef2f2", color, padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{pct.toFixed(1)}%</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </ScrollTable>
            )}

            <h3 style={s.subHeading}>By Species</h3>
            <ScrollTable>
              <thead><tr><Th>Species</Th><Th>Ordered</Th><Th>Loaded</Th><Th>Short</Th><Th>Occurrences Short-loaded</Th></tr></thead>
              <tbody>
                {specRows.map((r, i) => (
                  <tr key={i}>
                    <Td style={{ fontWeight: 600 }}>{r.species}</Td>
                    <Td>{r.orderedTotal.toLocaleString()}</Td>
                    <Td>{r.loadedTotal.toLocaleString()}</Td>
                    <Td style={{ fontWeight: 700, color: r.shortTotal > 0 ? "#dc2626" : "#166534" }}>{r.shortTotal.toLocaleString()}</Td>
                    <Td>{r.occurrences > 0 ? <span style={{ background: "#fef2f2", color: "#dc2626", padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{r.occurrences}x</span> : <span style={{ color: "#166534" }}>✓</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </div>
        );
      })()}

      {/* WhatsApp send modal */}
      {waModal && (
        <div style={s.modalOverlay} onClick={() => { setWaModal(null); setWaResult(null); }}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 15 }}>📱 Send Invoice via WhatsApp</strong>
              <button onClick={() => { setWaModal(null); setWaResult(null); }} style={s.modalClose}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
              Invoice: <span style={{ fontFamily: "monospace" }}>{waModal.invoiceId.slice(0, 8)}…</span>
            </p>
            <label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>Phone number</label>
            <input
              type="tel"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="e.g. 0821234567"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }}
            />
            {waResult && (
              <p style={{ marginTop: 12, fontSize: 13, color: waResult.success ? "#166534" : "#dc2626", fontWeight: 600 }}>
                {waResult.message}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setWaModal(null); setWaResult(null); }}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                disabled={waSending || !waPhone}
                onClick={async () => {
                  setWaSending(true);
                  setWaResult(null);
                  try {
                    const result = await whatsappApi.sendInvoice(waModal.invoiceId, waPhone);
                    setWaResult(result);
                  } catch (err: any) {
                    setWaResult({ success: false, message: err.message ?? "Failed to send" });
                  } finally {
                    setWaSending(false);
                  }
                }}
                style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, opacity: waSending || !waPhone ? 0.6 : 1 }}
              >
                {waSending ? "Sending…" : "Send"}
              </button>
            </div>
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
  waBtn: {
    padding: "5px 12px", borderRadius: 6, border: "1px solid #15803d", cursor: "pointer",
    background: "#f0fdf4", color: "#15803d", fontSize: 13, fontWeight: 600,
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
