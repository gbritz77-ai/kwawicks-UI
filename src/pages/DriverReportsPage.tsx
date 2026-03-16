import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { CSSProperties } from "react";
import { reportsApi } from "../api/reportsApi";
import type { MyDeliveryItem } from "../api/reportsApi";

export default function DriverReportsPage() {
  const nav = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<MyDeliveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await reportsApi.getMyDeliveries(from || undefined, to || undefined);
      setItems(data);
    } catch {
      setError("Failed to load deliveries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const pendingCount = items.filter((i) => i.paymentStatus === "Pending").length;

  return (
    <div style={s.page}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={s.backBtn} onClick={() => nav("/driver")}>← Back</button>
        <h2 style={{ ...s.heading, marginBottom: 0 }}>My Delivery History</h2>
      </div>

      {/* Date filter */}
      <div style={s.filterRow}>
        <label style={s.label}>From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
        <label style={s.label}>To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
        <button style={s.applyBtn} onClick={load}>Apply</button>
      </div>

      {error && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading...</p>}

      {!loading && (
        <>
          {/* KPIs */}
          <div style={s.kpiRow}>
            <KpiCard label="Deliveries" value={String(items.length)} />
            {pendingCount > 0 && <KpiCard label="Awaiting Payment" value={String(pendingCount)} warn />}
          </div>

          {/* Table */}
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Address</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.deliveryOrderId}>
                  <Td>{new Date(item.completedAt).toLocaleDateString("en-ZA")}</Td>
                  <Td>{item.customerId}</Td>
                  <Td style={{ color: "#64748b", fontSize: 13 }}>{item.deliveryAddress}</Td>
                  <Td>{item.paymentType || "—"}</Td>
                  <Td>
                    <span style={{
                      ...s.badge,
                      background: item.paymentStatus === "Paid" ? "#dcfce7" : "#fef9c3",
                      color: item.paymentStatus === "Paid" ? "#166534" : "#854d0e",
                    }}>
                      {item.paymentStatus || "—"}
                    </span>
                  </Td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} style={s.emptyCell}>No deliveries found for selected period</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  const bg = highlight ? "#166534" : warn ? "#92400e" : "#f8fafc";
  const color = highlight || warn ? "#fff" : "#1e293b";
  return (
    <div style={{ ...s.kpi, background: bg, color }}>
      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={s.th}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <td style={{ ...s.td, ...style }}>{children}</td>;
}

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 20px", maxWidth: 860, margin: "0 auto" },
  heading: { fontSize: 22, fontWeight: 700, color: "#1e293b" },
  backBtn: {
    padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1",
    background: "#fff", cursor: "pointer", fontSize: 14, color: "#475569",
  },
  filterRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  label: { fontSize: 13, color: "#64748b", fontWeight: 500 },
  dateInput: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14 },
  applyBtn: {
    padding: "7px 16px", borderRadius: 6, border: "none",
    background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500
  },
  kpiRow: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 },
  kpi: { flex: "1 1 140px", borderRadius: 10, padding: "16px 20px", minWidth: 130 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0",
    fontWeight: 600, color: "#475569", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em"
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b" },
  emptyCell: { padding: "32px 12px", color: "#94a3b8", textAlign: "center" },
  badge: { padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  error: { color: "#dc2626", marginBottom: 12 },
  muted: { color: "#94a3b8" },
};
