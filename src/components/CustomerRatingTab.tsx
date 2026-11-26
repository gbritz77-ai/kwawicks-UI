import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";

type OrderLine = { date: string; collectionRef: string; supplier: string; species: string; ordered: number; taken: number };
type CustomerRow = { clientId: string; name: string; orders: number; ordered: number; taken: number; lines: OrderLine[] };

const pctOf = (taken: number, ordered: number) => (ordered > 0 ? (taken / ordered) * 100 : 0);

function rating(rate: number): { stars: number; label: string; color: string; bg: string } {
  if (rate >= 98) return { stars: 5, label: "Excellent", color: "#166534", bg: "#dcfce7" };
  if (rate >= 95) return { stars: 4, label: "Good",      color: "#15803d", bg: "#f0fdf4" };
  if (rate >= 90) return { stars: 3, label: "Fair",      color: "#92400e", bg: "#fef9c3" };
  if (rate >= 80) return { stars: 2, label: "Poor",      color: "#c2410c", bg: "#ffedd5" };
  return                 { stars: 1, label: "Bad",       color: "#dc2626", bg: "#fef2f2" };
}

export default function CustomerRatingTab({ collections, from, to }: { collections: CollectionRequestDto[]; from: string; to: string }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);

  const rows = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const cr of collections) {
      const date = (cr.collectionDate || cr.updatedAt).slice(0, 10);
      if (from && date < from) continue;
      if (to && date > to) continue;
      for (const a of cr.deliveryAllocations ?? []) {
        if (a.clientId === "HUB" || a.deliveryOrderId === "HUB") continue;
        if (a.deliveryStatus !== "Delivered") continue;
        const row = map.get(a.clientId) ?? { clientId: a.clientId, name: a.clientName, orders: 0, ordered: 0, taken: 0, lines: [] };
        row.orders++;
        for (const l of a.lines) {
          row.ordered += l.qty;
          row.taken += l.deliveredQty;
          row.lines.push({
            date, collectionRef: `CR-${cr.collectionRequestId.split("-")[0].toUpperCase()}`,
            supplier: cr.supplierName, species: l.speciesName, ordered: l.qty, taken: l.deliveredQty,
          });
        }
        map.set(a.clientId, row);
      }
    }
    return [...map.values()]
      .map(r => ({ ...r, lines: r.lines.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => pctOf(a.taken, a.ordered) - pctOf(b.taken, b.ordered) || b.ordered - a.ordered);
  }, [collections, from, to]);

  const q = search.trim().toLowerCase();
  const searched = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  const counts = [5, 4, 3, 2, 1].map(st => searched.filter(r => rating(pctOf(r.taken, r.ordered)).stars === st).length);
  const visible = starFilter === null ? searched : searched.filter(r => rating(pctOf(r.taken, r.ordered)).stars === starFilter);

  const tot = visible.reduce((t, r) => ({ ordered: t.ordered + r.ordered, taken: t.taken + r.taken, orders: t.orders + r.orders }), { ordered: 0, taken: 0, orders: 0 });
  const totRate = pctOf(tot.taken, tot.ordered);

  function exportXlsx() {
    const data = visible.map(r => {
      const rate = pctOf(r.taken, r.ordered);
      return {
        Customer: r.name, Orders: r.orders, Ordered: r.ordered, Taken: r.taken,
        "Not Taken": r.ordered - r.taken, "Take Rate %": Number(rate.toFixed(2)),
        Rating: `${rating(rate).stars}★ ${rating(rate).label}`,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Rating");
    XLSX.writeFile(wb, `customer-rating-${from || "all"}-to-${to || "all"}.xlsx`);
  }

  return (
    <div>
      <div style={s.kpiRow}>
        <div style={{ ...s.kpi, background: "#166534", color: "#fff" }}>
          <div style={{ ...s.kpiLabel, color: "#bbf7d0" }}>Overall take rate</div>
          <div style={s.kpiValue}>{totRate.toFixed(2)}%</div>
        </div>
        <div style={s.kpi}><div style={s.kpiLabel}>Ordered (allocated)</div><div style={s.kpiValue}>{tot.ordered.toLocaleString()}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Taken (invoiced)</div><div style={s.kpiValue}>{tot.taken.toLocaleString()}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Not taken</div><div style={{ ...s.kpiValue, color: "#dc2626" }}>{(tot.ordered - tot.taken).toLocaleString()}</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {[5, 4, 3, 2, 1].map((st, i) => {
          const r = rating(st === 5 ? 100 : st === 4 ? 96 : st === 3 ? 91 : st === 2 ? 85 : 0);
          const active = starFilter === st;
          return (
            <button
              key={st}
              onClick={() => { setStarFilter(active ? null : st); setExpanded(null); }}
              title={active ? "Show all ratings" : `Show only ${r.label}`}
              style={{ ...s.badge, background: r.bg, color: r.color, cursor: "pointer",
                border: active ? `2px solid ${r.color}` : "2px solid transparent",
                opacity: starFilter !== null && !active ? 0.5 : 1 }}
            >
              {"★".repeat(st)} {r.label}: {counts[i]}
            </button>
          );
        })}
        {starFilter !== null && (
          <button style={{ ...s.badge, background: "#fff", color: "#475569", border: "1px solid #cbd5e1", cursor: "pointer" }} onClick={() => setStarFilter(null)}>
            ✕ Show all
          </button>
        )}
        <input style={s.search} placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={s.exportBtn} onClick={exportXlsx} disabled={visible.length === 0}>Export Excel</button>
      </div>

      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Collection allocations (ordered) vs quantity invoiced on the delivery (taken), for delivered orders with a collection date in the range. Hub allocations excluded.
        Rating: ★★★★★ ≥ 98% · ★★★★ ≥ 95% · ★★★ ≥ 90% · ★★ ≥ 80% · ★ below 80%. Click a customer for detail.
      </p>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Customer</th>
              <th style={{ ...s.th, textAlign: "right" }}>Orders</th>
              <th style={{ ...s.th, textAlign: "right" }}>Ordered</th>
              <th style={{ ...s.th, textAlign: "right" }}>Taken</th>
              <th style={{ ...s.th, textAlign: "right" }}>Not Taken</th>
              <th style={{ ...s.th, textAlign: "right" }}>Take Rate</th>
              <th style={s.th}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", color: "#94a3b8", padding: 24 }}>No delivered allocations in this period</td></tr>
            )}
            {visible.map(r => {
              const rate = pctOf(r.taken, r.ordered);
              const rt = rating(rate);
              const open = expanded === r.clientId;
              return [
                <tr key={r.clientId} style={{ cursor: "pointer", background: open ? "#f8fafc" : undefined }} onClick={() => setExpanded(open ? null : r.clientId)}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{open ? "▾" : "▸"} {r.name}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.orders}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.ordered.toLocaleString()}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.taken.toLocaleString()}</td>
                  <td style={{ ...s.td, textAlign: "right", color: r.ordered - r.taken > 0 ? "#dc2626" : undefined }}>{(r.ordered - r.taken).toLocaleString()}</td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: rt.color }}>{rate.toFixed(2)}%</td>
                  <td style={s.td}><span style={{ ...s.badge, background: rt.bg, color: rt.color }}>{"★".repeat(rt.stars)}{"☆".repeat(5 - rt.stars)} {rt.label}</span></td>
                </tr>,
                open && (
                  <tr key={`${r.clientId}-detail`}>
                    <td colSpan={7} style={{ padding: "4px 16px 14px", background: "#f8fafc" }}>
                      <table style={{ ...s.table, fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={s.thSm}>Date</th><th style={s.thSm}>Collection</th><th style={s.thSm}>Supplier</th><th style={s.thSm}>Species</th>
                            <th style={{ ...s.thSm, textAlign: "right" }}>Ordered</th><th style={{ ...s.thSm, textAlign: "right" }}>Taken</th><th style={{ ...s.thSm, textAlign: "right" }}>Take Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l, i) => (
                            <tr key={i}>
                              <td style={s.tdSm}>{new Date(l.date).toLocaleDateString("en-ZA")}</td>
                              <td style={{ ...s.tdSm, fontFamily: "monospace" }}>{l.collectionRef}</td>
                              <td style={s.tdSm}>{l.supplier}</td>
                              <td style={s.tdSm}>{l.species}</td>
                              <td style={{ ...s.tdSm, textAlign: "right" }}>{l.ordered.toLocaleString()}</td>
                              <td style={{ ...s.tdSm, textAlign: "right", color: l.taken < l.ordered ? "#dc2626" : undefined, fontWeight: 600 }}>{l.taken.toLocaleString()}</td>
                              <td style={{ ...s.tdSm, textAlign: "right" }}>{pctOf(l.taken, l.ordered).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ),
              ];
            })}
            {visible.length > 0 && (
              <tr style={{ background: "#f1f5f9" }}>
                <td style={{ ...s.td, fontWeight: 800 }}>Total</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{tot.orders}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{tot.ordered.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{tot.taken.toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{(tot.ordered - tot.taken).toLocaleString()}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: 800 }}>{totRate.toFixed(2)}%</td>
                <td style={s.td} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kpiRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  kpi: { flex: "1 1 180px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" },
  kpiLabel: { fontSize: 13, color: "#64748b", marginBottom: 6 },
  kpiValue: { fontSize: 24, fontWeight: 800 },
  badge: { fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" },
  search: { marginLeft: "auto", padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, minWidth: 200 },
  exportBtn: { padding: "7px 14px", borderRadius: 8, background: "#15803d", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 14px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "10px 14px", borderBottom: "1px solid #f1f5f9" },
  thSm: { textAlign: "left", padding: "6px 10px", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0" },
  tdSm: { padding: "6px 10px", borderBottom: "1px solid #f1f5f9" },
};
