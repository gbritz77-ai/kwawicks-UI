import React, { useEffect, useState } from "react";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto, CreateProcurementOrderRequest } from "../api/procurementOrdersApi";
import { suppliersApi } from "../api/suppliersApi";
import type { SupplierDto } from "../api/suppliersApi";
import { speciesApi } from "../api/speciesApi";
import { hasAnyRole } from "../api/auth";

type Tab = "All" | "Draft" | "Submitted" | "CollectionScheduled" | "InTransit" | "DeliveredToHub" | "Completed";
const TABS: Tab[] = ["All", "Draft", "Submitted", "CollectionScheduled", "InTransit", "DeliveredToHub", "Completed"];

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Draft: { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
  Submitted: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  CollectionScheduled: { background: "rgba(124,58,237,0.1)", color: "#4c1d95", border: "1px solid rgba(124,58,237,0.3)" },
  InTransit: { background: "rgba(234,88,12,0.1)", color: "#7c2d12", border: "1px solid rgba(234,88,12,0.3)" },
  DeliveredToHub: { background: "rgba(20,184,166,0.1)", color: "#134e4a", border: "1px solid rgba(20,184,166,0.3)" },
  Completed: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const canCreate = () => hasAnyRole("Owner", "Procurement");
const canComplete = () => hasAnyRole("Owner", "Finance");

export default function ProcurementOrdersPage() {
  const [orders, setOrders] = useState<ProcurementOrderDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [species, setSpecies] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateProcurementOrderRequest>({ supplierId: "", supplierOrderReference: "", notes: "", lines: [{ speciesId: "", orderedQty: 0 }] });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [ords, sups, spc] = await Promise.all([
        procurementOrdersApi.list(),
        suppliersApi.list(),
        speciesApi.list(),
      ]);
      setOrders(ords);
      setSuppliers(sups);
      setSpecies(spc);
    } catch { setError("Failed to load data."); }
    finally { setLoading(false); }
  }

  const filtered = tab === "All" ? orders : orders.filter(o => o.status === tab);

  async function handleSubmit(id: string) {
    setBusy(true);
    try {
      await procurementOrdersApi.submit(id);
      setOrders(o => o.map(x => x.procurementOrderId === id ? { ...x, status: "Submitted" } : x));
    } catch (e: any) { setError(e?.message ?? "Failed to submit."); }
    finally { setBusy(false); }
  }

  async function handleComplete(id: string) {
    setBusy(true);
    try {
      await procurementOrdersApi.complete(id);
      setOrders(o => o.map(x => x.procurementOrderId === id ? { ...x, status: "Completed" } : x));
    } catch (e: any) { setError(e?.message ?? "Failed to complete."); }
    finally { setBusy(false); }
  }

  async function createOrder() {
    if (!form.supplierId) { setFormError("Please select a supplier."); return; }
    if (form.lines.some(l => !l.speciesId || l.orderedQty <= 0)) { setFormError("All lines require a species and quantity > 0."); return; }
    setBusy(true); setFormError("");
    try {
      const created = await procurementOrdersApi.create(form);
      setOrders(o => [created, ...o]);
      setShowForm(false);
      setForm({ supplierId: "", supplierOrderReference: "", notes: "", lines: [{ speciesId: "", orderedQty: 0 }] });
    } catch (e: any) { setFormError(e?.message ?? "Failed to create."); }
    finally { setBusy(false); }
  }

  function addLine() { setForm(p => ({ ...p, lines: [...p.lines, { speciesId: "", orderedQty: 0 }] })); }
  function removeLine(i: number) { setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) })); }
  function setLine(i: number, k: string, v: any) {
    setForm(p => { const ls = [...p.lines]; ls[i] = { ...ls[i], [k]: v }; return { ...p, lines: ls }; });
  }

  const shortId = (id: string) => id.split("-")[0].toUpperCase();

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>Procurement Orders</div>
          <div style={s.pageSub}>Manage stock orders to suppliers</div>
        </div>
        {canCreate() && <button style={s.primaryBtn} onClick={() => { setFormError(""); setShowForm(true); }}>+ New Order</button>}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      <div style={s.tabsRow}>
        {TABS.map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === "CollectionScheduled" ? "Scheduled" : t === "DeliveredToHub" ? "At Hub" : t}
          </button>
        ))}
      </div>

      {loading ? <div style={s.loading}>Loading…</div> : filtered.length === 0 ? (
        <div style={s.empty}>No orders for this status.</div>
      ) : (
        <div style={s.list}>
          {filtered.map(ord => (
            <div key={ord.procurementOrderId} style={s.card}>
              <div style={s.cardHeader} onClick={() => setExpanded(expanded === ord.procurementOrderId ? null : ord.procurementOrderId)}>
                <div style={s.cardLeft}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={s.orderId}>PO-{shortId(ord.procurementOrderId)}</span>
                    <span style={{ ...s.badge, ...STATUS_COLORS[ord.status] }}>{ord.status}</span>
                  </div>
                  <div style={s.cardMeta}>
                    <span>{ord.supplierName}</span>
                    {ord.supplierOrderReference && <span> · Ref: {ord.supplierOrderReference}</span>}
                    <span> · {ord.lines.reduce((a, l) => a + l.orderedQty, 0)} units</span>
                    <span> · {new Date(ord.createdAt).toLocaleDateString("en-ZA")}</span>
                  </div>
                </div>
                <span style={s.chevron}>{expanded === ord.procurementOrderId ? "▲" : "▼"}</span>
              </div>

              {expanded === ord.procurementOrderId && (
                <div style={s.cardBody}>
                  {ord.notes && <div style={s.notes}>📝 {ord.notes}</div>}
                  <div style={s.tableWrap}>
                    <div style={{ ...s.tableRow, ...s.tableHeader }}>
                      <div>Species</div>
                      <div style={{ textAlign: "right" }}>Qty</div>
                      <div style={{ textAlign: "right" }}>Unit Cost</div>
                      <div style={{ textAlign: "right" }}>Total</div>
                    </div>
                    {ord.lines.map((l, i) => (
                      <div key={i} style={s.tableRow}>
                        <div>{l.speciesName || l.speciesId}</div>
                        <div style={{ textAlign: "right" }}>{l.orderedQty}</div>
                        <div style={{ textAlign: "right" }}>R {l.unitCost.toFixed(2)}</div>
                        <div style={{ textAlign: "right", fontWeight: 700 }}>R {(l.orderedQty * l.unitCost).toFixed(2)}</div>
                      </div>
                    ))}
                    <div style={{ ...s.tableRow, fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                      <div>Total</div>
                      <div style={{ textAlign: "right" }}>{ord.lines.reduce((a, l) => a + l.orderedQty, 0)}</div>
                      <div />
                      <div style={{ textAlign: "right", color: "#16a34a" }}>R {ord.lines.reduce((a, l) => a + l.orderedQty * l.unitCost, 0).toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={s.cardActions}>
                    {ord.status === "Draft" && canCreate() && (
                      <button style={s.primaryBtn} onClick={() => handleSubmit(ord.procurementOrderId)} disabled={busy}>Submit Order</button>
                    )}
                    {ord.status === "DeliveredToHub" && canComplete() && (
                      <button style={s.primaryBtn} onClick={() => handleComplete(ord.procurementOrderId)} disabled={busy}>Mark Completed</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={s.backdrop} onClick={() => !busy && setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>New Procurement Order</div>
            {formError && <div style={s.formError}>{formError}</div>}

            <label style={s.label}>Supplier *
              <select style={s.input} value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))} disabled={busy}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
              </select>
            </label>
            <label style={s.label}>Supplier Order / Reference No.
              <input style={s.input} value={form.supplierOrderReference} onChange={e => setForm(p => ({ ...p, supplierOrderReference: e.target.value }))} disabled={busy} placeholder="e.g. INV-0042" />
            </label>
            <label style={s.label}>Notes
              <input style={s.input} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} disabled={busy} />
            </label>

            <div style={s.sectionHeading}>
              Order Lines
              <button style={s.addLineBtn} onClick={addLine} disabled={busy}>+ Add line</button>
            </div>

            {form.lines.map((line, idx) => (
              <div key={idx} style={s.lineRow}>
                <select style={{ ...s.input, flex: 2 }} value={line.speciesId} onChange={e => setLine(idx, "speciesId", e.target.value)} disabled={busy}>
                  <option value="">— Species —</option>
                  {species.map((sp: any) => <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>)}
                </select>
                <input style={{ ...s.input, flex: 1 }} placeholder="Qty" inputMode="numeric" value={line.orderedQty || ""} onChange={e => setLine(idx, "orderedQty", parseInt(e.target.value) || 0)} disabled={busy} />
                {form.lines.length > 1 && (
                  <button style={s.removeBtn} onClick={() => removeLine(idx)} disabled={busy}>✕</button>
                )}
              </div>
            ))}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={createOrder} disabled={busy}>{busy ? "Creating…" : "Create Order"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  tabsRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 },
  tab: { padding: "6px 14px", borderRadius: 20, border: "1px solid #d1d5db", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer", fontWeight: 500 },
  tabActive: { background: "#0f172a", color: "#fff", border: "1px solid #0f172a" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" },
  cardLeft: { flex: 1, minWidth: 0 },
  orderId: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  badge: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 },
  cardMeta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chevron: { fontSize: 12, color: "#94a3b8", marginLeft: 12 },
  cardBody: { padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" },
  notes: { fontSize: 13, color: "#374151", marginTop: 12, marginBottom: 8 },
  tableWrap: { overflowX: "auto", marginTop: 8 },
  tableHeader: { background: "#f8fafc", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase" as const },
  tableRow: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 14 },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, boxSizing: "border-box", marginTop: 32 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  formError: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  sectionHeading: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 16, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" },
  label: { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb", color: "#111827", outline: "none" },
  lineRow: { display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" },
  addLineBtn: { background: "none", border: "1px solid #16a34a", color: "#16a34a", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  removeBtn: { padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, cursor: "pointer", fontSize: 14 },
  modalBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 },
  primaryBtn: { padding: "10px 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
};
