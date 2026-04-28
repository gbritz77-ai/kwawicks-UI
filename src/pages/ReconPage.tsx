import React, { useEffect, useState } from "react";
import { invoicesApi } from "../api/invoicesApi";
import type { ReconInvoiceItem } from "../api/invoicesApi";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_TYPES = ["", "Cash", "EFT", "Credit", "CardMachine", "Split"];

// ── Component ──────────────────────────────────────────────────────────────

export default function ReconPage() {
  // ── Filters ───────────────────────────────────────────────────────────────
  const [paymentType, setPaymentType] = useState("EFT");
  const [reconStatus, setReconStatus] = useState("pending");
  const [fromDate,    setFromDate]    = useState(thirtyDaysAgoIso());
  const [toDate,      setToDate]      = useState(todayIso());
  const [clientSearch, setClientSearch] = useState("");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [items,   setItems]   = useState<ReconInvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // ── Recon modal ───────────────────────────────────────────────────────────
  const [reconTarget,    setReconTarget]    = useState<ReconInvoiceItem | null>(null);
  const [reconRef,       setReconRef]       = useState("");
  const [reconNotes,     setReconNotes]     = useState("");
  const [reconDate,      setReconDate]      = useState(todayIso());
  const [reconBusy,      setReconBusy]      = useState(false);
  const [reconError,     setReconError]     = useState("");
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await invoicesApi.getReconList({
        paymentType: paymentType || undefined,
        reconStatus: reconStatus || undefined,
        from: fromDate || undefined,
        to:   toDate   ? toDate + "T23:59:59Z" : undefined,
      });
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const todayStr = todayIso();
  const pending     = items.filter(i => !i.reconciledAt);
  const reconToday  = items.filter(i => i.reconciledAt?.slice(0, 10) === todayStr);
  const pendingAmt  = pending.reduce((s, i) => s + i.grandTotal, 0);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const visible = items.filter(i => {
    if (!clientSearch) return true;
    return i.customerName.toLowerCase().includes(clientSearch.toLowerCase()) ||
           i.invoiceNumber.toLowerCase().includes(clientSearch.toLowerCase());
  });

  // ── Open recon modal ──────────────────────────────────────────────────────
  function openRecon(item: ReconInvoiceItem) {
    setReconTarget(item);
    setReconRef(item.reconReference || "");
    setReconNotes(item.reconNotes || "");
    setReconDate(item.reconciledAt ? item.reconciledAt.slice(0, 10) : todayIso());
    setReconError("");
    setReceiptViewUrl(null);
  }

  async function loadReceipt() {
    if (!reconTarget || !reconTarget.receiptS3Key) return;
    setReceiptLoading(true);
    try {
      const { url } = await invoicesApi.getReceiptViewUrl(reconTarget.invoiceId);
      setReceiptViewUrl(url);
    } catch {
      setReconError("Failed to load receipt link.");
    } finally {
      setReceiptLoading(false);
    }
  }

  async function submitRecon() {
    if (!reconTarget) return;
    setReconBusy(true);
    setReconError("");
    try {
      await invoicesApi.recon(reconTarget.invoiceId, {
        referenceNumber: reconRef || undefined,
        notes:           reconNotes || undefined,
        receivedAt:      reconDate ? new Date(reconDate).toISOString() : undefined,
      });
      setReconTarget(null);
      await load();
    } catch (e: any) {
      setReconError(e?.message ?? "Failed to reconcile.");
    } finally {
      setReconBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Reconciliation</h1>
        <button style={s.refreshBtn} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* KPI strip */}
      <div style={s.kpiRow}>
        <div style={s.kpiCard}>
          <div style={s.kpiValue}>{pending.length}</div>
          <div style={s.kpiLabel}>Pending Recon</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiValue}>{fmt(pendingAmt)}</div>
          <div style={s.kpiLabel}>Outstanding Amount</div>
        </div>
        <div style={{ ...s.kpiCard, ...s.kpiGreen }}>
          <div style={s.kpiValue}>{reconToday.length}</div>
          <div style={s.kpiLabel}>Reconciled Today</div>
        </div>
        <div style={{ ...s.kpiCard, ...s.kpiGreen }}>
          <div style={s.kpiValue}>{fmt(reconToday.reduce((s, i) => s + i.grandTotal, 0))}</div>
          <div style={s.kpiLabel}>Reconciled Today (Amount)</div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Payment Type</label>
          <select style={s.select} value={paymentType} onChange={e => setPaymentType(e.target.value)}>
            {PAYMENT_TYPES.map(pt => (
              <option key={pt} value={pt}>{pt || "All"}</option>
            ))}
          </select>
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Status</label>
          <select style={s.select} value={reconStatus} onChange={e => setReconStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="reconciled">Reconciled</option>
            <option value="">All</option>
          </select>
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>From</label>
          <input type="date" style={s.input} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>To</label>
          <input type="date" style={s.input} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Search Client / Invoice #</label>
          <input
            style={s.input}
            placeholder="e.g. John or INV000042"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
        </div>
        <button style={s.applyBtn} onClick={load} disabled={loading}>Apply</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={s.empty}>No invoices match the selected filters.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Invoice #</th>
                <th style={s.th}>Client</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Amount</th>
                <th style={s.th}>Days Out</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Ref #</th>
                <th style={s.th}>Reconciled At</th>
                <th style={s.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(item => {
                const isReconced = !!item.reconciledAt;
                return (
                  <tr key={item.invoiceId} style={isReconced ? s.rowReconced : s.rowPending}>
                    <td style={s.td}><span style={s.mono}>{item.invoiceNumber || item.invoiceId.slice(0, 8)}</span></td>
                    <td style={s.td}>{item.customerName || item.customerId}</td>
                    <td style={s.td}>{fmtDate(item.createdAt)}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, ...(item.paymentType === "EFT" ? s.badgeEFT : s.badgeCash) }}>
                        {item.paymentType || "—"}
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: "right" }}>{fmt(item.grandTotal)}</td>
                    <td style={{ ...s.td, textAlign: "center", color: item.daysOutstanding > 7 ? "#ef4444" : "#374151" }}>
                      {isReconced ? "—" : `${item.daysOutstanding}d`}
                    </td>
                    <td style={s.td}>
                      <span style={isReconced ? s.pillGreen : s.pillAmber}>
                        {isReconced ? "Reconciled" : "Pending"}
                      </span>
                    </td>
                    <td style={s.td}><span style={s.mono}>{item.reconReference || "—"}</span></td>
                    <td style={s.td}>{fmtDate(item.reconciledAt)}</td>
                    <td style={s.td}>
                      <button style={isReconced ? s.editBtn : s.reconBtn} onClick={() => openRecon(item)}>
                        {isReconced ? "✏️ Edit" : "✔ Reconcile"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recon modal */}
      {reconTarget && (
        <div style={s.overlay} onClick={() => setReconTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Reconcile Invoice</h2>
              <button style={s.closeBtn} onClick={() => setReconTarget(null)}>✕</button>
            </div>

            {/* Invoice summary */}
            <div style={s.modalSummary}>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Invoice</span>
                <span style={s.mono}>{reconTarget.invoiceNumber || reconTarget.invoiceId.slice(0, 8)}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Client</span>
                <span>{reconTarget.customerName || reconTarget.customerId}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Amount</span>
                <span style={s.summaryAmount}>{fmt(reconTarget.grandTotal)}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Payment Type</span>
                <span>{reconTarget.paymentType}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Invoice Date</span>
                <span>{fmtDate(reconTarget.createdAt)}</span>
              </div>
            </div>

            {/* EFT receipt link */}
            {reconTarget.paymentType === "EFT" && reconTarget.receiptS3Key && (
              <div style={s.receiptRow}>
                {receiptViewUrl ? (
                  <a href={receiptViewUrl} target="_blank" rel="noreferrer" style={s.receiptLink}>
                    📄 View Payment Receipt
                  </a>
                ) : (
                  <button style={s.receiptBtn} onClick={loadReceipt} disabled={receiptLoading}>
                    {receiptLoading ? "Loading…" : "📄 Load Receipt"}
                  </button>
                )}
              </div>
            )}

            <div style={s.fieldGroup}>
              <label style={s.label}>Bank Reference / Statement Ref</label>
              <input
                style={s.input}
                placeholder="e.g. NEDBANK-20240415-0023"
                value={reconRef}
                onChange={e => setReconRef(e.target.value)}
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Date Received on Statement</label>
              <input
                type="date"
                style={s.input}
                value={reconDate}
                onChange={e => setReconDate(e.target.value)}
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Notes (optional)</label>
              <textarea
                style={s.textarea}
                rows={3}
                placeholder="Any additional notes…"
                value={reconNotes}
                onChange={e => setReconNotes(e.target.value)}
              />
            </div>

            {reconError && <div style={s.errorBanner}>{reconError}</div>}

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setReconTarget(null)}>Cancel</button>
              <button style={s.submitBtn} disabled={reconBusy} onClick={submitRecon}>
                {reconBusy ? "Saving…" : "✔ Confirm Reconciliation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxWidth: 1400,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  refreshBtn: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "7px 16px",
    fontSize: 14,
    cursor: "pointer",
    color: "#374151",
  },
  errorBanner: {
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    color: "#b91c1c",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    marginBottom: 16,
  },

  // KPI
  kpiRow: {
    display: "flex",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  kpiCard: {
    flex: "1 1 180px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "18px 20px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  kpiGreen: {
    borderLeft: "4px solid #22c55e",
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 800,
    color: "#111827",
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 13,
    color: "#6b7280",
  },

  // Filters
  filterRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  select: {
    border: "1px solid #d1d5db",
    borderRadius: 7,
    padding: "7px 10px",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
    minWidth: 130,
  },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 7,
    padding: "7px 10px",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
    minWidth: 180,
  },
  applyBtn: {
    background: "#1e293b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-end",
    height: 38,
  },

  // Table
  tableWrap: {
    overflowX: "auto",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    background: "#f8fafc",
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    padding: "12px 14px",
    textAlign: "left" as const,
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "11px 14px",
    borderBottom: "1px solid #f1f5f9",
    color: "#374151",
    whiteSpace: "nowrap" as const,
  },
  rowPending: {
    background: "#fff",
  },
  rowReconced: {
    background: "#f0fdf4",
  },
  empty: {
    textAlign: "center",
    color: "#9ca3af",
    padding: "48px 0",
    fontSize: 15,
  },

  // Pills & badges
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  badgeEFT: {
    background: "#eff6ff",
    color: "#2563eb",
  },
  badgeCash: {
    background: "#f0fdf4",
    color: "#15803d",
  },
  pillGreen: {
    display: "inline-block",
    background: "#dcfce7",
    color: "#15803d",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
  },
  pillAmber: {
    display: "inline-block",
    background: "#fef3c7",
    color: "#92400e",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 13,
  },

  // Action buttons
  reconBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  editBtn: {
    background: "#f1f5f9",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },

  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    background: "#fff",
    borderRadius: 14,
    width: "100%",
    maxWidth: 500,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    color: "#6b7280",
    padding: 4,
  },
  modalSummary: {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
  },
  summaryLabel: {
    color: "#6b7280",
    fontWeight: 500,
  },
  summaryAmount: {
    fontSize: 17,
    fontWeight: 800,
    color: "#111827",
  },
  receiptRow: {
    display: "flex",
    alignItems: "center",
  },
  receiptBtn: {
    background: "#eff6ff",
    color: "#2563eb",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 600,
  },
  receiptLink: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  },
  textarea: {
    border: "1px solid #d1d5db",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 14,
    color: "#111827",
    fontFamily: "system-ui, -apple-system, sans-serif",
    resize: "vertical" as const,
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 4,
  },
  cancelBtn: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "9px 20px",
    fontSize: 14,
    cursor: "pointer",
    color: "#374151",
  },
  submitBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 22px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
