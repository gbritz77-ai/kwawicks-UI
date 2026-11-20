import React, { useEffect, useMemo, useState } from "react";
import { pettyCashApi } from "../api/pettyCashApi";
import type { CashDepositDetailDto } from "../api/pettyCashApi";

const fmt = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); };

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ClientDepositsReport() {
  const [deposits, setDeposits] = useState<CashDepositDetailDto[] | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    pettyCashApi.getDepositDetails()
      .then(setDeposits)
      .catch(e => { setError(e?.message ?? "Failed to load deposits."); setDeposits([]); });
  }, []);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    (deposits ?? []).forEach(d => m.set(d.clientId, d.clientName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [deposits]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (deposits ?? [])
      .filter(d => {
        const day = d.date.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (clientId && d.clientId !== clientId) return false;
        if (q && ![d.clientName, d.reference, d.notes].some(v => (v ?? "").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [deposits, from, to, clientId, search]);

  const byClient = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number }>();
    rows.forEach(d => {
      const cur = m.get(d.clientId) ?? { name: d.clientName, count: 0, total: 0 };
      cur.count++; cur.total += d.amount;
      m.set(d.clientId, cur);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const total = rows.reduce((s, d) => s + d.amount, 0);

  function exportCsv() {
    const lines = [
      ["Date", "Client", "Reference", "Notes", "Amount"].join(","),
      ...rows.map(d => [d.date.slice(0, 10), d.clientName, d.reference, d.notes, d.amount.toFixed(2)].map(csvCell).join(",")),
      ["", "", "", "Total", total.toFixed(2)].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `client-deposits-${from || "all"}-to-${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (deposits === null) return <p style={{ color: "#94a3b8" }}>Loading deposits…</p>;

  return (
    <div>
      <div style={s.filters}>
        <label style={s.filterLabel}>From
          <input type="date" style={s.input} value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label style={s.filterLabel}>To
          <input type="date" style={s.input} value={to} onChange={e => setTo(e.target.value)} />
        </label>
        <select style={{ ...s.input, minWidth: 180 }} value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input style={{ ...s.input, minWidth: 180 }} placeholder="Search reference / notes" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={s.btnSecondary} onClick={() => { setFrom(""); setTo(""); setClientId(""); setSearch(""); }}>All time</button>
        <button style={{ ...s.btnPrimary, marginLeft: "auto" }} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
      </div>

      {error && <p style={{ color: "#ef4444" }}>{error}</p>}

      <div style={s.kpiRow}>
        <div style={s.kpi}><div style={s.kpiLabel}>Total cash deposits</div><div style={{ ...s.kpiValue, color: "#22c55e" }}>{fmt(total)}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Deposits</div><div style={s.kpiValue}>{rows.length}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Clients</div><div style={s.kpiValue}>{byClient.length}</div></div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>No cash client deposits in this period.</p>
      ) : (
        <>
          <h3 style={s.h3}>By client</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Client</th>
                <th style={{ ...s.th, textAlign: "right" }}>Deposits</th>
                <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              </tr></thead>
              <tbody>
                {byClient.map(c => (
                  <tr key={c.name}>
                    <td style={s.td}>{c.name}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{c.count}</td>
                    <td style={{ ...s.td, textAlign: "right", color: "#22c55e", fontWeight: 600 }}>{fmt(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={s.h3}>All deposits</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Client</th>
                <th style={s.th}>Reference</th>
                <th style={s.th}>Notes</th>
                <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
              </tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.entryId}>
                    <td style={s.td}>{new Date(d.date).toLocaleDateString("en-ZA")}</td>
                    <td style={s.td}>{d.clientName}</td>
                    <td style={s.td}>{d.reference || "—"}</td>
                    <td style={s.td}>{d.notes || "—"}</td>
                    <td style={{ ...s.td, textAlign: "right", color: "#22c55e", fontWeight: 600 }}>{fmt(d.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...s.td, fontWeight: 700 }} colSpan={4}>Total</td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 800, color: "#22c55e" }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  filters: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20, padding: "12px 16px", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 },
  filterLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#94a3b8" },
  input: { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9", padding: "6px 8px", fontSize: 13 },
  btnPrimary: { background: "#22c55e", color: "#0f172a", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnSecondary: { background: "transparent", color: "#cbd5e1", border: "1px solid #475569", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" },
  kpiRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
  kpi: { flex: "1 1 160px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "14px 16px" },
  kpiLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 6 },
  kpiValue: { fontSize: 22, fontWeight: 800, color: "#f1f5f9" },
  h3: { fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: "8px 0 10px" },
  tableWrap: { overflowX: "auto", marginBottom: 24, border: "1px solid #334155", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", background: "#1e293b", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #334155", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", color: "#e2e8f0", borderBottom: "1px solid #1e293b" },
};
