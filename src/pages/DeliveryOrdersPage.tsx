import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deliveryOrdersApi, type DeliveryOrderResponse, type DeliveryOrderStatus } from "../api/deliveryOrdersApi";
import { clientsApi, type ClientDto } from "../api/clientsApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { usersApi, type DriverDto } from "../api/usersApi";

// ── Types ──────────────────────────────────────────────────────────────────

type OrderLine = {
  speciesId: string;
  quantity: string;
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
  lines: [{ speciesId: "", quantity: "" }],
};

const STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  Open: "Open",
  OutForDelivery: "Out for Delivery",
  Delivered: "Delivered",
};

const STATUS_COLORS: Record<DeliveryOrderStatus, React.CSSProperties> = {
  Open: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  OutForDelivery: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Delivered: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function DeliveryOrdersPage() {
  const navigate = useNavigate();

  // List state
  const [orders, setOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
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

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function loadOrders() {
    try {
      setError(null);
      setLoading(true);
      const data = await deliveryOrdersApi.list(statusFilter ? { status: statusFilter } : undefined);
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
      setClients(c);
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
  }, [statusFilter]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.deliveryOrderId.toLowerCase().includes(q) ||
        o.assignedDriverName.toLowerCase().includes(q) ||
        o.customerId.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

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
    setForm((prev) => ({ ...prev, lines: [...prev.lines, { speciesId: "", quantity: "" }] }));
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
      const available = sp ? (sp.qtyOnHandHub ?? 0) - (sp.qtyBookedOutForDelivery ?? 0) : null;
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
        lines: form.lines.map((l) => ({ speciesId: l.speciesId, quantity: Number(l.quantity) })),
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
    return (sp.qtyOnHandHub ?? 0) - (sp.qtyBookedOutForDelivery ?? 0);
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
        <input
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
          <option value="Open">Open</option>
          <option value="OutForDelivery">Out for Delivery</option>
          <option value="Delivered">Delivered</option>
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
                        {order.status === "Delivered" && (
                          <>
                            <div style={{ textAlign: "right" }}>Delivered</div>
                            <div style={{ textAlign: "right" }}>Dead</div>
                            <div style={{ textAlign: "right" }}>Mutilated</div>
                            <div style={{ textAlign: "right" }}>Not Wanted</div>
                          </>
                        )}
                      </div>
                      {order.lines.map((line, i) => (
                        <div key={i} style={s.linesRow}>
                          <div>{getSpeciesName(line.speciesId)}</div>
                          <div style={{ textAlign: "right", fontWeight: 700 }}>{line.quantity}</div>
                          {order.status === "Delivered" && (
                            <>
                              <div style={{ textAlign: "right", color: "#14532d", fontWeight: 700 }}>{line.deliveredQty}</div>
                              <div style={{ textAlign: "right", color: "#7f1d1d" }}>{line.returnedDeadQty}</div>
                              <div style={{ textAlign: "right", color: "#78350f" }}>{line.returnedMutilatedQty}</div>
                              <div style={{ textAlign: "right", color: "#1e3a8a" }}>{line.returnedNotWantedQty}</div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
                onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
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
              <input
                style={{ ...s.input, maxWidth: 160 }}
                value={form.postalCode}
                onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                disabled={busy}
                inputMode="numeric"
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
                    onChange={(e) => setLine(idx, "speciesId", e.target.value)}
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
                    <input
                      style={{ ...s.input }}
                      placeholder="Qty"
                      inputMode="numeric"
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
  page: { padding: 24, fontFamily: "system-ui" },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  headerActions: { display: "flex", gap: 10, alignItems: "center" },
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
    maxWidth: 1100,
  },

  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.02)",
    maxWidth: 1100,
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
    gridTemplateColumns: "1fr 1fr",
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

  // Modal
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 100,
    overflowY: "auto",
  },
  modal: {
    width: "min(580px, 96vw)",
    background: "white",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(0,0,0,0.12)",
    maxHeight: "90vh",
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
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

  lineRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 8,
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
