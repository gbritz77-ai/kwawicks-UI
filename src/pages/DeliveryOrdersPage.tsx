import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { deliveryOrdersApi, type DeliveryOrderResponse, type DeliveryOrderStatus, type EditDeliveryOrderLine } from "../api/deliveryOrdersApi";
import { clientsApi, type ClientDto } from "../api/clientsApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { usersApi, type DriverDto } from "../api/usersApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

// ── Types ──────────────────────────────────────────────────────────────────

type OrderLine = {
  speciesId: string;
  quantity: string;
  unitPrice: string;
};

type CreateForm = {
  customerId: string;
  hubId: string;
  assignedDriverId: string;
  assignedDriverName: string;
  deliveryAddressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  lines: OrderLine[];
};

const emptyForm: CreateForm = {
  customerId: "",
  hubId: "hub-001",
  assignedDriverId: "",
  assignedDriverName: "",
  deliveryAddressLine1: "",
  city: "",
  province: "",
  postalCode: "",
  lines: [{ speciesId: "", quantity: "", unitPrice: "" }],
};

const STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  AwaitingCollection: "Awaiting Collection",
  Open: "Open",
  OutForDelivery: "Out for Delivery",
  Delivered: "Delivered",
  MarkedAtHub: "Marked at Hub",
};

