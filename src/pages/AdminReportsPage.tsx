import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { hasAnyRole } from "../api/auth";
import { reportsApi } from "../api/reportsApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientsApi } from "../api/clientsApi";
import { staffMembersApi } from "../api/staffMembersApi";
import type { StaffMemberDto } from "../api/staffMembersApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { whatsappApi } from "../api/whatsappApi";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto } from "../api/procurementOrdersApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";
import { deliveryOrdersApi } from "../api/deliveryOrdersApi";
import { deliveryRunsApi } from "../api/deliveryRunsApi";
import type { DeliveryRunDto } from "../api/deliveryRunsApi";
import { clientCreditApi } from "../api/clientCreditApi";
import type { DeliveryOrderResponse } from "../api/deliveryOrdersApi";
import type {
  RevenueSummaryResponse,
  OutstandingPaymentsResponse,
  DriverPerformanceResponse,
  ReturnsSummaryResponse,
  DeliveryStatusSummaryResponse,
  InvoiceItem,
  SpeciesRevenueResponse,
  SalesReportRow,
  StaffStockDeductionsReportResponse,
} from "../api/reportsApi";
import { costAveragesApi } from "../api/costAveragesApi";
import type { CostAverageRecordDto } from "../api/costAveragesApi";
import type { ClientDto } from "../api/clientsApi";
import { NumericInput } from "../components/NumericInput";

type Tab = "revenue" | "outstanding" | "drivers" | "returns" | "deliveries" | "invoices" | "statement" | "species" | "supplier-spend" | "margin" | "load-discrepancy" | "transit-discrepancy" | "supplier-reliability" | "client-orders" | "sales" | "delivery-runs" | "staff-deductions";

