import React, { useEffect, useRef, useState } from "react";
import { invoicesApi } from "../api/invoicesApi";
import type { ReconInvoiceItem } from "../api/invoicesApi";
import { bankStatementsApi } from "../api/bankStatementsApi";
import type {
  BankStatementSummaryResponse,
  BankStatementResponse,
  BankTransactionResponse,
} from "../api/bankStatementsApi";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
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

// ── Main component ─────────────────────────────────────────────────────────

export default function ReconPage() {
  const [tab, setTab] = useState<"invoices" | "statements">("invoices");

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Reconciliation</h1>
        <div style={s.tabRow}>
          <button
            style={tab === "invoices" ? s.tabActive : s.tabBtn}
            onClick={() => setTab("invoices")}
          >
            Invoice Recon
          </button>
          <button
            style={tab === "statements" ? s.tabActive : s.tabBtn}
            onClick={() => setTab("statements")}
          >
            Bank Statements
          </button>
        </div>
      </div>

      {tab === "invoices" ? <InvoiceReconTab /> : <BankStatementsTab />}
    </div>
  );
}

// ── Invoice Recon tab ──────────────────────────────────────────────────────

function InvoiceReconTab() {
  const [paymentType, setPaymentType] = useState("EFT");
  const [reconStatus, setReconStatus] = useState("pending");
  const [fromDate,    setFromDate]    = useState(thirtyDaysAgoIso());
  const [toDate,      setToDate]      = useState(todayIso());
  const [clientSearch, setClientSearch] = useState("");

  const [items,   setItems]   = useState<ReconInvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const [reconTarget,    setReconTarget]    = useState<ReconInvoiceItem | null>(null);
  const [reconRef,       setReconRef]       = useState("");
  const [reconNotes,     setReconNotes]     = useState("");
  const [reconDate,      setReconDate]      = useState(todayIso());
  const [reconBusy,      setReconBusy]      = useState(false);
  const [reconError,     setReconError]     = useState("");
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

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

  const todayStr = todayIso();
  const pending     = items.filter(i => !i.reconciledAt);
  const reconToday  = items.filter(i => i.reconciledAt?.slice(0, 10) === todayStr);
  const pendingAmt  = pending.reduce((sum, i) => sum + i.grandTotal, 0);

  const visible = items.filter(i => {
    if (!clientSearch) return true;
    return i.customerName.toLowerCase().includes(clientSearch.toLowerCase()) ||
           i.invoiceNumber.toLowerCase().includes(clientSearch.toLowerCase());
  });

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

  return (
    <>
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
          <div style={s.kpiValue}>{fmt(reconToday.reduce((sum, i) => sum + i.grandTotal, 0))}</div>
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
        <button style={s.applyBtn} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
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
    </>
  );
}

// ── Bank Statements tab ────────────────────────────────────────────────────

