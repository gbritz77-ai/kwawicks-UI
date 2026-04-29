import React, { useEffect, useRef, useState } from "react";
import { invoicesApi } from "../api/invoicesApi";
import type { ReconInvoiceItem, InvoiceResponse } from "../api/invoicesApi";
import { bankStatementsApi } from "../api/bankStatementsApi";
import type {
  BankStatementSummaryResponse,
  BankStatementResponse,
  BankTransactionResponse,
} from "../api/bankStatementsApi";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function thirtyDaysAgoIso() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
}

const PAYMENT_TYPES = ["", "Cash", "EFT", "Credit", "CardMachine", "Split"];

// ── Root ───────────────────────────────────────────────────────────────────

export default function ReconPage() {
  const [tab, setTab] = useState<"invoices" | "statements">("invoices");

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Reconciliation</h1>
        <div style={s.tabRow}>
          <button style={tab === "invoices"   ? s.tabActive : s.tabBtn} onClick={() => setTab("invoices")}>
            Invoice Recon
          </button>
          <button style={tab === "statements" ? s.tabActive : s.tabBtn} onClick={() => setTab("statements")}>
            Bank Statements
          </button>
        </div>
      </div>

      {tab === "invoices" ? <InvoiceReconTab /> : <BankStatementsTab />}
    </div>
  );
}

// ── Invoice Recon tab (unchanged) ──────────────────────────────────────────

