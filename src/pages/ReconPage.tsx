import React, { useEffect, useRef, useState } from "react";
import { invoicesApi } from "../api/invoicesApi";
import type { ReconInvoiceItem, InvoiceResponse } from "../api/invoicesApi";
import { bankStatementsApi } from "../api/bankStatementsApi";
import type {
  BankStatementSummaryResponse,
  BankStatementResponse,
  BankTransactionResponse,
  AllocationWarning,
  BankReconAllocationReportItem,
} from "../api/bankStatementsApi";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { suppliersApi } from "../api/suppliersApi";
import type { SupplierResponse } from "../api/suppliersApi";

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

// ── Root ───────────────────────────────────────────────────────────────────

export default function ReconPage() {
  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Reconciliation</h1>
      </div>
      <BankStatementsTab />
    </div>
  );
}

// ── Bank Statements tab ────────────────────────────────────────────────────

type RightMode = "matches" | "browse" | "suppliers" | "nonclient";

function BankStatementsTab() {
  // Statement list
  const [statements,    setStatements]    = useState<BankStatementSummaryResponse[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [selected,      setSelected]      = useState<BankStatementResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Allocation report view
  const [showReport,    setShowReport]    = useState(false);
  const [report,        setReport]        = useState<BankReconAllocationReportItem[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFrom,    setReportFrom]    = useState(thirtyDaysAgoIso());
  const [reportTo,      setReportTo]      = useState(todayIso());

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Left-panel filters
  const [txTypeFilter,  setTxTypeFilter]  = useState<"all"|"Credit"|"Debit">("Credit");
  const [txAllocFilter, setTxAllocFilter] = useState<"all"|"unallocated"|"allocated">("unallocated");
  const [txSearch,      setTxSearch]      = useState("");

  // Selected transaction
  const [activeTx, setActiveTx] = useState<BankTransactionResponse | null>(null);

  // Right panel
  const [rightMode,    setRightMode]    = useState<RightMode>("matches");
  const [warning,      setWarning]      = useState<AllocationWarning | null>(null);
  const [allocError,   setAllocError]   = useState("");
  const [allocBusy,    setAllocBusy]    = useState<string | null>(null);

  // Smart matches
  const [matches,        setMatches]        = useState<ReconInvoiceItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchSearch,    setMatchSearch]    = useState("");

  // Browse clients
  const [clients,       setClients]       = useState<ClientDto[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientSearch,  setClientSearch]  = useState("");
  const [pickedClient,  setPickedClient]  = useState<ClientDto | null>(null);
  const [clientInvoices,     setClientInvoices]     = useState<InvoiceResponse[]>([]);
  const [clientInvLoading,   setClientInvLoading]   = useState(false);

  // Non-client allocation
  const [ncDescription, setNcDescription] = useState("");
  const [ncAmount,      setNcAmount]      = useState("");

  // Browse suppliers
  const [suppliers,       setSuppliers]       = useState<SupplierResponse[]>([]);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);
  const [supplierSearch,  setSupplierSearch]  = useState("");
  const [pickedSupplier,  setPickedSupplier]  = useState<SupplierResponse | null>(null);
  const [supplierNotes,   setSupplierNotes]   = useState("");

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function loadStatements() {
    setLoading(true); setError("");
    try { setStatements(await bankStatementsApi.list()); }
    catch (e: any) { setError(e?.message ?? "Failed to load statements."); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadStatements(); }, []);

  async function ensureClients() {
    if (clientsLoaded) return;
    try { setClients(await clientsApi.list()); setClientsLoaded(true); }
    catch { /* ignore */ }
  }

  async function openStatement(statementId: string) {
    setDetailLoading(true);
    resetRightPanel();
    setTxSearch(""); setTxTypeFilter("Credit"); setTxAllocFilter("unallocated");
    try { setSelected(await bankStatementsApi.get(statementId)); }
    catch (e: any) { setError(e?.message ?? "Failed to load statement."); }
    finally { setDetailLoading(false); }
  }

  async function loadReport() {
    setReportLoading(true);
    try {
      const data = await bankStatementsApi.getAllocationReport({
        from: reportFrom || undefined,
        to:   reportTo   ? reportTo + "T23:59:59Z" : undefined,
      });
      setReport(data);
    } catch (e: any) { setError(e?.message ?? "Failed to load report."); }
    finally { setReportLoading(false); }
  }
  useEffect(() => { if (showReport) loadReport(); }, [showReport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(true); setUploadProgress("Getting upload URL…"); setError("");
    try {
      const { uploadUrl, s3Key } = await bankStatementsApi.getUploadUrl(file.name);
      setUploadProgress("Uploading CSV…");
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "text/csv" } });
      if (!put.ok) throw new Error("Upload to S3 failed.");
      setUploadProgress("Parsing statement…");
      const result = await bankStatementsApi.process({ s3Key, fileName: file.name });
      await loadStatements();
      openStatement(result.statementId);
    } catch (e: any) { setError(e?.message ?? "Upload failed."); }
    finally { setUploading(false); setUploadProgress(""); }
  }

  // ── Select transaction + fetch smart matches ───────────────────────────

  function resetRightPanel() {
    setActiveTx(null); setRightMode("matches"); setWarning(null); setAllocError("");
    setMatches([]); setMatchSearch(""); setPickedClient(null); setClientInvoices([]);
    setNcDescription(""); setNcAmount("");
    setPickedSupplier(null); setSupplierNotes(""); setSupplierSearch("");
  }

  async function selectTx(tx: BankTransactionResponse) {
    if (activeTx?.transactionId === tx.transactionId) { resetRightPanel(); return; }
    setActiveTx(tx); setRightMode("matches"); setWarning(null); setAllocError("");
    setMatches([]); setMatchSearch(""); setPickedClient(null); setClientInvoices([]);
    setNcDescription(""); setNcAmount("");
    setPickedSupplier(null); setSupplierNotes(""); setSupplierSearch("");

    // Load smart matches
    setMatchesLoading(true);
    try { setMatches(await bankStatementsApi.getMatches(selected!.statementId, tx.transactionId)); }
    catch { /* silent — show empty state */ }
    finally { setMatchesLoading(false); }
  }

  async function searchMatches(q: string) {
    if (!selected || !activeTx) return;
    setMatchSearch(q);
    setMatchesLoading(true);
    try { setMatches(await bankStatementsApi.getMatches(selected.statementId, activeTx.transactionId, q)); }
    catch { /* silent */ }
    finally { setMatchesLoading(false); }
  }

  // ── Browse clients ────────────────────────────────────────────────────────

  async function switchToBrowse() {
    setRightMode("browse"); setPickedClient(null); setClientInvoices([]);
    await ensureClients();
  }

  async function pickClient(client: ClientDto) {
    setPickedClient(client); setClientInvoices([]); setClientInvLoading(true);
    try { setClientInvoices(await invoicesApi.listByClient(client.clientId)); }
    catch { setAllocError("Failed to load invoices for this client."); }
    finally { setClientInvLoading(false); }
  }

  // ── Browse suppliers ──────────────────────────────────────────────────────

  async function ensureSuppliers() {
    if (suppliersLoaded) return;
    try { setSuppliers(await suppliersApi.list()); setSuppliersLoaded(true); }
    catch { /* ignore */ }
  }

  async function switchToSuppliers() {
    setRightMode("suppliers"); setPickedSupplier(null); setSupplierNotes("");
    await ensureSuppliers();
  }

  // ── Allocate ──────────────────────────────────────────────────────────────

  async function allocateToInvoice(invoiceId: string) {
    if (!selected || !activeTx) return;
    setAllocBusy(invoiceId); setAllocError("");
    try {
      const res = await bankStatementsApi.allocate(selected.statementId, activeTx.transactionId, { invoiceId });
      setSelected(res.statement);
      setWarning(res.warning ?? null);
      if (!res.warning) resetRightPanel();
      else setActiveTx(null); // keep warning visible but deselect tx
      await loadStatements();
    } catch (e: any) { setAllocError(e?.message ?? "Failed to allocate."); }
    finally { setAllocBusy(null); }
  }

  async function allocateToSupplier() {
    if (!selected || !activeTx || !pickedSupplier) return;
    setAllocBusy(pickedSupplier.supplierId); setAllocError("");
    try {
      const res = await bankStatementsApi.allocateSupplier(
        selected.statementId, activeTx.transactionId,
        { supplierId: pickedSupplier.supplierId, notes: supplierNotes.trim() || undefined }
      );
      setSelected(res.statement);
      setWarning(res.warning ?? null);
      resetRightPanel();
      await loadStatements();
    } catch (e: any) { setAllocError(e?.message ?? "Failed to allocate."); }
    finally { setAllocBusy(null); }
  }

  async function allocateNonClient() {
    if (!selected || !activeTx || !ncDescription.trim()) return;
    const parsedAmt = ncAmount ? parseFloat(ncAmount) : 0;
    setAllocBusy("nonclient"); setAllocError("");
    try {
      const res = await bankStatementsApi.allocateNonClient(
        selected.statementId, activeTx.transactionId,
        { description: ncDescription.trim(), amount: parsedAmt }
      );
      setSelected(res.statement);
      setWarning(res.warning ?? null);
      if (!res.warning) resetRightPanel();
      else setActiveTx(null);
      await loadStatements();
    } catch (e: any) { setAllocError(e?.message ?? "Failed to allocate."); }
    finally { setAllocBusy(null); }
  }

  async function deallocate(tx: BankTransactionResponse) {
    if (!selected) return;
    if (!window.confirm(`Remove allocation from this transaction?`)) return;
    try {
      const updated = await bankStatementsApi.deallocate(selected.statementId, tx.transactionId);
      setSelected(updated); setWarning(null);
      if (activeTx?.transactionId === tx.transactionId) resetRightPanel();
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

  const visibleClients = clients.filter(c =>
    !clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase())
  );
  const visibleSuppliers = suppliers.filter(sup =>
    !supplierSearch || sup.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );
  const sortedClientInvoices = [...clientInvoices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalUnalloc  = statements.reduce((sum, s) => sum + s.unallocatedCount, 0);
  const totalUnallocAmt = statements.reduce((sum, s) => sum + s.unallocatedAmount, 0);

  // ── Allocation report view ────────────────────────────────────────────────

  if (showReport) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <div style={s.errorBanner}>{error}</div>}
        <div style={s.detailHeader}>
          <button style={s.backBtn} onClick={() => setShowReport(false)}>← Back</button>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Allocation Report</span>
          <div style={s.filterRow}>
            <div style={s.filterGroup}><label style={s.filterLabel}>From</label><input type="date" style={s.input} value={reportFrom} onChange={e=>setReportFrom(e.target.value)} /></div>
            <div style={s.filterGroup}><label style={s.filterLabel}>To</label><input type="date" style={s.input} value={reportTo} onChange={e=>setReportTo(e.target.value)} /></div>
            <button style={s.applyBtn} onClick={loadReport} disabled={reportLoading}>{reportLoading?"Loading…":"Apply"}</button>
          </div>
        </div>
        {reportLoading ? <div style={s.empty}>Loading…</div> :
         report.length === 0 ? <div style={s.empty}>No allocated transactions in this date range.</div> : (
          <div style={s.tableWrap}><table style={s.table}>
            <thead><tr>
              <th style={s.th}>Date</th><th style={s.th}>File</th><th style={s.th}>Description</th>
              <th style={s.th}>Reference</th><th style={{...s.th,textAlign:"right"}}>Amount</th>
              <th style={s.th}>Type</th><th style={s.th}>Allocated To</th><th style={s.th}>Allocated At</th>
            </tr></thead>
            <tbody>
              {report.map(r => (
                <tr key={r.transactionId} style={s.rowPending}>
                  <td style={s.td}>{fmtDate(r.date)}</td>
                  <td style={{...s.td,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>{r.fileName}</td>
                  <td style={{...s.td,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>{r.description}</td>
                  <td style={{...s.td,...s.mono,fontSize:12}}>{r.reference||"—"}</td>
                  <td style={{...s.td,textAlign:"right",fontWeight:600}}>{fmt(r.amount)}</td>
                  <td style={s.td}>
                    {r.allocationType === "Invoice"
                      ? <span style={{...s.badge,...s.badgeEFT}}>Invoice</span>
                      : r.allocationType === "Supplier"
                      ? <span style={{...s.badge,background:"#fef3c7",color:"#92400e"}}>Supplier</span>
                      : <span style={{...s.badge,background:"#f3e8ff",color:"#7c3aed"}}>Non-Client</span>}
                  </td>
                  <td style={s.td}>
                    {r.allocationType === "Invoice"
                      ? <span style={s.mono}>{r.allocatedInvoiceNumber||r.allocatedInvoiceId.slice(0,8)}</span>
                      : r.allocationType === "Supplier"
                      ? <span>{r.allocatedSupplierName || r.allocatedSupplierId}</span>
                      : r.nonClientDescription}
                  </td>
                  <td style={s.td}>{fmtDate(r.allocatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    );
  }

  // ── Statement detail (split panel) ────────────────────────────────────────

  if (selected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div style={s.errorBanner}>{error}</div>}

        {/* Warning banner (amount mismatch) */}
        {warning && (
          <div style={sp.warningBanner}>
            <span style={{ fontWeight: 700 }}>⚠ Amount mismatch — </span>
            {warning.message}
            <span style={{ marginLeft: 8 }}>
              Bank: <b>{fmt(warning.bankAmount)}</b> · Allocated: <b>{fmt(warning.allocationAmount)}</b> · Diff: <b>{fmt(Math.abs(warning.difference))}</b>
            </span>
            <button style={sp.warnDismiss} onClick={() => setWarning(null)}>✕</button>
          </div>
        )}

        {/* Header */}
        <div style={s.detailHeader}>
          <button style={s.backBtn} onClick={() => { setSelected(null); resetRightPanel(); }}>← Back</button>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{selected.fileName}</span>
            <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 10 }}>Uploaded {fmtDate(selected.uploadedAt)}</span>
          </div>
          <div style={s.detailKpis}>
            <span style={s.kpiBadge}>{selected.transactionCount} transactions</span>
            <span style={{ ...s.kpiBadge, background: "#eff6ff", color: "#2563eb" }}>
              {selected.creditCount} credits · {fmt(selected.totalCredits)}
            </span>
            <span style={{ ...s.kpiBadge, background: "#f0fdf4", color: "#15803d" }}>
              {selected.allocatedCount}/{selected.creditCount} allocated
            </span>
            {selected.unallocatedCount > 0 && (
              <span style={{ ...s.kpiBadge, background: "#fef3c7", color: "#92400e" }}>
                {selected.unallocatedCount} unallocated · {fmt(selected.unallocatedAmount)}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...s.filterRow, marginBottom: 0 }}>
          <div style={s.filterGroup}><label style={s.filterLabel}>Type</label>
            <select style={s.select} value={txTypeFilter} onChange={e=>setTxTypeFilter(e.target.value as any)}>
              <option value="all">All</option><option value="Credit">Credits</option><option value="Debit">Debits</option>
            </select>
          </div>
          <div style={s.filterGroup}><label style={s.filterLabel}>Allocation</label>
            <select style={s.select} value={txAllocFilter} onChange={e=>setTxAllocFilter(e.target.value as any)}>
              <option value="all">All</option><option value="unallocated">Unallocated</option><option value="allocated">Allocated</option>
            </select>
          </div>
          <div style={s.filterGroup}><label style={s.filterLabel}>Search</label>
            <input style={{ ...s.input, minWidth: 180 }} placeholder="Description or ref…" value={txSearch} onChange={e=>setTxSearch(e.target.value)} />
          </div>
          <div style={{ alignSelf: "flex-end", color: "#6b7280", fontSize: 13, paddingBottom: 8 }}>{visibleTx.length} rows</div>
        </div>

        {/* Split panel */}
        <div style={sp.splitWrap}>

          {/* ── LEFT: Transaction list ── */}
          <div style={sp.leftPanel}>
            <div style={sp.panelTitle}>Bank Transactions</div>
            <div style={sp.txList}>
              {visibleTx.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No transactions match the filters.
                </div>
              ) : visibleTx.map(tx => {
                const isActive    = activeTx?.transactionId === tx.transactionId;
                const isAllocated = tx.isAllocated;
                const allocLabel  = tx.allocationType === "Invoice"
                  ? (tx.allocatedInvoiceNumber || tx.allocatedInvoiceId.slice(0,8))
                  : tx.allocationType === "Supplier"
                  ? (tx.allocatedSupplierName || tx.allocatedSupplierId)
                  : tx.nonClientDescription || "Non-client";

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
                        <span style={{
                          ...s.badge,
                          ...(tx.allocationType === "Invoice" ? s.badgeEFT
                            : tx.allocationType === "Supplier" ? { background:"#fef3c7", color:"#92400e" }
                            : { background:"#f3e8ff", color:"#7c3aed" }),
                          fontSize: 11
                        }}>
                          {tx.allocationType === "Invoice" ? "Invoice"
                            : tx.allocationType === "Supplier" ? "Supplier"
                            : "Non-client"}
                        </span>
                        <span style={{ fontSize:12, color:"#374151" }}>{allocLabel}</span>
                        <button style={sp.unlinkBtn} onClick={e=>{e.stopPropagation();deallocate(tx);}}>✕</button>
                      </div>
                    ) : (
                      <div style={sp.txSelectHint}>{isActive ? "↗ Select an invoice or entry →" : "Click to allocate"}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Allocation panel ── */}
          <div style={sp.rightPanel}>
            {!activeTx ? (
              <div style={sp.emptyRight}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>←</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>Select a bank transaction</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
                  Click an unallocated credit on the left to find a matching invoice
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", gap: 10 }}>

                {/* Active tx summary */}
                <div style={sp.activeTxCard}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: 6 }}>
                    Selected transaction
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{fmtDate(activeTx.date)}</div>
                      <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{activeTx.description}</div>
                      {activeTx.reference && <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>{activeTx.reference}</div>}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b", marginLeft: 16, whiteSpace: "nowrap" }}>
                      {fmt(activeTx.amount)}
                    </div>
                  </div>
                </div>

                {allocError && <div style={{ ...s.errorBanner, margin: 0 }}>{allocError}</div>}

                {/* Mode tabs */}
                <div style={sp.modeTabs}>
                  <button style={rightMode==="matches"   ? sp.modeTabActive : sp.modeTab} onClick={()=>setRightMode("matches")}>Smart Matches</button>
                  <button style={rightMode==="browse"    ? sp.modeTabActive : sp.modeTab} onClick={switchToBrowse}>Browse Clients</button>
                  <button style={rightMode==="suppliers" ? sp.modeTabActive : sp.modeTab} onClick={switchToSuppliers}>Browse Suppliers</button>
                  <button style={rightMode==="nonclient" ? sp.modeTabActive : sp.modeTab} onClick={()=>setRightMode("nonclient")}>Non-Client</button>
                </div>

                {/* ─ Smart Matches ─ */}
                {rightMode === "matches" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", gap: 6 }}>
                    <input
                      style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                      placeholder="Filter by client name or invoice #…"
                      value={matchSearch}
                      onChange={e => searchMatches(e.target.value)}
                    />
                    <div style={sp.invoiceList}>
                      {matchesLoading ? (
                        <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Finding matches…</div>
                      ) : matches.length === 0 ? (
                        <div style={{ padding: "24px 16px", textAlign: "center" }}>
                          <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 8 }}>
                            {matchSearch ? "No invoices match this search." : `No pending invoices match ${fmt(activeTx.amount)}.`}
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Try Browse Clients or Non-Client allocation.</div>
                        </div>
                      ) : matches.map(inv => {
                        const busy = allocBusy === inv.invoiceId;
                        return (
                          <div key={inv.invoiceId} style={sp.invoiceRow}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                <span style={s.mono}>{inv.invoiceNumber}</span>
                                <span style={{ color: "#6b7280", fontSize: 12 }}>{inv.customerName}</span>
                              </div>
                              <div style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDate(inv.createdAt)}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(inv.grandTotal)}</span>
                              <span style={{ ...s.badge, ...(inv.paymentType==="EFT"?s.badgeEFT:s.badgeCash), fontSize: 11 }}>{inv.paymentType}</span>
                              <button
                                style={{ ...sp.allocBtn, opacity: busy ? 0.6 : 1 }}
                                disabled={!!allocBusy}
                                onClick={() => allocateToInvoice(inv.invoiceId)}
                              >
                                {busy ? "…" : "Allocate"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ─ Browse Clients ─ */}
                {rightMode === "browse" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", gap: 6 }}>
                    {!pickedClient ? (
                      <>
                        <input
                          style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                          placeholder="Search client name…"
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          autoFocus
                        />
                        <div style={sp.clientList}>
                          {visibleClients.length === 0
                            ? <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No clients found.</div>
                            : visibleClients.map(c => (
                              <div key={c.clientId} style={sp.clientRow} onClick={() => pickClient(c)}>
                                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{c.clientName}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>{c.clientCity || ""}</div>
                              </div>
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={sp.selectedClientBar}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>Client</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{pickedClient.clientName}</div>
                          </div>
                          <button style={sp.changeClientBtn} onClick={() => { setPickedClient(null); setClientInvoices([]); }}>Change</button>
                        </div>
                        <div style={sp.invoiceList}>
                          {clientInvLoading
                            ? <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading invoices…</div>
                            : sortedClientInvoices.length === 0
                              ? <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No invoices found.</div>
                              : sortedClientInvoices.map(inv => {
                                const isReconced = !!(inv as any).reconciledAt;
                                const busy = allocBusy === inv.invoiceId;
                                const amtMatch = Math.abs(inv.grandTotal - activeTx.amount) < 0.02;
                                return (
                                  <div key={inv.invoiceId} style={{ ...sp.invoiceRow, ...(isReconced ? sp.invoiceRowReconced : {}) }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                        <span style={s.mono}>{inv.invoiceNumber}</span>
                                        {amtMatch && <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>✓ amount match</span>}
                                      </div>
                                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDate(inv.createdAt)}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(inv.grandTotal)}</span>
                                      <span style={{ ...s.badge, ...(inv.paymentType==="EFT"?s.badgeEFT:s.badgeCash), fontSize: 11 }}>{inv.paymentType}</span>
                                      {isReconced
                                        ? <span style={{ ...s.pillGreen, fontSize: 11 }}>Reconciled</span>
                                        : <button style={{ ...sp.allocBtn, opacity: busy ? 0.6 : 1 }} disabled={!!allocBusy} onClick={() => allocateToInvoice(inv.invoiceId)}>
                                            {busy ? "…" : "Allocate"}
                                          </button>}
                                    </div>
                                  </div>
                                );
                              })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ─ Browse Suppliers ─ */}
                {rightMode === "suppliers" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", gap: 6 }}>
                    {!pickedSupplier ? (
                      <>
                        <input
                          style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                          placeholder="Search supplier name…"
                          value={supplierSearch}
                          onChange={e => setSupplierSearch(e.target.value)}
                          autoFocus
                        />
                        <div style={sp.clientList}>
                          {visibleSuppliers.length === 0
                            ? <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No suppliers found.</div>
                            : visibleSuppliers.map(sup => (
                              <div key={sup.supplierId} style={sp.clientRow} onClick={() => { setPickedSupplier(sup); setSupplierNotes(""); }}>
                                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{sup.name}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>
                                  {[sup.address?.city, sup.bankDetails?.bankName].filter(Boolean).join(" · ") || ""}
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={sp.selectedClientBar}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>Supplier</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{pickedSupplier.name}</div>
                            {pickedSupplier.bankDetails?.accountNumber && (
                              <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
                                {pickedSupplier.bankDetails.bankName} · {pickedSupplier.bankDetails.accountNumber}
                              </div>
                            )}
                          </div>
                          <button style={sp.changeClientBtn} onClick={() => setPickedSupplier(null)}>Change</button>
                        </div>
                        <div style={s.fieldGroup}>
                          <label style={s.label}>Notes (optional)</label>
                          <input
                            style={s.input}
                            placeholder="e.g. Invoice #, delivery reference…"
                            value={supplierNotes}
                            onChange={e => setSupplierNotes(e.target.value)}
                          />
                        </div>
                        <button
                          style={{ ...sp.allocBtn, padding: "10px 20px", fontSize: 14, background: "#f59e0b", opacity: (allocBusy === pickedSupplier.supplierId) ? 0.6 : 1 }}
                          disabled={!!allocBusy}
                          onClick={allocateToSupplier}
                        >
                          {allocBusy === pickedSupplier.supplierId ? "Allocating…" : `✔ Allocate to ${pickedSupplier.name}`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ─ Non-Client ─ */}
                {rightMode === "nonclient" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      Use this for bank charges, miscellaneous income, or any transaction not linked to a client invoice.
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Description *</label>
                      <input
                        style={s.input}
                        placeholder="e.g. Bank charges, Interest received…"
                        value={ncDescription}
                        onChange={e => setNcDescription(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Amount (optional — leave 0 to use bank transaction amount)</label>
                      <input
                        style={s.input}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={ncAmount}
                        onChange={e => setNcAmount(e.target.value)}
                      />
                    </div>
                    <button
                      style={{ ...sp.allocBtn, padding: "10px 20px", fontSize: 14, opacity: (!ncDescription.trim() || allocBusy === "nonclient") ? 0.5 : 1 }}
                      disabled={!ncDescription.trim() || !!allocBusy}
                      onClick={allocateNonClient}
                    >
                      {allocBusy === "nonclient" ? "Allocating…" : "✔ Confirm Non-Client Allocation"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Statement list ─────────────────────────────────────────────────────────

  return (
    <>
      {error && <div style={s.errorBanner}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={s.kpiRow} >
          <div style={s.kpiCard}><div style={s.kpiValue}>{statements.length}</div><div style={s.kpiLabel}>Statements</div></div>
          <div style={s.kpiCard}><div style={s.kpiValue}>{fmt(statements.reduce((sum,s)=>sum+s.totalCredits,0))}</div><div style={s.kpiLabel}>Total Credits</div></div>
          <div style={{...s.kpiCard,...s.kpiGreen}}><div style={s.kpiValue}>{statements.reduce((sum,s)=>sum+s.allocatedCount,0)}</div><div style={s.kpiLabel}>Allocated</div></div>
          <div style={s.kpiCard}><div style={{...s.kpiValue,color:totalUnalloc>0?"#ef4444":"#111827"}}>{totalUnalloc}</div><div style={s.kpiLabel}>Unallocated</div></div>
          <div style={s.kpiCard}><div style={{...s.kpiValue,color:totalUnallocAmt>0?"#ef4444":"#111827",fontSize:18}}>{fmt(totalUnallocAmt)}</div><div style={s.kpiLabel}>Unallocated Amount</div></div>
        </div>
        <button style={s.applyBtn} onClick={()=>setShowReport(true)}>📊 Allocation Report</button>
      </div>

      {/* Upload */}
      <div style={s.uploadArea}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
          onChange={e => { const f=e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }} />
        {uploading ? (
          <div style={s.uploadBusy}><span>⏳</span><span>{uploadProgress||"Processing…"}</span></div>
        ) : (
          <div style={s.uploadIdle}>
            <div style={s.uploadIcon}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Upload Bank Statement CSV</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>Supports Nedbank, FNB, Standard Bank, ABSA</div>
            <button style={s.uploadBtn} onClick={()=>fileRef.current?.click()}>Choose CSV File</button>
          </div>
        )}
      </div>

      {loading ? <div style={s.empty}>Loading…</div> :
       statements.length === 0 ? <div style={s.empty}>No bank statements uploaded yet.</div> : (
        <div style={s.tableWrap}><table style={s.table}>
          <thead><tr>
            <th style={s.th}>File Name</th>
            <th style={s.th}>Uploaded</th>
            <th style={{...s.th,textAlign:"right"}}>Transactions</th>
            <th style={{...s.th,textAlign:"right"}}>Credits</th>
            <th style={{...s.th,textAlign:"right"}}>Total Credits</th>
            <th style={{...s.th,textAlign:"right"}}>Allocated</th>
            <th style={{...s.th,textAlign:"right"}}>Unallocated Amt</th>
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
                  <td style={{...s.td,textAlign:"right"}}>{stmt.transactionCount}</td>
                  <td style={{...s.td,textAlign:"right"}}>{stmt.creditCount}</td>
                  <td style={{...s.td,textAlign:"right"}}>{fmt(stmt.totalCredits)}</td>
                  <td style={{...s.td,textAlign:"right"}}>{stmt.allocatedCount}/{stmt.creditCount}</td>
                  <td style={{...s.td,textAlign:"right",color:stmt.unallocatedAmount>0?"#ef4444":"#15803d",fontWeight:600}}>
                    {stmt.unallocatedCount > 0 ? fmt(stmt.unallocatedAmount) : "—"}
                  </td>
                  <td style={{...s.td,minWidth:110}}>
                    <div style={s.progressBg}>
                      <div style={{...s.progressBar,width:`${pct}%`,background:pct===100?"#22c55e":"#3b82f6"}} />
                    </div>
                    <span style={{fontSize:11,color:"#6b7280"}}>{pct}%</span>
                  </td>
                  <td style={s.td}>
                    <button style={s.reconBtn} onClick={()=>openStatement(stmt.statementId)} disabled={detailLoading}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </>
  );
}

// ── Split-panel styles ─────────────────────────────────────────────────────

const sp: Record<string, React.CSSProperties> = {
  splitWrap: { display:"flex", gap:0, border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden", background:"#fff", height:"calc(100vh - 380px)", minHeight:480 },
  leftPanel: { width:"44%", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", overflow:"hidden" },
  rightPanel: { flex:1, display:"flex", flexDirection:"column", padding:"14px 16px", overflow:"hidden" },
  panelTitle: { fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#6b7280", padding:"12px 14px 6px", borderBottom:"1px solid #f1f5f9" },
  txList: { flex:1, overflowY:"auto" as const },
  txRow: { padding:"12px 14px", borderBottom:"1px solid #f1f5f9", cursor:"pointer" },
  txRowActive: { background:"#eff6ff", borderLeft:"3px solid #3b82f6", paddingLeft:11 },
  txRowAllocated: { background:"#f0fdf4", cursor:"default" },
  txTop: { display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:2 },
  txDate: { fontSize:12, color:"#6b7280" },
  txAmount: { fontSize:14, fontWeight:700 },
  txDesc: { fontSize:13, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const },
  txRef: { fontSize:11, color:"#9ca3af", fontFamily:"monospace", marginTop:2 },
  txAllocBadge: { marginTop:6, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const },
  txSelectHint: { marginTop:4, fontSize:11, color:"#9ca3af" },
  unlinkBtn: { background:"none", border:"none", color:"#ef4444", fontSize:11, fontWeight:600, cursor:"pointer", padding:0, marginLeft:"auto" },
  emptyRight: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#9ca3af", textAlign:"center" as const },
  activeTxCard: { background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 14px" },
  modeTabs: { display:"flex", gap:0, background:"#f1f5f9", borderRadius:8, padding:3 },
  modeTab: { flex:1, background:"none", border:"none", borderRadius:6, padding:"6px 0", fontSize:13, fontWeight:500, color:"#6b7280", cursor:"pointer" },
  modeTabActive: { flex:1, background:"#fff", border:"none", borderRadius:6, padding:"6px 0", fontSize:13, fontWeight:700, color:"#111827", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" },
  clientList: { flex:1, overflowY:"auto" as const, border:"1px solid #e5e7eb", borderRadius:8 },
  clientRow: { padding:"10px 14px", borderBottom:"1px solid #f1f5f9", cursor:"pointer" },
  selectedClientBar: { display:"flex", alignItems:"center", justifyContent:"space-between", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px" },
  changeClientBtn: { background:"none", border:"1px solid #d1d5db", borderRadius:6, padding:"4px 12px", fontSize:12, cursor:"pointer", color:"#374151" },
  invoiceList: { flex:1, overflowY:"auto" as const, border:"1px solid #e5e7eb", borderRadius:8 },
  invoiceRow: { padding:"10px 14px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 },
  invoiceRowReconced: { background:"#f0fdf4", opacity:0.65 },
  allocBtn: { background:"#22c55e", color:"#fff", border:"none", borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" as const },
  warningBanner: { background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#92400e", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const },
  warnDismiss: { marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#92400e", fontWeight:700, fontSize:14, padding:"0 4px" },
};

// ── Shared styles ──────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding:"24px", fontFamily:"system-ui, -apple-system, sans-serif", maxWidth:1500, margin:"0 auto" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 },
  title: { fontSize:22, fontWeight:700, color:"#111827", margin:0 },
  tabRow: { display:"flex", gap:4, background:"#f1f5f9", borderRadius:10, padding:4 },
  tabBtn: { background:"none", border:"none", borderRadius:7, padding:"7px 18px", fontSize:14, fontWeight:500, color:"#6b7280", cursor:"pointer" },
  tabActive: { background:"#fff", border:"none", borderRadius:7, padding:"7px 18px", fontSize:14, fontWeight:700, color:"#111827", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.1)" },
  errorBanner: { background:"#fef2f2", border:"1px solid #fca5a5", color:"#b91c1c", borderRadius:8, padding:"10px 14px", fontSize:14, marginBottom:8 },
  kpiRow: { display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" },
  kpiCard: { flex:"1 1 160px", background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 20px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  kpiGreen: { borderLeft:"4px solid #22c55e" },
  kpiValue: { fontSize:22, fontWeight:800, color:"#111827", marginBottom:4 },
  kpiLabel: { fontSize:13, color:"#6b7280" },
  filterRow: { display:"flex", alignItems:"flex-end", gap:12, marginBottom:16, flexWrap:"wrap", background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"14px 16px" },
  filterGroup: { display:"flex", flexDirection:"column", gap:4 },
  filterLabel: { fontSize:12, fontWeight:600, color:"#6b7280", textTransform:"uppercase" as const, letterSpacing:"0.04em" },
  select: { border:"1px solid #d1d5db", borderRadius:7, padding:"7px 10px", fontSize:14, color:"#111827", background:"#fff", minWidth:130 },
  input: { border:"1px solid #d1d5db", borderRadius:7, padding:"7px 10px", fontSize:14, color:"#111827", background:"#fff", minWidth:160 },
  applyBtn: { background:"#1e293b", color:"#fff", border:"none", borderRadius:8, padding:"8px 20px", fontSize:14, fontWeight:600, cursor:"pointer", alignSelf:"flex-end", height:38, whiteSpace:"nowrap" as const },
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
  uploadArea: { border:"2px dashed #d1d5db", borderRadius:14, padding:"32px 24px", marginBottom:20, background:"#fafafa", textAlign:"center" },
  uploadIdle: { display:"flex", flexDirection:"column", alignItems:"center" },
  uploadIcon: { fontSize:36, marginBottom:8 },
  uploadBtn: { background:"#1e293b", color:"#fff", border:"none", borderRadius:8, padding:"10px 28px", fontSize:14, fontWeight:600, cursor:"pointer" },
  uploadBusy: { display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontSize:15, color:"#374151" },
  detailHeader: { display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" },
  backBtn: { background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 14px", fontSize:14, cursor:"pointer", color:"#374151", whiteSpace:"nowrap" as const },
  detailKpis: { display:"flex", gap:8, flexWrap:"wrap" },
  kpiBadge: { background:"#f1f5f9", color:"#374151", borderRadius:8, padding:"5px 12px", fontSize:13, fontWeight:600, whiteSpace:"nowrap" as const },
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
