import { useEffect, useState, useMemo } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import { reportsApi } from "../api/reportsApi";
import type { SalesReportRow } from "../api/reportsApi";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to   = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1); // first of current month
  return { from: iso(from), to: iso(to) };
}

function fmt(n: number) {
  return "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

type SummaryRow = {
  speciesName: string;
  qty: number;
  unitPrice: number;
  cash: number;
  eft: number;
  card: number;
  credit: number;
  total: number;
};

export default function SalesSummaryReportPage() {
  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to,   setTo]   = useState(range.to);
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function load(f = from, t = to) {
    setLoading(true);
    setError("");
    try {
      const res = await reportsApi.getSalesReport(f || undefined, t || undefined);
      setRows(res.rows);
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const summaryRows = useMemo((): SummaryRow[] => {
    const map = new Map<string, SummaryRow>();
    rows.forEach(r => {
      const priceCents = Math.round(r.unitPrice * 100);
      const key = `${r.speciesId}|${priceCents}`;
      if (!map.has(key)) {
        map.set(key, {
          speciesName: r.speciesName,
          qty: 0,
          unitPrice: r.unitPrice,
          cash: 0, eft: 0, card: 0, credit: 0, total: 0,
        });
      }
      const g = map.get(key)!;
      g.qty   += r.qty;
      g.total += r.lineTotal;
      const pt = (r.paymentType || "").toLowerCase();
      if (pt === "split") {
        (r.splitPayments ?? []).forEach(sp => {
          const m = (sp.method || "").toLowerCase();
          if (m === "cash")       g.cash   += sp.amount;
          else if (m === "eft")   g.eft    += sp.amount;
          else if (m === "card")  g.card   += sp.amount;
        });
      } else if (pt === "cash")   g.cash   += r.lineTotal;
      else if (pt === "eft")      g.eft    += r.lineTotal;
      else if (pt === "card")     g.card   += r.lineTotal;
      else if (pt === "credit")   g.credit += r.lineTotal;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.speciesName.localeCompare(b.speciesName) || a.unitPrice - b.unitPrice
    );
  }, [rows]);

  function exportToExcel() {
    const headers = ["Species", "QTY", "Unit Price (incl VAT)", "Cash", "EFT", "Card", "Credit", "Total"];
    const dataRows = summaryRows.map(r => [
      r.speciesName,
      r.qty,
      r.unitPrice,
      r.cash,
      r.eft,
      r.card,
      r.credit,
      r.total,
    ]);
    const totalsRow = ["Total", totalQty, "", totalCash, totalEft, totalCard, totalCred, grandTotal];

    const ws = XLSX.utils.aoa_to_sheet([
      [`Sales Summary Report`],
      [`Period: ${from ? fmtDate(from) : "—"} — ${to ? fmtDate(to) : "—"}`],
      [],
      headers,
      ...dataRows,
      [],
      totalsRow,
    ]);

    // Column widths
    ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Summary");

    // Credit detail sheet
    const creditLines = rows
      .filter(r => (r.paymentType || "").toLowerCase() === "credit")
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || b.date.localeCompare(a.date));
    if (creditLines.length > 0) {
      const creditHeaders = ["Date", "Client", "Inv No", "Species", "QTY", "Unit Price (incl VAT)", "Total (incl VAT)"];
      const creditData = creditLines.map(r => [fmtDate(r.date), r.clientName, r.invoiceNumber, r.speciesName, r.qty, r.unitPrice, r.lineTotal]);
      const creditTotals = ["", "", "", "Total Credit", creditLines.reduce((s, r) => s + r.qty, 0), "", creditLines.reduce((s, r) => s + r.lineTotal, 0)];
      const ws2 = XLSX.utils.aoa_to_sheet([creditHeaders, ...creditData, [], creditTotals]);
      ws2["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Credit Detail");
    }

    const fileName = `sales-summary-${from || "all"}-to-${to || "all"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  const hasCredit = summaryRows.some(r => r.credit > 0);
  const totalQty  = summaryRows.reduce((s, r) => s + r.qty,    0);
  const totalCash = summaryRows.reduce((s, r) => s + r.cash,   0);
  const totalEft  = summaryRows.reduce((s, r) => s + r.eft,    0);
  const totalCard = summaryRows.reduce((s, r) => s + r.card,   0);
  const totalCred = summaryRows.reduce((s, r) => s + r.credit, 0);
  const grandTotal= summaryRows.reduce((s, r) => s + r.total,  0);

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Sales Summary Report</h2>

      {/* Filter bar */}
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.label}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.dateInput} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.label}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={s.dateInput} />
        </div>
        <button style={s.applyBtn} onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
        {summaryRows.length > 0 && (
          <button style={s.exportBtn} onClick={exportToExcel}>
            ↓ Export Excel
          </button>
        )}
      </div>

      {error   && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && !error && (
        <>
          {/* Date range banner */}
          <div style={s.banner}>
            <span style={s.bannerLabel}>Period</span>
            <strong>{from ? fmtDate(from) : "—"}</strong>
            {" — "}
            <strong>{to ? fmtDate(to) : "—"}</strong>
            <span style={s.bannerSep}>·</span>
            <strong>{totalQty.toLocaleString()}</strong>
            {" units sold"}
          </div>

          {/* KPI tiles */}
          <div style={s.kpiRow}>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>Total Qty</span>
              <span style={s.kpiValue}>{totalQty.toLocaleString()}</span>
            </div>
            <div style={{ ...s.kpi, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <span style={s.kpiLabel}>Cash</span>
              <span style={{ ...s.kpiValue, color: "#166534" }}>{fmt(totalCash)}</span>
            </div>
            <div style={{ ...s.kpi, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <span style={s.kpiLabel}>EFT</span>
              <span style={{ ...s.kpiValue, color: "#1e40af" }}>{fmt(totalEft)}</span>
            </div>
            <div style={{ ...s.kpi, background: "#f5f3ff", border: "1px solid #ddd6fe" }}>
              <span style={s.kpiLabel}>Card</span>
              <span style={{ ...s.kpiValue, color: "#7c3aed" }}>{fmt(totalCard)}</span>
            </div>
            {hasCredit && (
              <div style={{ ...s.kpi, background: "#fefce8", border: "1px solid #fde68a" }}>
                <span style={s.kpiLabel}>Credit</span>
                <span style={{ ...s.kpiValue, color: "#92400e" }}>{fmt(totalCred)}</span>
              </div>
            )}
            <div style={{ ...s.kpi, background: "#f0fdf4", border: "2px solid #166534" }}>
              <span style={s.kpiLabel}>Total Sales</span>
              <span style={{ ...s.kpiValue, color: "#166534" }}>{fmt(grandTotal)}</span>
            </div>
          </div>

          {/* Table */}
          {summaryRows.length === 0 ? (
            <p style={s.muted}>No sales in this period.</p>
          ) : (
            <div style={s.scrollWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Species</th>
                    <th style={{ ...s.th, ...s.right }}>QTY</th>
                    <th style={{ ...s.th, ...s.right }}>Unit Price</th>
                    <th style={{ ...s.th, ...s.right }}>Cash</th>
                    <th style={{ ...s.th, ...s.right }}>EFT</th>
                    <th style={{ ...s.th, ...s.right }}>Card</th>
                    {hasCredit && <th style={{ ...s.th, ...s.right }}>Credit</th>}
                    <th style={{ ...s.th, ...s.right }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r, i) => (
                    <tr key={i} style={i % 2 === 0 ? s.rowEven : s.rowOdd}>
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
                      {hasCredit && (
                        <td style={{ ...s.td, ...s.right, color: r.credit > 0 ? "#92400e" : "#9ca3af" }}>
                          {r.credit > 0 ? fmt(r.credit) : "—"}
                        </td>
                      )}
                      <td style={{ ...s.td, ...s.right, fontWeight: 700 }}>{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={s.footerRow}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Total</td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700 }}>{totalQty.toLocaleString()}</td>
                    <td style={s.td} />
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#166534" }}>{fmt(totalCash)}</td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#1e40af" }}>{fmt(totalEft)}</td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#7c3aed" }}>{fmt(totalCard)}</td>
                    {hasCredit && (
                      <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#92400e" }}>{fmt(totalCred)}</td>
                    )}
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#166534" }}>{fmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Credit Detail */}
          {hasCredit && (() => {
            // All credit rows, sorted date desc → client asc → invoiceNumber
            const creditLines = rows
              .filter(r => (r.paymentType || "").toLowerCase() === "credit")
              .sort((a, b) => a.clientName.localeCompare(b.clientName) || b.date.localeCompare(a.date) || a.invoiceNumber.localeCompare(b.invoiceNumber));

            // Group by client + date
            type CreditGroup = { date: string; client: string; lines: typeof creditLines };
            const groups: CreditGroup[] = [];
            for (const row of creditLines) {
              const last = groups[groups.length - 1];
              if (last && last.client === row.clientName && last.date === row.date) {
                last.lines.push(row);
              } else {
                groups.push({ date: row.date, client: row.clientName, lines: [row] });
              }
            }

            const creditTotal = creditLines.reduce((s, r) => s + r.lineTotal, 0);

            return (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
                  Credit Sales Detail
                </h3>
                <div style={s.scrollWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Client</th>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Inv No</th>
                        <th style={s.th}>Species</th>
                        <th style={{ ...s.th, ...s.right }}>QTY</th>
                        <th style={{ ...s.th, ...s.right }}>Unit Price (incl VAT)</th>
                        <th style={{ ...s.th, ...s.right }}>Total (incl VAT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, gi) =>
                        g.lines.map((row, li) => (
                          <tr key={`${gi}-${li}`} style={gi % 2 === 0 ? s.rowEven : s.rowOdd}>
                            {li === 0 && (
                              <>
                                <td style={{ ...s.td, fontWeight: 600, verticalAlign: "top" }} rowSpan={g.lines.length}>
                                  {g.client}
                                </td>
                                <td style={{ ...s.td, fontWeight: 600, verticalAlign: "top" }} rowSpan={g.lines.length}>
                                  {fmtDate(row.date)}
                                </td>
                              </>
                            )}
                            <td style={s.td}>{row.invoiceNumber}</td>
                            <td style={s.td}>{row.speciesName}</td>
                            <td style={{ ...s.td, ...s.right }}>{row.qty.toLocaleString()}</td>
                            <td style={{ ...s.td, ...s.right }}>{fmt(row.unitPrice)}</td>
                            <td style={{ ...s.td, ...s.right, fontWeight: 700 }}>{fmt(row.lineTotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={s.footerRow}>
                        <td colSpan={6} style={{ ...s.td, fontWeight: 700 }}>Total Credit</td>
                        <td style={{ ...s.td, ...s.right, fontWeight: 700, color: "#92400e" }}>{fmt(creditTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 16px", maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" },
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
  bannerSep: { color: "#9ca3af", margin: "0 2px" },

  kpiRow: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  kpi: {
    flex: "1 1 120px", background: "#f9fafb", border: "1px solid #e5e7eb",
    borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4,
  },
  kpiLabel: { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" },
  kpiValue: { fontSize: 20, fontWeight: 700, color: "#111827" },

  scrollWrap: { overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" },
  th: { padding: "10px 12px", background: "#f9fafb", color: "#374151", fontWeight: 700, textAlign: "left", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", color: "#111827", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  rowEven: { background: "#fff" },
  rowOdd:  { background: "#fafafa" },
  footerRow: { background: "#f0fdf4", borderTop: "2px solid #bbf7d0" },
  right: { textAlign: "right" },

  error: { color: "#dc2626", fontSize: 14 },
  muted: { color: "#9ca3af", fontSize: 14 },
};
