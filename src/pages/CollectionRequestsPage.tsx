import React, { useEffect, useState } from "react";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto, CollectionRequestLineDto } from "../api/collectionRequestsApi";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto } from "../api/procurementOrdersApi";
import { usersApi } from "../api/usersApi";
import type { DriverDto } from "../api/usersApi";
import { hasAnyRole, getProfileFromIdToken } from "../api/auth";

function getUsername(): string | undefined {
  return getProfileFromIdToken()?.username;
}

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Pending: { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
  Loading: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  InTransit: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  ArrivedAtHub: { background: "rgba(124,58,237,0.1)", color: "#4c1d95", border: "1px solid rgba(124,58,237,0.3)" },
  HubConfirmed: { background: "rgba(20,184,166,0.1)", color: "#134e4a", border: "1px solid rgba(20,184,166,0.3)" },
  FinanceAcknowledged: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const isDriver = () => hasAnyRole("Driver") && !hasAnyRole("Owner", "Admin", "HubStaff", "Finance", "Procurement");
const isAdmin = () => hasAnyRole("Owner", "Admin", "HubStaff");
const isFinance = () => hasAnyRole("Owner", "Finance");
const canCreate = () => hasAnyRole("Owner", "Admin", "HubStaff");

export default function CollectionRequestsPage() {
  const [items, setItems] = useState<CollectionRequestDto[]>([]);
  const [pos, setPos] = useState<ProcurementOrderDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ procurementOrderId: "", assignedDriverId: "", assignedDriverName: "", hubId: "hub-001", notes: "" });
  const [createError, setCreateError] = useState("");

  // Loading modal (driver)
  const [loadingItem, setLoadingItem] = useState<CollectionRequestDto | null>(null);
  const [loadLines, setLoadLines] = useState<{ speciesId: string; loadedQty: number; loadingNotes: string }[]>([]);

  // Hub confirm modal
  const [confirmItem, setConfirmItem] = useState<CollectionRequestDto | null>(null);
  const [confirmLines, setConfirmLines] = useState<{ speciesId: string; receivedQty: number; discrepancyNotes: string }[]>([]);
  const [confirmError, setConfirmError] = useState("");

  // Finance acknowledge modal
  const [ackItem, setAckItem] = useState<CollectionRequestDto | null>(null);
  const [ackUploading, setAckUploading] = useState(false);
  const [ackFile, setAckFile] = useState<File | null>(null);
  const [ackError, setAckError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const driverId = isDriver() ? getUsername() : undefined;
      const [crs, poList, driverList] = await Promise.all([
        collectionRequestsApi.list(driverId ? { driverId } : undefined),
        procurementOrdersApi.list().catch(() => [] as ProcurementOrderDto[]),
        usersApi.listDrivers().catch(() => [] as DriverDto[]),
      ]);
      setItems(crs);
      setPos(poList.filter(p => ["Submitted", "CollectionScheduled"].includes(p.status)));
      setDrivers(driverList);
    } catch { setError("Failed to load collection requests."); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!createForm.procurementOrderId) { setCreateError("Please select a procurement order."); return; }
    if (!createForm.assignedDriverId) { setCreateError("Please assign a driver."); return; }
    setBusy(true); setCreateError("");
    try {
      const created = await collectionRequestsApi.create(createForm);
      setItems(i => [created, ...i]);
      setShowCreate(false);
      setCreateForm({ procurementOrderId: "", assignedDriverId: "", assignedDriverName: "", hubId: "hub-001", notes: "" });
    } catch (e: any) { setCreateError(e?.message ?? "Failed to create."); }
    finally { setBusy(false); }
  }

  function openLoadModal(item: CollectionRequestDto) {
    setLoadingItem(item);
    setLoadLines(item.lines.map(l => ({ speciesId: l.speciesId, loadedQty: l.loadedQty || l.orderedQty, loadingNotes: l.loadingNotes || "" })));
  }

  async function saveLoad(dispatch: boolean) {
    if (!loadingItem) return;
    setBusy(true);
    try {
      let updated = await collectionRequestsApi.driverLoad(loadingItem.collectionRequestId, loadLines);
      if (dispatch) {
        updated = await collectionRequestsApi.dispatch(loadingItem.collectionRequestId);
      }
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setLoadingItem(null);
    } catch (e: any) { setError(e?.message ?? "Failed to save."); }
    finally { setBusy(false); }
  }

  async function handleArrive(id: string) {
    setBusy(true);
    try {
      const updated = await collectionRequestsApi.arrive(id);
      setItems(i => i.map(x => x.collectionRequestId === id ? updated : x));
    } catch (e: any) { setError(e?.message ?? "Failed."); }
    finally { setBusy(false); }
  }

  function openConfirm(item: CollectionRequestDto) {
    setConfirmItem(item);
    setConfirmLines(item.lines.map(l => ({ speciesId: l.speciesId, receivedQty: l.loadedQty, discrepancyNotes: "" })));
    setConfirmError("");
  }

  async function submitConfirm() {
    if (!confirmItem) return;
    setBusy(true); setConfirmError("");
    try {
      const updated = await collectionRequestsApi.hubConfirm(confirmItem.collectionRequestId, confirmLines);
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setConfirmItem(null);
    } catch (e: any) { setConfirmError(e?.message ?? "Failed to confirm."); }
    finally { setBusy(false); }
  }

  async function submitAck() {
    if (!ackItem || !ackFile) { setAckError("Please select an invoice file."); return; }
    setBusy(true); setAckUploading(true); setAckError("");
    try {
      const { uploadUrl, s3Key } = await collectionRequestsApi.getInvoiceUploadUrl(ackItem.collectionRequestId);
      await fetch(uploadUrl, { method: "PUT", body: ackFile, headers: { "Content-Type": "application/pdf" } });
      const updated = await collectionRequestsApi.financeAcknowledge(ackItem.collectionRequestId, s3Key);
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setAckItem(null);
      setAckFile(null);
    } catch (e: any) { setAckError(e?.message ?? "Failed."); }
    finally { setBusy(false); setAckUploading(false); }
  }

  const shortId = (id: string) => id.split("-")[0].toUpperCase();

  function renderLine(line: CollectionRequestLineDto, cr: CollectionRequestDto) {
    const hasDiscrepancy = line.loadedQty !== line.orderedQty || line.receivedQty !== line.loadedQty;
    return (
      <div key={line.speciesId} style={s.lineCard}>
        <div style={s.lineName}>{line.speciesName || line.speciesId}</div>
        <div style={s.lineStats}>
          <span style={s.lineStat}><span style={s.lineStatLabel}>Ordered</span> {line.orderedQty}</span>
          <span style={{ ...s.lineStat, color: line.loadedQty < line.orderedQty ? "#dc2626" : "#16a34a" }}>
            <span style={s.lineStatLabel}>Loaded</span> {line.loadedQty}
          </span>
          {(cr.status === "HubConfirmed" || cr.status === "FinanceAcknowledged") && (
            <span style={{ ...s.lineStat, color: line.receivedQty < line.loadedQty ? "#dc2626" : "#16a34a" }}>
              <span style={s.lineStatLabel}>Received</span> {line.receivedQty}
            </span>
          )}
        </div>
        {hasDiscrepancy && line.loadingNotes && <div style={s.lineNote}>⚠ {line.loadingNotes}</div>}
        {hasDiscrepancy && line.discrepancyNotes && <div style={s.lineNote}>📝 {line.discrepancyNotes}</div>}
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>Collection Requests</div>
          <div style={s.pageSub}>{isDriver() ? "Your collection assignments" : "Manage stock collections from suppliers"}</div>
        </div>
        {canCreate() && <button style={s.primaryBtn} onClick={() => { setCreateError(""); setShowCreate(true); }}>+ New Collection</button>}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? <div style={s.loading}>Loading…</div> : items.length === 0 ? (
        <div style={s.empty}>No collection requests found.</div>
      ) : (
        <div style={s.list}>
          {items.map(cr => (
            <div key={cr.collectionRequestId} style={s.card}>
              <div style={s.cardHeader} onClick={() => setExpanded(expanded === cr.collectionRequestId ? null : cr.collectionRequestId)}>
                <div style={s.cardLeft}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={s.orderId}>CR-{shortId(cr.collectionRequestId)}</span>
                    <span style={{ ...s.badge, ...STATUS_COLORS[cr.status] }}>{cr.status}</span>
                  </div>
                  <div style={s.cardMeta}>
                    <span>{cr.supplierName}</span>
                    <span> · {cr.assignedDriverName}</span>
                    <span> · {cr.lines.length} species</span>
                    <span> · {new Date(cr.createdAt).toLocaleDateString("en-ZA")}</span>
                  </div>
                </div>
                <span style={s.chevron}>{expanded === cr.collectionRequestId ? "▲" : "▼"}</span>
              </div>

              {expanded === cr.collectionRequestId && (
                <div style={s.cardBody}>
                  {cr.notes && <div style={s.notes}>📝 {cr.notes}</div>}
                  <div style={s.linesGrid}>{cr.lines.map(l => renderLine(l, cr))}</div>

                  <div style={s.cardActions}>
                    {/* Driver actions */}
                    {isDriver() && (cr.status === "Pending" || cr.status === "Loading") && (
                      <button style={s.primaryBtn} onClick={() => openLoadModal(cr)}>
                        {cr.status === "Loading" ? "Update Loading" : "Start Loading"}
                      </button>
                    )}
                    {isDriver() && cr.status === "InTransit" && (
                      <button style={s.primaryBtn} onClick={() => handleArrive(cr.collectionRequestId)} disabled={busy}>Mark Arrived at Hub</button>
                    )}
                    {/* Hub admin actions */}
                    {isAdmin() && (cr.status === "ArrivedAtHub" || cr.status === "InTransit") && (
                      <button style={s.primaryBtn} onClick={() => openConfirm(cr)}>Confirm Receipt</button>
                    )}
                    {/* Finance actions */}
                    {isFinance() && cr.status === "HubConfirmed" && (
                      <button style={s.primaryBtn} onClick={() => { setAckItem(cr); setAckError(""); setAckFile(null); }}>Upload Invoice & Acknowledge</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={s.backdrop} onClick={() => !busy && setShowCreate(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>New Collection Request</div>
            {createError && <div style={s.formError}>{createError}</div>}
            <label style={s.label}>Procurement Order *
              <select style={s.input} value={createForm.procurementOrderId} onChange={e => setCreateForm(p => ({ ...p, procurementOrderId: e.target.value }))} disabled={busy}>
                <option value="">— Select order —</option>
                {pos.map(p => <option key={p.procurementOrderId} value={p.procurementOrderId}>PO-{p.procurementOrderId.split("-")[0].toUpperCase()} · {p.supplierName} · {p.lines.reduce((a, l) => a + l.orderedQty, 0)} units</option>)}
              </select>
            </label>
            <label style={s.label}>Assign Driver *
              <select style={s.input} value={createForm.assignedDriverId}
                onChange={e => {
                  const d = drivers.find(x => x.userId === e.target.value);
                  setCreateForm(p => ({ ...p, assignedDriverId: e.target.value, assignedDriverName: d?.name || e.target.value }));
                }} disabled={busy}>
                <option value="">— Select driver —</option>
                {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name} {d.email ? `(${d.email})` : ""}</option>)}
              </select>
            </label>
            <label style={s.label}>Notes
              <input style={s.input} value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} disabled={busy} />
            </label>
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowCreate(false)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={handleCreate} disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver loading modal */}
      {loadingItem && (
        <div style={s.backdrop} onClick={() => !busy && setLoadingItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Load Stock — {loadingItem.supplierName}</div>
            <div style={s.modalSub}>Record quantities loaded onto your vehicle</div>
            {loadLines.map((ll, i) => {
              const origLine = loadingItem.lines[i];
              return (
                <div key={ll.speciesId} style={s.loadLineCard}>
                  <div style={s.loadLineName}>{origLine?.speciesName || ll.speciesId}</div>
                  <div style={s.loadLineOrdered}>Ordered: {origLine?.orderedQty}</div>
                  <div style={s.loadLineInputs}>
                    <label style={s.label}>Loaded Qty
                      <input style={s.input} inputMode="numeric" value={ll.loadedQty}
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadedQty: parseInt(e.target.value) || 0 } : x))} disabled={busy} />
                    </label>
                    <label style={s.label}>Notes (if short)
                      <input style={s.input} value={ll.loadingNotes} placeholder="Reason if not full quantity"
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadingNotes: e.target.value } : x))} disabled={busy} />
                    </label>
                  </div>
                </div>
              );
            })}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setLoadingItem(null)} disabled={busy}>Cancel</button>
              <button style={{ ...s.secondaryBtn, color: "#16a34a", borderColor: "#16a34a" }} onClick={() => saveLoad(false)} disabled={busy}>Save Progress</button>
              <button style={s.primaryBtn} onClick={() => saveLoad(true)} disabled={busy}>{busy ? "…" : "Dispatch 🚛"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Hub confirm modal */}
      {confirmItem && (
        <div style={s.backdrop} onClick={() => !busy && setConfirmItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Confirm Receipt — {confirmItem.supplierName}</div>
            <div style={s.modalSub}>Enter the actual quantities received at the hub</div>
            {confirmError && <div style={s.formError}>{confirmError}</div>}
            {confirmLines.map((cl, i) => {
              const origLine = confirmItem.lines[i];
              return (
                <div key={cl.speciesId} style={s.loadLineCard}>
                  <div style={s.loadLineName}>{origLine?.speciesName || cl.speciesId}</div>
                  <div style={s.loadLineOrdered}>Loaded: {origLine?.loadedQty} · Ordered: {origLine?.orderedQty}</div>
                  <div style={s.loadLineInputs}>
                    <label style={s.label}>Received Qty
                      <input style={s.input} inputMode="numeric" value={cl.receivedQty}
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, receivedQty: parseInt(e.target.value) || 0 } : x))} disabled={busy} />
                    </label>
                    <label style={s.label}>Discrepancy Notes
                      <input style={s.input} value={cl.discrepancyNotes} placeholder="If different from loaded"
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, discrepancyNotes: e.target.value } : x))} disabled={busy} />
                    </label>
                  </div>
                </div>
              );
            })}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setConfirmItem(null)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitConfirm} disabled={busy}>{busy ? "Confirming…" : "Confirm Receipt ✓"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Finance acknowledge modal */}
      {ackItem && (
        <div style={s.backdrop} onClick={() => !busy && setAckItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Acknowledge Delivery</div>
            <div style={s.modalSub}>Upload the supplier invoice to complete this collection</div>
            {ackError && <div style={s.formError}>{ackError}</div>}
            <label style={s.label}>Supplier Invoice (PDF)
              <input type="file" accept="application/pdf" onChange={e => setAckFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ fontSize: 14 }} />
            </label>
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setAckItem(null)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitAck} disabled={busy || ackUploading}>{ackUploading ? "Uploading…" : "Upload & Acknowledge"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" },
  cardLeft: { flex: 1, minWidth: 0 },
  orderId: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  badge: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 },
  cardMeta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chevron: { fontSize: 12, color: "#94a3b8", marginLeft: 12 },
  cardBody: { padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" },
  notes: { fontSize: 13, color: "#374151", marginTop: 12 },
  linesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 12 },
  lineCard: { background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid #e2e8f0" },
  lineName: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  lineStats: { display: "flex", gap: 12 },
  lineStat: { fontSize: 13, fontWeight: 600 },
  lineStatLabel: { fontSize: 11, color: "#94a3b8", display: "block" as const },
  lineNote: { fontSize: 12, color: "#92400e", marginTop: 4 },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, boxSizing: "border-box", marginTop: 32 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  modalSub: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  formError: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  label: { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb", color: "#111827", outline: "none" },
  loadLineCard: { background: "#f8fafc", borderRadius: 10, padding: 12, border: "1px solid #e2e8f0", marginBottom: 10 },
  loadLineName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  loadLineOrdered: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  loadLineInputs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  modalBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" },
  primaryBtn: { padding: "10px 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
};
