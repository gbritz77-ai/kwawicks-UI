import { useEffect, useState, useMemo } from "react";
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

type View = "client" | "walkin" | "species";

export default function SalesReportPage() {
  const range = defaultRange();
  const [from,      setFrom]      = useState(range.from);
  const [to,        setTo]        = useState(range.to);
  const [view,      setView]      = useState<View>("client");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [rows,      setRows]      = useState<SalesReportRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

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

  // Distinct species for the filter dropdown (derived from loaded data)
  const speciesOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => { if (r.speciesId) map.set(r.speciesId, r.speciesName); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Base filter: species dropdown applies to all views
  const filtered = speciesFilter
    ? rows.filter(r => r.speciesId === speciesFilter)
    : rows;

  const visible = filtered.filter(r =>
    view === "species" ? true
    : view === "client" ? !r.isWalkIn
    : r.isWalkIn
  );

  const total = visible.reduce((s, r) => s + r.lineTotal, 0);
  const qty   = visible.reduce((s, r) => s + r.qty,      0);

  // By Client summary
  const byClient = visible.reduce<Record<string, { name: string; total: number; qty: number }>>((acc, r) => {
    if (!acc[r.clientId]) acc[r.clientId] = { name: r.clientName, total: 0, qty: 0 };
    acc[r.clientId].total += r.lineTotal;
    acc[r.clientId].qty   += r.qty;
    return acc;
  }, {});

  // By Species grouped rows: group by date + speciesId + unitPrice
  type SpeciesGroup = {
    date: string;
    speciesName: string;
    qty: number;
    unitPrice: number;
    cash: number;
    eft: number;
    card: number;
    credit: number;
    total: number;
  };

  const bySpeciesRows = useMemo((): SpeciesGroup[] => {
    const map = new Map<string, SpeciesGroup>();
    filtered.forEach(r => {
      const priceCents = Math.round(r.unitPrice * 100);
      const key = `${r.date}|${r.speciesId}|${priceCents}`;
      if (!map.has(key)) {
        map.set(key, {
          date: r.date,
          speciesName: r.speciesName,
          qty: 0,
          unitPrice: r.unitPrice,
          cash: 0,
          eft: 0,
          card: 0,
          credit: 0,
          total: 0,
        });
      }
      const g = map.get(key)!;
      g.qty   += r.qty;
      g.total += r.lineTotal;
      const pt = (r.paymentType || "").toLowerCase();
      if (pt === "cash")   g.cash   += r.lineTotal;
      else if (pt === "eft")    g.eft    += r.lineTotal;
      else if (pt === "card")   g.card   += r.lineTotal;
      else if (pt === "credit") g.credit += r.lineTotal;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.date === b.date ? a.speciesName.localeCompare(b.speciesName) : a.date.localeCompare(b.date)
    );
  }, [filtered]);

  const isMobile = window.innerWidth < 700;

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Sales Report</h2>

      {/* Filter bar */}
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
        <div style={s.filterGroup}>
          <label style={s.label}>Species</label>
          <select
            value={speciesFilter}
            onChange={e => setSpeciesFilter(e.target.value)}
            style={s.selectInput}
          >
            <option value="">All Species</option>
            {speciesOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <button style={s.applyBtn} onClick={apply} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>

      {/* View toggle */}
      <div style={s.tabRow}>
        {(["client", "walkin", "species"] as View[]).map(v => (
          <button
            key={v}
            style={view === v ? { ...s.tab, ...s.tabActive } : s.tab}
            onClick={() => setView(v)}
          >
            {v === "client" ? "By Client" : v === "walkin" ? "By Walk-in" : "By Species"}
          </button>
        ))}
      </div>

      {error   && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && !error && (
        <>
          {/* Summary KPIs */}
          {view !== "species" && (
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
          )}

          {view === "species" && (
            <div style={s.kpiRow}>
              <div style={s.kpi}>
                <span style={s.kpiLabel}>Groups</span>
                <span style={s.kpiValue}>{bySpeciesRows.length.toLocaleString()}</span>
              </div>
              <div style={s.kpi}>
                <span style={s.kpiLabel}>Total Qty</span>
                <span style={s.kpiValue}>{bySpeciesRows.reduce((s, r) => s + r.qty, 0).toLocaleString()}</span>
              </div>
              <div style={{ ...s.kpi, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <span style={s.kpiLabel}>Cash</span>
                <span style={s.kpiValue}>{fmt(bySpeciesRows.reduce((s, r) => s + r.cash, 0))}</span>
              </div>
              <div style={{ ...s.kpi, background: "#fdf4ff", border: "1px solid #e9d5ff" }}>
                <span style={s.kpiLabel}>EFT</span>
                <span style={s.kpiValue}>{fmt(bySpeciesRows.reduce((s, r) => s + r.eft, 0))}</span>
              </div>
              <div style={{ ...s.kpi, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                <span style={s.kpiLabel}>Card</span>
                <span style={s.kpiValue}>{fmt(bySpeciesRows.reduce((s, r) => s + r.card, 0))}</span>
              </div>
              <div style={{ ...s.kpi, ...s.kpiHighlight }}>
                <span style={s.kpiLabel}>Total Sales</span>
                <span style={s.kpiValue}>{fmt(bySpeciesRows.reduce((s, r) => s + r.total, 0))}</span>
              </div>
            </div>
          )}

          {/* By Species view */}
          {view === "species" && (
            bySpeciesRows.length === 0 ? (
              <p style={s.muted}>No sales in this period{speciesFilter ? " for the selected species" : ""}.</p>
            ) : (
              <div style={s.section}>
                <div style={s.scrollWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Species</th>
                        <th style={{ ...s.th, ...s.right }}>Qty</th>
                        <th style={{ ...s.th, ...s.right }}>Unit Price</th>
                        <th style={{ ...s.th, ...s.right }}>Cash</th>
                        <th style={{ ...s.th, ...s.right }}>EFT</th>
                        <th style={{ ...s.th, ...s.right }}>Card</th>
                        {bySpeciesRows.some(r => r.credit > 0) && (
                          <th style={{ ...s.th, ...s.right }}>Credit</th>
                        )}
                        <th style={{ ...s.th, ...s.right }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySpeciesRows.map((r, i) => (
                        <tr key={i} style={i % 2 === 0 ? s.rowEven : s.rowOdd}>
                          <td style={{ ...s.td, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                          <td style={{ ...s.td, fontWeight: 600 }}>{r.speciesName}</td>
                          <td style={{ ...s.td, ...s.right }}>{r.qty.toLocaleString()}</td>
                          <td style={{ ...s.td, ...s.right }}>{fmt(r.unitPrice)}</td>
                          <td style={{ ...s.td, ...s.right, color: r.cash > 0 ? "#166534" : "#9ca3af" }}>
                            {r.cash > 0 ? fmt(r.cash) : "—"}
                          </td>
                          <td style={{ ...s.td, ...s.right, color: r.eft > 0 ? "#1e40af" : "#9ca3af" }}>
                            {r.eft > 0 ? fmt(r.eft) : "—"}
                          </td>
                          <td style={{ ...s.td, ...s.right, color: r.card > 0 ? "#7c3aed" : "#9ca3af" }}>
                            {r.card > 0 ? fmt(r.card) : "—"}
                          </td>
                          {bySpeciesRows.some(g => g.credit > 0) && (
                            <td style={{ ...s.td, ...s.right, color: r.credit > 0 ? "#854d0e" : "#9ca3af" }}>
                              {r.credit > 0 ? fmt(r.credit) : "—"}
                            </td>
                          )}
                          <td style={{ ...s.td, ...s.right, fontWeight: 700 }}>{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={s.footerRow}>
                        <td colSpan={3} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                        <td style={s.td} />
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#166534" }}>
                          {fmt(bySpeciesRows.reduce((s, r) => s + r.cash, 0))}
                        </td>
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#1e40af" }}>
                          {fmt(bySpeciesRows.reduce((s, r) => s + r.eft, 0))}
                        </td>
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#7c3aed" }}>
                          {fmt(bySpeciesRows.reduce((s, r) => s + r.card, 0))}
                        </td>
                        {bySpeciesRows.some(g => g.credit > 0) && (
                          <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#854d0e" }}>
                            {fmt(bySpeciesRows.reduce((s, r) => s + r.credit, 0))}
                          </td>
                        )}
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#166534" }}>
                          {fmt(bySpeciesRows.reduce((s, r) => s + r.total, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          )}

          {/* By Client / By Walk-in views */}
          {view !== "species" && (
            visible.length === 0 ? (
              <p style={s.muted}>No {view === "client" ? "client" : "walk-in"} sales in this period{speciesFilter ? " for the selected species" : ""}.</p>
            ) : (
              <>
                {/* Client summary */}
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
            )
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
    case "card":   return { background: "#ede9fe", color: "#7c3aed" };
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
  selectInput: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
    minWidth: 160,
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
