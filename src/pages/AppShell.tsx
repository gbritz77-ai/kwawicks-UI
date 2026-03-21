import React, { useEffect, useState } from "react";
import { getProfileFromIdToken, hasRole, hasAnyRole } from "../api/auth";
import { useAutoLogout } from "../hooks/useAutoLogout";
import {
  reportsApi,
  type DeliveryStatusSummaryResponse,
  type RevenueSummaryResponse,
  type OutstandingPaymentsResponse,
  type MyDeliveryItem,
} from "../api/reportsApi";
import { speciesApi } from "../api/speciesApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(n: number) {
  return `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  let cum = 0;

  return (
    <svg viewBox="0 0 128 128" width={140} height={140} style={{ flexShrink: 0 }}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={22} />
      ) : (
        segments.map((seg, i) => {
          const dash = (seg.value / total) * circ;
          const offset = circ - (cum / total) * circ;
          cum += seg.value;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={22}
              strokeDasharray={`${dash} ${circ}`}
              strokeDashoffset={offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
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
  label, value, color, icon,
}: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div style={{ ...s.statCard, borderTop: `3px solid ${color}` }}>
      <div style={s.statIcon}>{icon}</div>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
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
  const profile = getProfileFromIdToken();
  const { from, to, today } = monthRange();

  const canSeeOps      = hasAnyRole("Owner", "Admin", "HubStaff");
  const canSeeFinances = hasAnyRole("Owner", "Finance");
  const isDriver       = hasRole("Driver");

  const [loadingDel,    setLoadingDel]    = useState(canSeeOps);
  const [loadingStock,  setLoadingStock]  = useState(canSeeOps);
  const [loadingRev,    setLoadingRev]    = useState(canSeeFinances);
  const [loadingOut,    setLoadingOut]    = useState(canSeeFinances);
  const [loadingMyDel,  setLoadingMyDel]  = useState(isDriver);

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

  const delivTotal = (deliveryData?.openCount ?? 0) +
    (deliveryData?.inTransitCount ?? 0) +
    (deliveryData?.deliveredCount ?? 0);

  const monthLabel = today.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const dateLabel  = today.toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={s.page}>
      {/* ── Page header ── */}
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>{greeting()}{profile?.username ? `, ${profile.username}` : ""} 👋</div>
        <div style={s.pageSub}>{dateLabel} · Overview for {monthLabel}</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ DELIVERIES */}
      {canSeeOps && (
        <Section icon="🚚" title="Deliveries" sub={`Live order status — ${monthLabel}`}>
          {loadingDel ? <SkeletonCards n={4} /> : (
            <div style={s.panelRow}>
              <div style={s.kpiGrid}>
                <StatCard icon="📋" label="Open"            value={deliveryData?.openCount ?? 0}      color="#f59e0b" />
                <StatCard icon="🚚" label="Out for Delivery" value={deliveryData?.inTransitCount ?? 0} color="#2563eb" />
                <StatCard icon="✅" label="Delivered"        value={deliveryData?.deliveredCount ?? 0}  color="#22c55e" />
                <StatCard icon="📦" label="Total Orders"     value={delivTotal}                         color="#8b5cf6" />
              </div>

              <div style={s.chartCard}>
                <div style={s.chartTitle}>Order Status Mix</div>
                <div style={s.donutRow}>
                  <DonutChart segments={[
                    { label: "Open",            value: deliveryData?.openCount ?? 0,      color: "#f59e0b" },
                    { label: "Out for Delivery",value: deliveryData?.inTransitCount ?? 0, color: "#2563eb" },
                    { label: "Delivered",        value: deliveryData?.deliveredCount ?? 0, color: "#22c55e" },
                  ]} />
                  <div style={s.legend}>
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

      {/* ══════════════════════════════════════════════════════════════ STOCK */}
      {canSeeOps && (
        <Section icon="🏭" title="Stock" sub="Current inventory levels at hub">
          {loadingStock ? <SkeletonCards n={4} /> : (
            <div style={s.panelRow}>
              <div style={s.kpiGrid}>
                <StatCard icon="📦" label="Total On Hand"     value={totalOnHand}             color="#22c55e" />
                <StatCard icon="🔒" label="Booked Out"        value={totalBooked}             color="#2563eb" />
                <StatCard icon="✅" label="Available"          value={totalOnHand - totalBooked} color="#8b5cf6" />
                <StatCard icon="🐔" label="Active Species"    value={activeSpecies.length}    color="#f59e0b" />
              </div>

              <div style={{ ...s.chartCard, flex: 2 }}>
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
            <div style={s.panelRow}>
              <div style={s.kpiGrid}>
                <StatCard icon="💵" label="Revenue"          value={money(revenueData?.totalGrandTotal ?? 0)}   color="#22c55e" />
                <StatCard icon="🧾" label="Invoices"         value={revenueData?.totalInvoices ?? 0}            color="#2563eb" />
                <StatCard icon="⚠️" label="Outstanding"      value={money(outstandingData?.totalOutstanding ?? 0)} color="#ef4444" />
                <StatCard icon="⏰" label="Overdue Invoices" value={outstandingData?.count ?? 0}                color="#f59e0b" />
              </div>

              <div style={{ ...s.chartCard, flex: 2 }}>
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

      {/* ══════════════════════════════════════════════════════════════ DRIVER */}
      {isDriver && (
        <Section icon="🚗" title="My Deliveries" sub={`Your performance — ${monthLabel}`}>
          {loadingMyDel ? <SkeletonCards n={2} /> : (
            <div style={s.kpiGrid}>
              <StatCard icon="✅" label="Completed"          value={myDeliveries?.length ?? 0} color="#2563eb" />
              <StatCard icon="💵" label="Total Value Delivered" value={money(myDelivTotal)}    color="#22c55e" />
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
  statValue: { fontSize: 28, fontWeight: 900, lineHeight: 1, marginBottom: 6 },
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
};