function InvoiceReconTab() {
  const [paymentType,  setPaymentType]  = useState("EFT");
  const [reconStatus,  setReconStatus]  = useState("pending");
  const [fromDate,     setFromDate]     = useState(thirtyDaysAgoIso());
  const [toDate,       setToDate]       = useState(todayIso());
  const [clientSearch, setClientSearch] = useState("");
  const [items,    setItems]   = useState<ReconInvoiceItem[]>([]);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");

  const [reconTarget,    setReconTarget]    = useState<ReconInvoiceItem | null>(null);
  const [reconRef,       setReconRef]       = useState("");
  const [reconNotes,     setReconNotes]     = useState("");
  const [reconDate,      setReconDate]      = useState(todayIso());
  const [reconBusy,      setReconBusy]      = useState(false);
  const [reconError,     setReconError]     = useState("");
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await invoicesApi.getReconList({
        paymentType: paymentType || undefined,
        reconStatus: reconStatus || undefined,
        from: fromDate || undefined,
        to:   toDate ? toDate + "T23:59:59Z" : undefined,
      });
      setItems(data);
    } catch (e: any) { setError(e?.message ?? "Failed to load invoices."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr   = todayIso();
  const pending    = items.filter(i => !i.reconciledAt);
  const reconToday = items.filter(i => i.reconciledAt?.slice(0, 10) === todayStr);
  const pendingAmt = pending.reduce((sum, i) => sum + i.grandTotal, 0);
  const visible    = items.filter(i => {
    if (!clientSearch) return true;
    return i.customerName.toLowerCase().includes(clientSearch.toLowerCase()) ||
           i.invoiceNumber.toLowerCase().includes(clientSearch.toLowerCase());
  });

  function openRecon(item: ReconInvoiceItem) {
    setReconTarget(item);
    setReconRef(item.reconReference || "");
    setReconNotes(item.reconNotes || "");
    setReconDate(item.reconciledAt ? item.reconciledAt.slice(0, 10) : todayIso());
    setReconError(""); setReceiptViewUrl(null);
  }
  async function loadReceipt() {
    if (!reconTarget?.receiptS3Key) return;
    setReceiptLoading(true);
    try { const { url } = await invoicesApi.getReceiptViewUrl(reconTarget.invoiceId); setReceiptViewUrl(url); }
    catch { setReconError("Failed to load receipt link."); }
    finally { setReceiptLoading(false); }
  }
  async function submitRecon() {
    if (!reconTarget) return;
    setReconBusy(true); setReconError("");
    try {
      await invoicesApi.recon(reconTarget.invoiceId, {
        referenceNumber: reconRef || undefined,
        notes:           reconNotes || undefined,
        receivedAt:      reconDate ? new Date(reconDate).toISOString() : undefined,
      });
      setReconTarget(null); await load();
    } catch (e: any) { setReconError(e?.message ?? "Failed to reconcile."); }
    finally { setReconBusy(false); }
  }

  return (
    <>
      {error && <div style={s.errorBanner}>{error}</div>}
      <div style={s.kpiRow}>
        <div style={s.kpiCard}><div style={s.kpiValue}>{pending.length}</div><div style={s.kpiLabel}>Pending Recon</div></div>
        <div style={s.kpiCard}><div style={s.kpiValue}>{fmt(pendingAmt)}</div><div style={s.kpiLabel}>Outstanding Amount</div></div>
        <div style={{ ...s.kpiCard, ...s.kpiGreen }}><div style={s.kpiValue}>{reconToday.length}</div><div style={s.kpiLabel}>Reconciled Today</div></div>
        <div style={{ ...s.kpiCard, ...s.kpiGreen }}><div style={s.kpiValue}>{fmt(reconToday.reduce((sum, i) => sum + i.grandTotal, 0))}</div><div style={s.kpiLabel}>Reconciled Today (Amount)</div></div>
      </div>
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Payment Type</label>
          <select style={s.select} value={paymentType} onChange={e => setPaymentType(e.target.value)}>
            {PAYMENT_TYPES.map(pt => <option key={pt} value={pt}>{pt || "All"}</option>)}
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
          <input style={s.input} placeholder="e.g. John or INV000042" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
        </div>
        <button style={s.applyBtn} onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
      </div>
      {loading ? <div style={s.empty}>Loading…</div> :
       visible.length === 0 ? <div style={s.empty}>No invoices match the selected filters.</div> : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Invoice #</th><th style={s.th}>Client</th><th style={s.th}>Date</th>
              <th style={s.th}>Type</th><th style={s.th}>Amount</th><th style={s.th}>Days Out</th>
              <th style={s.th}>Status</th><th style={s.th}>Ref #</th><th style={s.th}>Reconciled At</th><th style={s.th}>Action</th>
            </tr></thead>
            <tbody>
              {visible.map(item => {
                const done = !!item.reconciledAt;
                return (
                  <tr key={item.invoiceId} style={done ? s.rowReconced : s.rowPending}>
                    <td style={s.td}><span style={s.mono}>{item.invoiceNumber || item.invoiceId.slice(0,8)}</span></td>
                    <td style={s.td}>{item.customerName || item.customerId}</td>
                    <td style={s.td}>{fmtDate(item.createdAt)}</td>
                    <td style={s.td}><span style={{ ...s.badge, ...(item.paymentType==="EFT"?s.badgeEFT:s.badgeCash) }}>{item.paymentType||"—"}</span></td>
                    <td style={{ ...s.td, textAlign:"right" }}>{fmt(item.grandTotal)}</td>
                    <td style={{ ...s.td, textAlign:"center", color:item.daysOutstanding>7?"#ef4444":"#374151" }}>{done?"—":`${item.daysOutstanding}d`}</td>
                    <td style={s.td}><span style={done?s.pillGreen:s.pillAmber}>{done?"Reconciled":"Pending"}</span></td>
                    <td style={s.td}><span style={s.mono}>{item.reconReference||"—"}</span></td>
                    <td style={s.td}>{fmtDate(item.reconciledAt)}</td>
                    <td style={s.td}><button style={done?s.editBtn:s.reconBtn} onClick={()=>openRecon(item)}>{done?"✏️ Edit":"✔ Reconcile"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reconTarget && (
        <div style={s.overlay} onClick={() => setReconTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}><h2 style={s.modalTitle}>Reconcile Invoice</h2><button style={s.closeBtn} onClick={() => setReconTarget(null)}>✕</button></div>
            <div style={s.modalSummary}>
              <div style={s.summaryRow}><span style={s.summaryLabel}>Invoice</span><span style={s.mono}>{reconTarget.invoiceNumber||reconTarget.invoiceId.slice(0,8)}</span></div>
              <div style={s.summaryRow}><span style={s.summaryLabel}>Client</span><span>{reconTarget.customerName||reconTarget.customerId}</span></div>
              <div style={s.summaryRow}><span style={s.summaryLabel}>Amount</span><span style={s.summaryAmount}>{fmt(reconTarget.grandTotal)}</span></div>
              <div style={s.summaryRow}><span style={s.summaryLabel}>Payment Type</span><span>{reconTarget.paymentType}</span></div>
              <div style={s.summaryRow}><span style={s.summaryLabel}>Invoice Date</span><span>{fmtDate(reconTarget.createdAt)}</span></div>
            </div>
            {reconTarget.paymentType==="EFT" && reconTarget.receiptS3Key && (
              <div style={s.receiptRow}>
                {receiptViewUrl
                  ? <a href={receiptViewUrl} target="_blank" rel="noreferrer" style={s.receiptLink}>📄 View Payment Receipt</a>
                  : <button style={s.receiptBtn} onClick={loadReceipt} disabled={receiptLoading}>{receiptLoading?"Loading…":"📄 Load Receipt"}</button>}
              </div>
            )}
            <div style={s.fieldGroup}><label style={s.label}>Bank Reference / Statement Ref</label><input style={s.input} placeholder="e.g. NEDBANK-20240415-0023" value={reconRef} onChange={e=>setReconRef(e.target.value)} /></div>
            <div style={s.fieldGroup}><label style={s.label}>Date Received on Statement</label><input type="date" style={s.input} value={reconDate} onChange={e=>setReconDate(e.target.value)} /></div>
            <div style={s.fieldGroup}><label style={s.label}>Notes (optional)</label><textarea style={s.textarea} rows={3} value={reconNotes} onChange={e=>setReconNotes(e.target.value)} /></div>
            {reconError && <div style={s.errorBanner}>{reconError}</div>}
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setReconTarget(null)}>Cancel</button>
              <button style={s.submitBtn} disabled={reconBusy} onClick={submitRecon}>{reconBusy?"Saving…":"✔ Confirm Reconciliation"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Bank Statements tab ────────────────────────────────────────────────────

function BankStatementsTab() {
  const [statements,    setStatements]    = useState<BankStatementSummaryResponse[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [selected,      setSelected]      = useState<BankStatementResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Left-panel filters
  const [txTypeFilter,  setTxTypeFilter]  = useState<"all"|"Credit"|"Debit">("Credit");
  const [txAllocFilter, setTxAllocFilter] = useState<"all"|"unallocated"|"allocated">("unallocated");
  const [txSearch,      setTxSearch]      = useState("");

  // Left-panel selection
  const [activeTx, setActiveTx] = useState<BankTransactionResponse | null>(null);

  // Right-panel: clients
  const [clients,       setClients]       = useState<ClientDto[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientSearch,  setClientSearch]  = useState("");
  const [pickedClient,  setPickedClient]  = useState<ClientDto | null>(null);

  // Right-panel: invoices
  const [invoices,        setInvoices]        = useState<InvoiceResponse[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Allocation busy
  const [allocBusy,  setAllocBusy]  = useState<string | null>(null); // invoiceId being allocated
  const [allocError, setAllocError] = useState("");

  // ── Load list ────────────────────────────────────────────────────────────

  async function loadStatements() {
    setLoading(true); setError("");
    try { setStatements(await bankStatementsApi.list()); }
    catch (e: any) { setError(e?.message ?? "Failed to load statements."); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadStatements(); }, []);

  // ── Load clients once ────────────────────────────────────────────────────

  async function ensureClients() {
    if (clientsLoaded) return;
    try { setClients(await clientsApi.list()); setClientsLoaded(true); }
    catch { /* ignore — user can retry */ }
  }

  // ── Open statement ────────────────────────────────────────────────────────

  async function openStatement(statementId: string) {
    setDetailLoading(true);
    setActiveTx(null); setPickedClient(null); setInvoices([]); setAllocError("");
    setTxSearch(""); setTxTypeFilter("Credit"); setTxAllocFilter("unallocated");
    try { setSelected(await bankStatementsApi.get(statementId)); await ensureClients(); }
    catch (e: any) { setError(e?.message ?? "Failed to load statement."); }
    finally { setDetailLoading(false); }
  }

  function closeStatement() {
    setSelected(null); setActiveTx(null); setPickedClient(null); setInvoices([]);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(true); setUploadProgress("Getting upload URL…"); setError("");
    try {
      const { uploadUrl, s3Key } = await bankStatementsApi.getUploadUrl(file.name);
      setUploadProgress("Uploading CSV to S3…");
      const put = await fetch(uploadUrl, { method:"PUT", body:file, headers:{"Content-Type":"text/csv"} });
      if (!put.ok) throw new Error("Upload to S3 failed.");
      setUploadProgress("Parsing statement…");
      const result = await bankStatementsApi.process({ s3Key, fileName:file.name });
      await loadStatements();
      openStatement(result.statementId);
    } catch (e: any) { setError(e?.message ?? "Upload failed."); }
    finally { setUploading(false); setUploadProgress(""); }
  }

  // ── Select transaction ────────────────────────────────────────────────────

  function selectTx(tx: BankTransactionResponse) {
    setActiveTx(tx === activeTx ? null : tx);
    setPickedClient(null); setInvoices([]); setAllocError("");
    ensureClients();
  }

  // ── Pick client ───────────────────────────────────────────────────────────

  async function pickClient(client: ClientDto) {
    setPickedClient(client); setInvoices([]); setInvoicesLoading(true); setAllocError("");
    try { setInvoices(await invoicesApi.listByClient(client.clientId)); }
    catch { setAllocError("Failed to load invoices for this client."); }
    finally { setInvoicesLoading(false); }
  }

  // ── Allocate ──────────────────────────────────────────────────────────────

  async function allocate(invoice: InvoiceResponse) {
    if (!selected || !activeTx) return;
    setAllocBusy(invoice.invoiceId); setAllocError("");
    try {
      const updated = await bankStatementsApi.allocate(
        selected.statementId, activeTx.transactionId, { invoiceId: invoice.invoiceId }
      );
      setSelected(updated);
      setActiveTx(null); setPickedClient(null); setInvoices([]);
      await loadStatements();
    } catch (e: any) { setAllocError(e?.message ?? "Failed to allocate."); }
    finally { setAllocBusy(null); }
  }

  // ── Deallocate ────────────────────────────────────────────────────────────

  async function deallocate(tx: BankTransactionResponse) {
    if (!selected) return;
    if (!window.confirm(`Remove allocation from invoice ${tx.allocatedInvoiceNumber}?`)) return;
    setError("");
    try {
      const updated = await bankStatementsApi.deallocate(selected.statementId, tx.transactionId);
      setSelected(updated);
      if (activeTx?.transactionId === tx.transactionId) setActiveTx(null);
      await loadStatements();
    } catch (e: any) { setError(e?.message ?? "Failed to deallocate."); }
  }

  // ── Filtered transactions ─────────────────────────────────────────────────

  const visibleTx = (selected?.transactions ?? []).filter(tx => {
    if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
    if (txAllocFilter === "unallocated" && tx.isAllocated) return false;
    if (txAllocFilter === "allocated"   && !tx.isAllocated) return false;
    if (txSearch) {
      const q = txSearch.toLowerCase();
      return tx.description.toLowerCase().includes(q) || tx.reference.toLowerCase().includes(q);
    }
    return true;
  });

  // Filtered client list
  const visibleClients = clients.filter(c =>
    !clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Invoices for the picked client, sorted by date desc
  const sortedInvoices = [...invoices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // ── Summary KPIs ──────────────────────────────────────────────────────────

  const totalCredits    = statements.reduce((sum, s) => sum + s.totalCredits, 0);
  const totalAllocated  = statements.reduce((sum, s) => sum + s.allocatedCount, 0);
  const totalUnalloc    = statements.reduce((sum, s) => sum + s.creditCount - s.allocatedCount, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  if (selected) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {error && <div style={s.errorBanner}>{error}</div>}

        {/* Statement header bar */}
        <div style={s.detailHeader}>
          <button style={s.backBtn} onClick={closeStatement}>← Back</button>
          <div style={{ flex:1 }}>
            <span style={{ fontWeight:700, fontSize:15 }}>{selected.fileName}</span>
            <span style={{ color:"#6b7280", fontSize:13, marginLeft:10 }}>Uploaded {fmtDate(selected.uploadedAt)}</span>
          </div>
          <div style={s.detailKpis}>
            <span style={s.kpiBadge}>{selected.transactionCount} transactions</span>
            <span style={{ ...s.kpiBadge, background:"#eff6ff", color:"#2563eb" }}>
              {selected.creditCount} credits · {fmt(selected.totalCredits)}
            </span>
            <span style={{ ...s.kpiBadge, background:"#f0fdf4", color:"#15803d" }}>
              {selected.allocatedCount}/{selected.creditCount} allocated
            </span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...s.filterRow, marginBottom:0 }}>
          <div style={s.filterGroup}>
            <label style={s.filterLabel}>Type</label>
            <select style={s.select} value={txTypeFilter} onChange={e=>setTxTypeFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="Credit">Credits only</option>
              <option value="Debit">Debits only</option>
            </select>
          </div>
          <div style={s.filterGroup}>
            <label style={s.filterLabel}>Allocation</label>
            <select style={s.select} value={txAllocFilter} onChange={e=>setTxAllocFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="unallocated">Unallocated</option>
              <option value="allocated">Allocated</option>
            </select>
          </div>
          <div style={s.filterGroup}>
            <label style={s.filterLabel}>Search</label>
            <input style={{ ...s.input, minWidth:200 }} placeholder="Description or ref…" value={txSearch} onChange={e=>setTxSearch(e.target.value)} />
          </div>
          <div style={{ alignSelf:"flex-end", color:"#6b7280", fontSize:13, paddingBottom:8 }}>
            {visibleTx.length} rows
          </div>
        </div>

        {/* Split panel */}
        <div style={sp.splitWrap}>

          {/* ── LEFT: Transaction list ── */}
          <div style={sp.leftPanel}>
            <div style={sp.panelTitle}>Bank Transactions</div>
            <div style={sp.txList}>
              {visibleTx.length === 0 ? (
                <div style={{ padding:"32px 16px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>
                  No transactions match the filters.
                </div>
              ) : visibleTx.map(tx => {
                const isActive    = activeTx?.transactionId === tx.transactionId;
                const isAllocated = tx.isAllocated;
                return (
                  <div
                    key={tx.transactionId}
                    style={{
                      ...sp.txRow,
                      ...(isActive    ? sp.txRowActive    : {}),
                      ...(isAllocated ? sp.txRowAllocated : {}),
                    }}
                    onClick={() => !isAllocated && selectTx(tx)}
                  >
                    <div style={sp.txTop}>
                      <span style={sp.txDate}>{fmtDate(tx.date)}</span>
                      <span style={{ ...sp.txAmount, color: isAllocated ? "#15803d" : "#111827" }}>
                        {fmt(tx.amount)}
                      </span>
                    </div>
                    <div style={sp.txDesc}>{tx.description}</div>
                    {tx.reference && <div style={sp.txRef}>{tx.reference}</div>}
                    {isAllocated ? (
                      <div style={sp.txAllocBadge}>
                        ✓ {tx.allocatedInvoiceNumber || tx.allocatedInvoiceId.slice(0,8)}
                        <button
                          style={sp.unlinkBtn}
                          onClick={e => { e.stopPropagation(); deallocate(tx); }}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    ) : (
                      <div style={sp.txSelectHint}>
                        {isActive ? "← Select a client to the right" : "Click to allocate"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Client + Invoice picker ── */}
          <div style={sp.rightPanel}>
            {!activeTx ? (
              <div style={sp.emptyRight}>
                <div style={{ fontSize:32, marginBottom:12 }}>←</div>
                <div style={{ fontSize:15, fontWeight:600, color:"#374151" }}>
                  Select a bank transaction
                </div>
                <div style={{ fontSize:13, color:"#9ca3af", marginTop:4 }}>
                  Click an unallocated credit on the left to find a matching invoice
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

                {/* Active transaction summary */}
                <div style={sp.activeTxCard}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6b7280", marginBottom:6 }}>
                    Selected bank transaction
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#111827" }}>{fmtDate(activeTx.date)}</div>
                      <div style={{ fontSize:13, color:"#374151", marginTop:2 }}>{activeTx.description}</div>
                      {activeTx.reference && <div style={{ fontSize:12, color:"#6b7280", fontFamily:"monospace" }}>{activeTx.reference}</div>}
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#1e293b", marginLeft:16, whiteSpace:"nowrap" }}>
                      {fmt(activeTx.amount)}
                    </div>
                  </div>
                </div>

                {allocError && <div style={{ ...s.errorBanner, margin:"8px 0 0" }}>{allocError}</div>}

                {/* Client picker or selected client */}
                {!pickedClient ? (
                  <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", marginTop:12 }}>
                    <div style={sp.panelTitle}>Select Client</div>
                    <input
                      style={{ ...s.input, margin:"8px 0", width:"100%", boxSizing:"border-box" }}
                      placeholder="Search client name…"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                    />
                    <div style={sp.clientList}>
                      {visibleClients.length === 0 ? (
                        <div style={{ padding:"20px 0", textAlign:"center", color:"#9ca3af", fontSize:13 }}>No clients found.</div>
                      ) : visibleClients.map(c => (
                        <div key={c.clientId} style={sp.clientRow} onClick={() => pickClient(c)}>
                          <div style={{ fontWeight:600, fontSize:14, color:"#111827" }}>{c.clientName}</div>
                          <div style={{ fontSize:12, color:"#6b7280" }}>{c.clientCity || c.clientAddress || ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", marginTop:12 }}>
                    {/* Selected client header */}
                    <div style={sp.selectedClientBar}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6b7280" }}>Client</div>
                        <div style={{ fontWeight:700, fontSize:15, color:"#111827" }}>{pickedClient.clientName}</div>
                      </div>
                      <button style={sp.changeClientBtn} onClick={() => { setPickedClient(null); setInvoices([]); setAllocError(""); }}>
                        Change
                      </button>
                    </div>

                    {/* Invoice list */}
                    <div style={{ ...sp.panelTitle, marginTop:10 }}>
                      Payments / Invoices
                    </div>
                    <div style={sp.invoiceList}>
                      {invoicesLoading ? (
                        <div style={{ padding:"20px 0", textAlign:"center", color:"#9ca3af", fontSize:13 }}>Loading invoices…</div>
                      ) : sortedInvoices.length === 0 ? (
                        <div style={{ padding:"20px 0", textAlign:"center", color:"#9ca3af", fontSize:13 }}>No invoices found for this client.</div>
                      ) : sortedInvoices.map(inv => {
                        const isReconced = !!(inv as any).reconciledAt;
                        const busy       = allocBusy === inv.invoiceId;
                        return (
                          <div key={inv.invoiceId} style={{ ...sp.invoiceRow, ...(isReconced ? sp.invoiceRowReconced : {}) }}>
                            <div style={sp.invoiceLeft}>
                              <span style={s.mono}>{inv.invoiceNumber}</span>
                              <span style={{ color:"#6b7280", fontSize:12, marginLeft:8 }}>{fmtDate(inv.createdAt)}</span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontWeight:700, fontSize:14 }}>{fmt(inv.grandTotal)}</span>
                              <span style={{ ...s.badge, ...(inv.paymentType==="EFT"?s.badgeEFT:s.badgeCash), fontSize:11 }}>
                                {inv.paymentType}
                              </span>
                              {isReconced
                                ? <span style={{ ...s.pillGreen, fontSize:11 }}>Reconciled</span>
                                : <button
                                    style={{ ...sp.allocBtn, opacity: busy ? 0.6 : 1 }}
                                    disabled={!!allocBusy}
                                    onClick={() => allocate(inv)}
                                  >
                                    {busy ? "…" : "Allocate"}
                                  </button>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Statement list (no statement selected) ─────────────────────────────

  return (
    <>
      {error && <div style={s.errorBanner}>{error}</div>}

      <div style={s.kpiRow}>
        <div style={s.kpiCard}><div style={s.kpiValue}>{statements.length}</div><div style={s.kpiLabel}>Statements</div></div>
        <div style={s.kpiCard}><div style={s.kpiValue}>{fmt(totalCredits)}</div><div style={s.kpiLabel}>Total Credits</div></div>
        <div style={{ ...s.kpiCard, ...s.kpiGreen }}><div style={s.kpiValue}>{totalAllocated}</div><div style={s.kpiLabel}>Allocated</div></div>
        <div style={s.kpiCard}>
          <div style={{ ...s.kpiValue, color:totalUnalloc>0?"#ef4444":"#111827" }}>{totalUnalloc}</div>
          <div style={s.kpiLabel}>Unallocated Credits</div>
        </div>
      </div>

      {/* Upload */}
      <div style={s.uploadArea}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:"none" }}
          onChange={e => { const f=e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }} />
        {uploading ? (
          <div style={s.uploadBusy}><span>⏳</span><span>{uploadProgress||"Processing…"}</span></div>
        ) : (
          <div style={s.uploadIdle}>
            <div style={s.uploadIcon}>📄</div>
            <div style={{ fontSize:15, fontWeight:600, color:"#374151", marginBottom:6 }}>Upload Bank Statement CSV</div>
            <div style={{ fontSize:13, color:"#6b7280", marginBottom:14 }}>Supports Nedbank, FNB, Standard Bank, ABSA</div>
            <button style={s.uploadBtn} onClick={() => fileRef.current?.click()}>Choose CSV File</button>
          </div>
        )}
      </div>

      {loading ? <div style={s.empty}>Loading…</div> :
       statements.length === 0 ? <div style={s.empty}>No bank statements uploaded yet.</div> : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>File Name</th>
              <th style={s.th}>Uploaded</th>
              <th style={{ ...s.th, textAlign:"right" }}>Transactions</th>
              <th style={{ ...s.th, textAlign:"right" }}>Credits</th>
              <th style={{ ...s.th, textAlign:"right" }}>Total Credits</th>
              <th style={{ ...s.th, textAlign:"right" }}>Allocated</th>
              <th style={s.th}>Progress</th>
              <th style={s.th}></th>
            </tr></thead>
            <tbody>
              {statements.map(stmt => {
                const pct = stmt.creditCount > 0 ? Math.round((stmt.allocatedCount/stmt.creditCount)*100) : 0;
                return (
                  <tr key={stmt.statementId} style={s.rowPending}>
                    <td style={s.td}>{stmt.fileName}</td>
                    <td style={s.td}>{fmtDate(stmt.uploadedAt)}</td>
                    <td style={{ ...s.td, textAlign:"right" }}>{stmt.transactionCount}</td>
                    <td style={{ ...s.td, textAlign:"right" }}>{stmt.creditCount}</td>
                    <td style={{ ...s.td, textAlign:"right" }}>{fmt(stmt.totalCredits)}</td>
                    <td style={{ ...s.td, textAlign:"right" }}>{stmt.allocatedCount}/{stmt.creditCount}</td>
                    <td style={{ ...s.td, minWidth:110 }}>
                      <div style={s.progressBg}>
                        <div style={{ ...s.progressBar, width:`${pct}%`, background:pct===100?"#22c55e":"#3b82f6" }} />
                      </div>
                      <span style={{ fontSize:11, color:"#6b7280" }}>{pct}%</span>
                    </td>
                    <td style={s.td}>
                      <button style={s.reconBtn} onClick={() => openStatement(stmt.statementId)} disabled={detailLoading}>
                        Open
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
  );
}

// ── Split-panel styles ─────────────────────────────────────────────────────

const sp: Record<string, React.CSSProperties> = {
  splitWrap: {
    display: "flex",
    gap: 0,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff",
    height: "calc(100vh - 340px)",
    minHeight: 480,
  },
  leftPanel: {
    width: "44%",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "14px 16px",
    overflow: "hidden",
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#6b7280",
    padding: "12px 14px 6px",
    borderBottom: "1px solid #f1f5f9",
  },
  txList: {
    flex: 1,
    overflowY: "auto" as const,
  },
  txRow: {
    padding: "12px 14px",
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  txRowActive: {
    background: "#eff6ff",
    borderLeft: "3px solid #3b82f6",
    paddingLeft: 11,
  },
  txRowAllocated: {
    background: "#f0fdf4",
    cursor: "default",
  },
  txTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 2,
  },
  txDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  txAmount: {
    fontSize: 14,
    fontWeight: 700,
  },
  txDesc: {
    fontSize: 13,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  txRef: {
    fontSize: 11,
    color: "#9ca3af",
    fontFamily: "monospace",
    marginTop: 2,
  },
  txAllocBadge: {
    marginTop: 4,
    fontSize: 12,
    color: "#15803d",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  txSelectHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#9ca3af",
  },
  unlinkBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
  },
  emptyRight: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    textAlign: "center",
  },
  activeTxCard: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 10,
    padding: "12px 14px",
  },
  clientList: {
    flex: 1,
    overflowY: "auto" as const,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
  },
  clientRow: {
    padding: "10px 14px",
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
  },
  selectedClientBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    padding: "10px 14px",
  },
  changeClientBtn: {
    background: "none",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
    color: "#374151",
  },
  invoiceList: {
    flex: 1,
    overflowY: "auto" as const,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    marginTop: 6,
  },
  invoiceRow: {
    padding: "10px 14px",
    borderBottom: "1px solid #f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  invoiceRowReconced: {
    background: "#f0fdf4",
    opacity: 0.7,
  },
  invoiceLeft: {
    display: "flex",
    alignItems: "baseline",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  allocBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
};

// ── Shared styles ──────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding:"24px", fontFamily:"system-ui, -apple-system, sans-serif", maxWidth:1500, margin:"0 auto" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 },
  title: { fontSize:22, fontWeight:700, color:"#111827", margin:0 },
  tabRow: { display:"flex", gap:4, background:"#f1f5f9", borderRadius:10, padding:4 },
  tabBtn: { background:"none", border:"none", borderRadius:7, padding:"7px 18px", fontSize:14, fontWeight:500, color:"#6b7280", cursor:"pointer" },
  tabActive: { background:"#fff", border:"none", borderRadius:7, padding:"7px 18px", fontSize:14, fontWeight:700, color:"#111827", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.1)" },
  errorBanner: { background:"#fef2f2", border:"1px solid #fca5a5", color:"#b91c1c", borderRadius:8, padding:"10px 14px", fontSize:14, marginBottom:16 },
  kpiRow: { display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" },
  kpiCard: { flex:"1 1 180px", background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"18px 20px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  kpiGreen: { borderLeft:"4px solid #22c55e" },
  kpiValue: { fontSize:24, fontWeight:800, color:"#111827", marginBottom:4 },
  kpiLabel: { fontSize:13, color:"#6b7280" },
  filterRow: { display:"flex", alignItems:"flex-end", gap:12, marginBottom:16, flexWrap:"wrap", background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"14px 16px" },
  filterGroup: { display:"flex", flexDirection:"column", gap:4 },
  filterLabel: { fontSize:12, fontWeight:600, color:"#6b7280", textTransform:"uppercase" as const, letterSpacing:"0.04em" },
  select: { border:"1px solid #d1d5db", borderRadius:7, padding:"7px 10px", fontSize:14, color:"#111827", background:"#fff", minWidth:130 },
  input: { border:"1px solid #d1d5db", borderRadius:7, padding:"7px 10px", fontSize:14, color:"#111827", background:"#fff", minWidth:180 },
  applyBtn: { background:"#1e293b", color:"#fff", border:"none", borderRadius:8, padding:"8px 20px", fontSize:14, fontWeight:600, cursor:"pointer", alignSelf:"flex-end", height:38 },
  tableWrap: { overflowX:"auto", borderRadius:10, border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  table: { width:"100%", borderCollapse:"collapse", fontSize:14 },
  th: { background:"#f8fafc", color:"#6b7280", fontSize:12, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em", padding:"12px 14px", textAlign:"left" as const, borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" as const },
  td: { padding:"11px 14px", borderBottom:"1px solid #f1f5f9", color:"#374151", whiteSpace:"nowrap" as const },
  rowPending: { background:"#fff" },
  rowReconced: { background:"#f0fdf4" },
  empty: { textAlign:"center", color:"#9ca3af", padding:"48px 0", fontSize:15 },
  badge: { display:"inline-block", padding:"3px 8px", borderRadius:6, fontSize:12, fontWeight:600 },
  badgeEFT: { background:"#eff6ff", color:"#2563eb" },
  badgeCash: { background:"#f0fdf4", color:"#15803d" },
  pillGreen: { display:"inline-block", background:"#dcfce7", color:"#15803d", fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20 },
  pillAmber: { display:"inline-block", background:"#fef3c7", color:"#92400e", fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20 },
  mono: { fontFamily:"monospace", fontSize:13 },
  reconBtn: { background:"#22c55e", color:"#fff", border:"none", borderRadius:6, padding:"5px 12px", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" as const },
  editBtn: { background:"#f1f5f9", color:"#374151", border:"1px solid #d1d5db", borderRadius:6, padding:"5px 12px", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" as const },
  uploadArea: { border:"2px dashed #d1d5db", borderRadius:14, padding:"32px 24px", marginBottom:24, background:"#fafafa", textAlign:"center" },
  uploadIdle: { display:"flex", flexDirection:"column", alignItems:"center" },
  uploadIcon: { fontSize:36, marginBottom:8 },
  uploadBtn: { background:"#1e293b", color:"#fff", border:"none", borderRadius:8, padding:"10px 28px", fontSize:14, fontWeight:600, cursor:"pointer" },
  uploadBusy: { display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontSize:15, color:"#374151" },
  detailHeader: { display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" },
  backBtn: { background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 14px", fontSize:14, cursor:"pointer", color:"#374151", whiteSpace:"nowrap" as const },
  detailKpis: { display:"flex", gap:8, flexWrap:"wrap" },
  kpiBadge: { background:"#f1f5f9", color:"#374151", borderRadius:8, padding:"5px 12px", fontSize:13, fontWeight:600 },
  progressBg: { background:"#e5e7eb", borderRadius:4, height:6, width:"100%", marginBottom:2, overflow:"hidden" },
  progressBar: { height:6, borderRadius:4 },
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  modal: { background:"#fff", borderRadius:14, width:"100%", maxWidth:500, boxShadow:"0 20px 60px rgba(0,0,0,0.25)", maxHeight:"90vh", overflowY:"auto", padding:24, display:"flex", flexDirection:"column", gap:16 },
  modalHeader: { display:"flex", alignItems:"center", justifyContent:"space-between" },
  modalTitle: { fontSize:18, fontWeight:700, color:"#111827", margin:0 },
  closeBtn: { background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#6b7280", padding:4 },
  modalSummary: { background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"14px 16px", display:"flex", flexDirection:"column", gap:8 },
  summaryRow: { display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:14 },
  summaryLabel: { color:"#6b7280", fontWeight:500 },
  summaryAmount: { fontSize:17, fontWeight:800, color:"#111827" },
  receiptRow: { display:"flex", alignItems:"center" },
  receiptBtn: { background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe", borderRadius:8, padding:"7px 14px", fontSize:14, cursor:"pointer", fontWeight:600 },
  receiptLink: { color:"#2563eb", fontSize:14, fontWeight:600, textDecoration:"none" },
  fieldGroup: { display:"flex", flexDirection:"column", gap:6 },
  label: { fontSize:13, fontWeight:600, color:"#374151" },
  textarea: { border:"1px solid #d1d5db", borderRadius:7, padding:"8px 10px", fontSize:14, color:"#111827", fontFamily:"system-ui, -apple-system, sans-serif", resize:"vertical" as const },
  modalFooter: { display:"flex", justifyContent:"flex-end", gap:10, paddingTop:4 },
  cancelBtn: { background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 20px", fontSize:14, cursor:"pointer", color:"#374151" },
  submitBtn: { background:"#22c55e", color:"#fff", border:"none", borderRadius:8, padding:"9px 22px", fontSize:14, fontWeight:700, cursor:"pointer" },
};