const STATUS_COLORS: Record<DeliveryOrderStatus, React.CSSProperties> = {
  AwaitingCollection: { background: "rgba(124,58,237,0.08)", color: "#4c1d95", border: "1px solid rgba(124,58,237,0.3)" },
  Open: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  OutForDelivery: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Delivered: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
  MarkedAtHub: { background: "rgba(8,145,178,0.1)", color: "#164e63", border: "1px solid rgba(8,145,178,0.3)" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function DeliveryOrdersPage() {
  const navigate = useNavigate();

  // List state
  const [orders, setOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Reference data
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mark at hub
  const [markingAtHubId, setMarkingAtHubId] = useState<string | null>(null);

  // Check in return
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const canOverridePrice = hasAnyRole("Owner", "Finance");
  const canMarkAtHub = hasAnyRole("Owner", "Admin", "HubStaff");
  const canCheckIn = hasAnyRole("Owner", "Admin", "HubStaff");
  const canEditLines = hasAnyRole("Owner", "Finance", "Admin");
  const canDelete = hasAnyRole("Owner", "Admin");

  // Edit lines modal state
  const [editOrder, setEditOrder] = useState<DeliveryOrderResponse | null>(null);
  const [editLines, setEditLines] = useState<EditDeliveryOrderLine[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DeliveryOrderResponse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function loadOrders() {
    try {
      setError(null);
      setLoading(true);
      // "pending-return" is a client-side filter — fetch Delivered orders from server
      const apiStatus = statusFilter === "pending-return" ? "Delivered" : (statusFilter || undefined);
      const data = await deliveryOrdersApi.list(apiStatus ? { status: apiStatus } : undefined);
      setOrders(data);
    } catch (e: any) {
      setError(e?.message || "Could not load delivery orders.");
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    try {
      setLoadingRefs(true);
      const [c, s, d] = await Promise.all([
        clientsApi.list(200),
        speciesApi.list(),
        usersApi.listDrivers(),
      ]);
      setClients(c.filter((x: any) => !x.isWalkIn));
      setSpecies(s);
      setDrivers(d);
    } catch (e: any) {
      setError(e?.message || "Could not load reference data.");
    } finally {
      setLoadingRefs(false);
    }
  }

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => { loadOrders(); }, 30_000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  async function checkInReturn(orderId: string) {
    setCheckingInId(orderId);
    setCheckInError(null);
    try {
      await deliveryOrdersApi.checkInReturn(orderId);
      setOrders(prev => prev.map(o =>
        o.deliveryOrderId === orderId ? { ...o, returnCheckedIn: true } : o
      ));
    } catch (e: any) {
      setCheckInError(e?.message || "Could not check in return.");
    } finally {
      setCheckingInId(null);
    }
  }

  async function markAtHub(orderId: string) {
    setMarkingAtHubId(orderId);
    try {
      await deliveryOrdersApi.updateStatus(orderId, "MarkedAtHub");
      setOrders(prev => prev.map(o => o.deliveryOrderId === orderId ? { ...o, status: "MarkedAtHub" } : o));
    } catch (e: any) {
      setError(e?.message || "Could not mark order at hub.");
    } finally {
      setMarkingAtHubId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true); setDeleteError(null);
    try {
      await deliveryOrdersApi.delete(deleteTarget.deliveryOrderId);
      setOrders(prev => prev.filter(o => o.deliveryOrderId !== deleteTarget.deliveryOrderId));
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? "Could not delete order.");
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = orders;
    // Client-side filter for pending returns
    if (statusFilter === "pending-return") {
      result = result.filter(o =>
        o.returnSubmitted && !o.returnCheckedIn && o.lines.some(l => l.returnedNotWantedQty > 0)
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return result;
    return result.filter(
      (o) =>
        o.deliveryOrderId.toLowerCase().includes(q) ||
        o.assignedDriverName.toLowerCase().includes(q) ||
        o.customerId.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
    );
  }, [orders, searchQuery, statusFilter]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openForm() {
    setError(null);
    setForm(emptyForm);
    setShowForm(true);
    if (clients.length === 0) loadReferenceData();
  }

  function setLine(idx: number, field: keyof OrderLine, value: string) {
    setForm((prev) => {
      const lines = [...prev.lines];
      lines[idx] = { ...lines[idx], [field]: value };
      return { ...prev, lines };
    });
  }

  function addLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, { speciesId: "", quantity: "", unitPrice: "" }] }));
  }

  function removeLine(idx: number) {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  }

  function onDriverChange(userId: string) {
    const driver = drivers.find((d) => d.userId === userId);
    setForm((prev) => ({
      ...prev,
      assignedDriverId: userId,
      assignedDriverName: driver?.name ?? "",
    }));
  }

  // ── Validation + submit ───────────────────────────────────────────────────

  async function submit() {
    if (!form.customerId) return setError("Please select a client.");
    if (!form.assignedDriverId) return setError("Please select a driver.");
    if (!form.deliveryAddressLine1.trim()) return setError("Delivery address is required.");
    if (!form.city.trim()) return setError("City is required.");

    for (let i = 0; i < form.lines.length; i++) {
      const l = form.lines[i];
      if (!l.speciesId) return setError(`Line ${i + 1}: please select a species.`);
      const qty = Number(l.quantity);
      if (!Number.isInteger(qty) || qty <= 0) return setError(`Line ${i + 1}: quantity must be a positive whole number.`);

      const sp = (species as any[]).find((x: any) => x.speciesId === l.speciesId);
      const available = sp ? (sp.qtyOnHandHub ?? 0) : null; // qtyOnHandHub is already net of booked
      if (available !== null && qty > available)
        return setError(`Line ${i + 1} (${sp?.name}): only ${available} available, requested ${qty}.`);
    }

    try {
      setError(null);
      setBusy(true);
      const result = await deliveryOrdersApi.create({
        customerId: form.customerId,
        hubId: form.hubId,
        assignedDriverId: form.assignedDriverId,
        assignedDriverName: form.assignedDriverName,
        deliveryAddressLine1: form.deliveryAddressLine1.trim(),
        city: form.city.trim(),
        province: form.province.trim(),
        postalCode: form.postalCode.trim(),
        lines: form.lines.map((l) => ({
          speciesId: l.speciesId,
          quantity: Number(l.quantity),
          ...(canOverridePrice && l.unitPrice ? { unitPrice: Number(l.unitPrice) } : {}),
        })),
      });

      setShowForm(false);
      setForm(emptyForm);
      // Reload to get updated stock
      await loadOrders();
      setExpandedId(result.deliveryOrderId);
    } catch (e: any) {
      setError(e?.message || "Could not create delivery order.");
    } finally {
      setBusy(false);
    }
  }

  // ── Edit lines ────────────────────────────────────────────────────────────

  function openEditModal(order: DeliveryOrderResponse) {
    setEditOrder(order);
    setEditLines(order.lines.map(l => ({ speciesId: l.speciesId, quantity: l.quantity, unitPrice: l.unitPrice })));
    setEditError(null);
    if (species.length === 0) loadReferenceData();
  }

  function setEditLine(idx: number, field: keyof EditDeliveryOrderLine, value: string) {
    setEditLines(prev => {
      const lines = [...prev];
      lines[idx] = { ...lines[idx], [field]: field === "speciesId" ? value : (Number(value) || 0) };
      return lines;
    });
  }

  async function submitEditLines() {
    if (!editOrder) return;
    for (let i = 0; i < editLines.length; i++) {
      if (editLines[i].quantity <= 0) return setEditError(`Line ${i + 1}: quantity must be greater than 0.`);
      if (editLines[i].unitPrice < 0) return setEditError(`Line ${i + 1}: unit price cannot be negative.`);
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await deliveryOrdersApi.editLines(editOrder.deliveryOrderId, editLines);
      setEditOrder(null);
      await loadOrders();
    } catch (e: any) {
      setEditError(e?.message || "Could not update order lines.");
    } finally {
      setEditBusy(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getClientName(customerId: string) {
    return clients.find((c) => c.clientId === customerId)?.clientName ?? customerId;
  }

  function getSpeciesName(speciesId: string) {
    return (species as any[]).find((s: any) => s.speciesId === speciesId)?.name ?? speciesId;
  }

  function getAvailable(speciesId: string): number | null {
    const sp = (species as any[]).find((s: any) => s.speciesId === speciesId);
    if (!sp) return null;
    return sp.qtyOnHandHub ?? 0; // qtyOnHandHub is already net of booked
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <div style={s.title}>Delivery Orders</div>
          <div style={s.sub}>Create and manage delivery orders for drivers</div>
        </div>
        <div style={s.headerActions}>
          <button style={s.secondaryBtn} onClick={() => navigate("/app")} disabled={busy}>
            ← Back
          </button>
          <button style={s.secondaryBtn} onClick={loadOrders} disabled={loading || busy}>
            Refresh
          </button>
          <button style={s.primaryBtn} onClick={openForm} disabled={busy}>
            + New Order
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filtersRow}>
        <NumericInput
          style={s.search}
          placeholder="Search by order ID, driver, client, city…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          style={s.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="AwaitingCollection">Awaiting Collection</option>
          <option value="Open">Open</option>
          <option value="OutForDelivery">Out for Delivery</option>
          <option value="Delivered">Delivered</option>
          <option value="MarkedAtHub">Marked at Hub</option>
          <option value="pending-return">Pending Return Check-In</option>
        </select>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Order list */}
      {loading ? (
        <div style={s.card}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={s.card}>No delivery orders found.</div>
      ) : (
        <div style={s.list}>
          {filtered.map((order) => {
            const isExpanded = expandedId === order.deliveryOrderId;
            const statusStyle = STATUS_COLORS[order.status] ?? {};
            return (
              <div key={order.deliveryOrderId} style={s.orderCard}>
                {/* Summary row */}
                <div
                  style={s.orderSummary}
                  onClick={() => setExpandedId(isExpanded ? null : order.deliveryOrderId)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.orderTitle}>
                      {order.assignedDriverName || "—"}
                      <span style={{ ...s.statusBadge, ...statusStyle }}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    <div style={s.orderMeta}>
                      <span>{getClientName(order.customerId)}</span>
                      <span style={s.dot}>·</span>
                      <span>{order.city || order.deliveryAddressLine1 || "No address"}</span>
                      <span style={s.dot}>·</span>
                      <span>{order.lines.length} line{order.lines.length !== 1 ? "s" : ""}</span>
                      <span style={s.dot}>·</span>
                      <span style={s.mono}>{order.deliveryOrderId.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <div style={s.chevron}>{isExpanded ? "▲" : "▼"}</div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={s.orderDetail}>
                    <div style={s.detailGrid}>
                      <div style={s.detailSection}>
                        <div style={s.detailHeading}>Order Details</div>
                        <div style={s.kvRow}><span style={s.kvKey}>Order ID</span><span style={s.kvMono}>{order.deliveryOrderId}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Client</span><span style={s.kvVal}>{getClientName(order.customerId)}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Driver</span><span style={s.kvVal}>{order.assignedDriverName} <span style={s.kvMono}>({order.assignedDriverId})</span></span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Status</span><span style={s.kvVal}>{STATUS_LABELS[order.status] ?? order.status}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Created</span><span style={s.kvVal}>{new Date(order.createdAt).toLocaleString()}</span></div>
                        {order.invoiceId && (
                          <div style={s.kvRow}><span style={s.kvKey}>Invoice</span><span style={s.kvMono}>{order.invoiceId}</span></div>
                        )}
                      </div>

                      <div style={s.detailSection}>
                        <div style={s.detailHeading}>Delivery Address</div>
                        <div style={s.kvRow}><span style={s.kvKey}>Address</span><span style={s.kvVal}>{order.deliveryAddressLine1 || "—"}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>City</span><span style={s.kvVal}>{order.city || "—"}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Province</span><span style={s.kvVal}>{order.province || "—"}</span></div>
                        <div style={s.kvRow}><span style={s.kvKey}>Postal Code</span><span style={s.kvVal}>{order.postalCode || "—"}</span></div>
                      </div>
                    </div>

                    {/* Lines table */}
                    <div style={s.detailHeading}>Order Lines</div>
                    <div style={s.linesTable}>
                      <div style={{ ...s.linesRow, ...s.linesHeader }}>
                        <div>Species</div>
                        <div style={{ textAlign: "right" }}>Ordered</div>
                        {canOverridePrice && <div style={{ textAlign: "right" }}>Unit Price</div>}
                        {(order.status === "Delivered" || order.status === "MarkedAtHub") && (
                          <>
                            <div style={{ textAlign: "right" }}>Delivered</div>
                            <div style={{ textAlign: "right" }}>Dead</div>
                            <div style={{ textAlign: "right" }}>Mutilated</div>
                            <div style={{ textAlign: "right" }}>Not Wanted</div>
                            {order.returnSubmitted && <div style={{ textAlign: "right" }}>Returning</div>}
                          </>
                        )}
                      </div>
                      {order.lines.map((line, i) => (
                        <div key={i} style={s.linesRow}>
                          <div>{getSpeciesName(line.speciesId)}</div>
                          <div style={{ textAlign: "right", fontWeight: 700 }}>{line.quantity}</div>
                          {canOverridePrice && (
                            <div style={{ textAlign: "right", color: "#0f172a" }}>
                              {line.unitPrice ? `R\u00A0${Number(line.unitPrice).toFixed(2)}` : "—"}
                            </div>
                          )}
                          {(order.status === "Delivered" || order.status === "MarkedAtHub") && (
                            <>
                              <div style={{ textAlign: "right", color: "#14532d", fontWeight: 700 }}>{line.deliveredQty}</div>
                              <div style={{ textAlign: "right", color: "#7f1d1d" }}>{line.returnedDeadQty}</div>
                              <div style={{ textAlign: "right", color: "#78350f" }}>{line.returnedMutilatedQty}</div>
                              <div style={{ textAlign: "right", color: "#1e3a8a" }}>{line.returnedNotWantedQty}</div>
                              {order.returnSubmitted && (
                                <div style={{ textAlign: "right", color: "#166534", fontWeight: 700 }}>{line.returnedToHubQty}</div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Return status banner */}
                    {(order.status === "Delivered" || order.status === "MarkedAtHub") &&
                      order.lines.some(l => l.returnedNotWantedQty > 0) && (
                      <div style={{
                        marginTop: 14,
                        padding: "10px 14px",
                        borderRadius: 8,
                        fontSize: 13,
                        ...(order.returnCheckedIn
                          ? { background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)", color: "#166534" }
                          : order.returnSubmitted
                            ? { background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.4)", color: "#92400e" }
                            : { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" })
                      }}>
                        {order.returnCheckedIn
                          ? "✅ Stock return checked in"
                          : order.returnSubmitted
                            ? "🔄 Driver has submitted return — awaiting hub check-in"
                            : "⏳ Driver has not yet submitted return"}
                      </div>
                    )}

                    {checkInError && <div style={{ ...s.error, marginTop: 8 }}>{checkInError}</div>}

                    <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                      {canDelete && order.status === "Open" && (
                        <button
                          style={{ ...s.markAtHubBtn, background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                          onClick={() => { setDeleteTarget(order); setDeleteError(null); }}
                        >
                          🗑 Delete
                        </button>
                      )}
                      {canEditLines && order.status === "Open" && (
                        <button
                          style={{ ...s.markAtHubBtn, background: "#7c3aed", borderColor: "#7c3aed" }}
                          onClick={() => openEditModal(order)}
                        >
                          ✏️ Edit Lines
                        </button>
                      )}
                      {canCheckIn && order.returnSubmitted && !order.returnCheckedIn && (
                        <button
                          style={{ ...s.markAtHubBtn, background: "#166534", color: "#fff", borderColor: "#166534" }}
                          disabled={checkingInId === order.deliveryOrderId}
                          onClick={() => checkInReturn(order.deliveryOrderId)}
                        >
                          {checkingInId === order.deliveryOrderId ? "Checking in…" : "📦 Check In Returns"}
                        </button>
                      )}
                      {canMarkAtHub && order.status === "Delivered" && (
                        <button
                          style={s.markAtHubBtn}
                          disabled={markingAtHubId === order.deliveryOrderId}
                          onClick={() => markAtHub(order.deliveryOrderId)}
                        >
                          {markingAtHubId === order.deliveryOrderId ? "Marking…" : "✅ Mark at Hub"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div style={s.backdrop} onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div style={{ ...s.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...s.modalTitle, color: "#dc2626" }}>🗑 Delete Delivery Order</div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 16, lineHeight: 1.6 }}>
              Are you sure you want to delete this order?
              <br />
              <strong>{getClientName(deleteTarget.customerId)}</strong>
              {" · "}{deleteTarget.assignedDriverName}
              {" · "}{deleteTarget.lines.reduce((s, l) => s + l.quantity, 0)} items
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#7f1d1d", marginBottom: 16 }}>
              ⚠ Stock will be returned to hub inventory. This cannot be undone.
            </div>
            {deleteError && <div style={{ ...s.error, marginBottom: 12 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.secondaryBtn} onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Cancel</button>
              <button
                style={{ ...s.markAtHubBtn, background: "#dc2626", borderColor: "#dc2626", color: "#fff", padding: "9px 20px" }}
                onClick={confirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting…" : "Delete Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Lines Modal ── */}
      {editOrder && (
        <div style={s.backdrop} onClick={() => !editBusy && setEditOrder(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>✏️ Edit Order Lines</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Order <span style={{ fontFamily: "monospace" }}>{editOrder.deliveryOrderId.slice(0, 8)}…</span>
              {" · "}{getClientName(editOrder.customerId)}
              {" · "}{editOrder.assignedDriverName}
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)", fontSize: 13, color: "#4c1d95", marginBottom: 14 }}>
              ⚠️ Adjusting quantity will update hub stock. Reducing qty releases stock back; increasing qty deducts from available stock.
            </div>

            {editError && <div style={{ ...s.error, marginBottom: 10 }}>{editError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, fontWeight: 900, fontSize: 12, textTransform: "uppercase", color: "#64748b", padding: "0 2px 4px" }}>
              <div>Species</div>
              <div style={{ textAlign: "center" }}>Qty</div>
              <div style={{ textAlign: "center" }}>Unit Price (R)</div>
            </div>

            {editLines.map((line, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700 }}>
                  {getSpeciesName(line.speciesId)}
                </div>
                <NumericInput
                  style={{ ...s.input, textAlign: "center" as const }}
                  allowDecimal={false}
                  min={1}
                  value={line.quantity}
                  onChange={e => setEditLine(idx, "quantity", e.target.value)}
                  disabled={editBusy}
                />
                <NumericInput
                  style={{ ...s.input, textAlign: "center" as const }}
                  
                  min={0}
                  step={0.01}
                  value={line.unitPrice}
                  onChange={e => setEditLine(idx, "unitPrice", e.target.value)}
                  disabled={editBusy}
                />
              </div>
            ))}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setEditOrder(null)} disabled={editBusy}>Cancel</button>
              <button style={{ ...s.primaryBtn, background: "#7c3aed" }} onClick={submitEditLines} disabled={editBusy}>
                {editBusy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {showForm && (
        <div style={s.backdrop} onClick={() => !busy && setShowForm(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>New Delivery Order</div>

            {loadingRefs && <div style={{ marginBottom: 10, opacity: 0.6 }}>Loading reference data…</div>}

            {error && <div style={{ ...s.error, marginTop: 0, marginBottom: 10 }}>{error}</div>}

            {/* Client */}
            <label style={s.label}>
              Client *
              <select
                style={s.input}
                value={form.customerId}
                onChange={(e) => {
                  const clientId = e.target.value;
                  const client = clients.find((c) => c.clientId === clientId);
                  setForm((p) => ({
                    ...p,
                    customerId: clientId,
                    deliveryAddressLine1: client?.clientAddress ?? p.deliveryAddressLine1,
                    city: client?.clientCity ?? p.city,
                  }));
                }}
                disabled={busy || loadingRefs}
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.clientName}
                  </option>
                ))}
              </select>
            </label>

            {/* Driver */}
            <label style={s.label}>
              Assign Driver *
              <select
                style={s.input}
                value={form.assignedDriverId}
                onChange={(e) => onDriverChange(e.target.value)}
                disabled={busy || loadingRefs}
              >
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d.userId} value={d.userId}>
                    {d.name} {d.email ? `(${d.email})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Delivery address */}
            <div style={s.sectionHeading}>Delivery Address</div>

            <label style={s.label}>
              Street Address *
              <input
                style={s.input}
                value={form.deliveryAddressLine1}
                onChange={(e) => setForm((p) => ({ ...p, deliveryAddressLine1: e.target.value }))}
                disabled={busy}
                placeholder="e.g. 12 Main Road"
              />
            </label>

            <div style={s.twoCol}>
              <label style={s.label}>
                City *
                <input
                  style={s.input}
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label style={s.label}>
                Province
                <input
                  style={s.input}
                  value={form.province}
                  onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))}
                  disabled={busy}
                />
              </label>
            </div>

            <label style={s.label}>
              Postal Code
              <NumericInput
                style={{ ...s.input, maxWidth: 160 }}
                value={form.postalCode}
                onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                disabled={busy}
                allowDecimal={false} 
              />
            </label>

            {/* Order lines */}
            <div style={s.sectionHeading}>
              Order Lines
              <button style={s.addLineBtn} onClick={addLine} disabled={busy}>
                + Add line
              </button>
            </div>

            {form.lines.map((line, idx) => {
              const avail = line.speciesId ? getAvailable(line.speciesId) : null;
              return (
                <div key={idx} style={s.lineRow}>
                  <select
                    style={{ ...s.input, flex: 2 }}
                    value={line.speciesId}
                    onChange={(e) => {
                      const sp = (species as any[]).find((x: any) => x.speciesId === e.target.value);
                      setForm((prev) => {
                        const lines = [...prev.lines];
                        lines[idx] = {
                          ...lines[idx],
                          speciesId: e.target.value,
                          unitPrice: canOverridePrice && sp?.sellPrice != null ? String(sp.sellPrice) : lines[idx].unitPrice,
                        };
                        return { ...prev, lines };
                      });
                    }}
                    disabled={busy || loadingRefs}
                  >
                    <option value="">— Species —</option>
                    {(species as any[]).map((sp: any) => (
                      <option key={sp.speciesId} value={sp.speciesId}>
                        {sp.name} (avail: {Math.max(0, (sp.qtyOnHandHub ?? 0) - (sp.qtyBookedOutForDelivery ?? 0))})
                      </option>
                    ))}
                  </select>

                  <div style={{ flex: 1, display: "grid", gap: 4 }}>
                    <NumericInput
                      style={{ ...s.input }}
                      placeholder="Qty"
                      allowDecimal={false} 
                      value={line.quantity}
                      onChange={(e) => setLine(idx, "quantity", e.target.value)}
                      disabled={busy}
                    />
                    {avail !== null && (
                      <div style={s.availHint}>
                        {Number(line.quantity) > avail
                          ? <span style={{ color: "#dc2626" }}>⚠ only {avail} available</span>
                          : <span style={{ color: "#16a34a" }}>✓ {avail} available</span>}
                      </div>
                    )}
                  </div>

                  {canOverridePrice && (
                    <div style={{ flex: 1, display: "grid", gap: 4 }}>
                      <NumericInput
                        style={{ ...s.input }}
                        placeholder="Unit Price"
                        
                        value={line.unitPrice}
                        onChange={(e) => setLine(idx, "unitPrice", e.target.value)}
                        disabled={busy}
                      />
                      <div style={s.availHint}>Override price (incl. VAT)</div>
                    </div>
                  )}

                  {form.lines.length > 1 && (
                    <button style={s.removeLineBtn} onClick={() => removeLine(idx)} disabled={busy}>
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowForm(false)} disabled={busy}>
                Cancel
              </button>
              <button style={s.primaryBtn} onClick={submit} disabled={busy || loadingRefs}>
                {busy ? "Creating…" : "Create Order"}
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
  page: { padding: "20px 24px", fontFamily: "system-ui" },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  headerActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { opacity: 0.75, marginTop: 4 },

  filtersRow: {
    display: "flex",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
    alignItems: "center",
  },
  search: {
    flex: 1,
    minWidth: 200,
    maxWidth: 420,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 16,
  },
  filterSelect: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 14,
    fontWeight: 800,
    background: "white",
  },

  error: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
  },

  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.02)",
  },

  list: { display: "grid", gap: 10, marginTop: 14, maxWidth: 1100 },

  orderCard: {
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "white",
    overflow: "hidden",
  },
  orderSummary: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    cursor: "pointer",
  },
  orderTitle: {
    fontWeight: 900,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 999,
  },
  orderMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
    fontWeight: 700,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  dot: { opacity: 0.4 },
  mono: {
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
  },
  chevron: { fontSize: 12, opacity: 0.5, flexShrink: 0 },

  orderDetail: {
    padding: "0 16px 16px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    paddingTop: 14,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  detailSection: {},
  detailHeading: {
    fontWeight: 900,
    fontSize: 13,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    color: "rgba(0,0,0,0.5)",
    marginBottom: 8,
  },
  kvRow: { display: "flex", gap: 8, marginTop: 5, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" as const },
  kvKey: { fontWeight: 900, color: "#111", minWidth: 80 },
  kvVal: { color: "rgba(0,0,0,0.7)", fontWeight: 700 },
  kvMono: { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(0,0,0,0.55)" },

  linesTable: {
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 8,
  },
  linesRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    padding: "10px 14px",
    fontSize: 13,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    alignItems: "center",
  },
  linesHeader: {
    background: "#f3f4f6",
    fontWeight: 900,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "rgba(0,0,0,0.55)",
  },

  // Buttons
  primaryBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    background: "#2563eb",
    color: "white",
  },
  secondaryBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
    fontWeight: 900,
    background: "white",
  },
  markAtHubBtn: {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    background: "#0891b2",
    color: "white",
  },

  // Modal
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.4)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 16px 40px",
    zIndex: 200,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 580,
    boxSizing: "border-box" as const,
    background: "white",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(0,0,0,0.12)",
    overflowY: "auto",
  },
  modalTitle: { fontSize: 18, fontWeight: 900, marginBottom: 12 },
  label: { display: "grid", gap: 6, fontWeight: 800, marginTop: 10, fontSize: 14 },
  input: {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 16,
    background: "white",
  },
  sectionHeading: {
    fontWeight: 900,
    fontSize: 13,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    color: "rgba(0,0,0,0.5)",
    marginTop: 18,
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 0,
    gap: 8,
  },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },

  lineRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 8,
    flexWrap: "wrap",
  },
  availHint: { fontSize: 12, fontWeight: 700, paddingLeft: 2 },
  addLineBtn: {
    padding: "6px 12px",
    borderRadius: 10,
    border: "1px solid rgba(37,99,235,0.4)",
    background: "rgba(37,99,235,0.06)",
    color: "#1d4ed8",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },
  removeLineBtn: {
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.3)",
    background: "rgba(239,68,68,0.06)",
    color: "#dc2626",
    cursor: "pointer",
    fontWeight: 900,
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: 0,
  },

  modalBtns: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
};
