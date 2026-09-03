import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
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
import { stockLossApi } from "../api/stockLossApi";
import type { StockLossDto } from "../api/stockLossApi";
import { deliveryOrdersApi } from "../api/deliveryOrdersApi";
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
  ClientCreditStatementSummary,
} from "../api/reportsApi";
import { costAveragesApi } from "../api/costAveragesApi";
import type { CostAverageRecordDto } from "../api/costAveragesApi";
import type { ClientDto } from "../api/clientsApi";
import { NumericInput } from "../components/NumericInput";

// ── Searchable select ──────────────────────────────────────────────────────

type SelectOption = { value: string; label: string };

function SearchableSelect({
  value, onChange, options, placeholder = "All", style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  style?: CSSProperties;
}) {
  const [query, setQuery]     = useState("");
  const [open, setOpen]       = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const inputStyle: CSSProperties = {
    padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db",
    fontSize: 13, background: "#f9fafb", width: "100%", boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div
        style={{ display: "flex", alignItems: "center", border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb", overflow: "hidden", cursor: "text" }}
        onClick={() => { setOpen(true); setQuery(""); }}
      >
        <input
          style={{ ...inputStyle, border: "none", background: "transparent", flex: 1 }}
          value={open ? query : (selected ? selected.label : "")}
          placeholder={open ? "Type to search…" : placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(""); }}
        />
        {value && (
          <button
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "0 6px", fontSize: 14, lineHeight: 1 }}
            onMouseDown={e => { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }}
          >×</button>
        )}
        <span style={{ color: "#9ca3af", fontSize: 11, padding: "0 8px", pointerEvents: "none" }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)", maxHeight: 220, overflowY: "auto", marginTop: 2,
        }}>
          <div
            style={{ padding: "7px 12px", fontSize: 13, color: "#6b7280", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
            onMouseDown={() => { onChange(""); setQuery(""); setOpen(false); }}
          >{placeholder}</div>
          {filtered.length === 0
            ? <div style={{ padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>No results</div>
            : filtered.map(o => (
              <div
                key={o.value}
                style={{
                  padding: "7px 12px", fontSize: 13, cursor: "pointer",
                  background: o.value === value ? "#eff6ff" : undefined,
                  color: o.value === value ? "#2563eb" : "#111827",
                  fontWeight: o.value === value ? 600 : undefined,
                }}
                onMouseDown={() => { onChange(o.value); setQuery(""); setOpen(false); }}
              >{o.label}</div>
            ))}
        </div>
      )}
    </div>
  );
}

