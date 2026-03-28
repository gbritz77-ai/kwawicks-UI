import React, { useEffect, useState } from "react";
import { hubRequestsApi } from "../api/hubRequestsApi";
import type { HubRequestDto, ActionHubRequestRequest } from "../api/hubRequestsApi";
import { hasAnyRole } from "../api/auth";

const canCreate = () => hasAnyRole("Owner", "Finance", "Admin");
const canCancel = () => hasAnyRole("Owner", "Finance", "Admin");

type StatusFilter = "all" | "Pending" | "Actioned" | "Cancelled";

const ORDER_TYPES = ["DeliveryOrder", "ProcurementOrder", "Other"];

const emptyAction = (): ActionHubRequestRequest => ({
  actionNotes: "",
  linkedOrderId: "",
  linkedOrderType: "DeliveryOrder",
  linkedOrderRef: "",
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export default function HubRequestsPage() {
  const [requests, setRequests] = useState<HubRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // Action modal
  const [actionTarget, setActionTarget] = useState<HubRequestDto | null>(null);
  const [actionForm, setActionForm] = useState<ActionHubRequestRequest>(emptyAction());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => { load(); }, [statusFilter]);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const items = await hubRequestsApi.list(statusFilter === "all" ? undefined : statusFilter);
      setRequests(items);
    } catch {
      setError("Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newMessage.trim()) { setCreateError("Message is required."); return; }
    setCreateBusy(true);
    setCreateError("");
    try {
      const created = await hubRequestsApi.create({ message: newMessage.trim() });
      setRequests(prev => [created, ...prev]);
      setNewMessage("");
      setShowCreate(false);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create request.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleAction() {
    if (!actionTarget) return;
    setActionBusy(true);
    setActionError("");
    try {
      const updated = await hubRequestsApi.action(actionTarget.hubRequestId, actionForm);
      setRequests(prev => prev.map(r => r.hubRequestId === updated.hubRequestId ? updated : r));
      setActionTarget(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to action request.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      const updated = await hubRequestsApi.cancel(id);
      setRequests(prev => prev.map(r => r.hubRequestId === updated.hubRequestId ? updated : r));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    }
  }

  const pendingCount = requests.filter(r => r.status === "Pending").length;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.heading}>Hub Requests</h1>
          <p style={s.subText}>Request the hub team to create an order on your behalf.</p>
        </div>
        {canCreate() && (
          <button style={s.btnPrimary} onClick={() => { setShowCreate(true); setCreateError(""); setNewMessage(""); }}>
            + New Request
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div style={s.filterRow}>
        {(["all", "Pending", "Actioned", "Cancelled"] as StatusFilter[]).map(f => (
          <button
            key={f}
            style={statusFilter === f ? { ...s.filterBtn, ...s.filterBtnActive } : s.filterBtn}
            onClick={() => setStatusFilter(f)}
          >
            {f === "all" ? "All" : f}
            {f === "Pending" && pendingCount > 0 && (
              <span style={s.badge}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={s.createCard}>
          <h3 style={s.cardTitle}>New Hub Request</h3>
          <p style={s.hint}>
            Describe what you need the hub team to order or action. A WhatsApp notification will be sent to the hub.
          </p>
          {createError && <p style={s.errText}>{createError}</p>}
          <textarea
            style={s.textarea}
            rows={5}
            placeholder="e.g. Please create a delivery order for Client ABC — 50 boxes of Nile Perch, delivery on 2026-04-01 to Johannesburg. Payment type: EFT."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
          />
          <div style={s.formActions}>
            <button style={s.btnSecondary} onClick={() => setShowCreate(false)} disabled={createBusy}>Cancel</button>
            <button style={s.btnPrimary} onClick={handleCreate} disabled={createBusy}>
              {createBusy ? "Sending…" : "📱 Send Request"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p style={{ color: "#94a3b8", marginTop: 24 }}>Loading…</p>
      ) : error ? (
        <p style={{ color: "#ef4444", marginTop: 16 }}>{error}</p>
      ) : requests.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 600, color: "#f1f5f9" }}>No requests found</div>
          <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 14 }}>
            {statusFilter === "Pending" ? "All requests have been actioned." : "No requests yet."}
          </div>
        </div>
      ) : (
        <div style={s.list}>
          {requests.map(req => {
            const expanded = expandedId === req.hubRequestId;
            return (
              <div key={req.hubRequestId} style={s.card}>
                {/* Card header */}
                <div
                  style={s.cardHead}
                  onClick={() => setExpandedId(expanded ? null : req.hubRequestId)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.cardTopRow}>
                      <span style={{ ...s.statusBadge, ...statusStyle(req.status) }}>
                        {req.status}
                      </span>
                      <span style={s.dateText}>{fmtDate(req.createdAtUtc)}</span>
                    </div>
                    <div style={s.messagePreview}>
                      {expanded ? req.message : req.message.length > 120 ? req.message.slice(0, 120) + "…" : req.message}
                    </div>
                    <div style={s.metaRow}>
                      <span style={s.metaLabel}>Requested by:</span>
                      <span style={s.metaVal}>{req.requestedBy}</span>
                      {req.status !== "Pending" && req.actionedBy && (
                        <>
                          <span style={s.dot}>·</span>
                          <span style={s.metaLabel}>{req.status === "Actioned" ? "Actioned by:" : "Cancelled by:"}</span>
                          <span style={s.metaVal}>{req.actionedBy}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span style={s.chevron}>{expanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded body */}
                {expanded && (
                  <div style={s.cardBody}>
                    {/* Full message */}
                    <div style={s.fullMessage}>{req.message}</div>

                    {/* WhatsApp status */}
                    {req.whatsAppError ? (
                      <div style={s.waError}>⚠ WhatsApp notification failed: {req.whatsAppError}</div>
                    ) : (
                      <div style={s.waOk}>📱 WhatsApp notification sent</div>
                    )}

                    {/* Action details if actioned */}
                    {req.status === "Actioned" && (
                      <div style={s.actionDetail}>
                        {req.actionNotes && (
                          <div style={s.detailRow}>
                            <span style={s.detailKey}>Notes</span>
                            <span>{req.actionNotes}</span>
                          </div>
                        )}
                        {req.linkedOrderRef && (
                          <div style={s.detailRow}>
                            <span style={s.detailKey}>Linked Order</span>
                            <span>
                              <span style={s.orderTypeBadge}>{req.linkedOrderType || "Order"}</span>
                              {" "}{req.linkedOrderRef}
                              {req.linkedOrderId && (
                                <span style={s.idMono}> ({req.linkedOrderId.slice(0, 8)}…)</span>
                              )}
                            </span>
                          </div>
                        )}
                        {req.actionedAtUtc && (
                          <div style={s.detailRow}>
                            <span style={s.detailKey}>Actioned at</span>
                            <span>{fmtDate(req.actionedAtUtc)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions for pending requests */}
                    {req.status === "Pending" && (
                      <div style={s.cardActions}>
                        <button
                          style={s.btnAction}
                          onClick={() => { setActionTarget(req); setActionForm(emptyAction()); setActionError(""); }}
                        >
                          ✓ Mark as Actioned
                        </button>
                        {canCancel() && (
                          <button
                            style={s.btnCancel}
                            onClick={() => handleCancel(req.hubRequestId)}
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action modal */}
      {actionTarget && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>Mark as Actioned</h3>
            <p style={s.modalSub}>Request by {actionTarget.requestedBy}</p>
            <div style={s.requestPreview}>{actionTarget.message}</div>

            {actionError && <p style={s.errText}>{actionError}</p>}

            <label style={s.label}>
              Action Notes
              <textarea
                style={{ ...s.input, height: 80, resize: "vertical" }}
                placeholder="What was done? e.g. Created delivery order DO#abc123"
                value={actionForm.actionNotes}
                onChange={e => setActionForm(f => ({ ...f, actionNotes: e.target.value }))}
              />
            </label>

            <label style={s.label}>
              Order Type (optional)
              <select
                style={s.input}
                value={actionForm.linkedOrderType}
                onChange={e => setActionForm(f => ({ ...f, linkedOrderType: e.target.value }))}
              >
                <option value="">— Not linked to an order —</option>
                {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            {actionForm.linkedOrderType && (
              <>
                <label style={s.label}>
                  Order Reference (human-readable)
                  <input
                    type="text"
                    style={s.input}
                    placeholder="e.g. DO#abc123 or Procurement Order #42"
                    value={actionForm.linkedOrderRef}
                    onChange={e => setActionForm(f => ({ ...f, linkedOrderRef: e.target.value }))}
                  />
                </label>
                <label style={s.label}>
                  Order ID (system ID, optional)
                  <input
                    type="text"
                    style={s.input}
                    placeholder="Paste the order UUID if known"
                    value={actionForm.linkedOrderId}
                    onChange={e => setActionForm(f => ({ ...f, linkedOrderId: e.target.value }))}
                  />
                </label>
              </>
            )}

            <div style={s.modalBtns}>
              <button style={s.btnSecondary} onClick={() => setActionTarget(null)} disabled={actionBusy}>Cancel</button>
              <button style={s.btnPrimary} onClick={handleAction} disabled={actionBusy}>
                {actionBusy ? "Saving…" : "Confirm Actioned"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "Pending":  return { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" };
    case "Actioned": return { background: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" };
    case "Cancelled":return { background: "rgba(100,116,139,0.15)",color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" };
    default:         return {};
  }
}

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 24px 64px",
    maxWidth: 860,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#e2e8f0",
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  heading: { margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#f1f5f9" },
  subText: { margin: 0, fontSize: 14, color: "#94a3b8" },
  filterRow: {
    display: "flex",
    gap: 4,
    marginBottom: 20,
    borderBottom: "1px solid #334155",
  },
  filterBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    padding: "8px 16px",
    borderBottom: "2px solid transparent",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  filterBtnActive: {
    color: "#22c55e",
    borderBottom: "2px solid #22c55e",
    fontWeight: 600,
  },
  badge: {
    background: "#f59e0b",
    color: "#fff",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 700,
    padding: "1px 6px",
    minWidth: 18,
    textAlign: "center",
  },
  createCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: { margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#f1f5f9" },
  hint: { margin: "0 0 14px", fontSize: 13, color: "#94a3b8" },
  textarea: {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #475569",
    borderRadius: 6,
    color: "#e2e8f0",
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  btnPrimary: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    background: "#1e293b",
    color: "#94a3b8",
    border: "1px solid #475569",
    borderRadius: 7,
    padding: "9px 18px",
    fontSize: 14,
    cursor: "pointer",
  },
  errText: { color: "#ef4444", fontSize: 13, margin: "0 0 10px" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHead: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    cursor: "pointer",
  },
  cardTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  statusBadge: {
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
  },
  dateText: { fontSize: 12, color: "#64748b" },
  messagePreview: { fontSize: 14, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 6 },
  metaRow: { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 12 },
  metaLabel: { color: "#94a3b8" },
  metaVal: { color: "#cbd5e1", fontWeight: 500 },
  dot: { color: "#475569" },
  chevron: { color: "#475569", fontSize: 12, flexShrink: 0, paddingTop: 2 },
  cardBody: {
    borderTop: "1px solid #334155",
    padding: "14px 16px",
  },
  fullMessage: {
    fontSize: 14,
    color: "#e2e8f0",
    lineHeight: 1.65,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: "10px 14px",
    marginBottom: 12,
    whiteSpace: "pre-wrap",
  },
  waOk: { fontSize: 12, color: "#4ade80", marginBottom: 12 },
  waError: {
    fontSize: 12,
    color: "#fbbf24",
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.2)",
    borderRadius: 5,
    padding: "6px 10px",
    marginBottom: 12,
  },
  actionDetail: {
    background: "rgba(34,197,94,0.05)",
    border: "1px solid rgba(34,197,94,0.15)",
    borderRadius: 6,
    padding: "10px 14px",
    marginBottom: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  detailRow: { display: "flex", gap: 10, fontSize: 13, alignItems: "flex-start" },
  detailKey: { color: "#94a3b8", minWidth: 100, flexShrink: 0 },
  orderTypeBadge: {
    background: "rgba(99,102,241,0.15)",
    color: "#818cf8",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: 11,
    fontWeight: 600,
  },
  idMono: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#64748b" },
  cardActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  btnAction: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnCancel: {
    background: "none",
    color: "#94a3b8",
    border: "1px solid #475569",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 24px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    marginTop: 16,
  },
  // Modal
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 300,
    padding: 20,
  },
  modal: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  modalTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  modalSub: { margin: "0 0 16px", fontSize: 13, color: "#94a3b8" },
  requestPreview: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 13,
    color: "#cbd5e1",
    marginBottom: 16,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    maxHeight: 120,
    overflowY: "auto",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: 500,
    marginBottom: 12,
  },
  input: {
    background: "#0f172a",
    border: "1px solid #475569",
    borderRadius: 6,
    color: "#e2e8f0",
    padding: "8px 10px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modalBtns: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
};