function BankStatementsTab() {
  const [statements, setStatements] = useState<BankStatementSummaryResponse[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  // Upload state
  const fileRef          = useRef<HTMLInputElement>(null);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Selected statement detail
  const [selected,    setSelected]    = useState<BankStatementResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Allocate modal state
  const [allocTx,      setAllocTx]      = useState<BankTransactionResponse | null>(null);
  const [allocInvoice, setAllocInvoice] = useState("");
  const [allocBusy,    setAllocBusy]    = useState(false);
  const [allocError,   setAllocError]   = useState("");

  // Transaction search
  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "Credit" | "Debit">("Credit");
  const [txAllocFilter, setTxAllocFilter] = useState<"all" | "unallocated" | "allocated">("unallocated");

  async function loadStatements() {
    setLoading(true);
    setError("");
    try {
      const data = await bankStatementsApi.list();
      setStatements(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load bank statements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatements(); }, []);

  async function openStatement(statementId: string) {
    setDetailLoading(true);
    setTxSearch("");
    setTxTypeFilter("Credit");
    setTxAllocFilter("unallocated");
    try {
      const detail = await bankStatementsApi.get(statementId);
      setSelected(detail);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load statement.");
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadProgress("Getting upload URL…");
    setError("");
    try {
      const { uploadUrl, s3Key } = await bankStatementsApi.getUploadUrl(file.name);

      setUploadProgress("Uploading CSV to S3…");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "text/csv" },
      });
      if (!putRes.ok) throw new Error("Upload to S3 failed.");

      setUploadProgress("Parsing statement…");
      const result = await bankStatementsApi.process({ s3Key, fileName: file.name });

      await loadStatements();
      setUploadProgress("");
      openStatement(result.statementId);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  }

  // ── Allocate ──────────────────────────────────────────────────────────

  function openAllocate(tx: BankTransactionResponse) {
    setAllocTx(tx);
    setAllocInvoice("");
    setAllocError("");
  }

  async function submitAllocate() {
    if (!selected || !allocTx || !allocInvoice.trim()) return;
    setAllocBusy(true);
    setAllocError("");
    try {
      const updated = await bankStatementsApi.allocate(
        selected.statementId,
        allocTx.transactionId,
        { invoiceId: allocInvoice.trim() }
      );
      setSelected(updated);
      setAllocTx(null);
      await loadStatements();
    } catch (e: any) {
      setAllocError(e?.message ?? "Failed to allocate.");
    } finally {
      setAllocBusy(false);
    }
  }

  async function handleDeallocate(tx: BankTransactionResponse) {
    if (!selected) return;
    if (!window.confirm(`Remove allocation of this transaction from invoice ${tx.allocatedInvoiceNumber}?`)) return;
    try {
      const updated = await bankStatementsApi.deallocate(selected.statementId, tx.transactionId);
      setSelected(updated);
      await loadStatements();
    } catch (e: any) {
      setError(e?.message ?? "Failed to deallocate.");
    }
  }

  // ── Filtered transactions ─────────────────────────────────────────────

  const visibleTx = (selected?.transactions ?? []).filter(tx => {
    if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
    if (txAllocFilter === "unallocated" && tx.isAllocated) return false;
    if (txAllocFilter === "allocated" && !tx.isAllocated) return false;
    if (txSearch) {
      const q = txSearch.toLowerCase();
      return tx.description.toLowerCase().includes(q) || tx.reference.toLowerCase().includes(q);
    }
    return true;
  });

  // ── KPIs for the statement list ────────────────────────────────────────

  const totalCredits = statements.reduce((sum, s) => sum + s.totalCredits, 0);
  const totalAllocated = statements.reduce((sum, s) => sum + s.allocatedCount, 0);
  const totalUnallocated = statements.reduce((sum, s) => sum + s.creditCount - s.allocatedCount, 0);

  return (
    <>
      {error && <div style={s.errorBanner}>{error}</div>}

      {selected ? (
        /* ─── Statement detail view ─── */
        <>
          <div style={s.detailHeader}>
            <button style={s.backBtn} onClick={() => setSelected(null)}>← Back to Statements</button>
            <div style={s.detailTitle}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{selected.fileName}</span>
              <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 12 }}>
                Uploaded {fmtDate(selected.uploadedAt)}
              </span>
            </div>
            <div style={s.detailKpis}>
              <span style={s.kpiBadge}>
                {selected.transactionCount} transactions
              </span>
              <span style={{ ...s.kpiBadge, background: "#eff6ff", color: "#2563eb" }}>
                {selected.creditCount} credits · {fmt(selected.totalCredits)}
              </span>
              <span style={{ ...s.kpiBadge, background: "#f0fdf4", color: "#15803d" }}>
                {selected.allocatedCount}/{selected.creditCount} allocated
              </span>
            </div>
          </div>

          {/* Transaction filters */}
          <div style={s.filterRow}>
            <div style={s.filterGroup}>
              <label style={s.filterLabel}>Type</label>
              <select style={s.select} value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value as any)}>
                <option value="all">All</option>
                <option value="Credit">Credits only</option>
                <option value="Debit">Debits only</option>
              </select>
            </div>
            <div style={s.filterGroup}>
              <label style={s.filterLabel}>Allocation</label>
              <select style={s.select} value={txAllocFilter} onChange={e => setTxAllocFilter(e.target.value as any)}>
                <option value="all">All</option>
                <option value="unallocated">Unallocated</option>
                <option value="allocated">Allocated</option>
              </select>
            </div>
            <div style={s.filterGroup}>
              <label style={s.filterLabel}>Search Description / Ref</label>
              <input
                style={{ ...s.input, minWidth: 220 }}
                placeholder="Search…"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
              />
            </div>
            <div style={{ alignSelf: "flex-end", color: "#6b7280", fontSize: 13, paddingBottom: 8 }}>
              {visibleTx.length} rows shown
            </div>
          </div>

          {/* Transactions table */}
          {visibleTx.length === 0 ? (
            <div style={s.empty}>No transactions match the filters.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Description</th>
                    <th style={s.th}>Reference</th>
                    <th style={s.th}>Type</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Invoice</th>
                    <th style={s.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTx.map(tx => (
                    <tr key={tx.transactionId} style={tx.isAllocated ? s.rowReconced : s.rowPending}>
                      <td style={s.td}>{fmtDate(tx.date)}</td>
                      <td style={{ ...s.td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tx.description}
                      </td>
                      <td style={{ ...s.td, ...s.mono, fontSize: 12 }}>{tx.reference || "—"}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...(tx.type === "Credit" ? s.badgeEFT : s.badgeDebit) }}>
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>
                        {fmt(tx.amount)}
                      </td>
                      <td style={s.td}>
                        <span style={tx.isAllocated ? s.pillGreen : s.pillAmber}>
                          {tx.isAllocated ? "Allocated" : "Unallocated"}
                        </span>
                      </td>
                      <td style={{ ...s.td, ...s.mono, fontSize: 12 }}>
                        {tx.allocatedInvoiceNumber || "—"}
                      </td>
                      <td style={s.td}>
                        {tx.isAllocated ? (
                          <button style={s.editBtn} onClick={() => handleDeallocate(tx)}>
                            ✕ Remove
                          </button>
                        ) : tx.type === "Credit" ? (
                          <button style={s.reconBtn} onClick={() => openAllocate(tx)}>
                            Link Invoice
                          </button>
                        ) : (
                          <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* ─── Statement list view ─── */
        <>
          {/* KPIs */}
          <div style={s.kpiRow}>
            <div style={s.kpiCard}>
              <div style={s.kpiValue}>{statements.length}</div>
              <div style={s.kpiLabel}>Statements Uploaded</div>
            </div>
            <div style={s.kpiCard}>
              <div style={s.kpiValue}>{fmt(totalCredits)}</div>
              <div style={s.kpiLabel}>Total Credits</div>
            </div>
            <div style={{ ...s.kpiCard, ...s.kpiGreen }}>
              <div style={s.kpiValue}>{totalAllocated}</div>
              <div style={s.kpiLabel}>Allocated Transactions</div>
            </div>
            <div style={s.kpiCard}>
              <div style={{ ...s.kpiValue, color: totalUnallocated > 0 ? "#ef4444" : "#111827" }}>
                {totalUnallocated}
              </div>
              <div style={s.kpiLabel}>Unallocated Credits</div>
            </div>
          </div>

          {/* Upload area */}
          <div style={s.uploadArea}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <div style={s.uploadBusy}>
                <span style={s.spinner}>⏳</span>
                <span>{uploadProgress || "Processing…"}</span>
              </div>
            ) : (
              <div style={s.uploadIdle}>
                <div style={s.uploadIcon}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Upload Bank Statement CSV
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
                  Supports Nedbank, FNB, Standard Bank, ABSA CSV exports
                </div>
                <button style={s.uploadBtn} onClick={() => fileRef.current?.click()}>
                  Choose CSV File
                </button>
              </div>
            )}
          </div>

          {/* Statement list */}
          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : statements.length === 0 ? (
            <div style={s.empty}>No bank statements uploaded yet.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>File Name</th>
                    <th style={s.th}>Uploaded</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Transactions</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Credits</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Total Credits</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Allocated</th>
                    <th style={s.th}>Progress</th>
                    <th style={s.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map(stmt => {
                    const pct = stmt.creditCount > 0
                      ? Math.round((stmt.allocatedCount / stmt.creditCount) * 100)
                      : 0;
                    return (
                      <tr key={stmt.statementId} style={s.rowPending}>
                        <td style={s.td}>{stmt.fileName}</td>
                        <td style={s.td}>{fmtDate(stmt.uploadedAt)}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>{stmt.transactionCount}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>{stmt.creditCount}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>{fmt(stmt.totalCredits)}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>
                          {stmt.allocatedCount}/{stmt.creditCount}
                        </td>
                        <td style={{ ...s.td, minWidth: 120 }}>
                          <div style={s.progressBg}>
                            <div
                              style={{
                                ...s.progressBar,
                                width: `${pct}%`,
                                background: pct === 100 ? "#22c55e" : "#3b82f6",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{pct}%</span>
                        </td>
                        <td style={s.td}>
                          <button
                            style={s.reconBtn}
                            onClick={() => openStatement(stmt.statementId)}
                            disabled={detailLoading}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Allocate modal */}
      {allocTx && selected && (
        <div style={s.overlay} onClick={() => setAllocTx(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Link to Invoice</h2>
              <button style={s.closeBtn} onClick={() => setAllocTx(null)}>✕</button>
            </div>

            {/* Transaction summary */}
            <div style={s.modalSummary}>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Date</span>
                <span>{fmtDate(allocTx.date)}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Description</span>
                <span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {allocTx.description}
                </span>
              </div>
              {allocTx.reference && (
                <div style={s.summaryRow}>
                  <span style={s.summaryLabel}>Reference</span>
                  <span style={s.mono}>{allocTx.reference}</span>
                </div>
              )}
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Amount</span>
                <span style={s.summaryAmount}>{fmt(allocTx.amount)}</span>
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Invoice ID</label>
              <input
                style={s.input}
                placeholder="Paste the Invoice ID…"
                value={allocInvoice}
                onChange={e => setAllocInvoice(e.target.value)}
                autoFocus
              />
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Copy the Invoice ID from the Invoices or Recon page.
              </span>
            </div>

            {allocError && <div style={s.errorBanner}>{allocError}</div>}

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setAllocTx(null)}>Cancel</button>
              <button
                style={s.submitBtn}
                disabled={allocBusy || !allocInvoice.trim()}
                onClick={submitAllocate}
              >
                {allocBusy ? "Linking…" : "✔ Link Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  tabRow: {
    display: "flex",
    gap: 4,
    background: "#f1f5f9",
    borderRadius: 10,
    padding: 4,
  },
  tabBtn: {
    background: "none",
    border: "none",
    borderRadius: 7,
    padding: "7px 18px",
    fontSize: 14,
    fontWeight: 500,
    color: "#6b7280",
    cursor: "pointer",
  },
  tabActive: {
    background: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "7px 18px",
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
  rowPending: { background: "#fff" },
  rowReconced: { background: "#f0fdf4" },
  empty: {
    textAlign: "center",
    color: "#9ca3af",
    padding: "48px 0",
    fontSize: 15,
  },

  // Badges & pills
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  badgeEFT:   { background: "#eff6ff", color: "#2563eb" },
  badgeCash:  { background: "#f0fdf4", color: "#15803d" },
  badgeDebit: { background: "#fef2f2", color: "#b91c1c" },
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

  // Upload area
  uploadArea: {
    border: "2px dashed #d1d5db",
    borderRadius: 14,
    padding: "32px 24px",
    marginBottom: 24,
    background: "#fafafa",
    textAlign: "center",
  },
  uploadIdle: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  uploadIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  uploadBtn: {
    background: "#1e293b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 28px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  uploadBusy: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontSize: 15,
    color: "#374151",
  },
  spinner: {
    fontSize: 20,
  },

  // Statement detail
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  backBtn: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 14,
    cursor: "pointer",
    color: "#374151",
    whiteSpace: "nowrap" as const,
  },
  detailTitle: {
    flex: 1,
  },
  detailKpis: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  kpiBadge: {
    background: "#f1f5f9",
    color: "#374151",
    borderRadius: 8,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 600,
  },

  // Progress bar
  progressBg: {
    background: "#e5e7eb",
    borderRadius: 4,
    height: 6,
    width: "100%",
    marginBottom: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: 6,
    borderRadius: 4,
    transition: "width 0.3s",
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
