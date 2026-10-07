import React, { useEffect, useState } from "react";
import { inboundShipmentsApi, type InboundShipmentDto, type CreateInboundShipmentRequest } from "../api/inboundShipmentsApi";
import { suppliersApi, type SupplierDto } from "../api/suppliersApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

// ── Types ─────────────────────────────────────────────────────────────────────

type FormLine = { speciesId: string; orderedQty: string; unitCost: string };

type ShipmentForm = {
  supplierId: string;
  transporterName: string;
  transporterContact: string;
  vehicleReg: string;
  notes: string;
  expectedAt: string;
  lines: FormLine[];
};

const emptyForm: ShipmentForm = {
  supplierId: "",
  transporterName: "",
  transporterContact: "",
  vehicleReg: "",
  notes: "",
  expectedAt: "",
  lines: [{ speciesId: "", orderedQty: "", unitCost: "" }],
};

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, React.CSSProperties> = {
  Open:       { background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" },
  Dispatched: { background: "#fefce8", color: "#92400e", border: "1px solid #fde68a" },
  Received:   { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
};

function statusLabel(status: string) {
  if (status === "Open") return "🟡 Open";
  if (status === "Dispatched") return "🚚 Dispatched";
  if (status === "Received") return "✅ Received";
  return status;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: { padding: "24px 20px", maxWidth: 900, margin: "0 auto" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 },
  title: { fontSize: 22, fontWeight: 900, color: "#0f172a" } as React.CSSProperties,
  btn: { padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "#0f172a", color: "#fff" } as React.CSSProperties,
  outlineBtn: { padding: "7px 14px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "#fff", color: "#374151" } as React.CSSProperties,
  filters: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" as const },
  filterBtn: (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 20, border: "1px solid #e2e8f0", cursor: "pointer",
    fontWeight: active ? 700 : 400, fontSize: 13,
    background: active ? "#0f172a" : "#fff", color: active ? "#fff" : "#374151",
  }),
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 12, overflow: "hidden" } as React.CSSProperties,
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer", gap: 10 } as React.CSSProperties,
  cardBody: { padding: "0 16px 16px" } as React.CSSProperties,
  badge: (status: string): React.CSSProperties => ({
    ...STATUS_COLOR[status],
    padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const,
  }),
  lineGrid: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, fontSize: 13, padding: "4px 0" } as React.CSSProperties,
  lineGridHeader: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#94a3b8", padding: "4px 0 8px" } as React.CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" as const, justifyContent: "flex-end" },
  backdrop: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" as const },
  modalTitle: { fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 16 } as React.CSSProperties,
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 } as React.CSSProperties,
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const, fontFamily: "inherit" },
  select: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" as const, fontFamily: "inherit", background: "#fff" },
  field: { marginBottom: 14 } as React.CSSProperties,
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
  error: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13 } as React.CSSProperties,
  metaRow: { display: "flex", gap: 16, flexWrap: "wrap" as const, fontSize: 13, color: "#64748b", marginBottom: 10 } as React.CSSProperties,
  metaItem: { display: "flex", gap: 4, alignItems: "center" } as React.CSSProperties,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function InboundShipmentsPage() {
  const [shipments, setShipments] = useState<InboundShipmentDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<InboundShipmentDto | null>(null);
  const [form, setForm] = useState<ShipmentForm>(emptyForm);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Receive modal
  const [receiveTarget, setReceiveTarget] = useState<InboundShipmentDto | null>(null);
  const [receiveLines, setReceiveLines] = useState<{ speciesId: string; receivedQty: string; shortfallNotes: string }[]>([]);
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<InboundShipmentDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canCreate = hasAnyRole("Owner", "Admin", "Procurement", "Finance");
  const canDispatch = hasAnyRole("Owner", "Admin", "Procurement", "Finance", "HubStaff");
  const canReceive = hasAnyRole("Owner", "Admin", "HubStaff");

  function getSpeciesName(id: string) {
    return species.find(s => s.speciesId === id)?.name ?? id;
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [sh, sup, sp] = await Promise.all([
        inboundShipmentsApi.list(statusFilter ? { status: statusFilter } : undefined),
        suppliersApi.list(),
        speciesApi.list(),
      ]);
      setShipments(sh);
      setSuppliers(sup);
      setSpecies(sp);
    } catch (e: any) {
      setError(e?.message || "Could not load shipments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(s: InboundShipmentDto) {
    setEditTarget(s);
    setForm({
      supplierId: s.supplierId,
      transporterName: s.transporterName,
      transporterContact: s.transporterContact,
      vehicleReg: s.vehicleReg,
      notes: s.notes,
      expectedAt: s.expectedAt ? s.expectedAt.slice(0, 10) : "",
      lines: s.lines.map(l => ({
        speciesId: l.speciesId,
        orderedQty: String(l.orderedQty),
        unitCost: String(l.unitCost),
      })),
    });
    setFormError(null);
    setShowForm(true);
  }

  function setLine(idx: number, field: keyof FormLine, value: string) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l),
    }));
  }

  function addLine() {
    setForm(prev => ({ ...prev, lines: [...prev.lines, { speciesId: "", orderedQty: "", unitCost: "" }] }));
  }

  function removeLine(idx: number) {
    setForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  }

  async function submitForm() {
    if (!form.supplierId) { setFormError("Select a supplier."); return; }
    if (form.lines.length === 0 || form.lines.some(l => !l.speciesId || !l.orderedQty)) {
      setFormError("All lines must have a species and ordered quantity.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      const req: CreateInboundShipmentRequest = {
        supplierId: form.supplierId,
        transporterName: form.transporterName,
        transporterContact: form.transporterContact,
        vehicleReg: form.vehicleReg,
        notes: form.notes,
        expectedAt: form.expectedAt || null,
        lines: form.lines.map(l => ({
          speciesId: l.speciesId,
          orderedQty: parseInt(l.orderedQty) || 0,
          unitCost: parseFloat(l.unitCost) || 0,
        })),
      };
      if (editTarget) {
        const updated = await inboundShipmentsApi.update(editTarget.inboundShipmentId, req);
        setShipments(prev => prev.map(s => s.inboundShipmentId === editTarget.inboundShipmentId ? updated : s));
      } else {
        const created = await inboundShipmentsApi.create(req);
        setShipments(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e: any) {
      setFormError(e?.message || "Could not save shipment.");
    } finally {
      setFormBusy(false);
    }
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────

  async function dispatch(id: string) {
    try {
      await inboundShipmentsApi.dispatch(id);
      setShipments(prev => prev.map(s => s.inboundShipmentId === id
        ? { ...s, status: "Dispatched", dispatchedAt: new Date().toISOString() } : s));
    } catch (e: any) {
      setError(e?.message || "Could not mark as dispatched.");
    }
  }

  // ── Receive ──────────────────────────────────────────────────────────────────

  function openReceive(s: InboundShipmentDto) {
    setReceiveTarget(s);
    setReceiveLines(s.lines.map(l => ({
      speciesId: l.speciesId,
      receivedQty: String(l.receivedQty > 0 ? l.receivedQty : l.orderedQty),
      shortfallNotes: l.shortfallNotes,
    })));
    setReceiveError(null);
  }

  async function submitReceive() {
    if (!receiveTarget) return;
    setReceiveBusy(true);
    setReceiveError(null);
    try {
      await inboundShipmentsApi.receive(
        receiveTarget.inboundShipmentId,
        receiveLines.map(l => ({
          speciesId: l.speciesId,
          receivedQty: parseInt(l.receivedQty) || 0,
          shortfallNotes: l.shortfallNotes,
        }))
      );
      await load();
      setReceiveTarget(null);
    } catch (e: any) {
      setReceiveError(e?.message || "Could not receive shipment.");
    } finally {
      setReceiveBusy(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await inboundShipmentsApi.remove(deleteTarget.inboundShipmentId);
      setShipments(prev => prev.filter(s => s.inboundShipmentId !== deleteTarget.inboundShipmentId));
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message || "Could not delete shipment.");
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const statuses = ["", "Open", "Dispatched", "Received"];
  const statusLabels: Record<string, string> = { "": "All", Open: "Open", Dispatched: "Dispatched", Received: "Received" };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>🚚 Inbound Shipments</div>
        {canCreate && (
          <button style={s.btn} onClick={openCreate}>+ New Shipment</button>
        )}
      </div>

      {/* Status filter */}
      <div style={s.filters}>
        {statuses.map(st => (
          <button key={st} style={s.filterBtn(statusFilter === st)} onClick={() => setStatusFilter(st)}>
            {statusLabels[st]}
          </button>
        ))}
      </div>

      {error && <div style={{ ...s.error, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ color: "#64748b", padding: 24, textAlign: "center" }}>Loading…</div>
      ) : shipments.length === 0 ? (
        <div style={{ color: "#94a3b8", padding: 32, textAlign: "center", fontSize: 15 }}>
          No shipments found.
        </div>
      ) : (
        shipments.map(sh => {
          const expanded = expandedId === sh.inboundShipmentId;
          const hasShortfall = sh.status === "Received" && sh.lines.some(l => l.receivedQty < l.orderedQty);
          return (
            <div key={sh.inboundShipmentId} style={s.card}>
              <div style={s.cardHeader} onClick={() => setExpandedId(expanded ? null : sh.inboundShipmentId)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{sh.supplierName}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {sh.lines.reduce((t, l) => t + l.orderedQty, 0)} birds ordered
                    {sh.transporterName && ` · ${sh.transporterName}`}
                    {sh.vehicleReg && ` · ${sh.vehicleReg}`}
                    {sh.expectedAt && ` · Expected ${new Date(sh.expectedAt).toLocaleDateString("en-ZA")}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {hasShortfall && (
                    <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>⚠ Shortfall</span>
                  )}
                  <span style={s.badge(sh.status)}>{statusLabel(sh.status)}</span>
                  <span style={{ color: "#94a3b8", fontSize: 18 }}>{expanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {expanded && (
                <div style={s.cardBody}>
                  {/* Meta */}
                  <div style={s.metaRow}>
                    {sh.transporterName && <span style={s.metaItem}>🚛 {sh.transporterName}</span>}
                    {sh.transporterContact && <span style={s.metaItem}>📞 {sh.transporterContact}</span>}
                    {sh.vehicleReg && <span style={s.metaItem}>🚗 {sh.vehicleReg}</span>}
                    {sh.dispatchedAt && <span style={s.metaItem}>📤 Dispatched {new Date(sh.dispatchedAt).toLocaleDateString("en-ZA")}</span>}
                    {sh.receivedAt && <span style={s.metaItem}>📥 Received {new Date(sh.receivedAt).toLocaleDateString("en-ZA")}</span>}
                    {sh.notes && <span style={s.metaItem}>📝 {sh.notes}</span>}
                  </div>

                  {/* Lines */}
                  <div style={s.lineGridHeader}>
                    <div>Species</div>
                    <div style={{ textAlign: "right" }}>Ordered</div>
                    <div style={{ textAlign: "right" }}>Received</div>
                    <div style={{ textAlign: "right" }}>Unit Cost</div>
                  </div>
                  {sh.lines.map((l, i) => {
                    const shortfall = sh.status === "Received" && l.receivedQty < l.orderedQty;
                    return (
                      <div key={i} style={{ ...s.lineGrid, borderTop: "1px solid #f1f5f9", paddingTop: 8, marginTop: 4 }}>
                        <div style={{ fontWeight: 600 }}>{l.speciesName || getSpeciesName(l.speciesId)}</div>
                        <div style={{ textAlign: "right", color: "#1e40af", fontWeight: 700 }}>{l.orderedQty}</div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: shortfall ? "#dc2626" : l.receivedQty > 0 ? "#166534" : "#94a3b8" }}>
                          {sh.status === "Received" ? l.receivedQty : "—"}
                          {shortfall && <span style={{ fontSize: 11, marginLeft: 4 }}>(-{l.orderedQty - l.receivedQty})</span>}
                        </div>
                        <div style={{ textAlign: "right", color: "#374151" }}>
                          {l.unitCost > 0 ? `R ${Number(l.unitCost).toFixed(2)}` : "—"}
                        </div>
                      </div>
                    );
                  })}

                  {/* Shortfall notes */}
                  {sh.lines.some(l => l.shortfallNotes) && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#92400e" }}>
                      {sh.lines.filter(l => l.shortfallNotes).map((l, i) => (
                        <div key={i}>⚠ {l.speciesName}: {l.shortfallNotes}</div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={s.actions}>
                    {canCreate && sh.status === "Open" && (
                      <button style={{ ...s.outlineBtn, color: "#dc2626", borderColor: "#fca5a5" }}
                        onClick={() => { setDeleteTarget(sh); setDeleteError(null); }}>
                        🗑 Delete
                      </button>
                    )}
                    {canCreate && sh.status === "Open" && (
                      <button style={s.outlineBtn} onClick={() => openEdit(sh)}>✏️ Edit</button>
                    )}
                    {canDispatch && sh.status === "Open" && (
                      <button style={{ ...s.btn, background: "#92400e" }} onClick={() => dispatch(sh.inboundShipmentId)}>
                        🚚 Mark Dispatched
                      </button>
                    )}
                    {canReceive && (sh.status === "Open" || sh.status === "Dispatched") && (
                      <button style={{ ...s.btn, background: "#166534" }} onClick={() => openReceive(sh)}>
                        📥 Receive Stock
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div style={s.backdrop} onClick={() => !formBusy && setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>{editTarget ? "✏️ Edit Shipment" : "🚚 New Inbound Shipment"}</div>

            <div style={s.field}>
              <label style={s.label}>Supplier *</label>
              <select style={s.select} value={form.supplierId}
                onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))} disabled={formBusy}>
                <option value="">— Select supplier —</option>
                {suppliers.map(sup => (
                  <option key={sup.supplierId} value={sup.supplierId}>{sup.name}</option>
                ))}
              </select>
            </div>

            <div style={s.row2}>
              <div style={s.field}>
                <label style={s.label}>Transporter name</label>
                <input style={s.input} value={form.transporterName}
                  onChange={e => setForm(p => ({ ...p, transporterName: e.target.value }))} disabled={formBusy} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Transporter contact</label>
                <input style={s.input} value={form.transporterContact}
                  onChange={e => setForm(p => ({ ...p, transporterContact: e.target.value }))} disabled={formBusy} />
              </div>
            </div>

            <div style={s.row2}>
              <div style={s.field}>
                <label style={s.label}>Vehicle reg</label>
                <input style={s.input} value={form.vehicleReg}
                  onChange={e => setForm(p => ({ ...p, vehicleReg: e.target.value }))} disabled={formBusy} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Expected date</label>
                <input type="date" style={s.input} value={form.expectedAt}
                  onChange={e => setForm(p => ({ ...p, expectedAt: e.target.value }))} disabled={formBusy} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Notes</label>
              <input style={s.input} value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} disabled={formBusy} />
            </div>

            {/* Lines */}
            <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 8 }}>Order Lines *</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 32px", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 4 }}>
              <div>Species</div><div>Qty</div><div>Unit Cost</div><div />
            </div>
            {form.lines.map((line, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select style={s.select} value={line.speciesId}
                  onChange={e => setLine(idx, "speciesId", e.target.value)} disabled={formBusy}>
                  <option value="">— Species —</option>
                  {species.filter(sp => sp.isActive).map(sp => (
                    <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>
                  ))}
                </select>
                <NumericInput style={s.input} allowDecimal={false} min={0} value={line.orderedQty}
                  onChange={e => setLine(idx, "orderedQty", e.target.value)} disabled={formBusy} placeholder="0" />
                <NumericInput style={s.input} allowDecimal={true} min={0} value={line.unitCost}
                  onChange={e => setLine(idx, "unitCost", e.target.value)} disabled={formBusy} placeholder="0.00" />
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18, padding: 0 }}
                  onClick={() => removeLine(idx)} disabled={formBusy || form.lines.length <= 1}>✕</button>
              </div>
            ))}
            <button style={{ ...s.outlineBtn, marginBottom: 16 }} onClick={addLine} disabled={formBusy}>+ Add line</button>

            {formError && <div style={{ ...s.error, marginBottom: 12 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.outlineBtn} onClick={() => setShowForm(false)} disabled={formBusy}>Cancel</button>
              <button style={s.btn} onClick={submitForm} disabled={formBusy}>
                {formBusy ? "Saving…" : editTarget ? "Save Changes" : "Create Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive Modal ── */}
      {receiveTarget && (
        <div style={s.backdrop} onClick={() => !receiveBusy && setReceiveTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>📥 Receive Stock — {receiveTarget.supplierName}</div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(22,101,52,0.06)", border: "1px solid rgba(22,101,52,0.2)", fontSize: 13, color: "#166534", marginBottom: 16 }}>
              Enter the actual quantity received for each species. Stock will be added to the hub immediately.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#94a3b8", marginBottom: 8 }}>
              <div>Species</div><div style={{ textAlign: "center" }}>Ordered</div><div style={{ textAlign: "center" }}>Received</div>
            </div>

            {receiveLines.map((rl, idx) => {
              const doLine = receiveTarget.lines.find(l => l.speciesId === rl.speciesId);
              const received = parseInt(rl.receivedQty) || 0;
              const ordered = doLine?.orderedQty ?? 0;
              const hasShortfall = received < ordered && rl.receivedQty !== "";
              return (
                <div key={rl.speciesId} style={{ marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: hasShortfall ? 6 : 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {doLine?.speciesName || getSpeciesName(rl.speciesId)}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 700, color: "#1e40af" }}>{ordered}</div>
                    <NumericInput
                      style={{ ...s.input, textAlign: "center" as const, borderColor: hasShortfall ? "#dc2626" : undefined }}
                      allowDecimal={false} min={0} value={rl.receivedQty}
                      onChange={e => setReceiveLines(prev => prev.map((x, i) => i === idx ? { ...x, receivedQty: e.target.value } : x))}
                      disabled={receiveBusy}
                    />
                  </div>
                  {hasShortfall && (
                    <input
                      style={{ ...s.input, fontSize: 12, padding: "6px 10px", borderColor: "#fca5a5" }}
                      placeholder={`Shortfall reason for ${doLine?.speciesName ?? rl.speciesId}…`}
                      value={rl.shortfallNotes}
                      onChange={e => setReceiveLines(prev => prev.map((x, i) => i === idx ? { ...x, shortfallNotes: e.target.value } : x))}
                      disabled={receiveBusy}
                    />
                  )}
                </div>
              );
            })}

            {receiveError && <div style={{ ...s.error, marginBottom: 12 }}>{receiveError}</div>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.outlineBtn} onClick={() => setReceiveTarget(null)} disabled={receiveBusy}>Cancel</button>
              <button style={{ ...s.btn, background: "#166534" }} onClick={submitReceive} disabled={receiveBusy}>
                {receiveBusy ? "Confirming…" : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div style={s.backdrop} onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div style={{ ...s.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...s.modalTitle, color: "#dc2626" }}>🗑 Delete Shipment</div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
              Delete the shipment from <strong>{deleteTarget.supplierName}</strong>? This cannot be undone.
            </div>
            {deleteError && <div style={{ ...s.error, marginBottom: 12 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.outlineBtn} onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Cancel</button>
              <button style={{ ...s.btn, background: "#dc2626" }} onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
