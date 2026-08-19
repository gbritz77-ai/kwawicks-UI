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

type AdjustmentLine = {
  date: string;
  type: "under" | "over" | "short";
  notes: string;
  qty: number;
};

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
  adjustmentLines: AdjustmentLine[];
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
  // Dates actually used for the last successful load — used in memos so
  // changing the date inputs without clicking Apply never corrupts results.
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo,   setAppliedTo]   = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setExpanded(new Set());
    const f = from;
    const t = to;
    try {
      const [sp, crList, lossList, salesData] = await Promise.all([
        speciesApi.list(),
        collectionRequestsApi.list(),
        stockLossApi.list(),
        reportsApi.getSalesReport(f || undefined, t || undefined),
      ]);
      setAllSpecies(sp.filter(s => s.isActive));
      setCrs(crList);
      setLosses(lossList);
      setSalesRows(salesData.rows);
      setAppliedFrom(f);
      setAppliedTo(t);
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

  type DriverSpeciesLine = { speciesName: string; deadQty: number; overQty: number; shortQty: number };
  type DriverRow = { driver: string; deadQty: number; overQty: number; shortQty: number; species: DriverSpeciesLine[] };
  const driverRows = useMemo((): DriverRow[] => {
    if (!loaded) return [];
    // driver → speciesId → line
    const map = new Map<string, Map<string, DriverSpeciesLine>>();
    for (const cr of crs) {
      if ((cr.supplierName || "").toLowerCase() === "hub") continue;
      const date = (cr.collectionDate ?? cr.createdAt).slice(0, 10);
      if (appliedFrom && date < appliedFrom) continue;
      if (appliedTo   && date > appliedTo)   continue;
      const driver = cr.assignedDriverName || "Unknown";
      for (const line of cr.lines) {
        if (!line.deadQty && !line.overQty && !line.shortQty) continue;
        if (!map.has(driver)) map.set(driver, new Map());
        const specMap = map.get(driver)!;
        if (!specMap.has(line.speciesId)) specMap.set(line.speciesId, { speciesName: line.speciesName, deadQty: 0, overQty: 0, shortQty: 0 });
        const g = specMap.get(line.speciesId)!;
        g.deadQty  += line.deadQty  ?? 0;
        g.overQty  += line.overQty  ?? 0;
        g.shortQty += line.shortQty ?? 0;
      }
    }
    return Array.from(map.entries())
      .map(([driver, specMap]) => {
        const species = Array.from(specMap.values()).sort((a, b) => a.speciesName.localeCompare(b.speciesName));
        return {
          driver,
          deadQty:  species.reduce((s, r) => s + r.deadQty,  0),
          overQty:  species.reduce((s, r) => s + r.overQty,  0),
          shortQty: species.reduce((s, r) => s + r.shortQty, 0),
          species,
        };
      })
      .sort((a, b) => a.driver.localeCompare(b.driver));
  }, [loaded, crs, appliedFrom, appliedTo]);

  const reportRows = useMemo((): ReportRow[] => {
    if (!loaded) return [];

    const loaded_qty:  Record<string, number> = {};
    const sold_qty:    Record<string, number> = {};
    const deaths_qty:  Record<string, number> = {};
    const surplus_qty: Record<string, number> = {};
    const short_qty:   Record<string, number> = {};
    const salesBySpecies:      Record<string, SalesReportRow[]>  = {};
    const adjustBySpecies:     Record<string, AdjustmentLine[]>  = {};

    for (const cr of crs) {
      if ((cr.supplierName || "").toLowerCase() === "hub") continue;
      const date = (cr.collectionDate ?? cr.createdAt).slice(0, 10);
      if (appliedFrom && date < appliedFrom) continue;
      if (appliedTo   && date > appliedTo)   continue;
      const driver = cr.assignedDriverName || cr.supplierName || "—";
      for (const line of cr.lines) {
        if (line.loadedQty > 0)
          loaded_qty[line.speciesId] = (loaded_qty[line.speciesId] ?? 0) + line.loadedQty;
        if (line.deadQty > 0) {
          deaths_qty[line.speciesId] = (deaths_qty[line.speciesId] ?? 0) + line.deadQty;
          (adjustBySpecies[line.speciesId] ??= []).push({ date, type: "under", notes: driver, qty: line.deadQty });
        }
        if (line.shortQty > 0) {
          short_qty[line.speciesId] = (short_qty[line.speciesId] ?? 0) + line.shortQty;
          (adjustBySpecies[line.speciesId] ??= []).push({ date, type: "short", notes: driver, qty: line.shortQty });
        }
        if (line.overQty > 0) {
          surplus_qty[line.speciesId] = (surplus_qty[line.speciesId] ?? 0) + line.overQty;
          (adjustBySpecies[line.speciesId] ??= []).push({ date, type: "over", notes: driver, qty: line.overQty });
        }
      }
    }

    for (const r of salesRows) {
      sold_qty[r.speciesId] = (sold_qty[r.speciesId] ?? 0) + r.qty;
      (salesBySpecies[r.speciesId] ??= []).push(r);
    }

    for (const l of losses) {
      const date = l.createdAt.slice(0, 10);
      if (appliedFrom && date < appliedFrom) continue;
      if (appliedTo   && date > appliedTo)   continue;
      const t = (l.adjustmentType || "").toLowerCase();
      if      (t === "under") { deaths_qty[l.speciesId]  = (deaths_qty[l.speciesId]  ?? 0) + l.qty; (adjustBySpecies[l.speciesId] ??= []).push({ date, type: "under", notes: l.notes || "—", qty: l.qty }); }
      else if (t === "over")  { surplus_qty[l.speciesId] = (surplus_qty[l.speciesId] ?? 0) + l.qty; (adjustBySpecies[l.speciesId] ??= []).push({ date, type: "over",  notes: l.notes || "—", qty: l.qty }); }
      else if (t === "short") { short_qty[l.speciesId]   = (short_qty[l.speciesId]   ?? 0) + l.qty; (adjustBySpecies[l.speciesId] ??= []).push({ date, type: "short", notes: l.notes || "—", qty: l.qty }); }
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
          speciesId:       sp.speciesId,
          speciesName:     sp.name,
          openingStock:    opening,
          loaded:          load,
          sold:            sold,
          deaths:          deaths,
          surplus:         surp,
          short:           srt,
          closingStock:    sp.qtyOnHandHub,
          salesLines:      (salesBySpecies[sp.speciesId] ?? []).sort((a, b) => a.date.localeCompare(b.date)),
          adjustmentLines: (adjustBySpecies[sp.speciesId] ?? []).sort((a, b) => a.date.localeCompare(b.date)),
        };
      })
      .sort((a, b) => a.speciesName.localeCompare(b.speciesName));
  }, [loaded, allSpecies, crs, losses, salesRows, appliedFrom, appliedTo, speciesFilter]);

  function exportToExcel() {
    const openingDate = appliedFrom ? iso(new Date(new Date(appliedFrom).getTime() - 86400000)) : "prior";
    const headers = ["Species", `Opening Stock (${openingDate})`, "Total Loaded", "Total Sold", "Deaths", "Surplus", "Short", `Closing Stock (${appliedTo || "today"})`];
    const data = reportRows.map(r => [r.speciesName, r.openingStock, r.loaded, r.sold, r.deaths, r.surplus, r.short, r.closingStock]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["Stock Movement Report"],
      [`Period: ${appliedFrom ? fmtDate(appliedFrom) : "—"} — ${appliedTo ? fmtDate(appliedTo) : "—"}`],
      [`Opening stock as at: ${appliedFrom ? fmtDate(iso(new Date(new Date(appliedFrom).getTime() - 86400000))) : "—"}`],
      [],
      headers,
      ...data,
    ]);
    ws["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Movement");
    XLSX.writeFile(wb, `stock-movement-${appliedFrom || "all"}-to-${appliedTo || "all"}.xlsx`);
  }

  const openingLabel = appliedFrom
    ? `Opening Stock (${fmtDate(iso(new Date(new Date(appliedFrom).getTime() - 86400000)))})`
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
            <strong>{appliedFrom ? fmtDate(appliedFrom) : "—"}</strong>{" — "}<strong>{appliedTo ? fmtDate(appliedTo) : "—"}</strong>
            <span style={s.bannerSep}>·</span>
            Opening stock as at <strong>{appliedFrom ? fmtDate(iso(new Date(new Date(appliedFrom).getTime() - 86400000))) : "—"}</strong>
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
                              {r.adjustmentLines.length > 0 && (
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
                                      {r.adjustmentLines.map((ll, li) => {
                                        const typeColor = ll.type === "under" ? "#dc2626" : ll.type === "over" ? "#16a34a" : "#d97706";
                                        const typeLabel = ll.type === "under" ? "Dead/Loss" : ll.type === "over" ? "Surplus" : "Short";
                                        return (
                                          <tr key={li} style={li % 2 === 0 ? s.subRowEven : s.subRowOdd}>
                                            <td style={s.subTd}>{fmtDate(ll.date)}</td>
                                            <td style={{ ...s.subTd, color: typeColor, fontWeight: 600 }}>{typeLabel}</td>
                                            <td style={s.subTd}>{ll.notes}</td>
                                            <td style={{ ...s.subTd, ...s.right, fontWeight: 600, color: typeColor }}>{ll.qty.toLocaleString()}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {r.salesLines.length === 0 && r.adjustmentLines.length === 0 && (
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

          {/* Driver breakdown */}
          {driverRows.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
                Driver Adjustment Summary
              </h3>
              <div style={s.scrollWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Driver</th>
                      <th style={s.th}>Species</th>
                      <th style={{ ...s.th, ...s.right, color: "#dc2626" }}>Dead QTY</th>
                      <th style={{ ...s.th, ...s.right, color: "#16a34a" }}>Over QTY</th>
                      <th style={{ ...s.th, ...s.right, color: "#d97706" }}>Short QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverRows.map((r, di) => (
                      r.species.map((sp, si) => (
                        <tr key={`${di}-${si}`} style={di % 2 === 0 ? s.rowEven : s.rowOdd}>
                          {si === 0 && (
                            <td style={{ ...s.td, fontWeight: 700, verticalAlign: "top" }} rowSpan={r.species.length}>
                              {r.driver}
                            </td>
                          )}
                          <td style={{ ...s.td, color: "#374151" }}>{sp.speciesName}</td>
                          <td style={{ ...s.td, ...s.right, color: sp.deadQty  > 0 ? "#dc2626" : "#9ca3af" }}>
                            {sp.deadQty  > 0 ? `−${sp.deadQty.toLocaleString()}`  : "—"}
                          </td>
                          <td style={{ ...s.td, ...s.right, color: sp.overQty  > 0 ? "#16a34a" : "#9ca3af" }}>
                            {sp.overQty  > 0 ? `+${sp.overQty.toLocaleString()}`  : "—"}
                          </td>
                          <td style={{ ...s.td, ...s.right, color: sp.shortQty > 0 ? "#d97706" : "#9ca3af" }}>
                            {sp.shortQty > 0 ? `−${sp.shortQty.toLocaleString()}` : "—"}
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                      <td colSpan={2} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                      <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#dc2626" }}>
                        {driverRows.reduce((s, r) => s + r.deadQty,  0) > 0
                          ? `−${driverRows.reduce((s, r) => s + r.deadQty,  0).toLocaleString()}` : "—"}
                      </td>
                      <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#16a34a" }}>
                        {driverRows.reduce((s, r) => s + r.overQty,  0) > 0
                          ? `+${driverRows.reduce((s, r) => s + r.overQty,  0).toLocaleString()}` : "—"}
                      </td>
                      <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#d97706" }}>
                        {driverRows.reduce((s, r) => s + r.shortQty, 0) > 0
                          ? `−${driverRows.reduce((s, r) => s + r.shortQty, 0).toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


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
