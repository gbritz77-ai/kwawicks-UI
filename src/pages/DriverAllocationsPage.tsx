import React, { useEffect, useState } from "react";
import { driverAllocationsApi } from "../api/driverAllocationsApi";
import type { DriverStockAllocationDto } from "../api/driverAllocationsApi";
import { usersApi } from "../api/usersApi";
import type { DriverDto } from "../api/usersApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

const canManage = () => hasAnyRole("Owner", "Admin", "HubStaff");

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Active: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
  Completed: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Cancelled: { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
};

type CreateLine = { speciesId: string; qty: number; unitPrice: number };

type ConfirmAction = {
  id: string;
  action: "complete" | "cancel";
};

function fmt(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DriverAllocationsPage() {
  const [items, setItems] = useState<DriverStockAllocationDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDriver, setFilterDriver] = useState("");

  // Confirm action
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createDriverId, setCreateDriverId] = useState("");
  const [createDriverName, setCreateDriverName] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createLines, setCreateLines] = useState<CreateLine[]>([{ speciesId: "", qty: 0, unitPrice: 0 }]);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    load();
    const timer = setInterval(() => silentRefresh(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [allocs, driverList, sp] = await Promise.all([
        driverAllocationsApi.list(),
        usersApi.listDrivers().catch(() => [] as DriverDto[]),
        speciesApi.list().catch(() => [] as SpeciesResponse[]),
      ]);
      setItems(allocs);
      setDrivers(driverList);
      setSpecies(sp.filter((x: SpeciesResponse) => x.isActive));
      setLastRefresh(new Date());
    } catch {
      setError("Failed to load allocations.");
    } finally {
      setLoading(false);
    }
  }

  async function silentRefresh() {
    try {
      const allocs = await driverAllocationsApi.list();
      setItems(allocs);
      setLastRefresh(new Date());
    } catch {
      // silent — don't clobber UI
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setConfirmError("");
    setBusy(true);
    try {
      const updated =
        confirmAction.action === "complete"
          ? await driverAllocationsApi.complete(confirmAction.id)
          : await driverAllocationsApi.cancel(confirmAction.id);
      setItems(prev => prev.map(i => i.allocationId === updated.allocationId ? updated : i));
      setConfirmAction(null);
    } catch (e: any) {
      setConfirmError(e?.message ?? "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setCreateError("");
    if (!createDriverId) { setCreateError("Select a driver."); return; }
    const validLines = createLines.filter(l => l.speciesId && l.qty > 0 && l.unitPrice > 0);
    if (validLines.length === 0) { setCreateError("Add at least one line with species, qty, and unit price."); return; }
    setBusy(true);
    try {
      const created = await driverAllocationsApi.create({
        driverId: createDriverId,
        driverName: createDriverName,
        hubId: "hub-001",
        notes: createNotes,
        lines: validLines.map(l => ({ speciesId: l.speciesId, qty: l.qty, unitPrice: l.unitPrice })),
      });
      setItems(prev => [created, ...prev]);
      resetCreate();
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create allocation.");
    } finally {
      setBusy(false);
    }
  }

  function resetCreate() {
    setShowCreate(false);
    setCreateDriverId("");
    setCreateDriverName("");
    setCreateNotes("");
    setCreateLines([{ speciesId: "", qty: 0, unitPrice: 0 }]);
    setCreateError("");
  }

  function addCreateLine() {
    setCreateLines(prev => [...prev, { speciesId: "", qty: 0, unitPrice: 0 }]);
  }

  function removeCreateLine(idx: number) {
    setCreateLines(prev => prev.filter((_, i) => i !== idx));
  }

  function updateCreateLine(idx: number, field: keyof CreateLine, value: string | number) {
    setCreateLines(prev =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        if (field === "speciesId") {
          const sp = species.find(s => s.speciesId === value);
          return { ...l, speciesId: value as string, unitPrice: sp?.sellPrice ?? l.unitPrice };
        }
        return { ...l, [field]: value };
      })
    );
  }

  const filtered = items.filter(item => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterDriver && !item.driverName.toLowerCase().includes(filterDriver.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>Driver Stock Allocations</div>
          <div style={s.pageSub}>
            Allocate hub stock to drivers for walk-in sales
            {lastRefresh && (
              <span style={s.refreshStamp}>
                {" "}· Last updated {lastRefresh.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        {canManage() && (
          <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>
            + New Allocation
          </button>
        )}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Filter bar */}
      <div style={s.filterBar}>
        <select
          style={s.filterSelect}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <input
          style={s.filterInput}
          placeholder="Search driver..."
          value={filterDriver}
          onChange={e => setFilterDriver(e.target.value)}
        />
        <span style={s.filterCount}>{filtered.length} allocation{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Allocation list */}
      <div style={s.list}>
        {filtered.length === 0 && (
          <div style={s.emptyState}>No allocations found.</div>
        )}
        {filtered.map(item => {
          const isExpanded = expanded === item.allocationId;
          const totalAllocatedValue = item.lines.reduce((s, l) => s + l.allocatedQty * l.unitPrice, 0);
          const totalSoldValue = item.lines.reduce((s, l) => s + l.soldQty * l.unitPrice, 0);

          return (
            <div key={item.allocationId} style={s.card}>
              {/* Card header */}
              <div style={s.cardHeader}>
                <div style={s.cardHeaderLeft}>
                  <div style={s.driverName}>{item.driverName}</div>
                  <span style={{ ...s.badge, ...(STATUS_COLORS[item.status] ?? STATUS_COLORS["Cancelled"]) }}>
                    {item.status}
                  </span>
                  <span style={s.dateLabel}>{fmtDate(item.createdAt)}</span>
                </div>
                <div style={s.cardHeaderRight}>
                  {canManage() && item.status === "Active" && (
                    <>
                      <button
                        style={s.btnComplete}
                        onClick={() => { setConfirmAction({ id: item.allocationId, action: "complete" }); setConfirmError(""); }}
                      >
                        Complete
                      </button>
                      <button
                        style={s.btnCancel}
                        onClick={() => { setConfirmAction({ id: item.allocationId, action: "cancel" }); setConfirmError(""); }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    style={s.btnToggle}
                    onClick={() => setExpanded(isExpanded ? null : item.allocationId)}
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {/* Summary row */}
              <div style={s.cardSummary}>
                <span style={s.summaryChip}>{item.lines.length} species</span>
                <span style={s.summaryChip}>{item.sales.length} sales</span>
                <span style={s.summaryChip}>Allocated: {fmt(totalAllocatedValue)}</span>
                <span style={{ ...s.summaryChip, color: "#166534", fontWeight: 700 }}>
                  Sold: {fmt(totalSoldValue)}
                </span>
                {item.notes && <span style={s.summaryNotes}>{item.notes}</span>}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={s.expandedBody}>
                  {/* Lines table */}
                  <div style={s.sectionTitle}>Stock Lines</div>
                  <div style={{ overflowX: "auto" as const }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {["Species", "Allocated", "Sold", "Remaining", "Unit Price", "Value Sold"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.lines.map(line => (
                          <tr key={line.speciesId}>
                            <td style={s.td}>{line.speciesName}</td>
                            <td style={s.td}>{line.allocatedQty}</td>
                            <td style={s.td}>{line.soldQty}</td>
                            <td style={{
                              ...s.td,
                              fontWeight: 700,
                              color: line.remainingQty > 0 ? "#166534" : "#64748b",
                            }}>
                              {line.remainingQty}
                            </td>
                            <td style={s.td}>{fmt(line.unitPrice)}</td>
                            <td style={{ ...s.td, fontWeight: 600 }}>{fmt(line.soldQty * line.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ ...s.td, fontWeight: 700, textAlign: "right" as const }}>Totals</td>
                          <td style={s.td}></td>
                          <td style={{ ...s.td, fontWeight: 800, color: "#166534" }}>{fmt(totalSoldValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Sales history */}
                  {item.sales.length > 0 && (
                    <>
                      <div style={{ ...s.sectionTitle, marginTop: 20 }}>Sales History</div>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            {["Date/Time", "Species", "Qty", "Payment", "Customer", "Amount"].map(h => (
                              <th key={h} style={s.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...item.sales]
                            .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
                            .map(sale => (
                              <tr key={sale.saleId}>
                                <td style={s.td}>
                                  {new Date(sale.soldAt).toLocaleString("en-ZA", {
                                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                  })}
                                </td>
                                <td style={s.td}>{sale.speciesName}</td>
                                <td style={s.td}>{sale.qty}</td>
                                <td style={s.td}>{sale.paymentType}</td>
                                <td style={s.td}>{sale.customerName || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                                <td style={{ ...s.td, fontWeight: 600 }}>{fmt(sale.totalAmount)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {item.sales.length === 0 && (
                    <div style={s.emptyState}>No sales recorded yet.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm action modal */}
      {confirmAction && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>
              {confirmAction.action === "complete" ? "Complete Allocation?" : "Cancel Allocation?"}
            </div>
            <div style={s.modalBody}>
              {confirmAction.action === "complete"
                ? "Mark this allocation as completed. The driver's remaining stock will be returned."
                : "Cancel this allocation. This action cannot be undone."}
            </div>
            {confirmError && <div style={s.errorText}>{confirmError}</div>}
            <div style={s.modalActions}>
              <button
                style={s.btnSecondary}
                onClick={() => { setConfirmAction(null); setConfirmError(""); }}
                disabled={busy}
              >
                No, Keep It
              </button>
              <button
                style={confirmAction.action === "complete" ? s.btnPrimary : s.btnDanger}
                onClick={handleConfirmAction}
                disabled={busy}
              >
                {busy
                  ? "Processing..."
                  : confirmAction.action === "complete"
                  ? "Yes, Complete"
                  : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create allocation modal */}
      {showCreate && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth: 640, width: "100%" }}>
            <div style={s.modalTitle}>New Driver Allocation</div>

            <label style={s.label}>Driver *</label>
            <select
              style={s.select}
              value={createDriverId}
              onChange={e => {
                const d = drivers.find(dr => dr.userId === e.target.value);
                setCreateDriverId(e.target.value);
                setCreateDriverName(d?.name ?? "");
              }}
            >
              <option value="">— Select driver —</option>
              {drivers.map(d => (
                <option key={d.userId} value={d.userId}>{d.name}</option>
              ))}
            </select>

            <label style={{ ...s.label, marginTop: 12 }}>Notes (optional)</label>
            <input
              style={s.input}
              placeholder="e.g. Route A morning run"
              value={createNotes}
              onChange={e => setCreateNotes(e.target.value)}
            />

            <div style={{ ...s.sectionTitle, marginTop: 16 }}>Stock Lines</div>
            {createLines.map((line, idx) => {
              const sp = species.find(s => s.speciesId === line.speciesId);
              return (
                <div key={idx} style={s.createLineRow}>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Species</label>
                    <select
                      style={s.select}
                      value={line.speciesId}
                      onChange={e => updateCreateLine(idx, "speciesId", e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {species.map(sp2 => (
                        <option key={sp2.speciesId} value={sp2.speciesId}>
                          {sp2.name}
                          {sp2.qtyOnHandHub > 0 ? ` (${sp2.qtyOnHandHub} on hand)` : " (out of stock)"}
                        </option>
                      ))}
                    </select>
                    {sp && (
                      <div style={s.stockHint}>
                        On hand: {sp.qtyOnHandHub} · Booked: {sp.qtyBookedOutForDelivery} · Available: {sp.qtyAvailable}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Qty</label>
                    <NumericInput
                      style={s.input}
                      min={1}
                      allowDecimal={false}
                      label="Quantity"
                      value={line.qty === 0 ? "" : line.qty}
                      onChange={e => updateCreateLine(idx, "qty", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Unit Price (R)</label>
                    <NumericInput
                      style={s.input}
                      min={0}
                      step={0.01}
                      label="Unit Price"
                      value={line.unitPrice === 0 ? "" : line.unitPrice}
                      onChange={e => updateCreateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                    <button
                      style={s.removeBtn}
                      onClick={() => removeCreateLine(idx)}
                      disabled={createLines.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}

            <button style={s.btnAddLine} onClick={addCreateLine}>
              + Add Line
            </button>

            {createError && <div style={{ ...s.errorText, marginTop: 10 }}>{createError}</div>}

            <div style={{ ...s.modalActions, marginTop: 20 }}>
              <button style={s.btnSecondary} onClick={resetCreate} disabled={busy}>
                Cancel
              </button>
              <button style={s.btnPrimary} onClick={handleCreate} disabled={busy}>
                {busy ? "Creating..." : "Create Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  refreshStamp: { color: "#94a3b8" },
  filterBar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const, alignItems: "center" },
  filterSelect: { padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" },
  filterInput: { padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minWidth: 180 },
  filterCount: { fontSize: 12, color: "#94a3b8", marginLeft: 4 },
  list: { display: "flex", flexDirection: "column" as const, gap: 12 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 10 },
  cardHeaderLeft: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const },
  cardHeaderRight: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  driverName: { fontSize: 16, fontWeight: 700, color: "#1e293b" },
  badge: { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 },
  dateLabel: { fontSize: 12, color: "#64748b" },
  cardSummary: { display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" as const, alignItems: "center" },
  summaryChip: { fontSize: 12, color: "#374151", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 12, padding: "3px 10px" },
  summaryNotes: { fontSize: 12, color: "#64748b", fontStyle: "italic" as const, marginLeft: 4 },
  expandedBody: { marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, fontSize: 11, fontWeight: 600, color: "#64748b", borderBottom: "2px solid #e2e8f0", padding: "6px 8px", textTransform: "uppercase" as const },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" as const, color: "#374151" },
  emptyState: { textAlign: "center" as const, color: "#94a3b8", fontSize: 14, padding: "32px 16px" },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#374151", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  btnDanger: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnComplete: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnCancel: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnToggle: { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  btnAddLine: { background: "none", border: "1px dashed #94a3b8", color: "#64748b", borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontSize: 13, width: "100%", marginTop: 8 },
  removeBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: "4px 6px" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 12, padding: "24px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" as const },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#1e293b", marginBottom: 14 },
  modalBody: { fontSize: 14, color: "#374151", marginBottom: 16 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 },
  input: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" as const },
  select: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, background: "#fff", marginBottom: 4 },
  stockHint: { fontSize: 11, color: "#64748b", marginTop: 3 },
  createLineRow: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" },
  errorText: { color: "#dc2626", fontSize: 13 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
};
