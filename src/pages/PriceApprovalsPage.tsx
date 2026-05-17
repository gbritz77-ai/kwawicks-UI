import React, { useEffect, useState } from "react";
import { priceApprovalsApi } from "../api/priceApprovalsApi";
import type { PriceApprovalDto, AmendPriceLine } from "../api/priceApprovalsApi";
import { NumericInput } from "../components/NumericInput";

const fmt = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PriceApprovalsPage() {
  const [items, setItems] = useState<PriceApprovalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // invoiceId being processed

  // Amend modal state
  const [amendTarget, setAmendTarget] = useState<PriceApprovalDto | null>(null);
  const [amendPrices, setAmendPrices] = useState<Record<string, string>>({}); // speciesId → price string

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await priceApprovalsApi.getPending();
      setItems(data);
    } catch {
      setError("Failed to load pending price approvals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(invoiceId: string) {
    setBusy(invoiceId);
    try {
      await priceApprovalsApi.approve(invoiceId);
      setItems(prev => prev.filter(i => i.invoiceId !== invoiceId));
    } catch {
      alert("Failed to approve invoice.");
    } finally {
      setBusy(null);
    }
  }

  function openAmend(item: PriceApprovalDto) {
    const init: Record<string, string> = {};
    item.belowCostLines.forEach(l => { init[l.speciesId] = l.salePrice.toFixed(2); });
    setAmendPrices(init);
    setAmendTarget(item);
  }

  async function submitAmend() {
    if (!amendTarget) return;
    const lines: AmendPriceLine[] = amendTarget.belowCostLines.map(l => ({
      speciesId: l.speciesId,
      newUnitPrice: parseFloat(amendPrices[l.speciesId] ?? l.salePrice.toFixed(2)),
    }));
    setBusy(amendTarget.invoiceId);
    try {
      await priceApprovalsApi.amend(amendTarget.invoiceId, lines);
      setItems(prev => prev.filter(i => i.invoiceId !== amendTarget.invoiceId));
      setAmendTarget(null);
    } catch {
      alert("Failed to amend invoice.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
        Below-Cost Price Approvals
      </h2>
      <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
        Invoices with lines sold below cost price. Approve (accept the loss) or amend the price.
      </p>

      {loading && <div style={{ color: "#64748b" }}>Loading...</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div style={s.emptyState}>
          No pending price approvals.
        </div>
      )}

      {items.map(item => (
        <div key={item.invoiceId} style={s.card}>
          <div style={s.cardHeader}>
            <div>
              <span style={s.invoiceNum}>{item.invoiceNumber}</span>
              <span style={s.badge}>{item.saleType}</span>
              <span style={s.badge}>{item.paymentType}</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {new Date(item.createdAt).toLocaleString("en-ZA")}
            </div>
          </div>

          <div style={s.grandTotal}>Grand Total: <strong>{fmt(item.grandTotal)}</strong></div>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Species</th>
                <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
                <th style={{ ...s.th, textAlign: "right" }}>Cost Price</th>
                <th style={{ ...s.th, textAlign: "right" }}>Sale Price</th>
                <th style={{ ...s.th, textAlign: "right" }}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {item.belowCostLines.map(line => (
                <tr key={line.speciesId}>
                  <td style={s.td}>{line.speciesName}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{line.quantity}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#64748b" }}>{fmt(line.costPrice)}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{fmt(line.salePrice)}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#ef4444" }}>
                    {fmt((line.costPrice - line.salePrice) * line.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={s.actions}>
            <button
              style={s.approveBtn}
              disabled={busy === item.invoiceId}
              onClick={() => approve(item.invoiceId)}
            >
              {busy === item.invoiceId ? "Processing..." : "Approve (Accept Loss)"}
            </button>
            <button
              style={s.amendBtn}
              disabled={busy === item.invoiceId}
              onClick={() => openAmend(item)}
            >
              Amend Prices
            </button>
          </div>
        </div>
      ))}

      {/* Amend modal */}
      {amendTarget && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
              Amend Prices — {amendTarget.invoiceNumber}
            </h3>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
              Enter the corrected ex-VAT unit price for each below-cost line.
            </p>

            <table style={{ ...s.table, marginBottom: 20 }}>
              <thead>
                <tr>
                  <th style={s.th}>Species</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Cost</th>
                  <th style={{ ...s.th, textAlign: "right" }}>New Price (ex-VAT)</th>
                </tr>
              </thead>
              <tbody>
                {amendTarget.belowCostLines.map(line => (
                  <tr key={line.speciesId}>
                    <td style={s.td}>{line.speciesName}</td>
                    <td style={{ ...s.td, textAlign: "right", color: "#64748b" }}>{fmt(line.costPrice)}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>
                      <NumericInput
                        
                        step="0.01"
                        min={0}
                        style={s.priceInput}
                        value={amendPrices[line.speciesId] ?? ""}
                        onChange={e => setAmendPrices(prev => ({ ...prev, [line.speciesId]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.cancelBtn} onClick={() => setAmendTarget(null)}>Cancel</button>
              <button
                style={s.approveBtn}
                disabled={busy === amendTarget.invoiceId}
                onClick={submitAmend}
              >
                {busy === amendTarget.invoiceId ? "Saving..." : "Save & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  emptyState: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "40px 24px",
    textAlign: "center",
    color: "#64748b",
    fontSize: 15,
  },
  card: {
    background: "#fff",
    border: "1px solid #fca5a5",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  invoiceNum: {
    fontWeight: 700,
    fontSize: 15,
    color: "#1e293b",
    marginRight: 10,
  },
  badge: {
    background: "#f1f5f9",
    color: "#475569",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 500,
    marginRight: 6,
  },
  grandTotal: {
    marginBottom: 12,
    fontSize: 14,
    color: "#475569",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 14,
  },
  th: {
    textAlign: "left" as const,
    padding: "6px 8px",
    borderBottom: "2px solid #e2e8f0",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  td: {
    padding: "8px 8px",
    borderBottom: "1px solid #f1f5f9",
    color: "#1e293b",
  },
  actions: {
    display: "flex",
    gap: 10,
    marginTop: 14,
  },
  approveBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  amendBtn: {
    background: "#f59e0b",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: "24px 24px 20px",
    maxWidth: 560,
    width: "100%",
    boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  priceInput: {
    width: 100,
    padding: "5px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    textAlign: "right",
  },
};
