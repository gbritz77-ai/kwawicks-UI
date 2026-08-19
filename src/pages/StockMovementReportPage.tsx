import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";
import { stockLossApi } from "../api/stockLossApi";
import type { StockLossDto } from "../api/stockLossApi";
import { reportsApi } from "../api/reportsApi";
import type { SalesReportRow } from "../api/reportsApi";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function defaultRange() {
  const to   = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: iso(from), to: iso(to) };
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

type ReportRow = {
  speciesId: string;
  speciesName: string;
  openingStock: number;
  loaded: number;
  sold: number;
  deaths: number;
  surplus: number;
  short: number;
  closingStock: number;
  salesLines: SalesReportRow[];
  lossLines: StockLossDto[];
};

export default function StockMovementReportPage() {
  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to,   setTo]   = useState(range.to);
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [allSpecies, setAllSpecies] = useState<SpeciesResponse[]>([]);
  const [crs,        setCrs]        = useState<CollectionRequestDto[]>([]);
  const [losses,     setLosses]     = useState<StockLossDto[]>([]);
  const [salesRows,  setSalesRows]  = useState<SalesReportRow[]>([]);
  const [loaded,     setLoaded]     = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    setExpanded(new Set());
    try {
      const [sp, crList, lossList, salesData] = await Promise.all([
        speciesApi.list(),
        collectionRequestsApi.list(),
        stockLossApi.list(),
        reportsApi.getSalesReport(from || undefined, to || undefined),
      ]);
      setAllSpecies(sp.filter(s => s.isActive));
      setCrs(crList);
      setLosses(lossList);
      setSalesRows(salesData.rows);
      setLoaded(true);
    } catch {
      setError("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const speciesOptions = useMemo(() =>
    [...allSpecies].sort((a, b) => a.name.localeCompare(b.name)),
  [allSpecies]);

  const reportRows = useMemo((): ReportRow[] => {
    if (!loaded) return [];

    const loaded_qty:  Record<string, number> = {};
    const sold_qty:    Record<string, number> = {};
    const deaths_qty:  Record<string, number> = {};
    const surplus_qty: Record<string, number> = {};
    const short_qty:   Record<string, number> = {};
    const salesBySpecies:  Record<string, SalesReportRow[]> = {};
    const lossesBySpecies: Record<string, StockLossDto[]>   = {};

    for (const cr of crs) {
      if ((cr.supplierName || "").toLowerCase() === "hub") continue;
      const date = (cr.collectionDate ?? cr.createdAt).slice(0, 10);
      if (from && date < from) continue;
      if (to   && date > to)   continue;
      for (const line of cr.lines) {
        if (line.loadedQty > 0)
          loaded_qty[line.speciesId] = (loaded_qty[line.speciesId] ?? 0) + line.loadedQty;
        // Deaths/short/over recorded during hub confirmation live on the CR line
        if (line.deadQty  > 0) deaths_qty[line.speciesId]  = (deaths_qty[line.speciesId]  ?? 0) + line.deadQty;
        if (line.shortQty > 0) short_qty[line.speciesId]   = (short_qty[line.speciesId]   ?? 0) + line.shortQty;
        if (line.overQty  > 0) surplus_qty[line.speciesId] = (surplus_qty[line.speciesId] ?? 0) + line.overQty;
      }
    }

    for (const r of salesRows) {
      sold_qty[r.speciesId] = (sold_qty[r.speciesId] ?? 0) + r.qty;
      (salesBySpecies[r.speciesId] ??= []).push(r);
    }

    for (const l of losses) {
      const date = l.createdAt.slice(0, 10);
      if (from && date < from) continue;
      if (to   && date > to)   continue;
      const t = (l.adjustmentType || "").toLowerCase();
      if      (t === "under") deaths_qty[l.speciesId]  = (deaths_qty[l.speciesId]  ?? 0) + l.qty;
      else if (t === "over")  surplus_qty[l.speciesId] = (surplus_qty[l.speciesId] ?? 0) + l.qty;
      else if (t === "short") short_qty[l.speciesId]   = (short_qty[l.speciesId]   ?? 0) + l.qty;
      (lossesBySpecies[l.speciesId] ??= []).push(l);
    }

    return allSpecies
      .filter(sp => !speciesFilter || sp.speciesId === speciesFilter)
      .map(sp => {
        const load   = loaded_qty[sp.speciesId]  ?? 0;
        const sold   = sold_qty[sp.speciesId]    ?? 0;
        const deaths = deaths_qty[sp.speciesId]  ?? 0;
        const surp   = surplus_qty[sp.speciesId] ?? 0;
        const srt    = short_qty[sp.speciesId]   ?? 0;
        const opening = sp.qtyOnHandHub - load + sold + deaths + srt - surp;
        return {
          speciesId:    sp.speciesId,
          speciesName:  sp.name,
          openingStock: opening,
          loaded:       load,
          sold:         sold,
          deaths:       deaths,
          surplus:      surp,
          short:        srt,
          closingStock: sp.qtyOnHandHub,
          salesLines:   (salesBySpecies[sp.speciesId] ?? []).sort((a, b) => a.date.localeCompare(b.date)),
          lossLines:    (lossesBySpecies[sp.speciesId] ?? [])
                          .filter(l => { const d = l.createdAt.slice(0, 10); return (!from || d >= from) && (!to || d <= to); })
                          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        };
      })
      .sort((a, b) => a.speciesName.localeCompare(b.speciesName));
  }, [loaded, allSpecies, crs, losses, salesRows, from, to, speciesFilter]);

  function exportToExcel() {
    const openingDate = from ? iso(new Date(new Date(from).getTime() - 86400000)) : "prior";
    const headers = ["Species", `Opening Stock (${openingDate})`, "Total Loaded", "Total Sold", "Deaths", "Surplus", "Short", `Closing Stock (${to || "today"})`];
    const data = reportRows.map(r => [r.speciesName, r.openingStock, r.loaded, r.sold, r.deaths, r.surplus, r.short, r.closingStock]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["Stock Movement Report"],
      [`Period: ${from ? fmtDate(from) : "—"} — ${to ? fmtDate(to) : "—"}`],
      [`Opening stock as at: ${from ? fmtDate(iso(new Date(new Date(from).getTime() - 86400000))) : "—"}`],
      [],
      headers,
      ...data,
    ]);
    ws["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Movement");
    XLSX.writeFile(wb, `stock-movement-${from || "all"}-to-${to || "all"}.xlsx`);
  }

  const openingLabel = from
    ? `Opening Stock (${fmtDate(iso(new Date(new Date(from).getTime() - 86400000)))})`
    : "Opening Stock";

  const COL_COUNT = 8;

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Stock Movement Report</h2>

      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.label}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.dateInput} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.label}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={s.dateInput} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.label}>Species</label>
          <select value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value)} style={s.dateInput}>
            <option value="">All Species</option>
            {speciesOptions.map(sp => (
              <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>
            ))}
          </select>
        </div>
        <button style={s.applyBtn} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
        {reportRows.length > 0 && (
          <button style={s.exportBtn} onClick={exportToExcel}>↓ Export Excel</button>
        )}
      </div>

      {error   && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading…</p>}
      {!loading && !error && !loaded && <p style={s.muted}>Select a date range and click Apply.</p>}

      {!loading && loaded && (
        <>
          <div style={s.banner}>
            <span style={s.bannerLabel}>Period</span>
            <strong>{from ? fmtDate(from) : "—"}</strong>{" — "}<strong>{to ? fmtDate(to) : "—"}</strong>
            <span style={s.bannerSep}>·</span>
            Opening stock as at <strong>{from ? fmtDate(iso(new Date(new Date(from).getTime() - 86400000))) : "—"}</strong>
          </div>

          {reportRows.length === 0 ? (
            <p style={s.muted}>No active species found.</p>
          ) : (
            <div style={s.scrollWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: 28 }} />
                    <th style={s.th}>Species</th>
                    <th style={{ ...s.th, ...s.right }}>{openingLabel}</th>
                    <th style={{ ...s.th, ...s.right }}>Total Loaded</th>
                    <th style={{ ...s.th, ...s.right }}>Total Sold</th>
                    <th style={{ ...s.th, ...s.right, color: "#dc2626" }}>Deaths</th>
                    <th style={{ ...s.th, ...s.right, color: "#16a34a" }}>Surplus</th>
                    <th style={{ ...s.th, ...s.right, color: "#d97706" }}>Short</th>
                    <th style={{ ...s.th, ...s.right }}>Closing Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((r, i) => {
                    const isOpen = expanded.has(r.speciesId);
                    const rowBg = i % 2 === 0 ? s.rowEven : s.rowOdd;
                    return [
                      // Summary row
                      <tr key={r.speciesId} style={{ ...rowBg, cursor: "pointer" }} onClick={() => toggleExpand(r.speciesId)}>
                        <td style={{ ...s.td, textAlign: "center", color: "#6b7280", fontSize: 11 }}>
                          {isOpen ? "▾" : "▸"}
                        </td>
                        <td style={{ ...s.td, fontWeight: 600 }}>{r.speciesName}</td>
                        <td style={{ ...s.td, ...s.right }}>{r.openingStock.toLocaleString()}</td>
                        <td style={{ ...s.td, ...s.right, color: "#1e40af" }}>
                          {r.loaded > 0 ? `+${r.loaded.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ ...s.td, ...s.right, color: r.sold > 0 ? "#374151" : "#9ca3af" }}>
                          {r.sold > 0 ? r.sold.toLocaleString() : "—"}
                        </td>
                        <td style={{ ...s.td, ...s.right, color: r.deaths > 0 ? "#dc2626" : "#9ca3af" }}>
                          {r.deaths > 0 ? `−${r.deaths.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ ...s.td, ...s.right, color: r.surplus > 0 ? "#16a34a" : "#9ca3af" }}>
                          {r.surplus > 0 ? `+${r.surplus.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ ...s.td, ...s.right, color: r.short > 0 ? "#d97706" : "#9ca3af" }}>
                          {r.short > 0 ? `−${r.short.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: r.closingStock < 0 ? "#dc2626" : "#111827" }}>
                          {r.closingStock.toLocaleString()}
                        </td>
                      </tr>,

                      // Expanded detail
                      isOpen && (
                        <tr key={`${r.speciesId}-detail`}>
                          <td colSpan={COL_COUNT + 1} style={{ padding: 0, background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                            <div style={s.detailWrap}>

                              {/* Sales detail */}
                              {r.salesLines.length > 0 && (
                                <div style={s.detailSection}>
                                  <div style={s.detailTitle}>Sales Entries — {r.speciesName}</div>
                                  <table style={s.subTable}>
                                    <thead>
                                      <tr>
                                        <th style={s.subTh}>Date</th>
                                        <th style={s.subTh}>Client</th>
                                        <th style={s.subTh}>Invoice</th>
                                        <th style={s.subTh}>Sale Type</th>
                                        <th style={s.subTh}>Payment</th>
                                        <th style={{ ...s.subTh, ...s.right }}>QTY</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.salesLines.map((sl, si) => (
                                        <tr key={si} style={si % 2 === 0 ? s.subRowEven : s.subRowOdd}>
                                          <td style={s.subTd}>{fmtDate(sl.date)}</td>
                                          <td style={s.subTd}>{sl.clientName || "—"}</td>
                                          <td style={s.subTd}>{sl.invoiceNumber}</td>
                                          <td style={s.subTd}>{sl.saleType || "—"}</td>
                                          <td style={s.subTd}>{sl.paymentType || "—"}</td>
                                          <td style={{ ...s.subTd, ...s.right, fontWeight: 600 }}>{sl.qty.toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr style={{ background: "#e0f2fe" }}>
                                        <td colSpan={5} style={{ ...s.subTd, fontWeight: 700 }}>Total Sold</td>
                                        <td style={{ ...s.subTd, ...s.right, fontWeight: 700 }}>{r.sold.toLocaleString()}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}

                              {/* Adjustments detail */}
                              {r.lossLines.length > 0 && (
                                <div style={s.detailSection}>
                                  <div style={s.detailTitle}>Adjustments — {r.speciesName}</div>
                                  <table style={s.subTable}>
                                    <thead>
                                      <tr>
                                        <th style={s.subTh}>Date</th>
                                        <th style={s.subTh}>Type</th>
                                        <th style={s.subTh}>Driver / Notes</th>
                                        <th style={{ ...s.subTh, ...s.right }}>QTY</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.lossLines.map((ll, li) => {
                                        const t = (ll.adjustmentType || "").toLowerCase();
                                        const typeColor = t === "under" ? "#dc2626" : t === "over" ? "#16a34a" : "#d97706";
                                        const typeLabel = t === "under" ? "Dead/Loss" : t === "over" ? "Surplus" : "Short";
                                        return (
                                          <tr key={li} style={li % 2 === 0 ? s.subRowEven : s.subRowOdd}>
                                            <td style={s.subTd}>{fmtDate(ll.createdAt.slice(0, 10))}</td>
                                            <td style={{ ...s.subTd, color: typeColor, fontWeight: 600 }}>{typeLabel}</td>
                                            <td style={s.subTd}>{ll.notes || "—"}</td>
                                            <td style={{ ...s.subTd, ...s.right, fontWeight: 600, color: typeColor }}>{ll.qty.toLocaleString()}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>

                                  {/* Driver / notes count summary */}
                                  <DriverCountSummary lossLines={r.lossLines} />
                                </div>
                              )}

                              {r.salesLines.length === 0 && r.lossLines.length === 0 && (
                                <p style={{ margin: "12px 16px", color: "#9ca3af", fontSize: 13 }}>No detail entries for this period.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Summarises loss entries by notes (driver name) per adjustment type
function DriverCountSummary({ lossLines }: { lossLines: StockLossDto[] }) {
  // Group by notes → { under, over, short } counts and qty
  type DriverRow = { name: string; dead: number; deadQty: number; over: number; overQty: number; short: number; shortQty: number };
  const map = new Map<string, DriverRow>();
  for (const l of lossLines) {
    const key = (l.notes || "—").trim();
    if (!map.has(key)) map.set(key, { name: key, dead: 0, deadQty: 0, over: 0, overQty: 0, short: 0, shortQty: 0 });
    const g = map.get(key)!;
    const t = (l.adjustmentType || "").toLowerCase();
    if      (t === "under") { g.dead++;  g.deadQty  += l.qty; }
    else if (t === "over")  { g.over++;  g.overQty  += l.qty; }
    else if (t === "short") { g.short++; g.shortQty += l.qty; }
  }
  const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 0 4px 0" }}>
        Driver / Notes Count
      </div>
      <table style={{ ...dS.table, width: "auto", minWidth: 360 }}>
        <thead>
          <tr>
            <th style={dS.th}>Driver / Notes</th>
            <th style={{ ...dS.th, ...dS.right, color: "#dc2626" }}>Dead (entries)</th>
            <th style={{ ...dS.th, ...dS.right, color: "#dc2626" }}>Dead QTY</th>
            <th style={{ ...dS.th, ...dS.right, color: "#16a34a" }}>Over (entries)</th>
            <th style={{ ...dS.th, ...dS.right, color: "#16a34a" }}>Over QTY</th>
            <th style={{ ...dS.th, ...dS.right, color: "#d97706" }}>Short (entries)</th>
            <th style={{ ...dS.th, ...dS.right, color: "#d97706" }}>Short QTY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={i % 2 === 0 ? { background: "#fff" } : { background: "#f9fafb" }}>
              <td style={dS.td}>{r.name}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.dead > 0 ? "#dc2626" : "#9ca3af" }}>{r.dead > 0 ? r.dead : "—"}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.dead > 0 ? "#dc2626" : "#9ca3af" }}>{r.deadQty > 0 ? r.deadQty : "—"}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.over > 0 ? "#16a34a" : "#9ca3af" }}>{r.over > 0 ? r.over : "—"}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.over > 0 ? "#16a34a" : "#9ca3af" }}>{r.overQty > 0 ? r.overQty : "—"}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.short > 0 ? "#d97706" : "#9ca3af" }}>{r.short > 0 ? r.short : "—"}</td>
              <td style={{ ...dS.td, ...dS.right, color: r.short > 0 ? "#d97706" : "#9ca3af" }}>{r.shortQty > 0 ? r.shortQty : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dS: Record<string, CSSProperties> = {
  table: { borderCollapse: "collapse", fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6 },
  th: { padding: "7px 10px", background: "#f3f4f6", color: "#374151", fontWeight: 700, textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" },
  td: { padding: "6px 10px", color: "#111827", borderBottom: "1px solid #f3f4f6" },
  right: { textAlign: "right" },
};

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 16px", maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" },
  heading: { fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 20 },

  filterRow: {
    display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12,
    marginBottom: 20, background: "#f9fafb", border: "1px solid #e5e7eb",
    borderRadius: 10, padding: "14px 16px",
  },
  filterGroup: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" },
  dateInput: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 14, color: "#111827", background: "#fff" },
  applyBtn:  { padding: "8px 20px", fontSize: 14, fontWeight: 700, background: "#166534", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", alignSelf: "flex-end" },
  exportBtn: { padding: "8px 20px", fontSize: 14, fontWeight: 700, background: "#fff", color: "#166534", border: "2px solid #166534", borderRadius: 8, cursor: "pointer", alignSelf: "flex-end" },

  banner: {
    background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
    padding: "10px 16px", fontSize: 14, color: "#374151", marginBottom: 16,
    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
  },
  bannerLabel: { fontWeight: 700, color: "#166534", marginRight: 4 },
  bannerSep:   { color: "#9ca3af", margin: "0 4px" },

  scrollWrap: { overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" },
  th: { padding: "10px 12px", background: "#f9fafb", color: "#374151", fontWeight: 700, textAlign: "left", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", color: "#111827", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  rowEven: { background: "#fff" },
  rowOdd:  { background: "#fafafa" },
  right: { textAlign: "right" },

  detailWrap: { padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 20 },
  detailSection: { display: "flex", flexDirection: "column", gap: 6 },
  detailTitle: { fontSize: 13, fontWeight: 700, color: "#1e40af", marginBottom: 4 },

  subTable: { width: "100%", borderCollapse: "collapse", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" },
  subTh: { padding: "7px 10px", background: "#f3f4f6", color: "#374151", fontWeight: 700, textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" },
  subTd: { padding: "6px 10px", color: "#111827", borderBottom: "1px solid #f3f4f6" },
  subRowEven: { background: "#fff" },
  subRowOdd:  { background: "#f9fafb" },

  error: { color: "#dc2626", fontSize: 14 },
  muted: { color: "#9ca3af", fontSize: 14 },
};
