import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { reportsApi } from "../api/reportsApi";
import type { SalesReportRow } from "../api/reportsApi";

// ── Helpers ────────────────────────────────────────────────────────────────────

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to   = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { from: iso(from), to: iso(to) };
}

function fmt(n: number) {
  return "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

type View = "client" | "walkin";

export default function SalesReportPage() {
  const range = defaultRange();
  const [from, setFrom]   = useState(range.from);
  const [to,   setTo]     = useState(range.to);
  const [view, setView]   = useState<View>("client");
  const [rows, setRows]   = useState<SalesReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function load(f = from, t = to) {
    setLoading(true);
    setError("");
    try {
      const res = await reportsApi.getSalesReport(f || undefined, t || undefined);
      setRows(res.rows);
    } catch {
      setError("Failed to load sales report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function apply() { load(); }

  const visible = rows.filter(r => view === "client" ? !r.isWalkIn : r.isWalkIn);

  const total   = visible.reduce((s, r) => s + r.lineTotal, 0);
  const qty     = visible.reduce((s, r) => s + r.qty,      0);

  // Group rows by client for the "By Client" view summary
  const byClient = visible.reduce<Record<string, { name: string; total: number; qty: number }>>((acc, r) => {
    if (!acc[r.clientId]) acc[r.clientId] = { name: r.clientName, total: 0, qty: 0 };
    acc[r.clientId].total += r.lineTotal;
    acc[r.clientId].qty   += r.qty;
    return acc;
  }, {});

  const isMobile = window.innerWidth < 700;

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Sales Report</h2>

      {/* Date range filter */}
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.label}>From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            style={s.dateInput}
          />
        </div>
        <div style={s.filterGroup}>
          <label style={s.label}>To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            style={s.dateInput}
          />
        </div>
        <button style={s.applyBtn} onClick={apply} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>

      {/* View toggle */}
      <div style={s.tabRow}>
        <button
          style={view === "client" ? { ...s.tab, ...s.tabActive } : s.tab}
          onClick={() => setView("client")}
        >
          By Client
        </button>
        <button
          style={view === "walkin" ? { ...s.tab, ...s.tabActive } : s.tab}
          onClick={() => setView("walkin")}
        >
          By Walk-in
        </button>
      </div>

      {error   && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && !error && (
        <>
          {/* Summary KPIs */}
          <div style={s.kpiRow}>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>Lines</span>
              <span style={s.kpiValue}>{visible.length.toLocaleString()}</span>
            </div>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>Total Qty</span>
              <span style={s.kpiValue}>{qty.toLocaleString()}</span>
            </div>
            <div style={{ ...s.kpi, ...s.kpiHighlight }}>
              <span style={s.kpiLabel}>Total Sales</span>
              <span style={s.kpiValue}>{fmt(total)}</span>
            </div>
          </div>

          {visible.length === 0 ? (
            <p style={s.muted}>No {view === "client" ? "client" : "walk-in"} sales in this period.</p>
          ) : (
            <>
              {/* Client summary (only in By Client view) */}
              {view === "client" && Object.keys(byClient).length > 1 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Client Summary</h3>
                  <div style={s.scrollWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Client</th>
                          <th style={{ ...s.th, ...s.right }}>Qty</th>
                          <th style={{ ...s.th, ...s.right }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(byClient)
                          .sort((a, b) => b.total - a.total)
                          .map((c, i) => (
                            <tr key={i} style={i % 2 === 0 ? s.rowEven : s.rowOdd}>
                              <td style={s.td}>{c.name}</td>
                              <td style={{ ...s.td, ...s.right }}>{c.qty.toLocaleString()}</td>
                              <td style={{ ...s.td, ...s.right, fontWeight: 600 }}>{fmt(c.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detail table */}
              <div style={s.section}>
                <h3 style={s.sectionTitle}>
                  {view === "client" ? "Client Sales Detail" : "Walk-in Sales Detail"}
                </h3>
                <div style={s.scrollWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>{view === "client" ? "Client" : "Customer"}</th>
                        <th style={s.th}>Product</th>
                        <th style={{ ...s.th, ...s.right }}>Qty</th>
                        {!isMobile && <th style={{ ...s.th, ...s.right }}>Unit Price</th>}
                        <th style={s.th}>Payment</th>
                        <th style={{ ...s.th, ...s.right }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r, i) => (
                        <tr key={`${r.invoiceId}-${r.speciesId}-${i}`} style={i % 2 === 0 ? s.rowEven : s.rowOdd}>
                          <td style={{ ...s.td, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                          <td style={s.td}>{r.clientName}</td>
                          <td style={s.td}>{r.speciesName}</td>
                          <td style={{ ...s.td, ...s.right }}>{r.qty.toLocaleString()}</td>
                          {!isMobile && <td style={{ ...s.td, ...s.right }}>{fmt(r.unitPrice)}</td>}
                          <td style={s.td}>
                            <span style={{ ...s.badge, ...payBadgeStyle(r.paymentType) }}>
                              {r.paymentType || "—"}
                            </span>
                          </td>
                          <td style={{ ...s.td, ...s.right, fontWeight: 600 }}>{fmt(r.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={s.footerRow}>
                        <td colSpan={isMobile ? 3 : 4} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                        {!isMobile && <td />}
                        <td />
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#166534" }}>{fmt(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function payBadgeStyle(type: string): CSSProperties {
  switch ((type || "").toLowerCase()) {
    case "cash":   return { background: "#dcfce7", color: "#166534" };
    case "eft":    return { background: "#dbeafe", color: "#1e40af" };
    case "credit": return { background: "#fef9c3", color: "#854d0e" };
    default:       return { background: "#f3f4f6", color: "#374151" };
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  page: {
    padding: "24px 16px",
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 20,
  },

  // Filter
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  dateInput: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
  },
  applyBtn: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 700,
    background: "#166534",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    alignSelf: "flex-end",
  },

  // Tabs
  tabRow: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    background: "#f3f4f6",
    color: "#374151",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
  },
  tabActive: {
    background: "#166534",
    color: "#fff",
    border: "1px solid #166534",
  },

  // KPIs
  kpiRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  kpi: {
    flex: "1 1 120px",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kpiHighlight: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
  },

  // Sections
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 10,
  },

  // Table
  scrollWrap: {
    overflowX: "auto",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    background: "#fff",
  },
  th: {
    padding: "10px 12px",
    background: "#f9fafb",
    color: "#374151",
    fontWeight: 700,
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "9px 12px",
    color: "#111827",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "middle",
  },
  rowEven: { background: "#fff" },
  rowOdd:  { background: "#fafafa" },
  footerRow: {
    background: "#f0fdf4",
    borderTop: "2px solid #bbf7d0",
  },
  right: { textAlign: "right" },

  // Badge
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  // Status
  error: { color: "#dc2626", fontSize: 14 },
  muted: { color: "#9ca3af", fontSize: 14 },
};
