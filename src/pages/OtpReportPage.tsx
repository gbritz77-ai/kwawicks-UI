import React, { useEffect, useState } from "react";
import { otpApi } from "../api/otpApi";
import type { OtpRecordDto } from "../api/otpApi";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";

const fmt2 = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDt = (s?: string) =>
  s ? new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  Pending:   { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" },
  Confirmed: { background: "#dcfce7", color: "#14532d", border: "1px solid #86efac" },
  Bypassed:  { background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" },
  Expired:   { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{ ...STATUS_STYLE[status] ?? STATUS_STYLE.Expired, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
      {status}
    </span>
  );
}

export default function OtpReportPage() {
  const [records, setRecords] = useState<OtpRecordDto[]>([]);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const [filterClient, setFilterClient] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo]     = useState(today());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    clientsApi.list(500).then(setClients).catch(() => {});
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await otpApi.report({
        clientId: filterClient || undefined,
        from: from || undefined,
        to: to ? new Date(to + "T23:59:59Z").toISOString() : undefined,
      });
      setRecords(data);
    } catch {
      setError("Failed to load OTP report.");
    } finally {
      setLoading(false);
    }
  }

  // Per-client summary
  const byClient = React.useMemo(() => {
    const map = new Map<string, { name: string; total: number; confirmed: number; bypassed: number; expired: number; pending: number }>();
    for (const r of records) {
      const existing = map.get(r.clientId) ?? { name: r.clientName, total: 0, confirmed: 0, bypassed: 0, expired: 0, pending: 0 };
      existing.total++;
      if (r.status === "Confirmed") existing.confirmed++;
      else if (r.status === "Bypassed") existing.bypassed++;
      else if (r.status === "Expired")  existing.expired++;
      else existing.pending++;
      map.set(r.clientId, existing);
    }
    return [...map.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [records]);

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>OTP Confirmation Audit</h2>
      <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
        Full history of sale OTP confirmations, bypasses and expirations per client.
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
        <div style={s.field}>
          <label style={s.label}>Client</label>
          <select style={s.select} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.filter(c => !c.isWalkIn).map(c => (
              <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
            ))}
          </select>
        </div>
        <div style={s.field}>
          <label style={s.label}>From</label>
          <input style={s.input} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div style={s.field}>
          <label style={s.label}>To</label>
          <input style={s.input} type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button style={s.loadBtn} onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
      </div>

      {error && <div style={{ color: "#ef4444", marginBottom: 16 }}>{error}</div>}

      {/* Summary cards */}
      {byClient.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          {byClient.map(([clientId, stat]) => (
            <div key={clientId} style={s.summaryCard}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginBottom: 6 }}>{stat.name}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...s.statPill, background: "#dcfce7", color: "#14532d" }}>✓ {stat.confirmed} confirmed</span>
                {stat.bypassed > 0 && <span style={{ ...s.statPill, background: "#fff7ed", color: "#9a3412" }}>⚠ {stat.bypassed} bypassed</span>}
                {stat.expired  > 0 && <span style={{ ...s.statPill, background: "#f1f5f9", color: "#64748b" }}>⏱ {stat.expired} expired</span>}
                {stat.pending  > 0 && <span style={{ ...s.statPill, background: "#fef3c7", color: "#92400e" }}>⏳ {stat.pending} pending</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail table */}
      {records.length === 0 && !loading && (
        <div style={s.empty}>No OTP records found for the selected filters.</div>
      )}

      {records.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Sent</th>
                <th style={s.th}>Client</th>
                <th style={s.th}>Invoice</th>
                <th style={{ ...s.th, textAlign: "right" }}>Total</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Confirmed / Bypassed At</th>
                <th style={s.th}>By</th>
                <th style={s.th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <React.Fragment key={r.otpId}>
                  <tr>
                    <td style={s.td}>{fmtDt(r.sentAt)}</td>
                    <td style={s.td}>
                      <strong>{r.clientName}</strong>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.clientPhone}</div>
                    </td>
                    <td style={s.td}>{r.invoiceNumber || r.invoiceId.slice(0, 8) + "…"}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{fmt2(r.invoiceTotal)}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, color: "#475569" }}>
                        {r.referenceType === "HubSale" ? "🏪 Hub" : "🚚 Driver"}
                      </span>
                    </td>
                    <td style={s.td}><StatusBadge status={r.status} /></td>
                    <td style={s.td}>{fmtDt(r.confirmedAt)}</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#64748b" }}>{r.confirmedByUserId ?? "—"}</td>
                    <td style={s.td}>
                      {r.bypassReason && (
                        <button style={s.detailBtn} onClick={() => setExpanded(e => e === r.otpId ? null : r.otpId)}>
                          {expanded === r.otpId ? "Hide" : "Bypass info"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === r.otpId && r.bypassReason && (
                    <tr>
                      <td colSpan={9} style={{ ...s.td, background: "#fff7ed", fontSize: 13 }}>
                        <strong>Bypass reason:</strong> {r.bypassReason}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  field: { display: "flex", flexDirection: "column" as const, gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  input: { padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14 },
  select: { padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, background: "#fff", minWidth: 180 },
  loadBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, padding: "8px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", alignSelf: "flex-end" as const },
  summaryCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", minWidth: 200 },
  statPill: { borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 },
  empty: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "40px", textAlign: "center" as const, color: "#64748b" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden" },
  th: { textAlign: "left" as const, padding: "8px 10px", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const },
  td: { padding: "10px", borderBottom: "1px solid #f1f5f9", color: "#1e293b", verticalAlign: "middle" as const },
  detailBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer", color: "#475569" },
};