type Tab = "revenue" | "outstanding" | "drivers" | "returns" | "deliveries" | "invoices" | "statement" | "species" | "supplier-spend" | "margin" | "load-discrepancy" | "transit-discrepancy" | "supplier-reliability" | "collection-returns" | "client-orders" | "sales" | "staff-deductions" | "client-balances" | "species-audit";

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

  // ── Sales tab state ─────────────────────────────────────────────────────────
  const salesDefaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const salesDefaultTo   = new Date().toISOString().slice(0, 10);
  const [salesFrom,        setSalesFrom]        = useState(salesDefaultFrom);
  const [salesTo,          setSalesTo]          = useState(salesDefaultTo);
  const [salesRows,        setSalesRows]        = useState<SalesReportRow[]>([]);
  const [salesClientId,    setSalesClientId]    = useState("");
  const [salesView,        setSalesView]        = useState<"client" | "walkin" | "species">("client");
  const [salesSpeciesId,   setSalesSpeciesId]   = useState("");
  const [salesCostRecords, setSalesCostRecords] = useState<CostAverageRecordDto[]>([]);
  const [marginSalesRows,  setMarginSalesRows]  = useState<SalesReportRow[]>([]);

  // ── Dead / Short / Over driver filter ──────────────────────────────────────
  const [crDriverFilter, setCrDriverFilter] = useState("");

  // ── Staff Stock Deductions tab state ────────────────────────────────────────
  const [staffDeductions, setStaffDeductions] = useState<StaffStockDeductionsReportResponse | null>(null);
  const [staffDeductFilter, setStaffDeductFilter] = useState("");
  const [settleTarget, setSettleTarget] = useState<{ staffMemberId: string; staffName: string; balance: number } | null>(null);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleMessage, setSettleMessage] = useState("");

  // ── Client Balances tab state ───────────────────────────────────────────────
  const [clientBalances, setClientBalances] = useState<ClientCreditStatementSummary[] | null>(null);

  // ── Species Audit tab state ──────────────────────────────────────────────────
  const [auditSpeciesId,   setAuditSpeciesId]   = useState("");
  const [auditCrs,         setAuditCrs]         = useState<CollectionRequestDto[] | null>(null);
  const [auditSalesRows,   setAuditSalesRows]   = useState<SalesReportRow[] | null>(null);
  const [auditLosses,      setAuditLosses]      = useState<StockLossDto[] | null>(null);

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
        const [inv, cls, spc] = await Promise.all([
          reportsApi.getInvoices({ customerId: invoiceCustomer || undefined, paymentStatus: invoicePayFilter || undefined, from: from || undefined, to: to || undefined }),
          clients.length ? Promise.resolve(clients) : clientsApi.list(),
          allSpecies.length ? Promise.resolve(allSpecies) : speciesApi.list(),
        ]);
        setInvoices(inv);
        if (!clients.length) setClients(cls.filter((c: ClientDto) => !c.isWalkIn));
        if (!allSpecies.length) setAllSpecies(spc);
      }
      if (tab === "statement" && !clients.length) {
        setClients((await clientsApi.list()).filter((c: ClientDto) => !c.isWalkIn));
      }
      if (tab === "species") setSpeciesRevenue(await reportsApi.getSpeciesRevenue(from || undefined, to || undefined));
      if (tab === "supplier-spend") {
        const [pos, crs] = await Promise.all([procurementOrdersApi.list(), collectionRequestsApi.list()]);
        setPoData(pos);
        setCrData(crs);
      }
      if (tab === "margin") {
        const [spc, costData, salesData] = await Promise.all([
          allSpecies.length ? Promise.resolve(allSpecies) : speciesApi.list(),
          costAveragesApi.getHistory(),
          reportsApi.getSalesReport(from || undefined, to || undefined),
        ]);
        if (!allSpecies.length) setAllSpecies(spc);
        setSalesCostRecords(costData);
        setMarginSalesRows(salesData.rows);
      }
      if (["load-discrepancy","transit-discrepancy","supplier-reliability","collection-returns"].includes(tab)) setCrData(await collectionRequestsApi.list());
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
      if (tab === "client-balances") {
        setClientBalances(await reportsApi.getClientBalances(from || undefined, to || undefined));
      }
      if (tab === "species-audit") {
        const [spc, crs, sales, losses] = await Promise.all([
          allSpecies.length ? Promise.resolve(allSpecies) : speciesApi.list(),
          collectionRequestsApi.list(),
          reportsApi.getSalesReport(from || undefined, to || undefined),
          stockLossApi.list({ from: from || undefined, to: to || undefined }),
        ]);
        if (!allSpecies.length) setAllSpecies(spc);
        setAuditCrs(crs);
        setAuditSalesRows(sales.rows);
        setAuditLosses(losses);
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
        {(["revenue", "outstanding", "invoices", "sales", "client-balances", "staff-deductions", "client-orders", "drivers", "returns", "deliveries", "species", "species-audit", "statement", "supplier-spend", "margin", "load-discrepancy", "transit-discrepancy", "supplier-reliability", "collection-returns"] as Tab[])
          .filter(t => {
            const financialTabs: Tab[] = ["revenue", "outstanding", "invoices", "species", "species-audit", "statement", "sales", "staff-deductions", "client-balances"];
            const procurementTabs: Tab[] = ["supplier-spend", "margin", "load-discrepancy", "transit-discrepancy", "supplier-reliability", "collection-returns"];
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
            {t === "client-balances"       && "💳 Client Balances"}
            {t === "drivers"               && "🚚 Driver Performance"}
            {t === "returns"               && "↩️ Returns"}
            {t === "deliveries"            && "📬 Deliveries"}
            {t === "species"               && "🐔 Species Revenue"}
            {t === "species-audit"         && "🔍 Species Audit"}
            {t === "statement"             && "📄 Customer Statement"}
            {t === "supplier-spend"        && "💼 Supplier Spend"}
            {t === "margin"                && "📊 Cost vs Sell Margin"}
            {t === "load-discrepancy"      && "⚠️ Load Discrepancy"}
            {t === "transit-discrepancy"   && "🚛 Transit Loss"}
            {t === "supplier-reliability"  && "⭐ Supplier Reliability"}
            {t === "collection-returns"    && "💀 Dead / Short / Over"}
            {t === "client-orders"         && "📦 Client Orders"}
          </button>
        ))}
      </div>

      {/* Date filter (not shown for outstanding, statement, client-orders, or sales — sales has its own) */}
      {tab !== "outstanding" && tab !== "statement" && tab !== "client-orders" && tab !== "sales" && tab !== "species-audit" && (
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
                <Th>Driver</Th><Th>Deliveries</Th><Th>Total Value</Th><Th>Dead (inspected)</Th><Th>Mutilated (inspected)</Th><Th>Short</Th><Th>Over</Th>
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
                  <Td style={{ color: d.totalShortQty > 0 ? "#dc2626" : undefined }}>{d.totalShortQty}</Td>
                  <Td style={{ color: d.totalOverQty > 0 ? "#2563eb" : undefined }}>{d.totalOverQty}</Td>
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
                <Th>Species</Th><Th>Returned</Th><Th>Dead</Th><Th>Mutilated</Th><Th>Short</Th><Th>Over</Th>
              </tr>
            </thead>
            <tbody>
              {returns.items.map((r) => (
                <tr key={r.speciesId}>
                  <Td>{allSpecies.find((s) => s.speciesId === r.speciesId)?.name ?? r.speciesId}</Td>
                  <Td>{r.totalReturnedQty}</Td>
                  <Td style={{ color: r.deadQty > 0 ? "#dc2626" : undefined }}>{r.deadQty}</Td>
                  <Td style={{ color: r.mutilatedQty > 0 ? "#d97706" : undefined }}>{r.mutilatedQty}</Td>
                  <Td style={{ color: r.shortQty > 0 ? "#dc2626" : undefined }}>{r.shortQty}</Td>
                  <Td style={{ color: r.overQty > 0 ? "#2563eb" : undefined }}>{r.overQty}</Td>
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
            <SearchableSelect
              value={stmtCustomer}
              onChange={setStmtCustomer}
              options={[
                { value: "ALL", label: "All Customers" },
                ...clients.map(c => ({ value: c.clientId, label: c.clientName })),
              ]}
              placeholder="— Select customer —"
              style={{ minWidth: 220 }}
            />
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

      {/* ── Supplier Spend ── */}
      {tab === "supplier-spend" && poData && crData && !loading && (() => {
        // Build a unit cost lookup: procurementOrderId → speciesId → unitCost
        const costLookup = new Map<string, Map<string, number>>();
        for (const po of poData) {
          const bySpecies = new Map<string, number>();
          for (const l of po.lines) bySpecies.set(l.speciesId, l.unitCost ?? 0);
          costLookup.set(po.procurementOrderId, bySpecies);
        }

        // Build detail rows from collection requests (loaded qty, not ordered qty)
        type DetailRow = {
          date: string;
          supplier: string;
          speciesName: string;
          unitCost: number;
          loadedQty: number;
          totalValue: number;
        };

        const details: DetailRow[] = [];
        for (const cr of crData) {
          if ((cr.supplierName || "").toLowerCase() === "hub") continue;
          // Use collectionDate if available, otherwise createdAt date
          const date = (cr.collectionDate ?? cr.createdAt).slice(0, 10);
          if (from && date < from) continue;
          if (to   && date > to)   continue;

          const poBySpecies = costLookup.get(cr.procurementOrderId) ?? new Map<string, number>();

          for (const line of cr.lines) {
            if (line.loadedQty <= 0) continue;
            const unitCost = poBySpecies.get(line.speciesId) ?? 0;
            details.push({
              date,
              supplier: cr.supplierName || cr.supplierId,
              speciesName: line.speciesName,
              unitCost,
              loadedQty: line.loadedQty,
              totalValue: line.loadedQty * unitCost,
            });
          }
        }

        // Sort by date desc then supplier asc
        details.sort((a, b) => b.date.localeCompare(a.date) || a.supplier.localeCompare(b.supplier));

        const totalQty   = details.reduce((s, r) => s + r.loadedQty, 0);
        const totalValue = details.reduce((s, r) => s + r.totalValue, 0);
        const suppliers  = new Set(details.map(r => r.supplier)).size;

        // Group rows by date+supplier for display
        type Group = { date: string; supplier: string; lines: DetailRow[] };
        const groups: Group[] = [];
        for (const row of details) {
          const last = groups[groups.length - 1];
          if (last && last.date === row.date && last.supplier === row.supplier) {
            last.lines.push(row);
          } else {
            groups.push({ date: row.date, supplier: row.supplier, lines: [row] });
          }
        }

        const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });

        function exportSupplierSpend() {
          const headers = ["Date", "Supplier", "Species", "Unit Cost (incl. VAT)", "Qty Loaded", "Total Value (incl. VAT)"];
          const rows: (string | number)[][] = [];
          for (const g of groups) {
            for (const row of g.lines) {
              rows.push([g.date, g.supplier, row.speciesName, row.unitCost, row.loadedQty, row.totalValue]);
            }
          }
          rows.push(["TOTAL", "", "", "", totalQty, totalValue]);
          const ws = XLSX.utils.aoa_to_sheet([
            ["Supplier Spend Report"],
            [`Period: ${from ?? ""} — ${to ?? ""}`],
            [`Total Spend (incl. VAT): R ${totalValue.toFixed(2)}   Suppliers: ${suppliers}   Total Qty: ${totalQty.toLocaleString()}`],
            [],
            headers,
            ...rows,
          ]);
          ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 24 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Supplier Spend");
          XLSX.writeFile(wb, `supplier-spend-${from ?? "all"}-to-${to ?? "all"}.xlsx`);
        }

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Total Spend (incl. VAT)" value={fmt(totalValue)} highlight />
              <KpiCard label="Suppliers"  value={String(suppliers)} />
              <KpiCard label="Total Qty Loaded" value={totalQty.toLocaleString()} />
            </div>
            {details.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <button onClick={exportSupplierSpend} style={{ padding: "6px 14px", background: "#166534", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  ↓ Export Excel
                </button>
              </div>
            )}
            {groups.length === 0 ? (
              <p style={s.muted}>No loaded collections for the selected period.</p>
            ) : (
              <ScrollTable>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Supplier</Th>
                    <Th>Species</Th>
                    <Th>Unit Cost (incl. VAT)</Th>
                    <Th>Qty Loaded</Th>
                    <Th>Total Value (incl. VAT)</Th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) =>
                    g.lines.map((row, li) => (
                      <tr key={`${gi}-${li}`} style={{ background: gi % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        {li === 0 && (
                          <>
                            <Td style={{ fontWeight: 600, verticalAlign: "top" }} rowSpan={g.lines.length}>
                              {fmtDate(g.date)}
                            </Td>
                            <Td style={{ fontWeight: 600, verticalAlign: "top" }} rowSpan={g.lines.length}>
                              {g.supplier}
                            </Td>
                          </>
                        )}
                        <Td>{row.speciesName}</Td>
                        <Td>{fmt(row.unitCost)}</Td>
                        <Td>{row.loadedQty.toLocaleString()}</Td>
                        <Td style={{ fontWeight: 700, color: "#166534" }}>{fmt(row.totalValue)}</Td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: "#f0fdf4", fontWeight: 700, borderTop: "2px solid #bbf7d0" }}>
                    <Td colSpan={4} style={{ fontWeight: 700 }}>TOTAL</Td>
                    <Td style={{ fontWeight: 700 }}>{totalQty.toLocaleString()}</Td>
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
        // Build avg cost per species from cost records within the date range
        const fromMonth = from ? from.slice(0, 7) : null;
        const toMonth   = to   ? to.slice(0, 7)   : null;
        const filteredCostRecs = salesCostRecords.filter(r => {
          if (fromMonth && r.month < fromMonth) return false;
          if (toMonth   && r.month > toMonth)   return false;
          return true;
        });
        const costBySpecies: Record<string, { totalQty: number; weightedCost: number }> = {};
        for (const rec of filteredCostRecs) {
          if (!costBySpecies[rec.speciesId]) costBySpecies[rec.speciesId] = { totalQty: 0, weightedCost: 0 };
          costBySpecies[rec.speciesId].totalQty     += rec.totalQty;
          costBySpecies[rec.speciesId].weightedCost += rec.totalQty * rec.avgCostExVat;
        }

        // Build avg sell price per species from sales in the date range
        const sellBySpecies: Record<string, { totalQty: number; weightedSell: number }> = {};
        for (const row of marginSalesRows) {
          if (!sellBySpecies[row.speciesId]) sellBySpecies[row.speciesId] = { totalQty: 0, weightedSell: 0 };
          sellBySpecies[row.speciesId].totalQty     += row.qty;
          sellBySpecies[row.speciesId].weightedSell += row.qty * row.unitPrice;
        }

        const rows = allSpecies
          .filter(sp => sp.isActive)
          .map(sp => {
            const costEntry = costBySpecies[sp.speciesId];
            const sellEntry = sellBySpecies[sp.speciesId];
            const cost = costEntry && costEntry.totalQty > 0
              ? costEntry.weightedCost / costEntry.totalQty
              : Number(sp.unitCost ?? 0);
            const sell = sellEntry && sellEntry.totalQty > 0
              ? sellEntry.weightedSell / sellEntry.totalQty
              : Number(sp.sellPrice ?? 0);
            const margin = sell > 0 ? ((sell - cost) / sell) * 100 : null;
            const rand   = sell - cost;
            const hasCostData = !!costEntry;
            const hasSellData = !!sellEntry;
            return { name: sp.name, cost, sell, rand, margin, hasCostData, hasSellData };
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
              Avg unit cost and sell price incl. VAT for selected date range. Falls back to configured price if no data in range. Margin = (Sell − Cost) / Sell × 100.
            </p>
            <ScrollTable>
              <thead>
                <tr>
                  <Th>Species</Th>
                  <Th>Avg Unit Cost (incl. VAT)</Th>
                  <Th>Avg Sell Price (incl. VAT)</Th>
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
                      <Td>
                        {fmt(r.cost)}
                        {!r.hasCostData && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>(configured)</span>}
                      </Td>
                      <Td>
                        {r.sell > 0
                          ? <>{fmt(r.sell)}{!r.hasSellData && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>(configured)</span>}</>
                          : <span style={{ color: "#94a3b8" }}>Not set</span>}
                      </Td>
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

      {/* Collection Returns — Dead / Short / Over */}
      {tab === "collection-returns" && !loading && crData && (() => {
        const fFrom = from ? new Date(from) : null;
        const fTo   = to   ? new Date(to)   : null;
        const confirmed = crData.filter(cr => {
          if (!["HubConfirmed","FinanceAcknowledged"].includes(cr.status)) return false;
          const d = new Date(cr.createdAt);
          if (fFrom && d < fFrom) return false;
          if (fTo   && d > fTo)   return false;
          return true;
        });

        // All unique driver names for the filter dropdown
        const allDrivers = [...new Set(confirmed.map(cr => cr.assignedDriverName || cr.assignedDriverId || "Unknown"))].sort();

        // Apply driver filter
        const filtered = crDriverFilter
          ? confirmed.filter(cr => (cr.assignedDriverName || cr.assignedDriverId || "Unknown") === crDriverFilter)
          : confirmed;

        // Per-order rows
        type OrderRow = {
          id: string; supplier: string; driver: string; date: string;
          species: string; orderedQty: number; loadedQty: number;
          receivedQty: number; deadQty: number; shortQty: number; overQty: number;
        };
        const orderRows: OrderRow[] = [];
        for (const cr of filtered) {
          for (const l of cr.lines) {
            orderRows.push({
              id: cr.collectionRequestId,
              supplier: cr.supplierName,
              driver: cr.assignedDriverName || cr.assignedDriverId || "Unknown",
              date: cr.collectionDate ? cr.collectionDate.slice(0, 10) : cr.createdAt.slice(0, 10),
              species: l.speciesName || l.speciesId,
              orderedQty: l.orderedQty,
              loadedQty: l.loadedQty,
              receivedQty: l.receivedQty,
              deadQty: l.deadQty || 0,
              shortQty: l.shortQty || Math.max(0, l.orderedQty - l.loadedQty),
              overQty: l.overQty || Math.max(0, l.loadedQty - l.orderedQty),
            });
          }
        }

        // Per-driver summary
        type DriverRow = { driver: string; collections: number; dead: number; short: number; over: number };
        const driverMap = new Map<string, DriverRow>();
        for (const cr of filtered) {
          const key = cr.assignedDriverName || cr.assignedDriverId || "Unknown";
          const dead  = cr.lines.reduce((s, l) => s + (l.deadQty || 0), 0);
          const short = cr.lines.reduce((s, l) => s + (l.shortQty || Math.max(0, l.orderedQty - l.loadedQty)), 0);
          const over  = cr.lines.reduce((s, l) => s + (l.overQty  || Math.max(0, l.loadedQty - l.orderedQty)), 0);
          const ex = driverMap.get(key) ?? { driver: key, collections: 0, dead: 0, short: 0, over: 0 };
          driverMap.set(key, { driver: key, collections: ex.collections + 1, dead: ex.dead + dead, short: ex.short + short, over: ex.over + over });
        }
        const driverRows = [...driverMap.values()].sort((a, b) => b.dead - a.dead);

        const totalDead  = driverRows.reduce((s, r) => s + r.dead,  0);
        const totalShort = driverRows.reduce((s, r) => s + r.short, 0);
        const totalOver  = driverRows.reduce((s, r) => s + r.over,  0);

        return (
          <div>
            {/* Driver filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" as const }}>
              <label style={s.label}>Driver</label>
              <SearchableSelect
                value={crDriverFilter}
                onChange={setCrDriverFilter}
                options={allDrivers.map(d => ({ value: d, label: d }))}
                placeholder="All Drivers"
                style={{ minWidth: 180 }}
              />
              {crDriverFilter && (
                <button
                  onClick={() => setCrDriverFilter("")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: 13, color: "#64748b" }}
                >✕ Clear</button>
              )}
            </div>

            <div style={s.kpiRow}>
              <KpiCard label="Collections" value={String(filtered.length)} />
              <KpiCard label="Total Dead"  value={totalDead.toLocaleString()}  highlight />
              <KpiCard label="Total Short" value={totalShort.toLocaleString()} highlight />
              <KpiCard label="Total Over"  value={totalOver.toLocaleString()} />
            </div>

            <h3 style={s.subHeading}>By Driver</h3>
            {driverRows.length === 0 ? <p style={s.muted}>No confirmed collections in this period.</p> : (
              <ScrollTable>
                <thead><tr><Th>Driver</Th><Th>Collections</Th><Th>Dead</Th><Th>Short</Th><Th>Over</Th></tr></thead>
                <tbody>
                  {driverRows.map((r, i) => (
                    <tr key={i} style={{ cursor: "pointer" }} onClick={() => setCrDriverFilter(crDriverFilter === r.driver ? "" : r.driver)}>
                      <Td style={{ fontWeight: 600, color: crDriverFilter === r.driver ? "#15803d" : undefined }}>{r.driver}{crDriverFilter === r.driver ? " ✓" : ""}</Td>
                      <Td>{r.collections}</Td>
                      <Td style={{ fontWeight: 700, color: r.dead  > 0 ? "#dc2626" : "#166534" }}>{r.dead}</Td>
                      <Td style={{ fontWeight: 700, color: r.short > 0 ? "#f59e0b" : "#166534" }}>{r.short}</Td>
                      <Td style={{ fontWeight: 700, color: r.over  > 0 ? "#22c55e" : "#94a3b8" }}>{r.over}</Td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
            )}

            <h3 style={s.subHeading}>Per Order{crDriverFilter ? ` — ${crDriverFilter}` : ""}</h3>
            {orderRows.length === 0 ? <p style={s.muted}>No data.</p> : (
              <ScrollTable>
                <thead><tr><Th>Date</Th><Th>Order ID</Th><Th>Supplier</Th><Th>Driver</Th><Th>Species</Th><Th>Ordered</Th><Th>Loaded</Th><Th>Received</Th><Th>Dead</Th><Th>Short</Th><Th>Over</Th></tr></thead>
                <tbody>
                  {orderRows.map((r, i) => (
                    <tr key={i}>
                      <Td>{r.date}</Td>
                      <Td style={{ fontSize: 11, color: "#64748b" }}>{r.id.split("-")[0].toUpperCase()}</Td>
                      <Td>{r.supplier}</Td>
                      <Td style={{ fontWeight: 600 }}>{r.driver}</Td>
                      <Td>{r.species}</Td>
                      <Td>{r.orderedQty}</Td>
                      <Td>{r.loadedQty}</Td>
                      <Td>{r.receivedQty}</Td>
                      <Td style={{ fontWeight: 700, color: r.deadQty  > 0 ? "#dc2626" : "#94a3b8" }}>{r.deadQty  || "—"}</Td>
                      <Td style={{ fontWeight: 700, color: r.shortQty > 0 ? "#f59e0b" : "#94a3b8" }}>{r.shortQty || "—"}</Td>
                      <Td style={{ fontWeight: 700, color: r.overQty  > 0 ? "#22c55e" : "#94a3b8" }}>{r.overQty  || "—"}</Td>
                    </tr>
                  ))}
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
          salesSpeciesId={salesSpeciesId}
          setSalesSpeciesId={setSalesSpeciesId}
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
                          <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 600 }}>✓ Settled</span>
                        ) : (
                          <button
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #15803d", cursor: "pointer", background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
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
              <div style={s.modalOverlay}>
                <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(15,23,42,0.18)" }}>
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
                      style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", cursor: "pointer", background: "#f8fafc", color: "#475569", fontSize: 13, fontWeight: 600 }}
                      onClick={() => setSettleTarget(null)}
                      disabled={settleLoading}
                    >
                      Cancel
                    </button>
                    <button
                      style={s.confirmBtn}
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



      {/* ── Client Balances ── */}
      {tab === "client-balances" && !loading && (() => {
        const allRows = (clientBalances ?? []).sort((a, b) => a.closingBalance - b.closingBalance);
        const totalOwing  = allRows.reduce((s, r) => s + Math.min(0, r.closingBalance), 0);
        const totalCredit = allRows.reduce((s, r) => s + Math.max(0, r.closingBalance), 0);

        return (
          <div>
            <div style={s.kpiRow}>
              <KpiCard label="Clients" value={String(allRows.length)} />
              <KpiCard label="Total Outstanding" value={fmt(Math.abs(totalOwing))} highlight />
              <KpiCard label="Total Credit" value={fmt(totalCredit)} />
            </div>

            {allRows.length === 0 ? (
              <p style={s.muted}>No data — click Apply to load.</p>
            ) : (
              <ScrollTable>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Opening Balance</Th>
                    <Th>Charges</Th>
                    <Th>Payments / Deposits</Th>
                    <Th>Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r, i) => (
                    <tr key={r.customerId} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <Td>{r.customerName}</Td>
                      <Td>{fmt(r.openingBalance)}</Td>
                      <Td style={{ color: "#dc2626" }}>{fmt(Math.abs(r.totalCharges))}</Td>
                      <Td style={{ color: "#16a34a" }}>{fmt(r.totalDeposits)}</Td>
                      <Td style={{ color: Math.round(r.closingBalance * 100) < 0 ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                        {Math.round(r.closingBalance * 100) < 0 ? "−" : "+"}{fmt(Math.abs(r.closingBalance))}
                        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>
                          {Math.round(r.closingBalance * 100) < 0 ? "owing" : Math.round(r.closingBalance * 100) === 0 ? "settled" : "credit"}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
            )}
          </div>
        );
      })()}

      {/* ── Species Audit ── */}
      {tab === "species-audit" && !loading && (() => {
        // Species selector + date filters
        const selectedSpecies = allSpecies.find(s => s.speciesId === auditSpeciesId);

        // Build audit entries
        type AuditEntry = {
          date: string;
          kind: "collection" | "sale" | "adjustment";
          label: string;
          detail: string;
          qty: number; // positive = in, negative = out
        };

        const entries: AuditEntry[] = [];

        if (auditSpeciesId && auditCrs) {
          for (const cr of auditCrs) {
            if ((cr.supplierName || "").toLowerCase() === "hub") continue;
            const date = (cr.collectionDate ?? cr.createdAt).slice(0, 10);
            if (from && date < from) continue;
            if (to   && date > to)   continue;
            for (const line of cr.lines) {
              if (line.speciesId !== auditSpeciesId) continue;
              if (line.loadedQty > 0) {
                entries.push({ date, kind: "collection", label: cr.supplierName || cr.supplierId, detail: `Driver: ${cr.assignedDriverName || "—"}`, qty: line.loadedQty });
              }
              if (line.deadQty > 0)  entries.push({ date, kind: "adjustment", label: "Hub Confirmed — Dead",  detail: `CR: ${cr.collectionRequestId.slice(0, 8)}`, qty: -line.deadQty });
              if (line.shortQty > 0) entries.push({ date, kind: "adjustment", label: "Hub Confirmed — Short", detail: `CR: ${cr.collectionRequestId.slice(0, 8)}`, qty: -line.shortQty });
              if (line.overQty > 0)  entries.push({ date, kind: "adjustment", label: "Hub Confirmed — Over",  detail: `CR: ${cr.collectionRequestId.slice(0, 8)}`, qty: line.overQty });
            }
          }
        }

        if (auditSpeciesId && auditSalesRows) {
          for (const row of auditSalesRows) {
            if (row.speciesId !== auditSpeciesId) continue;
            entries.push({ date: row.date, kind: "sale", label: row.clientName || "Walk-in", detail: `Inv: ${row.invoiceNumber || row.invoiceId.slice(0, 8)}`, qty: -row.qty });
          }
        }

        if (auditSpeciesId && auditLosses) {
          for (const loss of auditLosses) {
            if (loss.speciesId !== auditSpeciesId) continue;
            const date = loss.createdAt.slice(0, 10);
            if (from && date < from) continue;
            if (to   && date > to)   continue;
            const isOut = loss.adjustmentType === "Under" || loss.adjustmentType === "Short";
            entries.push({ date, kind: "adjustment", label: `Stock Adj — ${loss.adjustmentType}`, detail: loss.notes || "—", qty: isOut ? -loss.qty : loss.qty });
          }
        }

        entries.sort((a, b) => a.date.localeCompare(b.date));

        // Running balance
        let running = 0;
        const withBal = entries.map(e => { running += e.qty; return { ...e, running }; });
        const totalIn  = entries.filter(e => e.qty > 0).reduce((s, e) => s + e.qty, 0);
        const totalOut = entries.filter(e => e.qty < 0).reduce((s, e) => s + Math.abs(e.qty), 0);

        const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });

        return (
          <div>
            {/* Controls */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 16, background: "#fff", padding: "14px 16px", borderRadius: 10, border: "1px solid #e2e8f0", alignItems: "center" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Species</label>
              <SearchableSelect
                value={auditSpeciesId}
                onChange={setAuditSpeciesId}
                options={allSpecies.map(sp => ({ value: sp.speciesId, label: sp.name }))}
                placeholder="— Select species —"
                style={{ minWidth: 200 }}
              />
              <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
              <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
              <button onClick={load} style={{ padding: "8px 20px", borderRadius: 8, background: "#15803d", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Apply</button>
            </div>

            {!auditSpeciesId ? (
              <p style={s.muted}>Select a species above to view its full movement audit trail.</p>
            ) : entries.length === 0 ? (
              <p style={s.muted}>No movements found for {selectedSpecies?.name ?? auditSpeciesId} in the selected period.</p>
            ) : (
              <>
                <div style={s.kpiRow}>
                  <KpiCard label="Total In (Loaded)" value={totalIn.toLocaleString()} />
                  <KpiCard label="Total Out (Sales + Adj)" value={totalOut.toLocaleString()} />
                  <KpiCard label={`Closing Balance`} value={running.toLocaleString()} highlight={running < 0} />
                  <KpiCard label="Transactions" value={String(entries.length)} />
                </div>
                <ScrollTable>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Type</Th>
                      <Th>Description</Th>
                      <Th>Detail</Th>
                      <Th>Qty In</Th>
                      <Th>Qty Out</Th>
                      <Th>Running Balance</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {withBal.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <Td>{fmtDate(row.date)}</Td>
                        <Td>
                          <span style={{
                            display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                            background: row.kind === "collection" ? "#dcfce7" : row.kind === "sale" ? "#dbeafe" : "#fef9c3",
                            color:      row.kind === "collection" ? "#166534" : row.kind === "sale" ? "#1d4ed8" : "#854d0e",
                          }}>
                            {row.kind === "collection" ? "▲ Collection" : row.kind === "sale" ? "▼ Sale" : "⚠ Adjustment"}
                          </span>
                        </Td>
                        <Td style={{ fontWeight: 600 }}>{row.label}</Td>
                        <Td style={{ color: "#64748b", fontSize: 12 }}>{row.detail}</Td>
                        <Td style={{ color: "#16a34a", fontWeight: 700 }}>{row.qty > 0 ? row.qty.toLocaleString() : ""}</Td>
                        <Td style={{ color: "#dc2626", fontWeight: 700 }}>{row.qty < 0 ? Math.abs(row.qty).toLocaleString() : ""}</Td>
                        <Td style={{ fontWeight: 800, color: row.running < 0 ? "#dc2626" : "#0f172a" }}>{row.running.toLocaleString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollTable>
              </>
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
  const [invoiceNumFilter, setInvoiceNumFilter] = useState("");
  const [creditBalances, setCreditBalances] = useState<Record<string, number>>({}); // customerId → balance
  const [creditBalanceLoading, setCreditBalanceLoading] = useState<Record<string, boolean>>({});
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [waModal, setWaModal] = useState<{ invoiceId: string; invoiceNumber: string; customerId: string } | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewInv, setPreviewInv] = useState<InvoiceItem | null>(null);

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
    (!payFilter        || i.paymentStatus === payFilter) &&
    (!payTypeFilter    || i.paymentType   === payTypeFilter) &&
    (!saleTypeFilter   || i.saleType      === saleTypeFilter) &&
    (!invoiceNumFilter || (i.invoiceNumber ?? "").toLowerCase().includes(invoiceNumFilter.toLowerCase()))
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
        <SearchableSelect
          value={customer}
          onChange={setCustomer}
          options={clients.map(c => ({ value: c.clientId, label: c.clientName }))}
          placeholder="All customers"
          style={{ minWidth: 200 }}
        />

        <label style={s.label}>Sale Source</label>
        <SearchableSelect
          value={saleTypeFilter}
          onChange={setSaleTypeFilter}
          options={[
            { value: "HubDirect",    label: "Hub Sale" },
            { value: "DriverDirect", label: "Driver Sale" },
            { value: "Delivery",     label: "Delivery" },
          ]}
          placeholder="All Sources"
          style={{ minWidth: 160 }}
        />

        <label style={s.label}>Payment Type</label>
        <SearchableSelect
          value={payTypeFilter}
          onChange={setPayTypeFilter}
          options={[
            { value: "Cash",          label: "Cash" },
            { value: "EFT",           label: "EFT" },
            { value: "Card",          label: "Card" },
            { value: "CardMachine",   label: "Card Machine" },
            { value: "Split",         label: "Split" },
            { value: "AccountCredit", label: "Account Credit" },
            { value: "Credit",        label: "Credit" },
            { value: "OnAccount",     label: "On Account" },
          ]}
          placeholder="All Types"
          style={{ minWidth: 160 }}
        />

        <label style={s.label}>Invoice #</label>
        <input
          type="text"
          placeholder="e.g. INV001372"
          value={invoiceNumFilter}
          onChange={e => setInvoiceNumFilter(e.target.value)}
          style={{ ...s.dateInput, minWidth: 140 }}
        />

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
                <Th>Preview</Th>
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
                    <Td>
                      <span style={s.mono}>{inv.invoiceNumber || inv.invoiceId.slice(0, 8) + "…"}</span>
                      {inv.lines?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {inv.lines.map((l, li) => (
                            <div key={li} style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 700, color: "#0f172a" }}>
                                {species.find(sp => sp.speciesId === l.speciesId)?.name ?? l.speciesId}
                              </span>
                              {" × "}{l.quantity}
                              <span style={{ color: "#64748b" }}>
                                {" @ R"}{(l.unitPrice * (1 + l.vatRate)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {inv.staffMemberId
                        ? <>{staffMap[inv.staffMemberId] ?? inv.staffMemberId}<span style={{ ...s.badge, background: "#ede9fe", color: "#6d28d9", marginLeft: 6, fontSize: 10 }}>Staff</span></>
                        : (inv.customerName || clientMap[inv.customerId] || inv.customerId)}

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
                        <div style={{ marginTop: 5, paddingTop: 4, borderTop: "1px solid #e2e8f0" }}>
                          {inv.splitPayments.map((sp, i) => (
                            <div key={i} style={{ fontSize: 12, color: "#374151", lineHeight: 1.8, display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontWeight: 700, color: "#1e40af", background: "#eff6ff", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>{sp.method}</span>
                              <span style={{ fontWeight: 600 }}>{fmt(sp.amount)}</span>
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
                    <Td>
                      <button onClick={() => setPreviewInv(inv)} style={{ background: "none", border: "1px solid #bfdbfe", color: "#2563eb", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        👁 Preview
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

      {/* Preview Invoice modal */}
      {previewInv && (
        <div style={s.modalOverlay} onClick={() => setPreviewInv(null)}>
          <div style={{ ...s.modalBox, maxWidth: 640, maxHeight: "90vh", overflowY: "auto" as const }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 16 }}>Invoice Preview</strong>
              <button onClick={() => setPreviewInv(null)} style={s.modalClose}>✕</button>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>KwaWicks</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Tax Invoice</div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{previewInv.invoiceNumber || previewInv.invoiceId.slice(0, 8) + "…"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{new Date(previewInv.createdAt).toLocaleDateString("en-ZA")}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ ...s.badge, background: previewInv.paymentStatus === "Paid" ? "#dcfce7" : "#fef9c3", color: previewInv.paymentStatus === "Paid" ? "#166534" : "#854d0e" }}>
                    {previewInv.paymentStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{previewInv.customerName || clientMap[previewInv.customerId] || previewInv.customerId}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Payment: {previewInv.paymentType}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Channel: {previewInv.saleType}</div>
            </div>

            {/* Lines */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ textAlign: "left" as const, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>Species</th>
                  <th style={{ textAlign: "right" as const, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>Qty</th>
                  <th style={{ textAlign: "right" as const, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>Unit (incl. VAT)</th>
                  <th style={{ textAlign: "right" as const, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {previewInv.lines?.map((l, i) => {
                  const unitIncl = l.unitPrice * (1 + l.vatRate);
                  const lineTotal = unitIncl * l.quantity;
                  const spName = species.find(sp => sp.speciesId === l.speciesId)?.name ?? l.speciesId;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ padding: "8px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{spName}</td>
                      <td style={{ padding: "8px", fontSize: 13, textAlign: "right" as const, color: "#374151" }}>{l.quantity}</td>
                      <td style={{ padding: "8px", fontSize: 13, textAlign: "right" as const, color: "#374151" }}>R {unitIncl.toFixed(2)}</td>
                      <td style={{ padding: "8px", fontSize: 13, textAlign: "right" as const, fontWeight: 600, color: "#0f172a" }}>R {lineTotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, paddingTop: 12, borderTop: "2px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#374151" }}>
                <span>Sub-total:</span>
                <span style={{ minWidth: 90, textAlign: "right" as const }}>R {previewInv.subTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#374151" }}>
                <span>VAT:</span>
                <span style={{ minWidth: 90, textAlign: "right" as const }}>R {previewInv.vatTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", gap: 24, fontSize: 15, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                <span>Grand Total:</span>
                <span style={{ minWidth: 90, textAlign: "right" as const }}>R {previewInv.grandTotal.toFixed(2)}</span>
              </div>
            </div>
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
function Td({ children, style, rowSpan, colSpan }: { children: React.ReactNode; style?: CSSProperties; rowSpan?: number; colSpan?: number }) {
  return <td style={{ ...s.td, ...style }} rowSpan={rowSpan} colSpan={colSpan}>{children}</td>;
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
          String(l.totalReturnedQty || 0), String(l.inspectedDeadQty || 0), String(l.inspectedMutilatedQty || 0)]);
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
            <td style="text-align:right;color:#dc2626">${l.inspectedDeadQty || 0}</td>
            <td style="text-align:right;color:#d97706">${l.inspectedMutilatedQty || 0}</td>
            <td style="text-align:right;color:#0891b2">${l.totalReturnedQty || 0}</td>` : ""}
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
          <td style="text-align:right;padding:6px 10px;color:${(l.inspectedDeadQty||0)>0?"#dc2626":"#cbd5e1"}">${l.inspectedDeadQty || 0}</td>
          <td style="text-align:right;padding:6px 10px;color:${(l.inspectedMutilatedQty||0)>0?"#d97706":"#cbd5e1"}">${l.inspectedMutilatedQty || 0}</td>
          <td style="text-align:right;padding:6px 10px;color:${(l.totalReturnedQty||0)>0?"#0891b2":"#cbd5e1"}">${l.totalReturnedQty || 0}</td>
          <td style="text-align:right;padding:6px 0 6px 10px">${fmt(l.unitPrice * (1 + vatRate))}</td>` : ""}
      </tr>`;
    }).join("");
    const totOrd  = o.lines.reduce((t, l) => t + l.quantity, 0);
    const totDel  = o.lines.reduce((t, l) => t + (l.deliveredQty || 0), 0);
    const totDead = o.lines.reduce((t, l) => t + (l.inspectedDeadQty || 0), 0);
    const totMut  = o.lines.reduce((t, l) => t + (l.inspectedMutilatedQty || 0), 0);
    const totNW   = o.lines.reduce((t, l) => t + (l.totalReturnedQty || 0), 0);
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
          <SearchableSelect
            value={clientId}
            onChange={v => { setClientId(v); setExpandedId(null); }}
            options={clients.map(c => ({ value: c.clientId, label: c.clientName }))}
            placeholder="— All Clients —"
            style={{ minWidth: 240 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Status</div>
          <SearchableSelect
            value={statusFilter === "All" ? "" : statusFilter}
            onChange={v => setStatusFilter(v || "All")}
            options={[
              { value: "Open",           label: "Open" },
              { value: "OutForDelivery", label: "Out for Delivery" },
              { value: "Delivered",      label: "Delivered" },
              { value: "MarkedAtHub",    label: "Marked at Hub" },
            ]}
            placeholder="All Statuses"
            style={{ minWidth: 180 }}
          />
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
        const totDead      = order.lines.reduce((t, l) => t + (l.inspectedDeadQty      || 0), 0);
        const totMut       = order.lines.reduce((t, l) => t + (l.inspectedMutilatedQty || 0), 0);
        const totNW        = order.lines.reduce((t, l) => t + (l.totalReturnedQty      || 0), 0);
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
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.inspectedDeadQty      > 0 ? "#dc2626" : "#cbd5e1" }}>{l.inspectedDeadQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.inspectedMutilatedQty > 0 ? "#d97706" : "#cbd5e1" }}>{l.inspectedMutilatedQty}</td>
                            <td style={{ textAlign: "right" as const, padding: "7px 10px", color: l.totalReturnedQty      > 0 ? "#0891b2" : "#cbd5e1" }}>{l.totalReturnedQty}</td>
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
  salesSpeciesId, setSalesSpeciesId,
  loading, onApply, fmt,
}: {
  rows: SalesReportRow[];
  allClients: ClientDto[];
  costRecords: CostAverageRecordDto[];
  salesFrom: string; salesTo: string;
  setSalesFrom: (v: string) => void; setSalesTo: (v: string) => void;
  salesClientId: string; setSalesClientId: (v: string) => void;
  salesView: "client" | "walkin" | "species"; setSalesView: (v: "client" | "walkin" | "species") => void;
  salesSpeciesId: string; setSalesSpeciesId: (v: string) => void;
  loading: boolean; onApply: () => void;
  fmt: (n: number) => string;
}) {
  // Build cost lookup: speciesId → month → avgCostExVat (ex-VAT, matches unitPrice storage)
  const costMap: Record<string, Record<string, number>> = {};
  for (const r of costRecords) {
    if (!costMap[r.speciesId]) costMap[r.speciesId] = {};
    costMap[r.speciesId][r.month] = r.avgCostExVat;
  }
  function unitCost(speciesId: string, dateIso: string): number | null {
    const month = dateIso.slice(0, 7);
    return costMap[speciesId]?.[month] ?? null;
  }

  // Named clients and walk-in clients for the dropdown
  const namedClients = allClients.filter(c => !c.isWalkIn).sort((a, b) => a.clientName.localeCompare(b.clientName));
  const walkInClients = allClients.filter(c => c.isWalkIn);

  // Distinct species for the species filter dropdown
  const speciesOptions = Array.from(
    new Map(rows.map(r => [r.speciesId, r.speciesName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Filter rows by view type, client, and species
  const visible = rows
    .filter(r => salesView === "species" ? true : salesView === "client" ? !r.isWalkIn : r.isWalkIn)
    .filter(r => !salesClientId || r.clientId === salesClientId)
    .filter(r => !salesSpeciesId || r.speciesId === salesSpeciesId);

  const totalSale = visible.reduce((s, r) => s + r.lineTotal, 0);
  const totalCost = visible.reduce((s, r) => {
    const c = unitCost(r.speciesId, r.date);
    return s + (c !== null ? c * r.qty : 0);
  }, 0);

  // By Species grouping: non-credit consolidated by date + speciesId + price; credit = one row per invoice
  type SpGroup = { date: string; speciesName: string; qty: number; unitPrice: number; cash: number; eft: number; card: number; credit: number; other: number; total: number; isCreditRow: boolean; clientName: string; invoiceNumber: string };
  const bySpeciesRows: SpGroup[] = [];
  if (salesView === "species") {
    const map = new Map<string, SpGroup>();
    visible.forEach(r => {
      const day = r.date.slice(0, 10); // normalize full datetime to YYYY-MM-DD
      const priceCents = Math.round(r.unitPrice * 100);
      const pt = (r.paymentType || "").toLowerCase();

      // Credit invoices: one row per invoice (not consolidated)
      if (pt === "credit") {
        const key = `credit|${r.invoiceId}|${r.speciesId}`;
        if (!map.has(key)) map.set(key, { date: day, speciesName: r.speciesName, qty: 0, unitPrice: r.unitPrice, cash: 0, eft: 0, card: 0, credit: 0, other: 0, total: 0, isCreditRow: true, clientName: r.clientName, invoiceNumber: r.invoiceNumber });
        const g = map.get(key)!;
        g.qty += r.qty; g.total += r.lineTotal; g.credit += r.lineTotal;
        return;
      }

      // All other payment types: consolidate by date + species + price
      const key = `${day}|${r.speciesId}|${priceCents}`;
      if (!map.has(key)) map.set(key, { date: day, speciesName: r.speciesName, qty: 0, unitPrice: r.unitPrice, cash: 0, eft: 0, card: 0, credit: 0, other: 0, total: 0, isCreditRow: false, clientName: "", invoiceNumber: "" });
      const g = map.get(key)!;
      g.qty += r.qty; g.total += r.lineTotal;
      if (pt === "split" && r.splitPayments?.length) {
        // Distribute line total across methods proportionally to the split amounts
        const splitTotal = r.splitPayments.reduce((s, sp) => s + sp.amount, 0);
        r.splitPayments.forEach(sp => {
          const share = splitTotal > 0 ? (sp.amount / splitTotal) * r.lineTotal : 0;
          const m = sp.method.toLowerCase();
          if (m === "cash") g.cash += share;
          else if (m === "eft") g.eft += share;
          else if (m === "card" || m === "cardmachine") g.card += share;
          else if (m === "credit") g.credit += share;
          else g.other += share;
        });
      } else if (pt === "cash") g.cash += r.lineTotal;
      else if (pt === "eft") g.eft += r.lineTotal;
      else if (pt === "card" || pt === "cardmachine") g.card += r.lineTotal;
      else g.other += r.lineTotal;
    });
    bySpeciesRows.push(...Array.from(map.values()).sort((a, b) => a.date === b.date ? a.speciesName.localeCompare(b.speciesName) : a.date.localeCompare(b.date)));
  }

  const hasCredit = bySpeciesRows.some(r => r.credit > 0);
  const hasOther  = bySpeciesRows.some(r => r.other > 0);

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
          <SearchableSelect
            value={salesView}
            onChange={v => { setSalesView((v || "client") as "client" | "walkin" | "species"); setSalesClientId(""); setSalesSpeciesId(""); }}
            options={[
              { value: "client",  label: "By Client" },
              { value: "walkin",  label: "By Walk-in" },
              { value: "species", label: "By Species" },
            ]}
            placeholder="By Client"
            style={{ minWidth: 150 }}
          />
        </div>
        {salesView !== "species" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={s.label}>Client</span>
            <SearchableSelect
              value={salesClientId}
              onChange={setSalesClientId}
              options={clientDropdown.map(c => ({ value: c.clientId, label: c.clientName }))}
              placeholder="All"
              style={{ minWidth: 200 }}
            />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={s.label}>Species</span>
          <SearchableSelect
            value={salesSpeciesId}
            onChange={setSalesSpeciesId}
            options={speciesOptions.map(([id, name]) => ({ value: id, label: name }))}
            placeholder="All Species"
            style={{ minWidth: 180 }}
          />
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

      {/* By Species grouped table */}
      {!loading && salesView === "species" && bySpeciesRows.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Species</th>
                <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
                <th style={{ ...s.th, textAlign: "right" }}>Unit Price</th>
                <th style={{ ...s.th, textAlign: "right" }}>Cash</th>
                <th style={{ ...s.th, textAlign: "right" }}>EFT</th>
                <th style={{ ...s.th, textAlign: "right" }}>Card</th>
                {hasCredit && <th style={{ ...s.th, textAlign: "right" }}>Credit</th>}
                {hasOther  && <th style={{ ...s.th, textAlign: "right" }}>Other</th>}
                <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bySpeciesRows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>{fmtDate(r.date)}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{r.speciesName}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.qty.toLocaleString()}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{fmt(r.unitPrice)}</td>
                  <td style={{ ...s.td, textAlign: "right", color: r.cash > 0 ? "#166534" : "#9ca3af" }}>{r.cash > 0 ? fmt(r.cash) : "—"}</td>
                  <td style={{ ...s.td, textAlign: "right", color: r.eft > 0 ? "#1e40af" : "#9ca3af" }}>{r.eft > 0 ? fmt(r.eft) : "—"}</td>
                  <td style={{ ...s.td, textAlign: "right", color: r.card > 0 ? "#7c3aed" : "#9ca3af" }}>{r.card > 0 ? fmt(r.card) : "—"}</td>
                  {hasCredit && (
                    <td style={{ ...s.td, textAlign: "right", color: r.credit > 0 ? "#854d0e" : "#9ca3af" }}>
                      {r.credit > 0 ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{fmt(r.credit)}</div>
                          {r.isCreditRow && (
                            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6, whiteSpace: "nowrap" as const }}>
                              {r.invoiceNumber} · {r.clientName}
                            </div>
                          )}
                        </>
                      ) : "—"}
                    </td>
                  )}
                  {hasOther  && <td style={{ ...s.td, textAlign: "right", color: r.other > 0 ? "#374151" : "#9ca3af" }}>{r.other > 0 ? fmt(r.other) : "—"}</td>}
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                <td colSpan={3} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                <td style={s.td} />
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#166534" }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.cash, 0))}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#1e40af" }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.eft, 0))}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#7c3aed" }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.card, 0))}</td>
                {hasCredit && <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#854d0e" }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.credit, 0))}</td>}
                {hasOther  && <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.other, 0))}</td>}
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#166534" }}>{fmt(bySpeciesRows.reduce((a, r) => a + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* By Client / Walk-in detail table */}
      {!loading && salesView !== "species" && visible.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Client</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Product</th>
                <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
                <th style={s.th}>Payment</th>
                <th style={{ ...s.th, textAlign: "right" }}>Unit Sale (ex VAT)</th>
                <th style={{ ...s.th, textAlign: "right" }}>Unit Cost (ex VAT)</th>
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
                      {r.paymentType === "Split" && r.splitPayments?.length > 0 && (
                        <div style={{ marginTop: 3 }}>
                          {r.splitPayments.map((sp, si) => (
                            <div key={si} style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 700 }}>{sp.method}</span> {fmt(sp.amount)}
                            </div>
                          ))}
                        </div>
                      )}
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
