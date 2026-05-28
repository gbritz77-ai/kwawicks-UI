import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProfileFromIdToken, hasRole, hasAnyRole } from "../api/auth";
import { useAutoLogout } from "../hooks/useAutoLogout";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}
import {
  reportsApi,
  type DeliveryStatusSummaryResponse,
  type RevenueSummaryResponse,
  type OutstandingPaymentsResponse,
  type MyDeliveryItem,
} from "../api/reportsApi";
import { speciesApi } from "../api/speciesApi";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto } from "../api/procurementOrdersApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(n: number) {
  return `R\u00A0${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function monthRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to, today };
}

// ── SVG Donut Chart ──────────────────────────────────────────────────────────

type DonutSegment = { label: string; value: number; color: string };

function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const r = 48, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let cumFraction = 0;

  return (
    <svg viewBox="0 0 128 128" width={140} height={140} style={{ flexShrink: 0 }}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={22} />
      ) : (
        segments.map((seg, i) => {
          const fraction = seg.value / total;
          const arc = fraction * circ;
          const rotation = -90 + cumFraction * 360;
          cumFraction += fraction;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={22}
              strokeDasharray={`${arc} ${circ}`}
              style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${cx}px ${cy}px` }}
            />
          );
        })
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="900" fill="#0f172a">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#94a3b8">orders</text>
    </svg>
  );
}

// ── Horizontal progress bar ──────────────────────────────────────────────────

function HBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 10, borderRadius: 5, background: "#f1f5f9", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 5 }} />
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, color, icon, compact = false, to,
}: { label: string; value: string | number; color: string; icon: string; compact?: boolean; to?: string }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const clickable = !!to;
  return (
    <div
      onClick={clickable ? () => navigate(to!) : undefined}
      onMouseEnter={() => clickable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...s.statCard,
        borderTop: `3px solid ${color}`,
        padding: compact ? "12px 14px" : "16px 18px",
        cursor: clickable ? "pointer" : "default",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered
          ? "0 4px 16px rgba(0,0,0,0.13)"
          : "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
    >
      <div style={{ ...s.statIcon, fontSize: compact ? 16 : 20, marginBottom: compact ? 6 : 10 }}>{icon}</div>
      <div style={{ ...s.statValue, color, fontSize: compact ? 20 : 28 }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      {clickable && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6, letterSpacing: "0.05em" }}>TAP TO VIEW →</div>}
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon, title, sub, children }: {
  icon: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <section style={s.section}>
      <div style={s.sectionHeader}>
        <span style={s.sectionIcon}>{icon}</span>
        <div>
          <div style={s.sectionTitle}>{title}</div>
          <div style={s.sectionSub}>{sub}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

// ── Skeleton placeholder ─────────────────────────────────────────────────────

function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div style={s.kpiGrid}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={s.skeleton} />
      ))}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function AppShell() {
  useAutoLogout();
  const isMobile = useIsMobile();
  const profile = getProfileFromIdToken();
  const { from, to, today } = monthRange();

  const canSeeOps          = hasAnyRole("Owner", "Admin", "HubStaff");
  const canSeeFinances     = hasAnyRole("Owner", "Finance");
  const canSeeProcurement  = hasAnyRole("Owner", "Admin", "Procurement", "Finance");
  const isDriver           = hasRole("Driver");

  const [loadingDel,    setLoadingDel]    = useState(canSeeOps);
  const [loadingStock,  setLoadingStock]  = useState(canSeeOps);
  const [loadingRev,    setLoadingRev]    = useState(canSeeFinances);
  const [loadingOut,    setLoadingOut]    = useState(canSeeFinances);
  const [loadingMyDel,  setLoadingMyDel]  = useState(isDriver);
  const [loadingPO,     setLoadingPO]     = useState(canSeeProcurement);
  const [poData,        setPoData]        = useState<ProcurementOrderDto[]>([]);
  const [poTab,         setPoTab]         = useState("All");
  const [crData,        setCrData]        = useState<CollectionRequestDto[]>([]);
  const [loadingCR,     setLoadingCR]     = useState(canSeeProcurement || canSeeFinances || canSeeOps);
  const [dnUrls,        setDnUrls]        = useState<Record<string, string>>({});
  const [dnLoading,     setDnLoading]     = useState<string | null>(null);

  const [deliveryData,     setDeliveryData]     = useState<DeliveryStatusSummaryResponse | null>(null);
  const [stockData,        setStockData]         = useState<any[] | null>(null);
  const [revenueData,      setRevenueData]       = useState<RevenueSummaryResponse | null>(null);
  const [outstandingData,  setOutstandingData]   = useState<OutstandingPaymentsResponse | null>(null);
  const [myDeliveries,     setMyDeliveries]      = useState<MyDeliveryItem[] | null>(null);

  useEffect(() => {
    if (canSeeOps) {
      reportsApi.getDeliveryStatus(from, to)
        .then(setDeliveryData).catch(() => {}).finally(() => setLoadingDel(false));
      speciesApi.list()
        .then((d) => setStockData(d as any[])).catch(() => {}).finally(() => setLoadingStock(false));
    }
    if (canSeeFinances) {
      reportsApi.getRevenue(from, to)
        .then(setRevenueData).catch(() => {}).finally(() => setLoadingRev(false));
      reportsApi.getOutstandingPayments()
        .then(setOutstandingData).catch(() => {}).finally(() => setLoadingOut(false));
    }
    if (isDriver) {
      reportsApi.getMyDeliveries(from, to)
        .then(setMyDeliveries).catch(() => {}).finally(() => setLoadingMyDel(false));
    }
    if (canSeeProcurement) {
      procurementOrdersApi.list()
        .then(setPoData).catch(() => {}).finally(() => setLoadingPO(false));
    }
    if (canSeeProcurement || canSeeFinances || canSeeOps) {
      collectionRequestsApi.list()
        .then(setCrData).catch(() => {}).finally(() => setLoadingCR(false));
    }
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────

  const activeSpecies = (stockData ?? []).filter((x) => x.isActive);
  const topStock = [...activeSpecies]
    .sort((a, b) => (b.qtyOnHandHub ?? 0) - (a.qtyOnHandHub ?? 0))
    .slice(0, 8);
  const maxStockQty = Math.max(...topStock.map((x) => x.qtyOnHandHub ?? 0), 1);
  const totalOnHand = activeSpecies.reduce((s, x) => s + (x.qtyOnHandHub ?? 0), 0);
  const totalBooked = activeSpecies.reduce((s, x) => s + (x.qtyBookedOutForDelivery ?? 0), 0);

  const maxRevenue = Math.max(...(revenueData?.byPaymentType ?? []).map((p) => p.grandTotal), 1);
  const myDelivTotal = (myDeliveries ?? []).reduce((s, d) => s + (d.grandTotal ?? 0), 0);

  const PAYMENT_COLORS: Record<string, string> = {
    Cash: "#22c55e", EFT: "#2563eb", Credit: "#8b5cf6", CardMachine: "#f59e0b",
  };

  const PO_STATUSES = [
    { key: "Draft",               label: "Draft",       color: "#94a3b8" },
    { key: "Submitted",           label: "Submitted",   color: "#f59e0b" },
    { key: "CollectionScheduled", label: "Scheduled",   color: "#8b5cf6" },
    { key: "InTransit",           label: "In Transit",  color: "#2563eb" },
    { key: "DeliveredToHub",      label: "At Hub",      color: "#0891b2" },
    { key: "Completed",           label: "Completed",   color: "#22c55e" },
  ];

  const filteredPOs = poTab === "All" ? poData : poData.filter(p => p.status === poTab);
  const poStatusColor = (status: string) =>
    PO_STATUSES.find(s => s.key === status)?.color ?? "#94a3b8";
  const poStatusLabel = (status: string) =>
    PO_STATUSES.find(s => s.key === status)?.label ?? status;

  const CR_STATUS_COLORS: Record<string, string> = {
    Pending: "#94a3b8", Loading: "#f59e0b", InTransit: "#2563eb",
    ArrivedAtHub: "#8b5cf6", HubConfirmed: "#0891b2", FinanceAcknowledged: "#22c55e",
  };
  const CR_STATUS_LABELS: Record<string, string> = {
    Pending: "Pending", Loading: "Loading", InTransit: "In Transit",
    ArrivedAtHub: "At Hub", HubConfirmed: "Hub Confirmed", FinanceAcknowledged: "Acknowledged",
  };
  const crForPo = (poId: string) => crData.filter(c => c.procurementOrderId === poId);
  const pendingAckCRs     = crData.filter(c => c.status === "HubConfirmed");
  const arrivedAtHubCRs  = crData.filter(c => c.status === "ArrivedAtHub");

  async function toggleDeliveryNote(crId: string) {
    if (dnUrls[crId]) { setDnUrls(u => { const n = { ...u }; delete n[crId]; return n; }); return; }
    setDnLoading(crId);
    try {
      const { viewUrl } = await collectionRequestsApi.getDeliveryNoteViewUrl(crId);
      setDnUrls(u => ({ ...u, [crId]: viewUrl }));
    } catch { /* non-fatal */ }
    finally { setDnLoading(null); }
  }

  const delivTotal = (deliveryData?.openCount ?? 0) +
    (deliveryData?.inTransitCount ?? 0) +
    (deliveryData?.deliveredCount ?? 0);

  const monthLabel = today.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const dateLabel  = today.toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ ...s.page, padding: isMobile ? "16px" : "24px" }}>
      {/* ── Page header ── */}
      <div style={s.pageHeader}>
        <div style={{ ...s.pageTitle, fontSize: isMobile ? 20 : 26 }}>{greeting()}{profile?.username ? `, ${profile.username}` : ""} 👋</div>
        <div style={s.pageSub}>{dateLabel} · Overview for {monthLabel}</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ DELIVERIES */}
      {canSeeOps && (
        <Section icon="🚚" title="Deliveries" sub={`Live order status — ${monthLabel}`}>
          {loadingDel ? <SkeletonCards n={4} /> : (
            <div style={{ ...s.panelRow, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ ...s.kpiGrid, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <StatCard compact={isMobile} icon="📋" label="Open"            value={deliveryData?.openCount ?? 0}      color="#f59e0b" to="/app/delivery-orders?status=Open" />
                <StatCard compact={isMobile} icon="🚚" label="Out for Delivery" value={deliveryData?.inTransitCount ?? 0} color="#2563eb" to="/app/delivery-orders?status=OutForDelivery" />
                <StatCard compact={isMobile} icon="✅" label="Delivered"        value={deliveryData?.deliveredCount ?? 0}  color="#22c55e" to="/app/delivery-orders?status=Delivered" />
                <StatCard compact={isMobile} icon="📦" label="Total Orders"     value={delivTotal}                         color="#8b5cf6" to="/app/delivery-orders" />
              </div>

              <div style={{ ...s.chartCard, minWidth: isMobile ? 0 : 260 }}>
                <div style={s.chartTitle}>Order Status Mix</div>
                <div style={{ ...s.donutRow, flexDirection: isMobile ? "column" : "row", alignItems: "center" }}>
                  <DonutChart segments={[
                    { label: "Open",            value: deliveryData?.openCount ?? 0,      color: "#f59e0b" },
                    { label: "Out for Delivery",value: deliveryData?.inTransitCount ?? 0, color: "#2563eb" },
                    { label: "Delivered",        value: deliveryData?.deliveredCount ?? 0, color: "#22c55e" },
                  ]} />
                  <div style={{ ...s.legend, width: isMobile ? "100%" : undefined }}>
                    {[
                      { label: "Open",             color: "#f59e0b", value: deliveryData?.openCount ?? 0 },
                      { label: "Out for Delivery", color: "#2563eb", value: deliveryData?.inTransitCount ?? 0 },
                      { label: "Delivered",         color: "#22c55e", value: deliveryData?.deliveredCount ?? 0 },
                    ].map((seg) => (
                      <div key={seg.label} style={s.legendItem}>
                        <span style={{ ...s.legendDot, background: seg.color }} />
                        <span style={s.legendLabel}>{seg.label}</span>
                        <span style={s.legendVal}>{seg.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════ ARRIVED AT HUB — CONFIRM RECEIPT */}
      {canSeeOps && (
        <Section icon="📦" title="Arrived at Hub — Awaiting Confirmation"
          sub={arrivedAtHubCRs.length > 0 ? `${arrivedAtHubCRs.length} collection${arrivedAtHubCRs.length !== 1 ? "s" : ""} need hub confirmation` : "Hub receipt confirmation"}>
          {loadingCR ? <SkeletonCards n={2} /> : arrivedAtHubCRs.length === 0 ? (
            <div style={{ ...s.empty, padding: "16px 0" }}>✅ No collections awaiting confirmation.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {arrivedAtHubCRs.map(cr => {
                const totalOrdered = cr.lines.reduce((n, l) => n + l.orderedQty,  0);
                const totalLoaded  = cr.lines.reduce((n, l) => n + l.loadedQty,   0);
                return (
                  <div key={cr.collectionRequestId} style={{ ...s.poCard, borderLeft: "4px solid #8b5cf6" }}>
                    <div style={s.poCardHead}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{cr.supplierName || "—"}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {cr.lines.length} species · {totalOrdered.toLocaleString()} ordered · {totalLoaded.toLocaleString()} loaded
                          {cr.assignedDriverName ? ` · 🚛 ${cr.assignedDriverName}` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {new Date(cr.createdAt).toLocaleDateString("en-ZA")}
                          {` · CR-${cr.collectionRequestId.split("-")[0].toUpperCase()}`}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                        background: "rgba(139,92,246,0.1)", color: "#8b5cf6",
                        border: "1px solid rgba(139,92,246,0.3)", whiteSpace: "nowrap" as const,
                      }}>
                        At Hub
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {cr.lines.map(l => (
                        <span key={l.speciesId} style={{
                          background: l.loadedQty < l.orderedQty ? "rgba(239,68,68,0.08)" : "#f1f5f9",
                          color: l.loadedQty < l.orderedQty ? "#dc2626" : "#475569",
                          padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                          border: l.loadedQty < l.orderedQty ? "1px solid rgba(239,68,68,0.25)" : "none",
                        }}>
                          {l.speciesName || l.speciesId}: {l.loadedQty}/{l.orderedQty}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <a href="/app/collection-requests" style={{
                        fontSize: 12, fontWeight: 700, color: "#8b5cf6", textDecoration: "none",
                        padding: "6px 12px", borderRadius: 8, background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.25)", display: "inline-block",
                      }}>
                        → Go to Collections to Confirm Receipt
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════ STOCK */}
      {canSeeOps && (
        <Section icon="🏭" title="Stock" sub="Current inventory levels at hub">
          {loadingStock ? <SkeletonCards n={4} /> : (
            <div style={{ ...s.panelRow, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ ...s.kpiGrid, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <StatCard compact={isMobile} icon="📦" label="Total On Hand"     value={totalOnHand + totalBooked} color="#22c55e" to="/app/hub-tasks?tab=species" />
                <StatCard compact={isMobile} icon="🔒" label="Booked Out"        value={totalBooked}               color="#2563eb" to="/app/hub-tasks?tab=species" />
                <StatCard compact={isMobile} icon="✅" label="Available"          value={totalOnHand}               color="#8b5cf6" to="/app/hub-tasks?tab=species" />
                <StatCard compact={isMobile} icon="🐔" label="Active Species"    value={activeSpecies.length}      color="#f59e0b" to="/app/hub-tasks?tab=species" />
              </div>

              <div style={{ ...s.chartCard, flex: 2, minWidth: isMobile ? 0 : 260 }}>
                <div style={s.chartTitle}>Top Species by Stock Level</div>
                <div style={s.stockLegend}>
                  <span style={{ ...s.dot, background: "#22c55e" }} /> Available
                  <span style={{ ...s.dot, background: "#2563eb", marginLeft: 14 }} /> Booked Out
                </div>
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {topStock.length === 0 && <div style={s.empty}>No stock data.</div>}
                  {topStock.map((x) => (
                    <div key={x.speciesId}>
                      <div style={s.barHeader}>
                        <span style={s.barLabel}>{x.name}</span>
                        <span style={s.barMeta}>{x.qtyOnHandHub ?? 0} on hand</span>
                      </div>
                      <div style={{ height: 10, borderRadius: 5, background: "#f1f5f9", overflow: "hidden", display: "flex" }}>
                        <div style={{
                          width: `${((x.qtyOnHandHub ?? 0) - (x.qtyBookedOutForDelivery ?? 0)) / maxStockQty * 100}%`,
                          background: "#22c55e",
                        }} />
                        <div style={{
                          width: `${(x.qtyBookedOutForDelivery ?? 0) / maxStockQty * 100}%`,
                          background: "#2563eb",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════ FINANCES */}
      {canSeeFinances && (
        <Section icon="💰" title="Finances" sub={`Revenue and outstanding payments — ${monthLabel}`}>
          {(loadingRev || loadingOut) ? <SkeletonCards n={4} /> : (
            <div style={{ ...s.panelRow, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ ...s.kpiGrid, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <StatCard compact={isMobile} icon="💵" label="Revenue"          value={money(revenueData?.totalGrandTotal ?? 0)}      color="#22c55e" to="/app/reports" />
                <StatCard compact={isMobile} icon="🧾" label="Invoices"         value={revenueData?.totalInvoices ?? 0}               color="#2563eb" to="/app/reports" />
                <StatCard compact={isMobile} icon="⚠️" label="Outstanding"      value={money(outstandingData?.totalOutstanding ?? 0)}  color="#ef4444" to="/app/reports" />
                <StatCard compact={isMobile} icon="⏰" label="Overdue Invoices" value={outstandingData?.count ?? 0}                   color="#f59e0b" to="/app/reports" />
              </div>

              <div style={{ ...s.chartCard, flex: 2, minWidth: isMobile ? 0 : 260 }}>
                <div style={s.chartTitle}>Revenue by Payment Type</div>
                <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
                  {(revenueData?.byPaymentType ?? []).length === 0 && (
                    <div style={s.empty}>No revenue data for this period.</div>
                  )}
                  {(revenueData?.byPaymentType ?? []).map((pt) => (
                    <div key={pt.paymentType}>
                      <div style={s.barHeader}>
                        <span style={s.barLabel}>{pt.paymentType}</span>
                        <span style={s.barMeta}>{money(pt.grandTotal)} · {pt.count} inv.</span>
                      </div>
                      <HBar
                        pct={(pt.grandTotal / maxRevenue) * 100}
                        color={PAYMENT_COLORS[pt.paymentType] ?? "#64748b"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════ PENDING ACK */}
      {canSeeFinances && (
        <Section icon="⏳" title="Pending Acknowledgments" sub="Collection requests awaiting Finance sign-off">
          {loadingCR ? <SkeletonCards n={2} /> : pendingAckCRs.length === 0 ? (
            <div style={{ ...s.empty, padding: "16px 0" }}>✅ All collections have been acknowledged.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {pendingAckCRs.map(cr => {
                const totalOrdered  = cr.lines.reduce((n, l) => n + l.orderedQty,  0);
                const totalReceived = cr.lines.reduce((n, l) => n + l.receivedQty, 0);
                return (
                  <div key={cr.collectionRequestId} style={{ ...s.poCard, borderLeft: "4px solid #0891b2" }}>
                    <div style={s.poCardHead}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{cr.supplierName || "—"}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {cr.lines.length} species · {totalOrdered.toLocaleString()} ordered · {totalReceived.toLocaleString()} received
                          {cr.assignedDriverName ? ` · 🚛 ${cr.assignedDriverName}` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {new Date(cr.createdAt).toLocaleDateString("en-ZA")}
                          {` · CR-${cr.collectionRequestId.split("-")[0].toUpperCase()}`}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                        background: "rgba(8,145,178,0.1)", color: "#0891b2", border: "1px solid rgba(8,145,178,0.3)",
                        whiteSpace: "nowrap" as const,
                      }}>
                        Hub Confirmed
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {cr.lines.map(l => (
                        <span key={l.speciesId} style={{
                          background: l.receivedQty < l.orderedQty ? "rgba(239,68,68,0.08)" : "#f1f5f9",
                          color: l.receivedQty < l.orderedQty ? "#dc2626" : "#475569",
                          padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                          border: l.receivedQty < l.orderedQty ? "1px solid rgba(239,68,68,0.25)" : "none",
                        }}>
                          {l.speciesName || l.speciesId}: {l.receivedQty}/{l.orderedQty}
                        </span>
                      ))}
                    </div>
                    {cr.deliveryNoteS3Key && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          onClick={() => toggleDeliveryNote(cr.collectionRequestId)}
                          style={{
                            fontSize: 12, fontWeight: 700, color: "#0891b2", cursor: "pointer",
                            padding: "6px 12px", borderRadius: 8, background: "rgba(8,145,178,0.08)",
                            border: "1px solid rgba(8,145,178,0.2)", display: "inline-block",
                          }}
                        >
                          {dnLoading === cr.collectionRequestId
                            ? "Loading…"
                            : dnUrls[cr.collectionRequestId]
                              ? "🖼 Hide Photo"
                              : "📷 View Delivery Note"}
                        </button>
                        {dnUrls[cr.collectionRequestId] && (
                          <img
                            src={dnUrls[cr.collectionRequestId]}
                            alt="Delivery note"
                            style={{ display: "block", width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8, marginTop: 8, border: "1px solid #e2e8f0" }}
                          />
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <a href="/app/collection-requests" style={{
                        fontSize: 12, fontWeight: 700, color: "#0891b2", textDecoration: "none",
                        padding: "6px 12px", borderRadius: 8, background: "rgba(8,145,178,0.08)",
                        border: "1px solid rgba(8,145,178,0.2)", display: "inline-block",
                      }}>
                        → Go to Collections to Acknowledge
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════ PROCUREMENT */}
      {canSeeProcurement && (
        <Section icon="💼" title="Procurement Pipeline" sub="Procurement orders by status">
          {loadingPO ? <SkeletonCards n={6} /> : (
            <>
              {/* KPI cards — one per status */}
              <div style={{ ...s.kpiGrid, gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)", marginBottom: 20 }}>
                {PO_STATUSES.map(st => (
                  <div
                    key={st.key}
                    onClick={() => setPoTab(poTab === st.key ? "All" : st.key)}
                    style={{
                      ...s.statCard,
                      borderTop: `3px solid ${st.color}`,
                      padding: isMobile ? "10px 10px" : "14px 16px",
                      cursor: "pointer",
                      outline: poTab === st.key ? `2px solid ${st.color}` : "none",
                      outlineOffset: 2,
                    }}
                  >
                    <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: st.color, lineHeight: 1, marginBottom: 4 }}>
                      {poData.filter(p => p.status === st.key).length}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      {st.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tab strip */}
              <div style={s.poTabStrip}>
                {["All", ...PO_STATUSES.map(s => s.key)].map(key => {
                  const label = key === "All" ? "All" : poStatusLabel(key);
                  const active = poTab === key;
                  const color = key === "All" ? "#1e293b" : poStatusColor(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setPoTab(key)}
                      style={{
                        ...s.poTab,
                        ...(active ? { background: color, color: "white", borderColor: color } : {}),
                      }}
                    >
                      {label}
                      <span style={{ ...s.poTabCount, ...(active ? { background: "rgba(255,255,255,0.25)", color: "white" } : {}) }}>
                        {key === "All" ? poData.length : poData.filter(p => p.status === key).length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* PO list */}
              {filteredPOs.length === 0 ? (
                <div style={{ ...s.empty, marginTop: 12, padding: "20px 0", textAlign: "center" as const }}>
                  No procurement orders for this status.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {filteredPOs.slice(0, 10).map(po => {
                    const color = poStatusColor(po.status);
                    const label = poStatusLabel(po.status);
                    const totalUnits = po.lines.reduce((n, l) => n + l.orderedQty, 0);
                    const totalCost  = po.lines.reduce((n, l) => n + l.orderedQty * (l.unitCost ?? 0), 0);
                    const linkedCRs  = crForPo(po.procurementOrderId);
                    return (
                      <div key={po.procurementOrderId} style={{ ...s.poCard, borderLeft: `4px solid ${color}` }}>
                        <div style={s.poCardHead}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{po.supplierName || "—"}</div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                              {po.lines.length} species · {totalUnits.toLocaleString()} units
                              {totalCost > 0 && ` · R\u00A0${totalCost.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
                              {po.supplierOrderReference ? ` · Ref: ${po.supplierOrderReference}` : ""}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px",
                            borderRadius: 999, background: `${color}1a`,
                            color, border: `1px solid ${color}66`,
                            whiteSpace: "nowrap" as const,
                          }}>
                            {label}
                          </span>
                        </div>
                        {po.lines.length > 0 && (
                          <div style={{ fontSize: 12, color: "#475569", marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {po.lines.map(l => (
                              <span key={l.speciesId} style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
                                {l.speciesName || l.speciesId}: {l.orderedQty.toLocaleString()}
                              </span>
                            ))}
                          </div>
                        )}
                        {linkedCRs.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column" as const, gap: 4 }}>
                            {linkedCRs.map(cr => {
                              const crColor = CR_STATUS_COLORS[cr.status] ?? "#94a3b8";
                              const crLabel = CR_STATUS_LABELS[cr.status] ?? cr.status;
                              return (
                                <div key={cr.collectionRequestId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: "#64748b" }}>🚛</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                                    {cr.assignedDriverName || cr.assignedDriverId || "Unassigned"}
                                  </span>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                                    background: `${crColor}18`, color: crColor, border: `1px solid ${crColor}55`,
                                    whiteSpace: "nowrap" as const,
                                  }}>
                                    CR: {crLabel}
                                  </span>
                                  {cr.notes && (
                                    <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{cr.notes}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredPOs.length > 10 && (
                    <div style={{ textAlign: "center" as const, fontSize: 13, color: "#94a3b8", padding: "8px 0" }}>
                      + {filteredPOs.length - 10} more — <button style={s.poViewAll} onClick={() => {}}>View all in Procurement</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════ DRIVER */}
      {isDriver && (
        <Section icon="🚗" title="My Deliveries" sub={`Your performance — ${monthLabel}`}>
          {loadingMyDel ? <SkeletonCards n={2} /> : (
            <div style={s.kpiGrid}>
              <StatCard compact={isMobile} icon="✅" label="Completed"             value={myDeliveries?.length ?? 0} color="#2563eb" to="/driver" />
              <StatCard compact={isMobile} icon="💵" label="Total Value Delivered" value={money(myDelivTotal)}    color="#22c55e" to="/driver/reports" />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },

  pageHeader: { marginBottom: 32 },
  pageTitle:  { fontSize: 26, fontWeight: 900, color: "#0f172a" },
  pageSub:    { fontSize: 14, color: "#64748b", marginTop: 4 },

  section: { marginBottom: 36 },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "2px solid #e2e8f0",
  },
  sectionIcon:  { fontSize: 26, lineHeight: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  sectionSub:   { fontSize: 13, color: "#64748b", marginTop: 2 },

  panelRow: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },

  statCard: {
    background: "#ffffff",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  },
  statIcon:  { fontSize: 20, marginBottom: 10 },
  statValue: { fontSize: 28, fontWeight: 900, lineHeight: 1, marginBottom: 6, whiteSpace: "nowrap" },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  chartCard: {
    background: "#ffffff",
    borderRadius: 12,
    padding: "16px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
    flex: 1,
    minWidth: 260,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#1e293b",
    marginBottom: 4,
  },

  donutRow: {
    display: "flex",
    alignItems: "center",
    gap: 24,
    marginTop: 12,
    flexWrap: "wrap",
  },
  legend:      { display: "grid", gap: 12, flex: 1, minWidth: 140 },
  legendItem:  { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  legendDot:   { width: 12, height: 12, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  legendLabel: { flex: 1, color: "#475569", fontWeight: 600 },
  legendVal:   { fontWeight: 900, color: "#0f172a", fontSize: 15 },

  stockLegend: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  dot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },

  barHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 5,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e293b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  barMeta: {
    fontSize: 12,
    color: "#94a3b8",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  skeleton: {
    height: 100,
    borderRadius: 12,
    background: "#e2e8f0",
    flex: 1,
    minWidth: 140,
  },

  empty: {
    color: "#94a3b8",
    fontSize: 13,
    fontStyle: "italic",
  },

  // Procurement pipeline
  poTabStrip: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 4,
  },
  poTab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "white",
    color: "#475569",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  poTabCount: {
    background: "#f1f5f9",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
    padding: "1px 7px",
    borderRadius: 999,
  },
  poCard: {
    background: "white",
    borderRadius: 10,
    padding: "12px 14px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  poCardHead: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  poViewAll: {
    background: "none",
    border: "none",
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    padding: 0,
  },
};
