import React, { useEffect, useState } from "react";
import { stockLossApi } from "../api/stockLossApi";
import type { StockLossDto } from "../api/stockLossApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { NumericInput } from "../components/NumericInput";

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function StockLossPage() {
  const [losses,  setLosses]  = useState<StockLossDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Filter
  const [filterSpecies, setFilterSpecies] = useState("");

  // Record loss modal
  const [showModal,    setShowModal]    = useState(false);
  const [modalSpecies, setModalSpecies] = useState("");
  const [modalQty,     setModalQty]     = useState(0);
  const [modalNotes,   setModalNotes]   = useState("");
  const [modalBusy,    setModalBusy]    = useState(false);
  const [modalError,   setModalError]   = useState("");

  // Latest success flash
  const [flash, setFlash] = useState<{ speciesName: string; qty: number; after: number } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [lossData, spData] = await Promise.all([
        stockLossApi.list(),
        speciesApi.list(),
      ]);
      setLosses(lossData);
      setSpecies(spData.filter(s => s.isActive));
    } catch { setError("Failed to load data."); }
    finally { setLoading(false); }
  }

  function openModal() {
    setModalSpecies(species[0]?.speciesId ?? "");
    setModalQty(0);
    setModalNotes("");
    setModalError("");
    setShowModal(true);
  }

  async function submitLoss() {
    if (!modalSpecies) { setModalError("Please select a species."); return; }
    if (modalQty <= 0) { setModalError("Quantity must be greater than zero."); return; }

    setModalBusy(true); setModalError("");
    try {
      const result = await stockLossApi.record({
        speciesId: modalSpecies,
        qty: modalQty,
        notes: modalNotes.trim(),
      });
      setLosses(prev => [result, ...prev]);

      // Update the species stock count in local list
      setSpecies(prev => prev.map(s =>
        s.speciesId === result.speciesId
          ? { ...s, qtyOnHandHub: result.qtyOnHandHubAfter }
          : s
      ));

      setFlash({ speciesName: result.speciesName, qty: result.qty, after: result.qtyOnHandHubAfter });
      setTimeout(() => setFlash(null), 5000);
      setShowModal(false);
    } catch (e: any) { setModalError(e?.message ?? "Failed to record loss."); }
    finally { setModalBusy(false); }
  }

  const selectedSpecies = species.find(s => s.speciesId === modalSpecies);
  const filtered = filterSpecies
    ? losses.filter(l => l.speciesId === filterSpecies)
    : losses;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>💀 Dead Stock</div>
          <div style={s.pageSub}>Record chickens that have died at the hub or shed — updates hub stock immediately.</div>
        </div>
        <button style={s.recordBtn} onClick={openModal}>
          + Record Dead Stock
        </button>
      </div>

      {/* Success flash */}
      {flash && (
        <div style={s.flash}>
          ✓ Recorded {flash.qty} dead {flash.speciesName} — hub stock now {flash.after} on hand.
        </div>
      )}

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Stock snapshot */}
      {species.length > 0 && (
        <div style={s.snapshotGrid}>
          {species.map(sp => (
            <div key={sp.speciesId} style={s.snapshotCard}>
              <div style={s.snapshotName}>{sp.name}</div>
              <div style={s.snapshotQty}>{sp.qtyOnHandHub.toLocaleString()}</div>
              <div style={s.snapshotLabel}>On Hand</div>
              {sp.qtyBookedOutForDelivery > 0 && (
                <div style={s.snapshotBooked}>({sp.qtyBookedOutForDelivery} booked)</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div style={s.filterRow}>
        <select
          value={filterSpecies}
          onChange={e => setFilterSpecies(e.target.value)}
          style={s.filterSelect}>
          <option value="">All Species</option>
          {species.map(sp => (
            <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loss table */}
      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>No dead stock records yet.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Date / Time</th>
                <th style={s.th}>Species</th>
                <th style={{ ...s.th, textAlign: "right" }}>Qty Dead</th>
                <th style={s.th}>Notes</th>
                <th style={s.th}>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.lossId} style={s.tr}>
                  <td style={s.td}>{fmt(l.createdAt)}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{l.speciesName || l.speciesId}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>
                    <span style={s.qtyBadge}>−{l.qty.toLocaleString()}</span>
                  </td>
                  <td style={{ ...s.td, color: "#64748b" }}>{l.notes || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                  <td style={{ ...s.td, color: "#64748b", fontSize: 12 }}>{l.recordedByUserId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record loss modal */}
      {showModal && (
        <div style={s.backdrop} onClick={() => !modalBusy && setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Record Dead Stock</div>
            <div style={s.modalSub}>
              This will immediately reduce the hub stock count for the selected species.
            </div>

            {modalError && <div style={s.formError}>{modalError}</div>}

            <label style={s.label}>
              Species
              <select
                value={modalSpecies}
                onChange={e => setModalSpecies(e.target.value)}
                style={s.input}
                disabled={modalBusy}>
                {species.map(sp => (
                  <option key={sp.speciesId} value={sp.speciesId}>
                    {sp.name} (on hand: {sp.qtyOnHandHub})
                  </option>
                ))}
              </select>
            </label>

            {selectedSpecies && (
              <div style={s.stockHint}>
                Current hub stock: <strong>{selectedSpecies.qtyOnHandHub}</strong> on hand
                {selectedSpecies.qtyBookedOutForDelivery > 0 && (
                  <span style={{ color: "#2563eb" }}> ({selectedSpecies.qtyBookedOutForDelivery} booked out)</span>
                )}
              </div>
            )}

            <label style={s.label}>
              Number Dead
              <NumericInput
                value={modalQty}
                onChange={setModalQty}
                min={1}
                max={selectedSpecies?.qtyOnHandHub ?? 99999}
                style={s.input}
                disabled={modalBusy}
              />
            </label>

            {selectedSpecies && modalQty > 0 && (
              <div style={{
                ...s.stockHint,
                color: selectedSpecies.qtyOnHandHub - modalQty < 0 ? "#dc2626" : "#15803d",
                fontWeight: 700,
              }}>
                Hub stock after: {(selectedSpecies.qtyOnHandHub - modalQty).toLocaleString()}
              </div>
            )}

            <label style={s.label}>
              Notes (optional)
              <input
                type="text"
                value={modalNotes}
                onChange={e => setModalNotes(e.target.value)}
                placeholder="e.g. Found dead in shed overnight"
                style={s.input}
                disabled={modalBusy}
              />
            </label>

            <div style={s.modalBtns}>
              <button
                style={s.secondaryBtn}
                onClick={() => setShowModal(false)}
                disabled={modalBusy}>
                Cancel
              </button>
              <button
                style={{ ...s.primaryBtn, background: "#dc2626" }}
                onClick={submitLoss}
                disabled={modalBusy}>
                {modalBusy ? "Recording…" : "💀 Record Loss"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:        { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  headerRow:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  pageTitle:   { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub:     { fontSize: 13, color: "#64748b", marginTop: 2 },
  recordBtn:   { padding: "10px 20px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  flash:       { background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.4)", color: "#15803d", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14, fontWeight: 600 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },

  // Stock snapshot
  snapshotGrid: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 },
  snapshotCard: { background: "#fff", borderRadius: 10, padding: "12px 16px", border: "1px solid #e2e8f0", minWidth: 120, textAlign: "center" as const },
  snapshotName: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 },
  snapshotQty:  { fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 },
  snapshotLabel:{ fontSize: 11, color: "#94a3b8", marginTop: 2 },
  snapshotBooked:{ fontSize: 11, color: "#2563eb", marginTop: 1 },

  filterRow:    { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  filterSelect: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff", minWidth: 180 },

  loading:      { textAlign: "center", padding: 40, color: "#64748b" },
  empty:        { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },

  tableWrap:    { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" },
  table:        { width: "100%", borderCollapse: "collapse" as const },
  thead:        { background: "#f8fafc" },
  th:           { padding: "10px 14px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0" },
  tr:           { borderBottom: "1px solid #f1f5f9" },
  td:           { padding: "12px 14px", fontSize: 14, color: "#0f172a" },
  qtyBadge:     { background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#dc2626", borderRadius: 8, padding: "2px 8px", fontWeight: 700, fontSize: 13 },

  // Modal
  backdrop:     { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal:        { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, boxSizing: "border-box", marginTop: 60 },
  modalTitle:   { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  modalSub:     { fontSize: 13, color: "#64748b", marginBottom: 16 },
  formError:    { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  label:        { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 },
  input:        { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const, background: "#f9fafb", color: "#111827", outline: "none" },
  stockHint:    { fontSize: 13, color: "#374151", background: "#f8fafc", borderRadius: 6, padding: "6px 10px", marginBottom: 12, border: "1px solid #e2e8f0" },
  modalBtns:    { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 },
  primaryBtn:   { padding: "10px 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
};