export default function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFinancialUser    = hasAnyRole("Owner", "Finance", "Admin");
  const isProcurementUser  = hasAnyRole("Owner", "Finance", "Admin", "Procurement");
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
  const [runReport, setRunReport] = useState<DeliveryRunDto[] | null>(null);

  // ── Sales tab state ─────────────────────────────────────────────────────────
  const salesDefaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const salesDefaultTo   = new Date().toISOString().slice(0, 10);
  const [salesFrom,        setSalesFrom]        = useState(salesDefaultFrom);
  const [salesTo,          setSalesTo]          = useState(salesDefaultTo);
  const [salesRows,        setSalesRows]        = useState<SalesReportRow[]>([]);
  const [salesClientId,    setSalesClientId]    = useState("");
  const [salesView,        setSalesView]        = useState<"client" | "walkin">("client");
  const [salesCostRecords, setSalesCostRecords] = useState<CostAverageRecordDto[]>([]);

  // ── Staff Stock Deductions tab state ────────────────────────────────────────
  const [staffDeductions, setStaffDeductions] = useState<StaffStockDeductionsReportResponse | null>(null);
  const [staffDeductFilter, setStaffDeductFilter] = useState("");
  const [settleTarget, setSettleTarget] = useState<{ staffMemberId: string; staffName: string; balance: number } | null>(null);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleMessage, setSettleMessage] = useState("");

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
        if (!clients.length) setClients(cls.filter((c: ClientDto) => !c.isWalkIn));
      }
      if (tab === "statement" && !clients.length) {
        setClients((await clientsApi.list()).filter((c: ClientDto) => !c.isWalkIn));
      }
      if (tab === "species") setSpeciesRevenue(await reportsApi.getSpeciesRevenue(from || undefined, to || undefined));
      if (tab === "supplier-spend") setPoData(await procurementOrdersApi.list());
      if (tab === "margin" && !allSpecies.length) setAllSpecies(await speciesApi.list());
      if (["load-discrepancy","transit-discrepancy","supplier-reliability"].includes(tab)) setCrData(await collectionRequestsApi.list());
      if (tab === "delivery-runs") setRunReport(await deliveryRunsApi.list());
      if (tab === "client-orders") {
        if (!clients.length) setClients((await clientsApi.list()).filter((c: ClientDto) => !c.isWalkIn));
        if (!allSpecies.length) setAllSpecies(await speciesApi.list());
      }
      if (tab === "sales") {
        const [salesData, costData, cls] = await Promise.all([
          reportsApi.getSalesReport(salesFrom || undefined, salesTo || undefined),
          costAveragesApi.getHistory(),
          clients.length ? Promise.resolve(clients) : clientsApi.list(),
        ]);
        setSalesRows(salesData.rows);
        setSalesCostRecords(costData);
        if (!clients.length) setClients(cls);
      }
      if (tab === "staff-deductions") {
        setStaffDeductions(await reportsApi.getStaffStockDeductions({ from: from || undefined, to: to || undefined }));
      }
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
        {(["revenue", "outstanding", "invoices", "sales", "staff-deductions", "client-orders", "drivers", "returns", "deliveries", "delivery-runs", "species", "statement", "supplier-spend", "margin", "load-discrepancy", "transit-discrepancy", "supplier-reliability"] as Tab[])
          .filter(t => {
            const financialTabs: Tab[] = ["revenue", "outstanding", "invoices", "species", "statement", "sales", "staff-deductions"];
            const procurementTabs: Tab[] = ["supplier-spend", "margin", "load-discrepancy", "transit-discrepancy", "supplier-reliability"];
            if (procurementTabs.includes(t)) return isProcurementUser;
            return isFinancialUser || !financialTabs.includes(t);
          })
          .map((t) => (
          <button key={t} style={tab === t ? { ...s.tab, ...s.tabActive } : s.tab} onClick={() => setTab(t)}>
            {t === "revenue"               && "💰 Revenue"}
            {t === "outstanding"           && "⚠️ Outstanding"}
            {t === "invoices"              && "🧾 Invoices"}
            {t === "sales"                 && "📋 Sales"}
            {t === "staff-deductions"      && "👤 Staff Stock Deductions"}
            {t === "drivers"               && "🚚 Driver Performance"}
            {t === "returns"               && "↩️ Returns"}
            {t === "deliveries"            && "📬 Deliveries"}
            {t === "delivery-runs"         && "🚚 Delivery Runs"}
            {t === "species"               && "🐔 Species Revenue"}
            {t === "statement"             && "📄 Customer Statement"}
            {t === "supplier-spend"        && "💼 Supplier Spend"}
            {t === "margin"                && "📊 Cost vs Sell Margin"}
            {t === "load-discrepancy"      && "⚠️ Load Discrepancy"}
            {t === "transit-discrepancy"   && "🚛 Transit Loss"}
            {t === "supplier-reliability"  && "⭐ Supplier Reliability"}
            {t === "client-orders"         && "📦 Client Orders"}
          </button>
        ))}
      </div>

      {/* Date filter (not shown for outstanding, statement, client-orders, or sales — sales has its own) */}
      {tab !== "outstanding" && tab !== "statement" && tab !== "client-orders" && tab !== "sales" && (
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
          species={allSpecies}
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
                        {o.invoiceId ? (o.invoiceNumber || o.invoiceId.slice(0, 8) + "…") : "—"}
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
              <KpiCard label="Total Spend (incl. VAT)" value={fmt(totalValue)} highlight />
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
                    <Th>Total Value (incl. VAT)</Th>
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
              Unit cost and sell price are incl. VAT. Margin = (Sell − Cost) / Sell × 100.
            </p>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Species</Th>
                  <Th>Unit Cost (incl. VAT)</Th>
                  <Th>Sell Price (incl. VAT)</Th>
                  <Th>Margin (R)</Th>
                  <Th>Margin (%)</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const good = (r.margin ?? 0) >= 20;
                  const warn = (r.margin ?? 0) > 0 && (r.margin ?? 0) < 20;
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

      {/* ── Transit Loss (Loaded vs Received) ── */}
      {tab === "transit-discrepancy" && crData && !loading && (() => {
        // Only hub-confirmed or finance-acknowledged CRs have receivedQty
        const confirmed = crData.filter(cr => {
          const d = cr.createdAt.slice(0, 10);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return ["HubConfirmed","FinanceAcknowledged"].includes(cr.status);
        });

        type Row = { supplier: string; collections: number; loadedTotal: number; receivedTotal: number; lossTotal: number };
        const supMap = new Map<string, Row>();
        for (const cr of confirmed) {
          const key = cr.supplierName || cr.supplierId || "Unknown";
          const loaded   = cr.lines.reduce((s, l) => s + l.loadedQty,   0);
          const received = cr.lines.reduce((s, l) => s + l.receivedQty, 0);
          const loss     = Math.max(0, loaded - received);
          const existing = supMap.get(key) ?? { supplier: key, collections: 0, loadedTotal: 0, receivedTotal: 0, lossTotal: 0 };
          supMap.set(key, { ...existing, collections: existing.collections + 1, loadedTotal: existing.loadedTotal + loaded, receivedTotal: existing.receivedTotal + received, lossTotal: existing.lossTotal + loss });
        }
        const rows = [...supMap.values()].sort((a, b) => b.lossTotal - a.lossTotal);
        const totalLoss     = rows.reduce((s, r) => s + r.lossTotal, 0);
        const totalLoaded   = rows.reduce((s, r) => s + r.loadedTotal, 0);
        const pctLoss       = totalLoaded > 0 ? totalLoss / totalLoaded * 100 : 0;

        // Per-species loss
        type SRow = { species: string; loaded: number; received: number; loss: number };
        const specMap = new Map<string, SRow>();
        for (const cr of confirmed) {
          for (const l of cr.lines) {
            const loss = Math.max(0, l.loadedQty - l.receivedQty);
            const ex = specMap.get(l.speciesId) ?? { species: l.speciesName || l.speciesId, loaded: 0, received: 0, loss: 0 };
            specMap.set(l.speciesId, { ...ex, loaded: ex.loaded + l.loadedQty, received: ex.received + l.receivedQty, loss: ex.loss + loss });
          }
        }
        const specRows = [...specMap.values()].sort((a, b) => b.loss - a.loss);

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Confirmed Collections" value={String(confirmed.length)} />
              <KpiCard label="Total Transit Loss"     value={totalLoss.toLocaleString()} highlight />
              <KpiCard label="Transit Loss Rate"      value={`${pctLoss.toFixed(1)}%`} />
              <KpiCard label="Suppliers"              value={String(rows.length)} />
            </div>

            <h3 style={s.subHeading}>By Supplier</h3>
            {rows.length === 0 ? <p style={s.muted}>No hub-confirmed collections in this period.</p> : (
              <ScrollTable>
                <thead><tr><Th>Supplier</Th><Th>Collections</Th><Th>Loaded</Th><Th>Received at Hub</Th><Th>Loss</Th><Th>Loss %</Th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const pct = r.loadedTotal > 0 ? r.lossTotal / r.loadedTotal * 100 : 0;
                    const color = pct === 0 ? "#166534" : pct < 3 ? "#92400e" : "#dc2626";
                    return (
                      <tr key={i}>
                        <Td style={{ fontWeight: 600 }}>{r.supplier}</Td>
                        <Td>{r.collections}</Td>
                        <Td>{r.loadedTotal.toLocaleString()}</Td>
                        <Td>{r.receivedTotal.toLocaleString()}</Td>
                        <Td style={{ fontWeight: 700, color: r.lossTotal > 0 ? "#dc2626" : "#166534" }}>{r.lossTotal.toLocaleString()}</Td>
                        <Td><span style={{ background: pct === 0 ? "#f0fdf4" : pct < 3 ? "#fefce8" : "#fef2f2", color, padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{pct.toFixed(1)}%</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </ScrollTable>
            )}

            <h3 style={s.subHeading}>By Species</h3>
            <ScrollTable>
              <thead><tr><Th>Species</Th><Th>Loaded</Th><Th>Received</Th><Th>Loss</Th><Th>Loss %</Th></tr></thead>
              <tbody>
                {specRows.map((r, i) => {
                  const pct = r.loaded > 0 ? r.loss / r.loaded * 100 : 0;
                  const color = pct === 0 ? "#166534" : pct < 3 ? "#92400e" : "#dc2626";
                  return (
                    <tr key={i}>
                      <Td style={{ fontWeight: 600 }}>{r.species}</Td>
                      <Td>{r.loaded.toLocaleString()}</Td>
                      <Td>{r.received.toLocaleString()}</Td>
                      <Td style={{ fontWeight: 700, color: r.loss > 0 ? "#dc2626" : "#166534" }}>{r.loss.toLocaleString()}</Td>
                      <Td><span style={{ background: pct === 0 ? "#f0fdf4" : pct < 3 ? "#fefce8" : "#fef2f2", color, padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{pct.toFixed(1)}%</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
          </div>
        );
      })()}

      {/* ── Supplier Reliability ── */}
      {tab === "supplier-reliability" && crData && !loading && (() => {
        const confirmed = crData.filter(cr => {
          const d = cr.createdAt.slice(0, 10);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return ["HubConfirmed","FinanceAcknowledged"].includes(cr.status);
        });

        type Row = { supplier: string; orders: number; orderedTotal: number; receivedTotal: number; fulfilPct: number };
        const map = new Map<string, Row>();
        for (const cr of confirmed) {
          const key      = cr.supplierName || cr.supplierId || "Unknown";
          const ordered  = cr.lines.reduce((s, l) => s + l.orderedQty,   0);
          const received = cr.lines.reduce((s, l) => s + l.receivedQty,  0);
          const ex = map.get(key) ?? { supplier: key, orders: 0, orderedTotal: 0, receivedTotal: 0, fulfilPct: 0 };
          const newOrdered  = ex.orderedTotal  + ordered;
          const newReceived = ex.receivedTotal + received;
          map.set(key, { ...ex, orders: ex.orders + 1, orderedTotal: newOrdered, receivedTotal: newReceived, fulfilPct: newOrdered > 0 ? newReceived / newOrdered * 100 : 0 });
        }
        const rows = [...map.values()].sort((a, b) => a.fulfilPct - b.fulfilPct);
        const overallOrdered  = rows.reduce((s, r) => s + r.orderedTotal,  0);
        const overallReceived = rows.reduce((s, r) => s + r.receivedTotal, 0);
        const overallPct      = overallOrdered > 0 ? overallReceived / overallOrdered * 100 : 0;

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Suppliers Tracked"    value={String(rows.length)} />
              <KpiCard label="Overall Fulfilment"   value={`${overallPct.toFixed(1)}%`} highlight />
              <KpiCard label="Total Ordered"        value={overallOrdered.toLocaleString()} />
              <KpiCard label="Total Received"       value={overallReceived.toLocaleString()} />
            </div>
            {rows.length === 0 ? <p style={s.muted}>No hub-confirmed collections in this period.</p> : (
              <ScrollTable>
                <thead><tr><Th>Supplier</Th><Th>Collections</Th><Th>Ordered</Th><Th>Received</Th><Th>Shortfall</Th><Th>Fulfilment %</Th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const color = r.fulfilPct >= 98 ? "#166534" : r.fulfilPct >= 90 ? "#92400e" : "#dc2626";
                    const bg    = r.fulfilPct >= 98 ? "#f0fdf4"  : r.fulfilPct >= 90 ? "#fefce8"  : "#fef2f2";
                    return (
                      <tr key={i}>
                        <Td style={{ fontWeight: 600 }}>{r.supplier}</Td>
                        <Td>{r.orders}</Td>
                        <Td>{r.orderedTotal.toLocaleString()}</Td>
                        <Td>{r.receivedTotal.toLocaleString()}</Td>
                        <Td style={{ fontWeight: 700, color: r.orderedTotal - r.receivedTotal > 0 ? "#dc2626" : "#166534" }}>{(r.orderedTotal - r.receivedTotal).toLocaleString()}</Td>
                        <Td><span style={{ background: bg, color, padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{r.fulfilPct.toFixed(1)}%</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </ScrollTable>
            )}
          </div>
        );
      })()}

      {/* Client Orders */}
      {tab === "client-orders" && !loading && (
        <ClientOrdersTab clients={clients} species={allSpecies} fmt={fmt} />
      )}

      {/* Sales */}
      {tab === "sales" && (
        <SalesTab
          rows={salesRows}
          allClients={clients}
          costRecords={salesCostRecords}
          salesFrom={salesFrom}
          salesTo={salesTo}
          setSalesFrom={setSalesFrom}
          setSalesTo={setSalesTo}
          salesClientId={salesClientId}
          setSalesClientId={setSalesClientId}
          salesView={salesView}
          setSalesView={setSalesView}
          loading={loading}
          onApply={() => load()}
          fmt={fmt}
        />
      )}

      {/* ── Staff Stock Deductions ── */}
      {tab === "staff-deductions" && staffDeductions && !loading && (() => {
        const filteredSummary = staffDeductions.summary.filter(s =>
          !staffDeductFilter || s.staffName.toLowerCase().includes(staffDeductFilter.toLowerCase())
        );
        const filteredDetails = staffDeductions.details.filter(d =>
          !staffDeductFilter || d.staffName.toLowerCase().includes(staffDeductFilter.toLowerCase())
        );
        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Staff with deductions" value={String(staffDeductions.summary.length)} />
              <KpiCard label="Transactions" value={String(staffDeductions.details.length)} />
              <KpiCard label="Total to deduct" value={fmt(staffDeductions.totalAmount)} highlight />
            </div>

            <div style={{ marginBottom: 12 }}>
              <input
                style={s.dateInput}
                placeholder="Filter by staff name…"
                value={staffDeductFilter}
                onChange={e => setStaffDeductFilter(e.target.value)}
              />
            </div>

            <h3 style={s.subHeading}>Summary — amount to deduct per staff member</h3>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Staff</Th><Th>Department</Th><Th>Transactions</Th><Th>Total to Deduct</Th><Th>Current Balance</Th><Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.length === 0 ? (
                  <tr><Td>No staff stock deductions in this period.</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td></tr>
                ) : filteredSummary.map(row => {
                  const isSettled = row.currentBalance >= 0;
                  return (
                    <tr key={row.staffMemberId}>
                      <Td>{row.staffName}</Td>
                      <Td>{row.department || "—"}</Td>
                      <Td>{row.transactionCount}</Td>
                      <Td><strong>{fmt(row.totalAmount)}</strong></Td>
                      <Td style={{ color: row.currentBalance < 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                        {fmt(row.currentBalance)}
                      </Td>
                      <Td>
                        {isSettled ? (
                          <span style={{ color: "#16a34a", fontSize: 13 }}>✓ Settled</span>
                        ) : (
                          <button
                            style={{ ...s.btn, background: "#0f172a", color: "#fff", fontSize: 12, padding: "4px 10px" }}
                            onClick={() => setSettleTarget({ staffMemberId: row.staffMemberId, staffName: row.staffName, balance: row.currentBalance })}
                          >
                            Mark Salary Deducted
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>

            {settleMessage && (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#166534", fontSize: 13 }}>
                {settleMessage}
                <button style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "#166534", fontWeight: 700 }} onClick={() => setSettleMessage("")}>✕</button>
              </div>
            )}

            <h3 style={s.subHeading}>Detail — what stock, cost, and date</h3>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Staff</Th><Th>Invoice #</Th><Th>Items Taken</Th><Th>Payment Type</Th><Th>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.length === 0 ? (
                  <tr><Td>No transactions found.</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td></tr>
                ) : filteredDetails.map(d => (
                  <tr key={d.invoiceId}>
                    <Td>{new Date(d.date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</Td>
                    <Td>{d.staffName}{d.department ? ` (${d.department})` : ""}</Td>
                    <Td>{d.invoiceNumber}</Td>
                    <Td>
                      {d.lines.map((l, i) => (
                        <div key={i} style={{ fontSize: 12 }}>
                          {l.quantity} × {l.speciesName} @ {fmt(l.unitPrice)} = {fmt(l.lineTotal)}
                        </div>
                      ))}
                    </Td>
                    <Td>{d.paymentType}</Td>
                    <Td><strong>{fmt(d.grandTotal)}</strong></Td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>

            {/* ── Settle Salary Deduction Confirmation Modal ── */}
            {settleTarget && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 400, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Confirm Salary Deduction</h3>
                  <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                    Mark salary deduction as processed for <strong>{settleTarget.staffName}</strong>?
                  </p>
                  <p style={{ margin: "0 0 20px", fontSize: 14 }}>
                    Outstanding balance: <strong style={{ color: "#dc2626" }}>{fmt(settleTarget.balance)}</strong> will be cleared to <strong style={{ color: "#16a34a" }}>R0</strong>.
                  </p>
                  <p style={{ margin: "0 0 20px", fontSize: 12, color: "#64748b" }}>
                    This records a SalaryDeduction credit entry in the staff member's account. Only do this after the deduction has been processed from their pay.
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      style={{ ...s.btn, background: "#e2e8f0", color: "#1e293b" }}
                      onClick={() => setSettleTarget(null)}
                      disabled={settleLoading}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ ...s.btn, background: "#0f172a", color: "#fff" }}
                      disabled={settleLoading}
                      onClick={async () => {
                        setSettleLoading(true);
                        try {
                          const res = await staffMembersApi.settleDeductions(settleTarget.staffMemberId);
                          setSettleMessage(res.message);
                          setSettleTarget(null);
                          // Reload the report so balances refresh
                          setStaffDeductions(await reportsApi.getStaffStockDeductions({ from: from || undefined, to: to || undefined }));
                        } catch {
                          setSettleMessage("Failed to process settlement. Please try again.");
                          setSettleTarget(null);
                        } finally {
                          setSettleLoading(false);
                        }
                      }}
                    >
                      {settleLoading ? "Processing…" : "Confirm — Mark as Deducted"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Delivery Runs Report ── */}
      {tab === "delivery-runs" && runReport && !loading && (() => {
        function fmtDT(iso: string) {
          return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        }

        const filtered = runReport
          .filter(r => {
            const d = r.createdAt.slice(0, 10);
            if (from && d < from) return false;
            if (to   && d > to)   return false;
            return true;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const totalRuns      = filtered.length;
        const completedRuns  = filtered.filter(r => r.status === "Completed").length;
        const inProgressRuns = filtered.filter(r => r.status === "OutForDelivery").length;
        const allAllocs      = filtered.flatMap(r => r.allocations);
        const deliveredAllocs = allAllocs.filter(a => a.deliveryStatus === "Delivered");
        const totalItemsDelivered = deliveredAllocs.flatMap(a => a.lines).reduce((s, l) => s + l.deliveredQty, 0);

        const runStatus = (s: string) =>
          s === "Completed"      ? { bg: "#dcfce7", color: "#166534", label: "Completed" } :
          s === "OutForDelivery" ? { bg: "#dbeafe", color: "#1d4ed8", label: "Out for Delivery" } :
                                   { bg: "#fef9c3", color: "#854d0e", label: "Open" };

        const allocStatus = (s: string) =>
          s === "Delivered"      ? { bg: "#dcfce7", color: "#166534", label: "Delivered" } :
          s === "OutForDelivery" ? { bg: "#dbeafe", color: "#1d4ed8", label: "Out for Delivery" } :
                                   { bg: "#fef9c3", color: "#854d0e", label: "Open" };

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Total Runs"        value={String(totalRuns)} />
              <KpiCard label="Completed"         value={String(completedRuns)}  color="#166534" bg="#dcfce7" />
              <KpiCard label="In Progress"       value={String(inProgressRuns)} color="#1d4ed8" bg="#dbeafe" />
              <KpiCard label="Clients Delivered" value={String(deliveredAllocs.length)} color="#7c3aed" bg="#ede9fe" />
              <KpiCard label="Items Delivered"   value={totalItemsDelivered.toLocaleString()} color="#0369a1" bg="#e0f2fe" />
            </div>

            {filtered.length === 0 ? (
              <p style={s.muted}>No delivery runs in this period.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filtered.map(run => {
                  const rs = runStatus(run.status);
                  const runItems = run.allocations.filter(a => a.deliveryStatus === "Delivered")
                    .flatMap(a => a.lines).reduce((sum, l) => sum + l.deliveredQty, 0);
                  return (
                    <div key={run.deliveryRunId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                      {/* Run header */}
                      <div style={{ background: "#f8fafc", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0" }}>
                        <span style={{ ...s.badge, background: rs.bg, color: rs.color }}>{rs.label}</span>
                        <strong style={{ fontSize: 14, color: "#0f172a" }}>🚚 {run.assignedDriverName || run.assignedDriverId}</strong>
                        <span style={{ fontSize: 13, color: "#64748b" }}>{fmtDT(run.createdAt)}</span>
                        {run.notes && <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>{run.notes}</span>}
                        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
                          {run.allocations.length} client{run.allocations.length !== 1 ? "s" : ""} · {runItems} delivered
                        </span>
                      </div>

                      {/* Allocations */}
                      {run.allocations.length > 0 && (
                        <div style={s.tableWrap}>
                          <table style={{ ...s.table, fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th style={s.th}>Client</th>
                                <th style={s.th}>Status</th>
                                <th style={s.th}>Items</th>
                                <th style={s.th}>Payment</th>
                                <th style={s.th}>Invoice</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.allocations.map((alloc, ai) => {
                                const as_ = allocStatus(alloc.deliveryStatus);
                                return (
                                  <tr key={alloc.deliveryOrderId} style={{ background: ai % 2 === 0 ? "#fff" : "#f9fafb" }}>
                                    <td style={{ ...s.td, fontWeight: 600 }}>{alloc.clientName}</td>
                                    <td style={s.td}>
                                      <span style={{ ...s.badge, background: as_.bg, color: as_.color }}>{as_.label}</span>
                                    </td>
                                    <td style={s.td}>
                                      {alloc.lines.map(l => (
                                        <div key={l.speciesId} style={{ lineHeight: 1.8 }}>
                                          <span style={{ fontWeight: 600 }}>{l.speciesName}</span>
                                          {": "}
                                          {alloc.deliveryStatus === "Delivered" ? (
                                            <>
                                              <span style={{ color: "#15803d", fontWeight: 700 }}>{l.deliveredQty} delivered</span>
                                              {l.deliveredQty !== l.qty && (
                                                <span style={{ color: "#94a3b8", fontSize: 11 }}> of {l.qty} ordered</span>
                                              )}
                                            </>
                                          ) : (
                                            <span>{l.qty} ordered</span>
                                          )}
                                          {l.unitPrice > 0 && <span style={{ color: "#64748b" }}> @ R{l.unitPrice.toFixed(2)}</span>}
                                        </div>
                                      ))}
                                    </td>
                                    <td style={s.td}>
                                      {alloc.paymentType
                                        ? <span style={{ ...salesBadge, ...(alloc.paymentType === "Cash" ? badgeCash : alloc.paymentType === "EFT" ? badgeEFT : alloc.paymentType === "Credit" ? badgeCredit : badgeOther) }}>
                                            {alloc.paymentType}
                                          </span>
                                        : <span style={{ color: "#94a3b8" }}>—</span>}
                                    </td>
                                    <td style={{ ...s.td, ...s.mono, color: "#64748b" }}>
                                      {alloc.invoiceId ? alloc.invoiceId.slice(0, 12) + "…" : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function InvoicesTab({
  invoices, clients, species, payFilter, setPayFilter, customer, setCustomer,
  from, setFrom, to, setTo, loading, onApply, fmt, onConfirmed,
}: {
  invoices: InvoiceItem[] | null;
  clients: ClientDto[];
  species: SpeciesResponse[];
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
  const isOwner = hasAnyRole("Owner");
  const canOverrideNegativeBalance = hasAnyRole("Owner", "Finance");
  const [staffMembers, setStaffMembers] = useState<StaffMemberDto[]>([]);
  useEffect(() => { staffMembersApi.list().then(setStaffMembers).catch(() => {}); }, []);
  const staffMap = Object.fromEntries(staffMembers.map(s => [s.staffMemberId, s.name]));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [creditBlockMsg, setCreditBlockMsg] = useState<string | null>(null);
  const [overridePrompt, setOverridePrompt] = useState<{ invoiceId: string; customerId: string; balance: number; clientName: string } | null>(null);
  const [payTypeFilter, setPayTypeFilter] = useState("");
  const [saleTypeFilter, setSaleTypeFilter] = useState("");
  const [creditBalances, setCreditBalances] = useState<Record<string, number>>({}); // customerId → balance
  const [creditBalanceLoading, setCreditBalanceLoading] = useState<Record<string, boolean>>({});
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [waModal, setWaModal] = useState<{ invoiceId: string; invoiceNumber: string; customerId: string } | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ success: boolean; message: string } | null>(null);

  // Edit prices modal state
  const [editModal, setEditModal] = useState<InvoiceItem | null>(null);
  const [editPrices, setEditPrices] = useState<{ speciesId: string; speciesLabel: string; qty: number; vatRate: number; unitPriceIncl: number }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editResult, setEditResult] = useState<{ success: boolean; message: string } | null>(null);

  function openEditModal(inv: InvoiceItem) {
    setEditModal(inv);
    setEditResult(null);
    setEditPrices(inv.lines.map(l => ({
      speciesId: l.speciesId,
      speciesLabel: species.find(s => s.speciesId === l.speciesId)?.name ?? l.speciesId,
      qty: l.quantity,
      vatRate: l.vatRate,
      // Convert stored ex-VAT price to incl-VAT for display
      unitPriceIncl: parseFloat((l.unitPrice * (1 + l.vatRate)).toFixed(4)),
    })));
  }

  async function saveEditPrices() {
    if (!editModal) return;
    setEditSaving(true);
    setEditResult(null);
    try {
      const result = await invoicesApi.updateLines(
        editModal.invoiceId,
        editPrices.map(p => ({ speciesId: p.speciesId, unitPriceIncl: p.unitPriceIncl }))
      );
      setEditResult({
        success: true,
        message: result.whatsAppSent
          ? "✅ Invoice updated and resent via WhatsApp."
          : `✅ Invoice updated.${result.whatsAppError ? ` (WhatsApp: ${result.whatsAppError})` : " No phone on file — WhatsApp not sent."}`,
      });
      onConfirmed(); // refresh the list
    } catch (e: any) {
      setEditResult({ success: false, message: e.message ?? "Failed to update invoice." });
    } finally {
      setEditSaving(false);
    }
  }

  const clientMap = Object.fromEntries(clients.map((c) => [c.clientId, c.clientName]));
  const clientPhoneMap = Object.fromEntries(clients.map((c) => [c.clientId, c.clientPhone || c.clientContactDetails || ""]));
  const clientFullMap = Object.fromEntries(clients.map((c) => [c.clientId, c]));

  async function handleConfirm(invoiceId: string, customerId: string, paymentType: string) {
    // For Credit/AccountCredit invoices, block if the client's balance is negative
    if (paymentType === "AccountCredit" || paymentType === "Credit" || paymentType === "OnAccount") {
      setConfirming(invoiceId);
      try {
        const { balance } = await clientCreditApi.getBalance(customerId);
        setCreditBalances(b => ({ ...b, [customerId]: balance }));
        if (balance < 0) {
          const clientName = clientMap[customerId] ?? "this client";
          if (canOverrideNegativeBalance) {
            setOverridePrompt({ invoiceId, customerId, balance, clientName });
          } else {
            const fmt2 = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            setCreditBlockMsg(
              `Cannot confirm — ${clientName}'s credit account is ${fmt2(balance)}. They must top up their account before this invoice can be confirmed.`
            );
          }
          return;
        }
      } catch {
        setCreditBlockMsg("Could not verify credit balance. Please try again.");
        return;
      } finally {
        setConfirming(null);
      }
    }
    setConfirming(invoiceId);
    try {
      await invoicesApi.confirmPayment(invoiceId);
      onConfirmed();
    } finally {
      setConfirming(null);
    }
  }

  async function cancelInvoice(inv: InvoiceItem) {
    const reason = window.prompt(
      `Cancel invoice ${inv.invoiceNumber}?\n\nThis restores stock and reverses any credit charge.\nEnter a reason (e.g. "Wrong sale", "Duplicate"):`
    );
    if (!reason || !reason.trim()) return;
    setCancelBusy(inv.invoiceId);
    try {
      await invoicesApi.cancel(inv.invoiceId, { reason: reason.trim() });
      onConfirmed();
    } catch (e: any) {
      setCreditBlockMsg(e?.message ?? "Failed to cancel invoice.");
    } finally {
      setCancelBusy(null);
    }
  }

  async function confirmOverride() {
    if (!overridePrompt) return;
    const { invoiceId } = overridePrompt;
    setConfirming(invoiceId);
    try {
      await invoicesApi.confirmPayment(invoiceId);
      setOverridePrompt(null);
      onConfirmed();
    } catch {
      setCreditBlockMsg("Failed to confirm invoice. Please try again.");
      setOverridePrompt(null);
    } finally {
      setConfirming(null);
    }
  }

  // Fetch and cache credit balance for a given customer (called when row is rendered)
  async function fetchCreditBalance(customerId: string) {
    if (customerId in creditBalances || creditBalanceLoading[customerId]) return;
    setCreditBalanceLoading(l => ({ ...l, [customerId]: true }));
    try {
      const { balance } = await clientCreditApi.getBalance(customerId);
      setCreditBalances(b => ({ ...b, [customerId]: balance }));
    } catch { /* ignore */ } finally {
      setCreditBalanceLoading(l => ({ ...l, [customerId]: false }));
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

  const totalPending    = invoices?.filter((i) => i.paymentStatus === "Pending").reduce((s, i) => s + i.grandTotal, 0) ?? 0;
  const totalPaid       = invoices?.filter((i) => i.paymentStatus === "Paid").reduce((s, i) => s + i.grandTotal, 0) ?? 0;
  const visibleInvoices = invoices?.filter((i) =>
    (!payFilter      || i.paymentStatus === payFilter) &&
    (!payTypeFilter  || i.paymentType   === payTypeFilter) &&
    (!saleTypeFilter || i.saleType      === saleTypeFilter)
  ) ?? [];

  const SALE_TYPE_LABELS: Record<string, string> = {
    HubDirect:    "Hub Sale",
    DriverDirect: "Driver Sale",
    Delivery:     "Delivery",
  };
  const saleTypeLabel = (t: string) => SALE_TYPE_LABELS[t] ?? t;
  const saleTypeChannels = ["HubDirect", "DriverDirect", "Delivery"];
  const channelTotals = saleTypeChannels.map(ch => ({
    key: ch,
    label: SALE_TYPE_LABELS[ch],
    count: invoices?.filter(i => i.saleType === ch).length ?? 0,
    total: invoices?.filter(i => i.saleType === ch).reduce((s, i) => s + i.grandTotal, 0) ?? 0,
  }));

  return (
    <div>
      {/* Negative-balance override modal (Owner/Finance only) */}
      {overridePrompt && (
        <div
          onClick={() => !confirming && setOverridePrompt(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: "32px 28px", maxWidth: 460, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", textAlign: "center" }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Confirm With Negative Balance?</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 24 }}>
              <strong>{overridePrompt.clientName}</strong>'s credit account is{" "}
              <strong style={{ color: "#dc2626" }}>
                R {overridePrompt.balance.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{" "}
              — already overdrawn. Confirming this invoice will charge it to their account anyway, pushing the balance further negative.
              This override is only available to Owner/Finance.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setOverridePrompt(null)}
                disabled={!!confirming}
                style={{ padding: "10px 22px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmOverride}
                disabled={!!confirming}
                style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {confirming ? "Confirming…" : "⚠ Confirm Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit block modal */}
      {creditBlockMsg && (
        <div
          onClick={() => setCreditBlockMsg(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: "32px 28px", maxWidth: 440, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", textAlign: "center" }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", marginBottom: 10 }}>Insufficient Credit</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 24 }}>{creditBlockMsg}</div>
            <button
              onClick={() => setCreditBlockMsg(null)}
              style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              OK
            </button>
          </div>
        </div>
      )}

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

        <label style={s.label}>Sale Source</label>
        <select
          value={saleTypeFilter}
          onChange={e => setSaleTypeFilter(e.target.value)}
          style={{ ...s.dateInput, minWidth: 150 }}
        >
          <option value="">All Sources</option>
          <option value="HubDirect">Hub Sale</option>
          <option value="DriverDirect">Driver Sale</option>
          <option value="Delivery">Delivery</option>
        </select>

        <label style={s.label}>Payment Type</label>
        <select
          value={payTypeFilter}
          onChange={e => setPayTypeFilter(e.target.value)}
          style={{ ...s.dateInput, minWidth: 150 }}
        >
          <option value="">All Types</option>
          <option value="Cash">Cash</option>
          <option value="EFT">EFT</option>
          <option value="Card">Card</option>
          <option value="CardMachine">Card Machine</option>
          <option value="AccountCredit">Account Credit</option>
          <option value="Credit">Credit</option>
          <option value="OnAccount">On Account</option>
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
            onClick={() => setPayFilter(v)}
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
          {/* Sales channel breakdown */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 20 }}>
            {channelTotals.map(ch => (
              <button key={ch.key} onClick={() => setSaleTypeFilter(saleTypeFilter === ch.key ? "" : ch.key)}
                style={{ flex: "1 1 160px", borderRadius: 10, padding: "12px 16px", border: `2px solid ${saleTypeFilter === ch.key ? "#2563eb" : "#e2e8f0"}`,
                  background: saleTypeFilter === ch.key ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left" as const }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>
                  {ch.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: saleTypeFilter === ch.key ? "#2563eb" : "#0f172a" }}>{fmt(ch.total)}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{ch.count} invoice{ch.count !== 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>

          <ScrollTable>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Source</Th>
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
                {isOwner && <Th>Edit Prices</Th>}
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((inv) => {
                const payColor = inv.paymentStatus === "Paid" ? "#166534" : "#854d0e";
                const payBg    = inv.paymentStatus === "Paid" ? "#dcfce7" : "#fef9c3";
                const hasReceipt = !!inv.receiptS3Key;
                const isAccountCredit = inv.paymentType === "AccountCredit" || inv.paymentType === "Credit" || inv.paymentType === "OnAccount";
                // Trigger lazy credit balance fetch for AccountCredit pending invoices
                if (isAccountCredit && inv.paymentStatus === "Pending") fetchCreditBalance(inv.customerId);
                const creditBal = isAccountCredit ? creditBalances[inv.customerId] : undefined;
                const creditNegative = creditBal !== undefined && creditBal < 0;
                return (
                  <tr key={inv.invoiceId}>
                    <Td><span style={s.mono}>{inv.invoiceNumber || inv.invoiceId.slice(0, 8) + "…"}</span></Td>
                    <Td>
                      {inv.staffMemberId
                        ? <>{staffMap[inv.staffMemberId] ?? inv.staffMemberId}<span style={{ ...s.badge, background: "#ede9fe", color: "#6d28d9", marginLeft: 6, fontSize: 10 }}>Staff</span></>
                        : (clientMap[inv.customerId] ?? inv.customerId)}
                    </Td>
                    <Td>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                        background: inv.saleType === "HubDirect" ? "#eff6ff" : inv.saleType === "DriverDirect" ? "#f0fdf4" : "#fef9c3",
                        color:      inv.saleType === "HubDirect" ? "#1d4ed8" : inv.saleType === "DriverDirect" ? "#15803d"  : "#92400e",
                      }}>
                        {saleTypeLabel(inv.saleType || "Delivery")}
                      </span>
                    </Td>
                    <Td style={{ color: "#64748b", fontSize: 13 }}>{inv.createdByDriverId || "—"}</Td>
                    <Td>
                      <div>{inv.paymentType || "—"}</div>
                      {inv.paymentType === "Split" && inv.splitPayments?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {inv.splitPayments.map((sp, i) => (
                            <div key={i} style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 600, color: "#1e40af" }}>{sp.method}</span>
                              {" — "}
                              <span>{fmt(sp.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isAccountCredit && inv.paymentStatus === "Pending" && (
                        <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600,
                          color: creditBal === undefined ? "#94a3b8" : creditNegative ? "#dc2626" : "#166534" }}>
                          {creditBal === undefined
                            ? "Loading…"
                            : creditNegative
                              ? `⚠ Balance: ${fmt(creditBal)}`
                              : `✓ Balance: ${fmt(creditBal)}`}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span style={{ ...s.badge, background: payBg, color: payColor }}>
                        {inv.paymentStatus}
                      </span>
                      {inv.status === "Cancelled" && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b", fontSize: 10 }}>✕ Cancelled</span>
                          {inv.cancelledReason && <div style={{ fontSize: 11, color: "#991b1b", marginTop: 2 }}>{inv.cancelledReason}</div>}
                        </div>
                      )}
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
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, alignItems: "flex-start" }}>
                        {inv.paymentStatus === "Pending" && (() => {
                          const hardBlocked = isAccountCredit && creditNegative && !canOverrideNegativeBalance;
                          return (
                            <button
                              disabled={confirming === inv.invoiceId || (isAccountCredit && creditBal === undefined) || hardBlocked}
                              onClick={() => handleConfirm(inv.invoiceId, inv.customerId, inv.paymentType)}
                              style={{
                                ...s.confirmBtn,
                                ...(hardBlocked ? { background: "#94a3b8", cursor: "not-allowed" }
                                  : isAccountCredit && creditNegative ? { background: "#f59e0b" } : {}),
                              }}
                              title={
                                hardBlocked ? "Credit balance is negative — client must top up first"
                                  : isAccountCredit && creditNegative ? "Balance is negative — click to confirm with an override"
                                  : undefined
                              }
                            >
                              {confirming === inv.invoiceId ? "…" : isAccountCredit && creditNegative ? "⚠ Confirm" : "Confirm"}
                            </button>
                          );
                        })()}
                        {inv.status !== "Cancelled" && (
                          inv.amountPaid > 0 ? (
                            <span style={{ fontSize: 10, color: "#94a3b8" }} title="Bank-reconciled — remove the allocation on the Reconciliation page first">
                              Bank-reconciled
                            </span>
                          ) : (
                            <button
                              disabled={cancelBusy === inv.invoiceId}
                              onClick={() => cancelInvoice(inv)}
                              style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                              title="Cancel this invoice — restores stock and reverses any credit charge"
                            >
                              {cancelBusy === inv.invoiceId ? "…" : "Cancel"}
                            </button>
                          )
                        )}
                        {inv.paymentStatus !== "Pending" && inv.status === "Cancelled" && "—"}
                      </div>
                    </Td>
                    <Td>
                      <button
                        onClick={() => {
                          setWaModal({ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber, customerId: inv.customerId });
                          setWaPhone(clientPhoneMap[inv.customerId] ?? "");
                          setWaResult(null);
                        }}
                        style={s.waBtn}
                      >
                        📱 WhatsApp
                      </button>
                    </Td>
                    {isOwner && (
                      <Td>
                        <button onClick={() => openEditModal(inv)} style={s.editPriceBtn}>
                          ✏️ Edit Prices
                        </button>
                      </Td>
                    )}
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

      {/* Edit Prices modal */}
      {editModal && (
        <div style={s.modalOverlay} onClick={() => !editSaving && setEditModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong style={{ fontSize: 16 }}>✏️ Edit Invoice Prices</strong>
              <button onClick={() => setEditModal(null)} style={s.modalClose} disabled={editSaving}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              {editModal.invoiceNumber || editModal.invoiceId.slice(0, 8) + "…"} · {clientFullMap[editModal.customerId]?.clientName ?? "Unknown"}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 6, padding: "6px 10px", marginBottom: 14 }}>
              ✓ Enter prices inclusive of VAT — the updated invoice PDF will be sent to the client's WhatsApp immediately.
            </div>

            {editPrices.map((p, i) => (
              <div key={p.speciesId} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{p.speciesLabel}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Qty: {p.qty} · VAT: {(p.vatRate * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2 }}>
                    <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Unit Price (incl. VAT)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "#374151" }}>R</span>
                      <NumericInput
                        min={0}
                        step={0.01}
                        value={p.unitPriceIncl}
                        onChange={e => setEditPrices(ps => ps.map((x, j) => j === i ? { ...x, unitPriceIncl: parseFloat(e.target.value) || 0 } : x))}
                        onFocus={e => e.target.select()}
                        disabled={editSaving}
                        style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, textAlign: "right" as const }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Line total: R {(p.unitPriceIncl * p.qty).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Updated totals preview */}
            <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "10px 14px", marginTop: 4, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", marginBottom: 4 }}>
                <span>Grand Total (incl. VAT)</span>
                <strong style={{ color: "#0f172a" }}>
                  R {editPrices.reduce((s, p) => s + p.unitPriceIncl * p.qty, 0).toFixed(2)}
                </strong>
              </div>
            </div>

            {editResult && (
              <p style={{ fontSize: 13, fontWeight: 600, color: editResult.success ? "#166534" : "#dc2626", marginBottom: 10 }}>
                {editResult.message}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditModal(null)} disabled={editSaving}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                {editResult?.success ? "Close" : "Cancel"}
              </button>
              {!editResult?.success && (
                <button onClick={saveEditPrices} disabled={editSaving}
                  style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, opacity: editSaving ? 0.6 : 1 }}>
                  {editSaving ? "Saving…" : "💾 Save & Resend"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp send modal */}
      {waModal && (
        <div style={s.modalOverlay} onClick={() => { setWaModal(null); setWaResult(null); }}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 15 }}>📱 Send Invoice via WhatsApp</strong>
              <button onClick={() => { setWaModal(null); setWaResult(null); }} style={s.modalClose}>✕</button>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
              <div><span style={{ color: "#94a3b8" }}>Invoice:</span> <span style={{ fontFamily: "monospace" }}>{waModal.invoiceNumber || waModal.invoiceId.slice(0, 8) + "…"}</span></div>
              <div><span style={{ color: "#94a3b8" }}>Client:</span> <strong>{clientFullMap[waModal.customerId]?.clientName ?? "—"}</strong></div>
              {clientFullMap[waModal.customerId]?.clientCity && (
                <div><span style={{ color: "#94a3b8" }}>City:</span> {clientFullMap[waModal.customerId].clientCity}</div>
              )}
            </div>
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
              <Td><span style={s.mono}>{i.invoiceNumber || i.invoiceId.slice(0, 8) + "…"}</span></Td>
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

// ── Client Orders Tab ────────────────────────────────────────────────────────

const STATUS_LABELS_CO: Record<string, string> = {
  Open: "Open", OutForDelivery: "Out for Delivery", Delivered: "Delivered",
  MarkedAtHub: "Marked at Hub", AwaitingCollection: "Awaiting Collection",
};
const STATUS_COLORS_CO: Record<string, CSSProperties> = {
  Open:               { background: "#fef9c3", color: "#713f12", border: "1px solid #fcd34d" },
  OutForDelivery:     { background: "#dbeafe", color: "#1e3a8a", border: "1px solid #93c5fd" },
  Delivered:          { background: "#dcfce7", color: "#14532d", border: "1px solid #86efac" },
  MarkedAtHub:        { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  AwaitingCollection: { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" },
};

function ClientOrdersTab({ clients, species, fmt }: {
  clients: ClientDto[];
  species: SpeciesResponse[];
  fmt: (n: number) => string;
}) {
  const [clientId, setClientId]       = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [orders, setOrders]           = useState<DeliveryOrderResponse[]>([]);
  const [invoiceMap, setInvoiceMap]       = useState<Record<string, string>>({}); // deliveryOrderId → invoiceNumber
  const [invoiceIdMap, setInvoiceIdMap]   = useState<Record<string, string>>({}); // deliveryOrderId → invoiceId
  const [invNumById, setInvNumById]       = useState<Record<string, string>>({}); // invoiceId → invoiceNumber (fallback for legacy)
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  useEffect(() => {
    setOrdersLoading(true);
    Promise.all([
      deliveryOrdersApi.list(),
      reportsApi.getInvoices({}),
    ])
      .then(([ordersData, invoicesData]: [DeliveryOrderResponse[], InvoiceItem[]]) => {
        setOrders(ordersData);
        const map: Record<string, string> = {};
        const idMap: Record<string, string> = {};
        const byId: Record<string, string> = {};
        for (const inv of invoicesData) {
          // Primary key: deliveryOrderId (set on all invoices going forward)
          if (inv.deliveryOrderId) {
            map[inv.deliveryOrderId]  = inv.invoiceNumber;
            idMap[inv.deliveryOrderId] = inv.invoiceId;
          }
          // Fallback key: invoiceId (for legacy orders where deliveryOrderId wasn't back-linked)
          if (inv.invoiceId) byId[inv.invoiceId] = inv.invoiceNumber;
        }
        setInvoiceMap(map);
        setInvoiceIdMap(idMap);
        setInvNumById(byId);
      })
      .catch(() => setOrdersError("Failed to load delivery orders."))
      .finally(() => setOrdersLoading(false));
  }, []);

  const visible = orders
    .filter(o => !clientId || o.customerId === clientId)
    .filter(o => statusFilter === "All" || o.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const spName  = (id: string) => species.find(sp => sp.speciesId === id)?.name ?? id.slice(0, 10) + "…";
  const clName  = (id: string) => clients.find(c => c.clientId === id)?.clientName ?? "Unknown";
  const clPhone = (id: string) => clients.find(c => c.clientId === id)?.clientPhone ?? "";

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCsv() {
    const rows: string[][] = [
      ["Invoice #", "Client", "Address", "City", "Date", "Driver", "Status", "Species", "Ordered", "Delivered", "Dead", "Mutilated", "Not Wanted"],
    ];
    for (const o of visible) {
      const invNum = invoiceMap[o.deliveryOrderId] ?? (o.invoiceId ? invNumById[o.invoiceId] : "") ?? "";
      const client = clName(o.customerId);
      const addr   = o.deliveryAddressLine1 ?? "";
      const city   = o.city ?? "";
      const date   = new Date(o.createdAt).toLocaleDateString("en-ZA");
      const driver = o.assignedDriverName ?? "";
      const status = STATUS_LABELS_CO[o.status] ?? o.status;
      for (const l of o.lines) {
        rows.push([invNum, client, addr, city, date, driver, status, spName(l.speciesId),
          String(l.quantity), String(l.deliveredQty || 0),
          String(l.returnedDeadQty || 0), String(l.returnedMutilatedQty || 0), String(l.returnedNotWantedQty || 0)]);
      }
      if (o.lines.length === 0) {
        rows.push([invNum, client, addr, city, date, driver, status, "", "0", "0", "0", "0", "0"]);
      }
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `client-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Print ────────────────────────────────────────────────────────────────
  function printOrders() {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const rows = visible.map(o => {
      const invNum = invoiceMap[o.deliveryOrderId] ?? (o.invoiceId ? invNumById[o.invoiceId] : "") ?? "";
      const hasRet = o.status === "Delivered" || o.status === "MarkedAtHub";
      const linesHtml = o.lines.map(l => `
        <tr>
          <td>${spName(l.speciesId)}</td>
          <td style="text-align:right">${l.quantity}</td>
          ${hasRet ? `<td style="text-align:right;color:#166534">${l.deliveredQty || 0}</td>
            <td style="text-align:right;color:#dc2626">${l.returnedDeadQty || 0}</td>
            <td style="text-align:right;color:#d97706">${l.returnedMutilatedQty || 0}</td>
            <td style="text-align:right;color:#0891b2">${l.returnedNotWantedQty || 0}</td>` : ""}
        </tr>`).join("");
      return `<div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #15803d;padding-bottom:4px;margin-bottom:8px">
          <strong style="font-size:14px">${clName(o.customerId)}</strong>
          ${invNum ? `<span style="font-family:monospace;color:#15803d;font-weight:700">${invNum}</span>` : ""}
          <span style="font-size:12px;color:#64748b">${new Date(o.createdAt).toLocaleDateString("en-ZA")} · ${STATUS_LABELS_CO[o.status] ?? o.status}</span>
        </div>
        <div style="font-size:12px;color:#475569;margin-bottom:6px">${o.deliveryAddressLine1 ?? ""}${o.city ? `, ${o.city}` : ""}${o.assignedDriverName ? ` · 🚛 ${o.assignedDriverName}` : ""}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f8fafc">
            <th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0">Species</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #e2e8f0">Ordered</th>
            ${hasRet ? `<th style="text-align:right;padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#166534">Delivered</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#dc2626">Dead</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#d97706">Mutilated</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #e2e8f0;color:#0891b2">Not Wanted</th>` : ""}
          </tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </div>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Client Orders</title>
      <style>body{font-family:sans-serif;padding:24px;color:#1e293b} @media print{button{display:none}}</style>
      </head><body>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px">
        <h2 style="margin:0">Client Orders</h2>
        <button onclick="window.print()" style="padding:8px 16px;background:#15803d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Print</button>
      </div>
      ${rows}
      </body></html>`);
    win.document.close();
  }

  // ── Print single order ───────────────────────────────────────────────────
  function printSingleOrder(o: DeliveryOrderResponse, invNum?: string) {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const hasRet = o.status === "Delivered" || o.status === "MarkedAtHub";
    const linesHtml = o.lines.map(l => {
      const vatRate = species.find(sp => sp.speciesId === l.speciesId)?.vat ?? 0.15;
      return `<tr>
        <td style="padding:6px 10px 6px 0">${spName(l.speciesId)}</td>
        <td style="text-align:right;padding:6px 10px">${l.quantity}</td>
        ${hasRet ? `<td style="text-align:right;padding:6px 10px;color:#166534;font-weight:700">${l.deliveredQty || 0}</td>
          <td style="text-align:right;padding:6px 10px;color:${(l.returnedDeadQty||0)>0?"#dc2626":"#cbd5e1"}">${l.returnedDeadQty || 0}</td>
          <td style="text-align:right;padding:6px 10px;color:${(l.returnedMutilatedQty||0)>0?"#d97706":"#cbd5e1"}">${l.returnedMutilatedQty || 0}</td>
          <td style="text-align:right;padding:6px 10px;color:${(l.returnedNotWantedQty||0)>0?"#0891b2":"#cbd5e1"}">${l.returnedNotWantedQty || 0}</td>
          <td style="text-align:right;padding:6px 0 6px 10px">${fmt(l.unitPrice * (1 + vatRate))}</td>` : ""}
      </tr>`;
    }).join("");
    const totOrd  = o.lines.reduce((t, l) => t + l.quantity, 0);
    const totDel  = o.lines.reduce((t, l) => t + (l.deliveredQty || 0), 0);
    const totDead = o.lines.reduce((t, l) => t + (l.returnedDeadQty || 0), 0);
    const totMut  = o.lines.reduce((t, l) => t + (l.returnedMutilatedQty || 0), 0);
    const totNW   = o.lines.reduce((t, l) => t + (l.returnedNotWantedQty || 0), 0);
    const totalsRow = hasRet && o.lines.length > 1 ? `
      <tfoot><tr style="border-top:2px solid #e2e8f0;font-weight:800">
        <td style="padding:8px 10px 4px 0">Total</td>
        <td style="text-align:right;padding:8px 10px 4px">${totOrd}</td>
        <td style="text-align:right;padding:8px 10px 4px;color:#166534">${totDel}</td>
        <td style="text-align:right;padding:8px 10px 4px;color:${totDead>0?"#dc2626":"#cbd5e1"}">${totDead}</td>
        <td style="text-align:right;padding:8px 10px 4px;color:${totMut>0?"#d97706":"#cbd5e1"}">${totMut}</td>
        <td style="text-align:right;padding:8px 10px 4px;color:${totNW>0?"#0891b2":"#cbd5e1"}">${totNW}</td>
        <td></td>
      </tr></tfoot>` : "";
    const date = new Date(o.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
    win.document.write(`<!DOCTYPE html><html><head><title>${invNum ?? "Order"} — ${clName(o.customerId)}</title>
      <style>
        body{font-family:sans-serif;padding:32px;color:#1e293b;font-size:14px}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;padding:6px 10px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;color:#64748b}
        th.r{text-align:right}
        td{border-bottom:1px solid #f1f5f9}
        @media print{button{display:none}}
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <h2 style="margin:0 0 4px">${clName(o.customerId)}</h2>
          <div style="color:#64748b;font-size:13px">${o.deliveryAddressLine1 ?? ""}${o.city ? `, ${o.city}` : ""}${o.province ? `, ${o.province}` : ""}</div>
          ${o.assignedDriverName ? `<div style="color:#64748b;font-size:13px;margin-top:2px">Driver: ${o.assignedDriverName}</div>` : ""}
        </div>
        <div style="text-align:right">
          ${invNum ? `<div style="font-family:monospace;font-size:16px;font-weight:700;color:#15803d">${invNum}</div>` : ""}
          <div style="font-size:13px;color:#64748b">${date}</div>
          <div style="font-size:13px;font-weight:600;margin-top:4px">${STATUS_LABELS_CO[o.status] ?? o.status}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Species</th><th class="r">Ordered</th>
          ${hasRet ? `<th class="r" style="color:#166534">Delivered</th>
            <th class="r" style="color:#dc2626">Dead</th>
            <th class="r" style="color:#d97706">Mutilated</th>
            <th class="r" style="color:#0891b2">Not Wanted</th>
            <th class="r">Unit Price</th>` : ""}
        </tr></thead>
        <tbody>${linesHtml}</tbody>
        ${totalsRow}
      </table>
      <div style="margin-top:24px">
        <button onclick="window.print()" style="padding:8px 20px;background:#15803d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Print</button>
      </div>
      </body></html>`);
    win.document.close();
  }

  // ── WhatsApp send ────────────────────────────────────────────────────────
  const [waSending, setWaSending] = useState<string | null>(null); // invoiceId being sent
  const [waResult,  setWaResult]  = useState<Record<string, string>>({}); // invoiceId → message

  function sendWhatsApp(invoiceId: string, clientId: string) {
    const phone = clPhone(clientId);
    if (!phone) { setWaResult(r => ({ ...r, [invoiceId]: "No phone on record." })); return; }
    setWaSending(invoiceId);
    whatsappApi.sendInvoice(invoiceId, phone)
      .then(res => setWaResult(r => ({ ...r, [invoiceId]: res.success ? "✅ Sent" : `❌ ${res.message}` })))
      .catch(() => setWaResult(r => ({ ...r, [invoiceId]: "❌ Failed to send" })))
      .finally(() => setWaSending(null));
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 20, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Client</div>
          <select style={{ ...s.select, minWidth: 240 }} value={clientId}
            onChange={e => { setClientId(e.target.value); setExpandedId(null); }}>
            <option value="">— All Clients —</option>
            {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.clientName}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Status</div>
          <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="OutForDelivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="MarkedAtHub">Marked at Hub</option>
          </select>
        </div>
        {!ordersLoading && (
          <div style={{ display: "flex", gap: 8, alignSelf: "flex-end", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#64748b", paddingBottom: 4 }}>
              {visible.length} order{visible.length !== 1 ? "s" : ""}
            </span>
            <button onClick={exportCsv} disabled={visible.length === 0}
              style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151" }}>
              📥 Export CSV
            </button>
            <button onClick={printOrders} disabled={visible.length === 0}
              style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151" }}>
              🖨️ Print
            </button>
          </div>
        )}
      </div>

      {ordersLoading && <p style={s.muted}>Loading orders…</p>}
      {ordersError  && <p style={s.error}>{ordersError}</p>}

      {!ordersLoading && !ordersError && visible.length === 0 && (
        <p style={s.muted}>{clientId ? "No orders found for this client." : "Select a client or browse all orders."}</p>
      )}

      {visible.map(order => {
        const isExpanded   = expandedId === order.deliveryOrderId;
        const hasReturns   = order.status === "Delivered" || order.status === "MarkedAtHub";
        const totOrdered   = order.lines.reduce((t, l) => t + l.quantity, 0);
        const totDelivered = order.lines.reduce((t, l) => t + (l.deliveredQty   || 0), 0);
        const totDead      = order.lines.reduce((t, l) => t + (l.returnedDeadQty      || 0), 0);
        const totMut       = order.lines.reduce((t, l) => t + (l.returnedMutilatedQty || 0), 0);
        const totNW        = order.lines.reduce((t, l) => t + (l.returnedNotWantedQty || 0), 0);
        const badge        = STATUS_COLORS_CO[order.status] ?? {};
        const date         = new Date(order.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
        // Try deliveryOrderId map first (driver flow + new hub-direct), fall back to invoiceId on the order (legacy hub-direct)
        const invoiceNumber = invoiceMap[order.deliveryOrderId]
          ?? (order.invoiceId ? invNumById[order.invoiceId] : undefined);
        const linkedInvoiceId = invoiceIdMap[order.deliveryOrderId] ?? order.invoiceId ?? "";

        return (
          <div key={order.deliveryOrderId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            {/* Summary row — clickable to expand */}
            <button onClick={() => setExpandedId(isExpanded ? null : order.deliveryOrderId)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const, textAlign: "left" as const }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", flex: "1 1 180px" }}>
                {!clientId && <span style={{ color: "#2563eb" }}>{clName(order.customerId)} · </span>}
                {order.deliveryAddressLine1}{order.city ? `, ${order.city}` : ""}
              </span>
              {invoiceNumber ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace" }}>
                  {invoiceNumber}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#94a3b8", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace" }}>
                  #{order.deliveryOrderId.slice(-8).toUpperCase()}
                </span>
              )}
              <span style={{ fontSize: 12, color: "#64748b" }}>{date}</span>
              {order.assignedDriverName && (
                <span style={{ fontSize: 12, color: "#64748b" }}>🚛 {order.assignedDriverName}</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, ...badge }}>
                {STATUS_LABELS_CO[order.status] ?? order.status}
              </span>
              {hasReturns ? (
                <span style={{ fontSize: 12, color: "#374151" }}>
                  <strong style={{ color: "#166534" }}>{totDelivered}</strong>/{totOrdered} delivered
                  {totDead > 0 && <span style={{ color: "#dc2626" }}> · {totDead} dead</span>}
                  {totMut  > 0 && <span style={{ color: "#d97706" }}> · {totMut} mutilated</span>}
                  {totNW   > 0 && <span style={{ color: "#0891b2" }}> · {totNW} not wanted</span>}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "#64748b" }}>{totOrdered} ordered</span>
              )}
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>{isExpanded ? "▲ Hide" : "▼ Details"}</span>
            </button>

            {/* Expanded line breakdown */}
            {isExpanded && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 16px", overflowX: "auto" as const }}>
                <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Order Ref: <span style={{ fontFamily: "monospace", color: "#374151" }}>#{order.deliveryOrderId.slice(-8).toUpperCase()}</span>
                  </span>
                  {invoiceNumber && (
                    <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                      Invoice: <span style={{ fontFamily: "monospace" }}>{invoiceNumber}</span>
                    </span>
                  )}
                  {/* Per-order print */}
                  <button
                    onClick={() => printSingleOrder(order, invoiceNumber)}
                    style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151" }}>
                    🖨️ Print
                  </button>
                  {/* WhatsApp — only when linked invoice exists */}
                  {invoiceNumber && linkedInvoiceId && (
                    <>
                      <button
                        onClick={() => sendWhatsApp(linkedInvoiceId, order.customerId)}
                        disabled={waSending === linkedInvoiceId}
                        style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #16a34a", background: "#f0fdf4", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#15803d" }}>
                        {waSending === linkedInvoiceId ? "Sending…" : "📱 WhatsApp Invoice"}
                      </button>
                      {waResult[linkedInvoiceId] && (
                        <span style={{ fontSize: 12, color: waResult[linkedInvoiceId].startsWith("✅") ? "#15803d" : "#dc2626" }}>
                          {waResult[linkedInvoiceId]}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left"  as const, padding: "4px 10px 8px 0", fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Species</th>
                      <th style={{ textAlign: "right" as const, padding: "4px 10px 8px",   fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Ordered</th>
                      {hasReturns && <>
                        <th style={{ textAlign: "right" as const, padding: "4px 10px 8px", fontWeight: 700, fontSize: 11, color: "#166534",  textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Delivered</th>
                        <th style={{ textAlign: "right" as const, padding: "4px 10px 8px", fontWeight: 700, fontSize: 11, color: "#dc2626",  textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Dead</th>
                        <th style={{ textAlign: "right" as const, padding: "4px 10px 8px", fontWeight: 700, fontSize: 11, color: "#d97706",  textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Mutilated</th>
                        <th style={{ textAlign: "right" as const, padding: "4px 10px 8px", fontWeight: 700, fontSize: 11, color: "#0891b2",  textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Not Wanted</th>
                        <th style={{ textAlign: "right" as const, padding: "4px 0 8px 10px", fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Unit Price</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map(l => {
                      const vatRate = species.find(sp => sp.speciesId === l.speciesId)?.vat ?? 0.15;
                      return (
                        <tr key={l.speciesId} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "7px 10px 7px 0", fontWeight: 600, color: "#0f172a" }}>{spName(l.speciesId)}</td>
                          <td style={{ textAlign: "right" as const, padding: "7px 10px", color: "#374151" }}>{l.quantity}</td>
                          {hasReturns && <>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", fontWeight: 700, color: "#166534" }}>{l.deliveredQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.returnedDeadQty      > 0 ? "#dc2626" : "#cbd5e1" }}>{l.returnedDeadQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.returnedMutilatedQty > 0 ? "#d97706" : "#cbd5e1" }}>{l.returnedMutilatedQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.returnedNotWantedQty > 0 ? "#0891b2" : "#cbd5e1" }}>{l.returnedNotWantedQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 0 7px 10px", color: "#374151" }}>{fmt(l.unitPrice * (1 + vatRate))}</td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                  {hasReturns && order.lines.length > 1 && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #e2e8f0" }}>
                        <td style={{ padding: "8px 10px 4px 0", fontWeight: 800, color: "#0f172a" }}>Total</td>
                        <td style={{ textAlign: "right" as const, padding: "8px 10px 4px", fontWeight: 700 }}>{totOrdered}</td>
                        <td style={{ textAlign: "right" as const, padding: "8px 10px 4px", fontWeight: 700, color: "#166534" }}>{totDelivered}</td>
                        <td style={{ textAlign: "right" as const, padding: "8px 10px 4px", fontWeight: 700, color: totDead > 0 ? "#dc2626" : "#cbd5e1" }}>{totDead}</td>
                        <td style={{ textAlign: "right" as const, padding: "8px 10px 4px", fontWeight: 700, color: totMut  > 0 ? "#d97706" : "#cbd5e1" }}>{totMut}</td>
                        <td style={{ textAlign: "right" as const, padding: "8px 10px 4px", fontWeight: 700, color: totNW   > 0 ? "#0891b2" : "#cbd5e1" }}>{totNW}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Sales Tab ──────────────────────────────────────────────────────────────────

function SalesTab({
  rows, allClients, costRecords,
  salesFrom, salesTo, setSalesFrom, setSalesTo,
  salesClientId, setSalesClientId,
  salesView, setSalesView,
  loading, onApply, fmt,
}: {
  rows: SalesReportRow[];
  allClients: ClientDto[];
  costRecords: CostAverageRecordDto[];
  salesFrom: string; salesTo: string;
  setSalesFrom: (v: string) => void; setSalesTo: (v: string) => void;
  salesClientId: string; setSalesClientId: (v: string) => void;
  salesView: "client" | "walkin"; setSalesView: (v: "client" | "walkin") => void;
  loading: boolean; onApply: () => void;
  fmt: (n: number) => string;
}) {
  // Build cost lookup: speciesId → month → avgCostIncVat
  const costMap: Record<string, Record<string, number>> = {};
  for (const r of costRecords) {
    if (!costMap[r.speciesId]) costMap[r.speciesId] = {};
    costMap[r.speciesId][r.month] = r.avgCostIncVat;
  }
  function unitCost(speciesId: string, dateIso: string): number | null {
    const month = dateIso.slice(0, 7);
    return costMap[speciesId]?.[month] ?? null;
  }

  // Named clients and walk-in clients for the dropdown
  const namedClients = allClients.filter(c => !c.isWalkIn).sort((a, b) => a.clientName.localeCompare(b.clientName));
  const walkInClients = allClients.filter(c => c.isWalkIn);

  // Filter rows by view type and selected client
  const visible = rows
    .filter(r => salesView === "client" ? !r.isWalkIn : r.isWalkIn)
    .filter(r => !salesClientId || r.clientId === salesClientId);

  const totalSale = visible.reduce((s, r) => s + r.lineTotal, 0);
  const totalCost = visible.reduce((s, r) => {
    const c = unitCost(r.speciesId, r.date);
    return s + (c !== null ? c * r.qty : 0);
  }, 0);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  }

  const clientDropdown = salesView === "client" ? namedClients : walkInClients;

  return (
    <div>
      {/* Filter row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 16, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={s.label}>From</span>
          <input type="date" value={salesFrom} onChange={e => setSalesFrom(e.target.value)} style={s.dateInput} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={s.label}>To</span>
          <input type="date" value={salesTo} onChange={e => setSalesTo(e.target.value)} style={s.dateInput} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={s.label}>View</span>
          <select value={salesView} onChange={e => { setSalesView(e.target.value as "client" | "walkin"); setSalesClientId(""); }} style={s.dateInput}>
            <option value="client">By Client</option>
            <option value="walkin">By Walk-in</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={s.label}>Client</span>
          <select value={salesClientId} onChange={e => setSalesClientId(e.target.value)} style={{ ...s.dateInput, minWidth: 180 }}>
            <option value="">All</option>
            {clientDropdown.map(c => (
              <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
            ))}
          </select>
        </div>
        <button style={s.applyBtn} onClick={onApply} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
      </div>

      {/* KPI strip */}
      {!loading && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={salesKpi}><span style={s.kpiLabel}>Lines</span><strong>{visible.length}</strong></div>
          <div style={salesKpi}><span style={s.kpiLabel}>Total Sales</span><strong style={{ color: "#166534" }}>{fmt(totalSale)}</strong></div>
          {totalCost > 0 && <div style={salesKpi}><span style={s.kpiLabel}>Total Cost</span><strong style={{ color: "#b45309" }}>{fmt(totalCost)}</strong></div>}
          {totalCost > 0 && <div style={salesKpi}><span style={s.kpiLabel}>Gross Margin</span><strong style={{ color: totalSale - totalCost >= 0 ? "#166534" : "#dc2626" }}>{fmt(totalSale - totalCost)}</strong></div>}
        </div>
      )}

      {/* Table */}
      {!loading && visible.length === 0 && (
        <p style={s.muted}>No sales found for this selection.</p>
      )}
      {!loading && visible.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Client</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Product</th>
                <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
                <th style={s.th}>Payment</th>
                <th style={{ ...s.th, textAlign: "right" }}>Unit Sale</th>
                <th style={{ ...s.th, textAlign: "right" }}>Unit Cost</th>
                <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const uc = unitCost(r.speciesId, r.date);
                return (
                  <tr key={`${r.invoiceId}-${r.speciesId}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={s.td}>{r.clientName}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>{fmtDate(r.date)}</td>
                    <td style={s.td}>{r.speciesName}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{r.qty.toLocaleString()}</td>
                    <td style={s.td}>
                      <span style={{ ...salesBadge, ...(r.paymentType === "Cash" ? badgeCash : r.paymentType === "EFT" ? badgeEFT : r.paymentType === "Credit" ? badgeCredit : badgeOther) }}>
                        {r.paymentType || "—"}
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: "right" }}>{fmt(r.unitPrice)}</td>
                    <td style={{ ...s.td, textAlign: "right", color: uc !== null ? "#92400e" : "#9ca3af" }}>
                      {uc !== null ? fmt(uc) : "—"}
                    </td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(r.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                <td colSpan={7} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#166534" }}>{fmt(totalSale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const salesKpi: CSSProperties = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 2, minWidth: 120 };
const salesBadge: CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 };
const badgeCash:   CSSProperties = { background: "#dcfce7", color: "#166534" };
const badgeEFT:    CSSProperties = { background: "#dbeafe", color: "#1e40af" };
const badgeCredit: CSSProperties = { background: "#fef9c3", color: "#854d0e" };
const badgeOther:  CSSProperties = { background: "#f3f4f6", color: "#374151" };

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
  editPriceBtn: {
    padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(37,99,235,0.4)", cursor: "pointer",
    background: "rgba(37,99,235,0.06)", color: "#1d4ed8", fontSize: 13, fontWeight: 600,
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
