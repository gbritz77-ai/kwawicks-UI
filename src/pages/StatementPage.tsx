import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { reportsApi } from "../api/reportsApi";
import type { CustomerStatementResponse } from "../api/reportsApi";

const fmt = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA");

export default function StatementPage() {
  const [params] = useSearchParams();
  const customerId = params.get("customerId") ?? "";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  const [statement, setStatement] = useState<CustomerStatementResponse | null>(null);
  const [allStatements, setAllStatements] = useState<CustomerStatementResponse[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId) { setError("No customer selected."); return; }
    if (customerId === "ALL") {
      reportsApi.getAllStatements(from, to)
        .then(setAllStatements)
        .catch(() => setError("Failed to load statements."));
    } else {
      reportsApi.getCustomerStatement(customerId, from, to)
        .then(setStatement)
        .catch(() => setError("Failed to load statement."));
    }
  }, [customerId, from, to]);

  if (error) return <div style={{ padding: 40, color: "#dc2626" }}>{error}</div>;
  if (customerId === "ALL" && !allStatements) return <div style={{ padding: 40, color: "#64748b" }}>Loading statements…</div>;
  if (customerId !== "ALL" && !statement) return <div style={{ padding: 40, color: "#64748b" }}>Loading statement…</div>;

  const statements = allStatements ?? (statement ? [statement] : []);

  return (
    <>
      {/* Print-specific styles injected inline so they work in a standalone tab */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          body { margin: 0; }
        }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; }
      `}</style>

      {/* Print button bar */}
      <div className="no-print" style={s.printBar}>
        <span style={{ color: "#475569", fontSize: 14 }}>
          {customerId === "ALL"
            ? `${statements.length} customer statement${statements.length !== 1 ? "s" : ""} — use your browser's Print to save as PDF`
            : "Statement ready — use your browser's Print to save as PDF"}
        </span>
        <button style={s.printBtn} onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      {statements.map((st, idx) => (
        <div key={st.customerId} className={idx < statements.length - 1 ? "page-break" : undefined}>
          <StatementDocument statement={st} />
        </div>
      ))}
    </>
  );
}

function StatementDocument({ statement }: { statement: CustomerStatementResponse }) {
  const periodLabel = statement.from || statement.to
    ? `${statement.from ? fmtDate(statement.from) : "—"} to ${statement.to ? fmtDate(statement.to) : "—"}`
    : "All time";

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.companyName}>KwaWicks</div>
          <div style={s.companyMeta}>Customer Account Statement</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={s.metaLabel}>Generated</div>
          <div style={s.metaValue}>{fmtDate(statement.generatedAt)}</div>
          <div style={{ ...s.metaLabel, marginTop: 6 }}>Period</div>
          <div style={s.metaValue}>{periodLabel}</div>
        </div>
      </div>

      <hr style={s.divider} />

      {/* Customer info */}
      <div style={s.customerBlock}>
        <div style={s.sectionLabel}>Bill To</div>
        <div style={s.customerName}>{statement.customerName}</div>
        {statement.customerAddress && (
          <div style={s.customerMeta}>{statement.customerAddress}</div>
        )}
        {statement.customerContact && (
          <div style={s.customerMeta}>{statement.customerContact}</div>
        )}
      </div>

      {/* Invoice table */}
      <table style={s.table}>
        <thead>
          <tr style={s.thead}>
            <th style={s.th}>Date</th>
            <th style={s.th}>Invoice #</th>
            <th style={s.th}>Payment Method</th>
            <th style={{ ...s.th, textAlign: "right" }}>Sub-Total</th>
            <th style={{ ...s.th, textAlign: "right" }}>VAT</th>
            <th style={{ ...s.th, textAlign: "right" }}>Total</th>
            <th style={{ ...s.th, textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line, i) => (
            <tr key={line.invoiceId} style={i % 2 === 0 ? {} : s.altRow}>
              <td style={s.td}>{fmtDate(line.date)}</td>
              <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>
                {line.invoiceId.slice(0, 8)}…
              </td>
              <td style={s.td}>{line.paymentType || "—"}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{fmt(line.subTotal)}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{fmt(line.vatTotal)}</td>
              <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(line.grandTotal)}</td>
              <td style={{ ...s.td, textAlign: "center" }}>
                <span style={{
                  ...s.badge,
                  background: line.paymentStatus === "Paid" ? "#dcfce7" : "#fef9c3",
                  color: line.paymentStatus === "Paid" ? "#166534" : "#92400e",
                }}>
                  {line.paymentStatus || "—"}
                </span>
              </td>
            </tr>
          ))}
          {statement.lines.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...s.td, textAlign: "center", color: "#94a3b8", padding: "24px 0" }}>
                No invoices found for this period
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals summary */}
      <div style={s.totalsBlock}>
        <div style={s.totalsGrid}>
          <TotalRow label="Sub-Total" value={fmt(statement.totalSubTotal)} />
          <TotalRow label="VAT" value={fmt(statement.totalVat)} />
          <TotalRow label="Total Invoiced" value={fmt(statement.totalGrandTotal)} bold />
          <div style={s.totalsDivider} />
          <TotalRow label="Total Paid" value={fmt(statement.totalPaid)} color="#166534" />
          <TotalRow
            label="Outstanding Balance"
            value={fmt(statement.totalOutstanding)}
            bold
            color={statement.totalOutstanding > 0 ? "#dc2626" : "#166534"}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <p>This statement was generated automatically. Please contact KwaWicks if you have any queries.</p>
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={s.totalRow}>
      <span style={{ color: "#475569", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color: color ?? "#111", fontSize: bold ? 15 : 13 }}>
        {value}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  printBar: {
    background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
    padding: "12px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  printBtn: {
    padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600,
  },
  page: { maxWidth: 820, margin: "0 auto", padding: "32px 40px" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20,
  },
  companyName: { fontSize: 26, fontWeight: 800, color: "#1e293b" },
  companyMeta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  metaLabel: { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" },
  metaValue: { fontSize: 13, fontWeight: 600, color: "#1e293b" },
  divider: { border: "none", borderTop: "2px solid #e2e8f0", margin: "0 0 20px" },
  customerBlock: { marginBottom: 28 },
  sectionLabel: { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 },
  customerName: { fontSize: 17, fontWeight: 700, color: "#1e293b" },
  customerMeta: { fontSize: 13, color: "#475569", marginTop: 2 },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 13 },
  thead: { background: "#1e293b" },
  th: {
    padding: "9px 12px", color: "#fff", fontWeight: 600, fontSize: 12,
    textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left",
  },
  td: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b" },
  altRow: { background: "#f8fafc" },
  badge: { padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
  totalsBlock: { display: "flex", justifyContent: "flex-end", marginBottom: 32 },
  totalsGrid: { width: 300 },
  totalRow: { display: "flex", justifyContent: "space-between", padding: "5px 0" },
  totalsDivider: { borderTop: "1px solid #e2e8f0", margin: "8px 0" },
  footer: {
    borderTop: "1px solid #e2e8f0", paddingTop: 16, fontSize: 12, color: "#94a3b8", textAlign: "center",
  },
};
