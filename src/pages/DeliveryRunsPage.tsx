import React, { useEffect, useState } from "react";
import { deliveryRunsApi, type DeliveryRunDto, type DeliveryRunAllocationDto } from "../api/deliveryRunsApi";
import { clientsApi, type ClientDto } from "../api/clientsApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { usersApi, type DriverDto } from "../api/usersApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

// ── Types ──────────────────────────────────────────────────────────────────

type AllocLine = { speciesId: string; qty: string; unitPrice: string };

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Open:           { background: "rgba(234,179,8,0.12)",  color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  OutForDelivery: { background: "rgba(37,99,235,0.1)",  color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Completed:      { background: "rgba(34,197,94,0.1)",  color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const ALLOC_STATUS_COLORS: Record<string, React.CSSProperties> = {
  Open:           { background: "rgba(234,179,8,0.1)",  color: "#92400e", border: "1px solid rgba(234,179,8,0.35)" },
  OutForDelivery: { background: "rgba(37,99,235,0.08)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.25)" },
  Delivered:      { background: "rgba(34,197,94,0.08)", color: "#14532d", border: "1px solid rgba(34,197,94,0.25)" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function DeliveryRunsPage() {
  const isAdmin = hasAnyRole("Owner", "Finance", "Admin");

  // List state
  const [items, setItems] = useState<DeliveryRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);

  // Reference data
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(false);

  // Create run modal
  const [showCreate, setShowCreate] = useState(false);
  const [createDriverId, setCreateDriverId] = useState("");
  const [createDriverName, setCreateDriverName] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Add allocation modal
  const [allocRun, setAllocRun] = useState<DeliveryRunDto | null>(null);
  const [allocClientId, setAllocClientId] = useState("");
  const [allocLines, setAllocLines] = useState<AllocLine[]>([{ speciesId: "", qty: "", unitPrice: "" }]);
  const [allocError, setAllocError] = useState("");
  const [allocBusy, setAllocBusy] = useState(false);

  // Confirm delivery modal
  const [confirmTarget, setConfirmTarget] = useState<{ run: DeliveryRunDto; alloc: DeliveryRunAllocationDto } | null>(null);
  const [confirmLines, setConfirmLines] = useState<{ speciesId: string; speciesName: string; orderedQty: number; deliveredQty: string; unitPrice: string }[]>([]);
  const [confirmPayment, setConfirmPayment] = useState("Cash");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Remove allocation confirm
  const [removeTarget, setRemoveTarget] = useState<{ run: DeliveryRunDto; alloc: DeliveryRunAllocationDto } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function load() {
    try {
      setLoading(true);
      setErrorBanner("");
      const data = await deliveryRunsApi.list(statusFilter ? { status: statusFilter } : undefined);
      setItems(data);
    } catch (e: any) {
      setErrorBanner(e?.message ?? "Could not load delivery runs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRefs() {
    if (refsLoaded) return;
    try {
      const [c, sp, d] = await Promise.all([
        clientsApi.list(200),
        speciesApi.list(),
        usersApi.listDrivers(),
      ]);
      setClients((c as ClientDto[]).filter((x: any) => !x.isWalkIn));
      setSpecies(sp as SpeciesResponse[]);
      setDrivers(d);
      setRefsLoaded(true);
    } catch { /* non-fatal */ }
  }

  useEffect(() => { load(); }, [statusFilter]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getAvailable(speciesId: string): number {
    const sp = (species as any[]).find((x: any) => x.speciesId === speciesId);
    if (!sp) return 0;
    return Math.max(0, sp.qtyOnHandHub ?? 0); // qtyOnHandHub is already net of booked
  }

  // ── Create run ────────────────────────────────────────────────────────────

  function openCreate() {
    setCreateDriverId(""); setCreateDriverName(""); setCreateNotes(""); setCreateError("");
    setShowCreate(true);
    loadRefs();
  }

  async function submitCreate() {
    if (!createDriverId) return setCreateError("Please select a driver.");
    setCreateBusy(true); setCreateError("");
    try {
      const run = await deliveryRunsApi.create({
        hubId: "hub-001",
        assignedDriverId: createDriverId,
        assignedDriverName: createDriverName,
        notes: createNotes.trim(),
      });
      setItems(prev => [run, ...prev]);
      setShowCreate(false);
      setExpandedId(run.deliveryRunId);
    } catch (e: any) { setCreateError(e?.message ?? "Could not create delivery run."); }
    finally { setCreateBusy(false); }
  }

  // ── Add allocation ────────────────────────────────────────────────────────

  function openAllocModal(run: DeliveryRunDto) {
    setAllocRun(run);
    setAllocClientId("");
    setAllocLines([{ speciesId: "", qty: "", unitPrice: "" }]);
    setAllocError("");
    loadRefs();
  }

  function setAllocLine(idx: number, field: keyof AllocLine, value: string) {
    setAllocLines(prev => {
      const lines = [...prev];
      if (field === "speciesId") {
        const sp = (species as any[]).find((x: any) => x.speciesId === value);
        lines[idx] = { ...lines[idx], speciesId: value, unitPrice: sp?.sellPrice ? String(sp.sellPrice) : lines[idx].unitPrice };
      } else {
        lines[idx] = { ...lines[idx], [field]: value };
      }
      return lines;
    });
  }

  async function submitAlloc() {
    if (!allocRun) return;
    if (!allocClientId) return setAllocError("Please select a client.");
    for (let i = 0; i < allocLines.length; i++) {
      if (!allocLines[i].speciesId) return setAllocError(`Line ${i + 1}: select a species.`);
      if (!Number(allocLines[i].qty) || Number(allocLines[i].qty) <= 0) return setAllocError(`Line ${i + 1}: qty must be > 0.`);
    }
    setAllocBusy(true); setAllocError("");
    try {
      const updated = await deliveryRunsApi.addAllocation(allocRun.deliveryRunId, {
        clientId: allocClientId,
        lines: allocLines.map(l => ({
          speciesId: l.speciesId,
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice) || 0,
        })),
      });
      setItems(prev => prev.map(x => x.deliveryRunId === updated.deliveryRunId ? updated : x));
      setAllocRun(null);
    } catch (e: any) { setAllocError(e?.message ?? "Could not add allocation."); }
    finally { setAllocBusy(false); }
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  async function handleDispatch(run: DeliveryRunDto) {
    setBusy(true);
    try {
      const updated = await deliveryRunsApi.dispatch(run.deliveryRunId);
      setItems(prev => prev.map(x => x.deliveryRunId === updated.deliveryRunId ? updated : x));
    } catch (e: any) { setErrorBanner(e?.message ?? "Could not dispatch run."); }
    finally { setBusy(false); }
  }

  // ── Confirm delivery ──────────────────────────────────────────────────────

  function openConfirm(run: DeliveryRunDto, alloc: DeliveryRunAllocationDto) {
    setConfirmTarget({ run, alloc });
    setConfirmLines(alloc.lines.map(l => ({
      speciesId: l.speciesId,
      speciesName: l.speciesName,
      orderedQty: l.qty,
      deliveredQty: String(l.qty),
      unitPrice: String(l.unitPrice),
    })));
    setConfirmPayment("Cash");
    setConfirmError("");
  }

  async function submitConfirm() {
    if (!confirmTarget) return;
    setConfirmBusy(true); setConfirmError("");
    try {
      const updated = await deliveryRunsApi.confirmDelivery(
        confirmTarget.run.deliveryRunId,
        confirmTarget.alloc.deliveryOrderId,
        {
          lines: confirmLines.map(l => ({
            speciesId: l.speciesId,
            deliveredQty: Number(l.deliveredQty) || 0,
            unitPrice: Number(l.unitPrice) || 0,
          })),
          paymentType: confirmPayment,
        },
      );
      setItems(prev => prev.map(x => x.deliveryRunId === updated.deliveryRunId ? updated : x));
      setConfirmTarget(null);
    } catch (e: any) { setConfirmError(e?.message ?? "Could not confirm delivery."); }
    finally { setConfirmBusy(false); }
  }

  // ── Remove allocation ─────────────────────────────────────────────────────

  async function submitRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true); setRemoveError("");
    try {
      const updated = await deliveryRunsApi.removeAllocation(
        removeTarget.run.deliveryRunId,
        removeTarget.alloc.deliveryOrderId,
      );
      setItems(prev => prev.map(x => x.deliveryRunId === updated.deliveryRunId ? updated : x));
      setRemoveTarget(null);
    } catch (e: any) { setRemoveError(e?.message ?? "Could not remove allocation."); }
    finally { setRemoveBusy(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>Delivery Runs</div>
          <div style={s.pageSub}>One driver, multiple client deliveries per run</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select style={s.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Open">Open</option>
            <option value="OutForDelivery">Out for Delivery</option>
            <option value="Completed">Completed</option>
          </select>
          <button style={s.refreshBtn} onClick={load} disabled={loading}>↻</button>
          {isAdmin && (
            <button style={s.primaryBtn} onClick={openCreate}>+ New Run</button>
          )}
        </div>
      </div>

      {errorBanner && <div style={s.errorBanner}>{errorBanner}</div>}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={s.empty}>No delivery runs found.</div>
      ) : (
        <div style={s.list}>
          {items.map(run => {
            const isExpanded = expandedId === run.deliveryRunId;
            const statusStyle = STATUS_COLORS[run.status] ?? {};
            const deliveredCount = run.allocations.filter(a => a.deliveryStatus === "Delivered").length;
            return (
              <div key={run.deliveryRunId} style={s.card}>
                {/* Card header */}
                <div style={s.cardHeader} onClick={() => setExpandedId(isExpanded ? null : run.deliveryRunId)}>
                  <div style={s.cardLeft}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={s.cardTitle}>{run.assignedDriverName || "—"}</span>
                      <span style={{ ...s.badge, ...statusStyle }}>{run.status === "OutForDelivery" ? "Out for Delivery" : run.status}</span>
                    </div>
                    <div style={s.cardMeta}>
                      {run.allocations.length} client{run.allocations.length !== 1 ? "s" : ""}
                      {" · "}
                      {deliveredCount}/{run.allocations.length} delivered
                      {run.notes ? ` · ${run.notes}` : ""}
                      {" · "}
                      <span style={{ fontFamily: "monospace", fontSize: 11 }}>{run.deliveryRunId.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <span style={s.chevron}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={s.cardBody}>
                    {/* Allocation cards */}
                    {run.allocations.length === 0 && (
                      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>No allocations yet. Add client deliveries below.</div>
                    )}
                    {run.allocations.map(alloc => {
                      const allocStyle = ALLOC_STATUS_COLORS[alloc.deliveryStatus] ?? {};
                      const canRemove = isAdmin && alloc.deliveryStatus !== "Delivered" && !alloc.invoiceId;
                      const canConfirm = isAdmin && alloc.deliveryStatus !== "Delivered" && !alloc.invoiceId;
                      return (
                        <div key={alloc.deliveryOrderId} style={s.allocCard}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                            <div>
                              <span style={s.allocClientName}>{alloc.clientName}</span>
                              <span style={{ ...s.badge, ...allocStyle, marginLeft: 8, fontSize: 10 }}>
                                {alloc.deliveryStatus === "OutForDelivery" ? "Out for Delivery" : alloc.deliveryStatus}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {alloc.paymentType && (
                                <span style={s.paymentBadge}>{alloc.paymentType}</span>
                              )}
                              {canConfirm && (
                                <button style={s.confirmBtn} onClick={() => openConfirm(run, alloc)}>
                                  ✓ Confirm Delivery
                                </button>
                              )}
                              {canRemove && (
                                <button style={s.removeAllocBtn} onClick={() => { setRemoveTarget({ run, alloc }); setRemoveError(""); }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={s.allocLines}>
                            {alloc.lines.map(l => (
                              <span key={l.speciesId} style={s.allocPill}>
                                {l.speciesName || l.speciesId}:{" "}
                                {alloc.deliveryStatus === "Delivered"
                                  ? <><strong>{l.deliveredQty}</strong><span style={{ color: "#94a3b8" }}>/{l.qty}</span></>
                                  : <strong>{l.qty}</strong>
                                }
                                {l.unitPrice > 0 && <span style={{ color: "#64748b" }}> @ R{l.unitPrice.toFixed(2)}</span>}
                              </span>
                            ))}
                          </div>
                          {alloc.invoiceId && (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                              Invoice: <span style={{ fontFamily: "monospace" }}>{alloc.invoiceId.slice(0, 12)}…</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Actions */}
                    <div style={s.cardActions}>
                      {isAdmin && run.status !== "Completed" && (
                        <button style={s.allocBtn} onClick={() => openAllocModal(run)}>
                          + Add Client Delivery
                        </button>
                      )}
                      {isAdmin && run.status === "Open" && run.allocations.length > 0 && (
                        <button style={s.dispatchBtn} onClick={() => handleDispatch(run)} disabled={busy}>
                          🚚 Dispatch Driver
                        </button>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>
                      Created {new Date(run.createdAt).toLocaleString("en-ZA")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Run Modal ── */}
      {showCreate && (
        <div style={s.backdrop} onClick={() => !createBusy && setShowCreate(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>New Delivery Run</div>
            <div style={s.modalSub}>Assign a driver to deliver to multiple clients</div>

            <label style={s.label}>
              Driver *
              <select
                style={s.input}
                value={createDriverId}
                onChange={e => {
                  const d = drivers.find(x => x.userId === e.target.value);
                  setCreateDriverId(e.target.value);
                  setCreateDriverName(d?.name ?? "");
                }}
                disabled={createBusy}
              >
                <option value="">— Select driver —</option>
                {drivers.map(d => (
                  <option key={d.userId} value={d.userId}>{d.name}</option>
                ))}
              </select>
            </label>

            <label style={s.label}>
              Notes
              <input
                style={s.input}
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
                disabled={createBusy}
                placeholder="Optional run notes"
              />
            </label>

            {createError && <div style={s.formError}>{createError}</div>}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowCreate(false)} disabled={createBusy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitCreate} disabled={createBusy}>
                {createBusy ? "Creating…" : "Create Run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Allocation Modal ── */}
      {allocRun && (
        <div style={s.backdrop} onClick={() => !allocBusy && setAllocRun(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Add Client Delivery</div>
            <div style={s.modalSub}>{allocRun.assignedDriverName}</div>

            <label style={s.label}>
              Client *
              <select style={s.input} value={allocClientId} onChange={e => setAllocClientId(e.target.value)} disabled={allocBusy}>
                <option value="">— Select client —</option>
                {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.clientName}</option>)}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 4 }}>
              <div style={s.sectionLabel}>Order Lines</div>
              <button style={s.addLineBtn} onClick={() => setAllocLines(l => [...l, { speciesId: "", qty: "", unitPrice: "" }])} disabled={allocBusy}>+ Add line</button>
            </div>

            {allocLines.map((line, idx) => {
              const avail = line.speciesId ? getAvailable(line.speciesId) : null;
              const overQty = avail !== null && Number(line.qty) > avail;
              return (
                <div key={idx} style={s.lineRow}>
                  <select
                    style={{ ...s.input, flex: 2, minWidth: 0 }}
                    value={line.speciesId}
                    onChange={e => setAllocLine(idx, "speciesId", e.target.value)}
                    disabled={allocBusy}
                  >
                    <option value="">— Species —</option>
                    {(species as any[]).map((sp: any) => (
                      <option key={sp.speciesId} value={sp.speciesId}>
                        {sp.name} (avail: {sp.qtyAvailable ?? sp.qtyOnHandHub})
                      </option>
                    ))}
                  </select>
                  <div style={{ flex: 1, display: "grid", gap: 3 }}>
                    <NumericInput
                      style={{ ...s.input, ...(overQty ? { borderColor: "#dc2626" } : {}) }}
                      placeholder="Qty"
                      allowDecimal={false}
                      value={line.qty}
                      onChange={e => setAllocLine(idx, "qty", e.target.value)}
                      disabled={allocBusy}
                    />
                    {avail !== null && (
                      <div style={{ fontSize: 11, fontWeight: 700 }}>
                        {overQty
                          ? <span style={{ color: "#dc2626" }}>⚠ only {avail} available</span>
                          : <span style={{ color: "#16a34a" }}>✓ {avail} available</span>}
                      </div>
                    )}
                  </div>
                  <NumericInput
                    style={{ ...s.input, flex: 1 }}
                    placeholder="Unit Price"
                    value={line.unitPrice}
                    onChange={e => setAllocLine(idx, "unitPrice", e.target.value)}
                    disabled={allocBusy}
                  />
                  {allocLines.length > 1 && (
                    <button style={s.removeLineBtn} onClick={() => setAllocLines(l => l.filter((_, i) => i !== idx))} disabled={allocBusy}>✕</button>
                  )}
                </div>
              );
            })}

            {allocError && <div style={s.formError}>{allocError}</div>}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setAllocRun(null)} disabled={allocBusy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitAlloc} disabled={allocBusy}>
                {allocBusy ? "Adding…" : "Add Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delivery Modal ── */}
      {confirmTarget && (
        <div style={s.backdrop} onClick={() => !confirmBusy && setConfirmTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Confirm Delivery</div>
            <div style={s.modalSub}>
              {confirmTarget.alloc.clientName} · {confirmTarget.run.assignedDriverName}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 2px 4px", marginTop: 8 }}>
              <div>Species</div>
              <div style={{ textAlign: "center" }}>Delivered Qty</div>
              <div style={{ textAlign: "center" }}>Unit Price (R)</div>
            </div>

            {confirmLines.map((l, idx) => (
              <div key={l.speciesId} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontWeight: 700 }}>
                  {l.speciesName}<br />
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>Ordered: {l.orderedQty}</span>
                </div>
                <NumericInput
                  style={{ ...s.input, textAlign: "center" as const }}
                  allowDecimal={false}
                  min={0}
                  max={l.orderedQty}
                  value={l.deliveredQty}
                  onChange={e => setConfirmLines(prev => prev.map((x, i) => i === idx ? { ...x, deliveredQty: e.target.value } : x))}
                  disabled={confirmBusy}
                />
                <NumericInput
                  style={{ ...s.input, textAlign: "center" as const }}
                  min={0}
                  step={0.01}
                  value={l.unitPrice}
                  onChange={e => setConfirmLines(prev => prev.map((x, i) => i === idx ? { ...x, unitPrice: e.target.value } : x))}
                  disabled={confirmBusy}
                />
              </div>
            ))}

            <label style={{ ...s.label, marginTop: 12 }}>
              Payment Type
              <select style={s.input} value={confirmPayment} onChange={e => setConfirmPayment(e.target.value)} disabled={confirmBusy}>
                <option value="Cash">Cash</option>
                <option value="EFT">EFT</option>
                <option value="Credit">Credit</option>
                <option value="CardMachine">Card Machine</option>
              </select>
            </label>

            {confirmError && <div style={s.formError}>{confirmError}</div>}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setConfirmTarget(null)} disabled={confirmBusy}>Cancel</button>
              <button style={{ ...s.primaryBtn, background: "#15803d" }} onClick={submitConfirm} disabled={confirmBusy}>
                {confirmBusy ? "Confirming…" : "✓ Confirm Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Allocation Confirm ── */}
      {removeTarget && (
        <div style={s.backdrop} onClick={() => !removeBusy && setRemoveTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Remove Allocation?</div>
            <div style={s.modalSub}>
              Remove the delivery for <strong>{removeTarget.alloc.clientName}</strong> from this run?
            </div>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
              This will reverse the stock booking and permanently delete the linked delivery order.
            </p>
            {removeError && <div style={s.formError}>{removeError}</div>}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => { setRemoveTarget(null); setRemoveError(""); }} disabled={removeBusy}>Cancel</button>
              <button style={{ ...s.primaryBtn, background: "#dc2626" }} onClick={submitRemove} disabled={removeBusy}>
                {removeBusy ? "Removing…" : "🗑 Remove"}
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
  page: { padding: "20px 24px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  filterSelect: { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff" },
  refreshBtn: { padding: "8px 12px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#64748b", fontWeight: 700, fontSize: 15, cursor: "pointer", lineHeight: 1 },
  primaryBtn: { padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "#2563eb", color: "#fff" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "#fff", color: "#374151" },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" },
  cardLeft: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  badge: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 },
  cardMeta: { fontSize: 12, color: "#64748b", marginTop: 4 },
  chevron: { fontSize: 12, color: "#94a3b8", marginLeft: 12 },
  cardBody: { padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" },
  allocCard: { background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: "10px 12px", marginTop: 10 },
  allocClientName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  allocLines: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  allocPill: { fontSize: 12, fontWeight: 600, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 999, padding: "2px 10px", color: "#334155" },
  paymentBadge: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#15803d" },
  confirmBtn: { padding: "3px 10px", borderRadius: 6, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)", color: "#15803d", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  removeAllocBtn: { padding: "3px 8px", borderRadius: 6, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", color: "#dc2626", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" },
  allocBtn: { padding: "8px 14px", borderRadius: 8, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.3)", color: "#1d4ed8", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  dispatchBtn: { padding: "8px 14px", borderRadius: 8, background: "#2563eb", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 520, boxSizing: "border-box", marginTop: 32 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  modalSub: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  formError: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 13 },
  label: { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb", color: "#111827" },
  sectionLabel: { fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  addLineBtn: { padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(37,99,235,0.4)", background: "rgba(37,99,235,0.06)", color: "#1d4ed8", cursor: "pointer", fontWeight: 700, fontSize: 12 },
  lineRow: { display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" },
  removeLineBtn: { padding: "10px 10px", borderRadius: 8, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#dc2626", cursor: "pointer", fontWeight: 700, flexShrink: 0, alignSelf: "flex-start" },
  modalBtns: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
};
