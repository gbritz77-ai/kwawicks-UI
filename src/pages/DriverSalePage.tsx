import React, { useEffect, useState } from "react";
import { driverAllocationsApi } from "../api/driverAllocationsApi";
import type { DriverStockAllocationDto, DriverStockAllocationLineDto, DriverSaleRecordDto } from "../api/driverAllocationsApi";
import { getProfileFromIdToken } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

function getUsername(): string | undefined {
  return getProfileFromIdToken()?.username;
}

function fmt(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PaymentType = "Cash" | "EFT";

export default function DriverSalePage() {
  const [allocation, setAllocation] = useState<DriverStockAllocationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sale form
  const [saleSpeciesId, setSaleSpeciesId] = useState("");
  const [saleQty, setSaleQty] = useState<string>("");
  const [saleUnitPrice, setSaleUnitPrice] = useState<string>("");
  const [salePaymentType, setSalePaymentType] = useState<PaymentType>("Cash");
  const [saleCustomerName, setSaleCustomerName] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);

  // Complete
  const [showComplete, setShowComplete] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const driverId = getUsername();
      const allocs = await driverAllocationsApi.list({ driverId, status: "Active" });
      setAllocation(allocs.length > 0 ? allocs[0] : null);
    } catch {
      setError("Failed to load your allocation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // When species selection changes, pre-fill unit price from allocation line
  function handleSpeciesChange(speciesId: string) {
    setSaleSpeciesId(speciesId);
    setSaleError("");
    if (speciesId && allocation) {
      const line = allocation.lines.find(l => l.speciesId === speciesId);
      if (line) setSaleUnitPrice(String(line.unitPrice));
    } else {
      setSaleUnitPrice("");
    }
    setSaleQty("");
  }

  const selectedLine: DriverStockAllocationLineDto | null =
    allocation?.lines.find(l => l.speciesId === saleSpeciesId) ?? null;

  const qtyNum = parseInt(saleQty) || 0;
  const priceNum = parseFloat(saleUnitPrice) || 0;
  const saleTotal = qtyNum * priceNum;

  const availableLines = allocation?.lines.filter(l => l.remainingQty > 0) ?? [];

  async function handleRecordSale() {
    setSaleError("");
    setSaleSuccess(null);
    if (!allocation) return;
    if (!saleSpeciesId) { setSaleError("Select a species."); return; }
    if (qtyNum <= 0) { setSaleError("Enter a valid quantity."); return; }
    if (selectedLine && qtyNum > selectedLine.remainingQty) {
      setSaleError(`Cannot exceed remaining qty (${selectedLine.remainingQty}).`);
      return;
    }
    if (priceNum <= 0) { setSaleError("Enter a valid unit price."); return; }

    setSaleBusy(true);
    try {
      const updated = await driverAllocationsApi.recordSale(allocation.allocationId, {
        speciesId: saleSpeciesId,
        qty: qtyNum,
        unitPrice: priceNum,
        paymentType: salePaymentType,
        customerName: saleCustomerName,
      });
      setAllocation(updated);
      setSaleSuccess(`Sale of ${qtyNum} recorded — ${fmt(saleTotal)} via ${salePaymentType}.`);
      setSaleSpeciesId("");
      setSaleQty("");
      setSaleUnitPrice("");
      setSalePaymentType("Cash");
      setSaleCustomerName("");
    } catch (e: any) {
      setSaleError(e?.message ?? "Failed to record sale.");
    } finally {
      setSaleBusy(false);
    }
  }

  async function handleComplete() {
    if (!allocation) return;
    setCompleteError("");
    setCompleteBusy(true);
    try {
      const updated = await driverAllocationsApi.complete(allocation.allocationId);
      setAllocation(updated);
      setShowComplete(false);
    } catch (e: any) {
      setCompleteError(e?.message ?? "Failed to complete allocation.");
    } finally {
      setCompleteBusy(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 32, color: "#94a3b8", textAlign: "center" as const }}>Loading your allocation...</div>;
  }

  if (error) {
    return (
      <div style={s.page}>
        <div style={s.errorBanner}>{error}</div>
        <button style={s.btnPrimary} onClick={load}>Retry</button>
      </div>
    );
  }

  // Completed state — show read-only summary
  if (allocation && allocation.status !== "Active") {
    const totalSold = allocation.sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    return (
      <div style={s.page}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Driver Allocation</div>
            <div style={s.pageSub}>
              {allocation.status === "Completed" ? "Allocation completed" : "Allocation cancelled"}
            </div>
          </div>
        </div>
        <div style={s.infoBanner}>
          This allocation has been {allocation.status.toLowerCase()}. Total sold: <strong>{fmt(totalSold)}</strong>.
        </div>
        <SalesHistorySection sales={allocation.sales} />
      </div>
    );
  }

  // No active allocation
  if (!allocation) {
    return (
      <div style={s.page}>
        <div style={s.pageHeader}>
          <div style={s.pageTitle}>Driver Sales</div>
        </div>
        <div style={s.emptyCard}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 6 }}>No stock allocated to you yet</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>Contact your admin to have stock allocated before your run.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>Driver Sales</div>
          <div style={s.pageSub}>
            Allocated {new Date(allocation.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
            {allocation.notes ? ` · ${allocation.notes}` : ""}
          </div>
        </div>
        <button style={s.btnComplete} onClick={() => { setShowComplete(true); setCompleteError(""); }}>
          Complete & Return
        </button>
      </div>

      {/* Available stock table */}
      <div style={s.card}>
        <div style={s.cardTitle}>Available Stock</div>
        {availableLines.length === 0 ? (
          <div style={s.emptyState}>All stock sold. Tap "Complete & Return" to finish.</div>
        ) : (
          <div style={{ overflowX: "auto" as const }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Species", "Allocated", "Sold", "Remaining", "Unit Price"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availableLines.map(line => (
                  <tr key={line.speciesId} style={saleSpeciesId === line.speciesId ? s.trHighlight : undefined}>
                    <td style={s.td}>{line.speciesName}</td>
                    <td style={s.td}>{line.allocatedQty}</td>
                    <td style={s.td}>{line.soldQty}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#166534" }}>{line.remainingQty}</td>
                    <td style={s.td}>{fmt(line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sale form */}
      {availableLines.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>Record a Sale</div>

          {saleSuccess && (
            <div style={s.successBanner}>{saleSuccess}</div>
          )}

          <label style={s.label}>Species *</label>
          <select
            style={s.select}
            value={saleSpeciesId}
            onChange={e => handleSpeciesChange(e.target.value)}
            disabled={saleBusy}
          >
            <option value="">— Select species —</option>
            {availableLines.map(line => (
              <option key={line.speciesId} value={line.speciesId}>
                {line.speciesName} ({line.remainingQty} remaining)
              </option>
            ))}
          </select>

          <div style={s.formRow}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Qty *</label>
              <NumericInput
                style={s.input}
                min={1}
                max={selectedLine?.remainingQty ?? undefined}
                allowDecimal={false}
                label="Quantity"
                value={saleQty}
                onChange={e => setSaleQty(e.target.value)}
                disabled={saleBusy || !saleSpeciesId}
              />
              {selectedLine && (
                <div style={s.fieldHint}>Max: {selectedLine.remainingQty}</div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Unit Price (R) *</label>
              <NumericInput
                style={s.input}
                min={0}
                step={0.01}
                label="Unit Price"
                value={saleUnitPrice}
                onChange={e => setSaleUnitPrice(e.target.value)}
                disabled={saleBusy || !saleSpeciesId}
              />
            </div>
          </div>

          <label style={{ ...s.label, marginTop: 12 }}>Payment Type *</label>
          <div style={s.paymentRow}>
            {(["Cash", "EFT"] as PaymentType[]).map(pt => (
              <button
                key={pt}
                style={salePaymentType === pt ? { ...s.paymentBtn, ...s.paymentBtnActive } : s.paymentBtn}
                onClick={() => setSalePaymentType(pt)}
                disabled={saleBusy}
                type="button"
              >
                {pt}
              </button>
            ))}
          </div>

          <label style={{ ...s.label, marginTop: 12 }}>Customer Name (optional)</label>
          <input
            style={s.input}
            placeholder="Walk-in customer name"
            value={saleCustomerName}
            onChange={e => setSaleCustomerName(e.target.value)}
            disabled={saleBusy}
          />

          {qtyNum > 0 && priceNum > 0 && (
            <div style={s.saleTotalRow}>
              <span>Total: </span>
              <span style={{ fontWeight: 800, fontSize: 18, color: "#166534" }}>{fmt(saleTotal)}</span>
            </div>
          )}

          {saleError && <div style={s.errorText}>{saleError}</div>}

          <button
            style={{ ...s.btnPrimary, width: "100%", marginTop: 14, padding: "14px", fontSize: 15 }}
            onClick={handleRecordSale}
            disabled={saleBusy || !saleSpeciesId || qtyNum <= 0 || priceNum <= 0}
          >
            {saleBusy ? "Recording..." : "Record Sale"}
          </button>
        </div>
      )}

      {/* Sales history */}
      {allocation.sales.length > 0 && (
        <SalesHistorySection sales={allocation.sales} />
      )}

      {/* Complete confirmation modal */}
      {showComplete && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Complete & Return?</div>
            <div style={s.modalBody}>
              Mark your allocation as complete. Any remaining stock will be recorded as returned to the hub.
            </div>
            {completeError && <div style={s.errorText}>{completeError}</div>}
            <div style={s.modalActions}>
              <button
                style={s.btnSecondary}
                onClick={() => { setShowComplete(false); setCompleteError(""); }}
                disabled={completeBusy}
              >
                Not Yet
              </button>
              <button
                style={s.btnPrimary}
                onClick={handleComplete}
                disabled={completeBusy}
              >
                {completeBusy ? "Processing..." : "Yes, Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SalesHistorySection({ sales }: { sales: DriverSaleRecordDto[] }) {
  if (sales.length === 0) return null;

  function fmt(n: number) {
    return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const sorted = [...sales].sort(
    (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
  );

  const today = new Date().toDateString();
  const todaySales = sorted.filter(s => new Date(s.soldAt).toDateString() === today);
  const todayTotal = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const grandTotal = sorted.reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div style={sh.card}>
      <div style={sh.cardTitle}>
        Sales History
        <span style={sh.totalChip}>{sorted.length} sales · {fmt(grandTotal)}</span>
      </div>
      {todaySales.length > 0 && todaySales.length < sorted.length && (
        <div style={sh.todayRow}>
          Today: {todaySales.length} sales · {fmt(todayTotal)}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {sorted.map(sale => (
          <div key={sale.saleId} style={sh.saleRow}>
            <div style={sh.saleLeft}>
              <div style={sh.saleSpecies}>{sale.speciesName}</div>
              <div style={sh.saleMeta}>
                {sale.qty} unit{sale.qty !== 1 ? "s" : ""} · {sale.paymentType}
                {sale.customerName ? ` · ${sale.customerName}` : ""}
              </div>
            </div>
            <div style={sh.saleRight}>
              <div style={sh.saleAmount}>{fmt(sale.totalAmount)}</div>
              <div style={sh.saleTime}>
                {new Date(sale.soldAt).toDateString() === new Date().toDateString()
                  ? new Date(sale.soldAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
                  : new Date(sale.soldAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                }
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 600, margin: "0 auto", padding: "20px 14px", fontFamily: "system-ui, -apple-system, sans-serif" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10 },
  pageTitle: { fontSize: 20, fontWeight: 800, color: "#1e293b" },
  pageSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, fontSize: 11, fontWeight: 600, color: "#64748b", borderBottom: "2px solid #e2e8f0", padding: "6px 8px", textTransform: "uppercase" as const },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" as const, color: "#374151" },
  trHighlight: { background: "#f0fdf4" },
  emptyState: { textAlign: "center" as const, color: "#94a3b8", fontSize: 13, padding: "20px 0" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, boxSizing: "border-box" as const },
  select: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, background: "#fff", marginBottom: 12 },
  formRow: { display: "flex", gap: 12, marginTop: 12 },
  fieldHint: { fontSize: 11, color: "#64748b", marginTop: 3 },
  paymentRow: { display: "flex", gap: 10, marginBottom: 4 },
  paymentBtn: { flex: 1, padding: "12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer", fontSize: 15, fontWeight: 600 },
  paymentBtnActive: { background: "#166534", color: "#fff", borderColor: "#166534" },
  saleTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginTop: 14, fontSize: 14, color: "#374151" },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#374151", borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" },
  btnComplete: { background: "rgba(37,99,235,0.08)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  infoBanner: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#166534", marginBottom: 16 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  errorText: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  successBanner: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 },
  emptyCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "48px 24px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 12, padding: "24px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", maxWidth: 420, width: "100%" },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "#1e293b", marginBottom: 10 },
  modalBody: { fontSize: 14, color: "#374151", marginBottom: 16 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
};

const sh: Record<string, React.CSSProperties> = {
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" },
  totalChip: { fontSize: 12, fontWeight: 600, color: "#166534", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "2px 10px" },
  todayRow: { fontSize: 12, color: "#64748b", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" },
  saleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" },
  saleLeft: { display: "flex", flexDirection: "column" as const, gap: 3 },
  saleSpecies: { fontSize: 14, fontWeight: 600, color: "#1e293b" },
  saleMeta: { fontSize: 12, color: "#64748b" },
  saleRight: { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3 },
  saleAmount: { fontSize: 14, fontWeight: 700, color: "#166534" },
  saleTime: { fontSize: 11, color: "#94a3b8" },
};
