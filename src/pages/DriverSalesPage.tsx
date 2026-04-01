import React, { useEffect, useRef, useState } from "react";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { driverSalesApi } from "../api/driverSalesApi";
import { clientCreditApi } from "../api/clientCreditApi";
import { invoicesApi } from "../api/invoicesApi";

const VAT_RATE = 0.15;
type CustomerMode = "existing" | "walkin";
const PAYMENT_TYPES = ["Cash", "EFT", "Card"] as const;

type SaleLine = {
  speciesId: string;
  speciesName: string;
  quantity: number;
  unitPrice: number; // incl. VAT (display)
  vatRate: number;
};

function fmt(n: number) {
  return `R\u00A0${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DriverSalesPage() {
  const [clients, setClients]   = useState<ClientDto[]>([]);
  const [species, setSpecies]   = useState<SpeciesResponse[]>([]);
  const [loading, setLoading]   = useState(true);

  // Customer
  const [mode, setMode]                   = useState<CustomerMode>("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch]   = useState("");

  // Credit
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // Add-item row
  const [addSpeciesId, setAddSpeciesId]   = useState("");
  const [addQty, setAddQty]               = useState(1);
  const [addPrice, setAddPrice]           = useState("");

  // Lines
  const [lines, setLines] = useState<SaleLine[]>([]);

  // Payment
  const [paymentType, setPaymentType]     = useState("Cash");

  // Submission
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  // Success + receipt upload
  type SuccessState = {
    invoiceId: string;
    whatsAppSent: boolean;
    creditCharged?: boolean;
    newCreditBalance?: number;
    needsReceipt: boolean;  // EFT or Card
  };
  const [success, setSuccess]             = useState<SuccessState | null>(null);
  const [receiptFile, setReceiptFile]     = useState<File | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [uploadDone, setUploadDone]       = useState(false);
  const [uploadError, setUploadError]     = useState("");
  const receiptInputRef                   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([clientsApi.list(200), speciesApi.list()])
      .then(([c, sp]) => {
        setClients(c);
        setSpecies(sp.filter((x: SpeciesResponse) => x.isActive));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch credit balance on client selection
  useEffect(() => {
    if (mode === "existing" && selectedClientId) {
      setCreditBalance(null);
      setCreditLoading(true);
      clientCreditApi.getBalance(selectedClientId)
        .then(r => setCreditBalance(r.balance))
        .catch(() => setCreditBalance(null))
        .finally(() => setCreditLoading(false));
    } else {
      setCreditBalance(null);
    }
    if (paymentType === "AccountCredit") setPaymentType("Cash");
  }, [selectedClientId, mode]);

  const grandTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const subTotal   = lines.reduce((s, l) => s + (l.quantity * l.unitPrice) / (1 + l.vatRate), 0);
  const vatTotal   = grandTotal - subTotal;

  function addLine() {
    const sp = species.find(s => s.speciesId === addSpeciesId);
    const parsedPrice = Number(addPrice);
    if (!sp || addQty <= 0 || !addPrice || parsedPrice <= 0) return;
    if (lines.find(l => l.speciesId === addSpeciesId)) {
      setLines(ls => ls.map(l => l.speciesId === addSpeciesId
        ? { ...l, quantity: l.quantity + addQty, unitPrice: parsedPrice }
        : l));
    } else {
      setLines(ls => [...ls, {
        speciesId: addSpeciesId,
        speciesName: sp.name,
        quantity: addQty,
        unitPrice: parsedPrice,
        vatRate: VAT_RATE,
      }]);
    }
    setAddSpeciesId("");
    setAddQty(1);
    setAddPrice("");
  }

  function removeLine(speciesId: string) {
    setLines(ls => ls.filter(l => l.speciesId !== speciesId));
  }

  function updateLine(speciesId: string, field: "quantity" | "unitPrice", value: number) {
    setLines(ls => ls.map(l => l.speciesId === speciesId ? { ...l, [field]: value } : l));
  }

  function reset() {
    setMode("existing");
    setSelectedClientId("");
    setClientSearch("");
    setLines([]);
    setPaymentType("Cash");
    setCreditBalance(null);
    setError("");
    setSuccess(null);
    setReceiptFile(null);
    setUploadDone(false);
    setUploadError("");
    setAddSpeciesId("");
    setAddQty(1);
    setAddPrice("");
  }

  async function handleSubmit() {
    setError("");
    if (lines.length === 0) { setError("Add at least one item."); return; }
    const zeroPrice = lines.find(l => l.unitPrice <= 0);
    if (zeroPrice) { setError(`Price for "${zeroPrice.speciesName}" cannot be R 0.`); return; }
    if (mode === "existing" && !selectedClientId) { setError("Select a customer."); return; }

    setBusy(true);
    try {
      const result = await driverSalesApi.create({
        customerId: mode === "existing" ? selectedClientId : undefined,
        newClient: mode === "walkin" ? { clientName: "Walk-in", clientType: 0, isWalkIn: true } : undefined,
        hubId: "main",
        paymentType,
        lines: lines.map(l => ({
          speciesId: l.speciesId,
          quantity: l.quantity,
          unitPrice: l.unitPrice / (1 + l.vatRate), // back-calc to ex-VAT
          vatRate: l.vatRate,
        })),
      });
      setSuccess({
        invoiceId: result.invoiceId,
        whatsAppSent: result.whatsAppSent,
        creditCharged: result.creditCharged,
        newCreditBalance: result.newCreditBalance,
        needsReceipt: paymentType === "EFT" || paymentType === "Card",
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to create sale.");
    } finally { setBusy(false); }
  }

  async function uploadReceipt() {
    if (!success || !receiptFile) return;
    setUploading(true);
    setUploadError("");
    try {
      const { presignedUrl } = await invoicesApi.getReceiptUploadUrl(success.invoiceId);
      await fetch(presignedUrl, {
        method: "PUT",
        body: receiptFile,
        headers: { "Content-Type": receiptFile.type || "application/octet-stream" },
      });
      setUploadDone(true);
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed. Please try again.");
    } finally { setUploading(false); }
  }

  const filteredClients = clients.filter(c =>
    !clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase())
  );
  const selectedSpeciesItem = species.find(s => s.speciesId === addSpeciesId);

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={s.page}>
        <div style={s.successBox}>
          {uploadDone || !success.needsReceipt ? (
            <>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <div style={s.successTitle}>Sale Complete</div>
              <div style={s.successSub}>Invoice created successfully.</div>
              {success.whatsAppSent
                ? <div style={s.successNote}>📱 Invoice sent via WhatsApp</div>
                : <div style={{ ...s.successNote, color: "#64748b" }}>No WhatsApp sent (no phone on file)</div>}
              {success.creditCharged && success.newCreditBalance !== undefined && (
                <div style={{ ...s.successNote, color: "#1d4ed8" }}>
                  💳 Credit charged — new balance: {fmt(success.newCreditBalance)}
                </div>
              )}
              <button style={{ ...s.btnPrimary, marginTop: 28, width: "100%" }} onClick={reset}>
                New Sale
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
              <div style={s.successTitle}>Upload Proof of Payment</div>
              <div style={s.successSub}>
                {paymentType === "EFT" ? "Attach the EFT / bank transfer proof." : "Attach the card receipt or slip."}
              </div>

              {uploadError && <div style={s.errorText}>{uploadError}</div>}

              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
              />

              {receiptFile ? (
                <div style={s.fileChosen}>
                  <span>📎 {receiptFile.name}</span>
                  <button style={s.removeFile} onClick={() => setReceiptFile(null)}>✕</button>
                </div>
              ) : (
                <button style={s.attachBtn} onClick={() => receiptInputRef.current?.click()}>
                  📷 Attach Photo or PDF
                </button>
              )}

              <button
                style={{ ...s.btnPrimary, marginTop: 16, width: "100%", opacity: receiptFile && !uploading ? 1 : 0.5 }}
                disabled={!receiptFile || uploading}
                onClick={uploadReceipt}
              >
                {uploading ? "Uploading…" : "Upload & Finish"}
              </button>
              <button style={{ ...s.btnSecondary, marginTop: 10, width: "100%" }} onClick={() => setUploadDone(true)}>
                Skip (upload later)
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>🛒 Driver Sale</div>
        <div style={s.pageSub}>Record a direct sale to a client or walk-in</div>
      </div>

      {/* Customer */}
      <div style={s.card}>
        <div style={s.cardTitle}>Customer</div>
        <div style={s.modeRow}>
          {(["existing", "walkin"] as CustomerMode[]).map(m => (
            <button
              key={m}
              style={mode === m ? { ...s.modeBtn, ...s.modeBtnActive } : s.modeBtn}
              onClick={() => { setMode(m); setError(""); }}
            >
              {m === "existing" ? "Existing Client" : "Walk-in"}
            </button>
          ))}
        </div>

        {mode === "existing" && (
          <>
            <input
              style={s.input}
              placeholder="Search client..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
            />
            <select
              style={s.select}
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
            >
              <option value="">— Select client —</option>
              {filteredClients.map(c => (
                <option key={c.clientId} value={c.clientId}>
                  {c.clientName}{c.isWalkIn ? " (walk-in)" : ""}
                </option>
              ))}
            </select>
            {selectedClientId && (
              <div style={s.creditBadge}>
                {creditLoading
                  ? <span style={{ color: "#64748b" }}>Loading credit balance…</span>
                  : creditBalance !== null
                    ? <>💳 Credit balance:{" "}
                        <strong style={{ color: creditBalance >= 0 ? "#166534" : "#dc2626" }}>
                          {fmt(creditBalance)}
                        </strong></>
                    : <span style={{ color: "#94a3b8" }}>Credit balance unavailable</span>}
              </div>
            )}
          </>
        )}
        {mode === "walkin" && (
          <div style={s.infoBanner}>🛒 Walk-in — no customer details required.</div>
        )}
      </div>

      {/* Add item */}
      <div style={s.card}>
        <div style={s.cardTitle}>Add Item</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={s.label}>Species</label>
            <select
              style={s.select}
              value={addSpeciesId}
              onChange={e => {
                const sp = species.find(x => x.speciesId === e.target.value);
                setAddSpeciesId(e.target.value);
                if (sp) setAddPrice(sp.sellPrice != null ? String(sp.sellPrice) : "");
              }}
            >
              <option value="">— Select —</option>
              {species.map(sp => (
                <option key={sp.speciesId} value={sp.speciesId}>
                  {sp.name}{sp.qtyAvailable > 0 ? ` — ${sp.qtyAvailable} available` : " — Out of stock"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label}>Qty</label>
            <input
              style={s.input} type="number" min={1} value={addQty}
              onChange={e => setAddQty(Number(e.target.value))}
              onFocus={e => e.target.select()}
            />
          </div>
          <div>
            <label style={s.label}>Unit Price (incl. VAT)</label>
            <input
              style={s.input} type="number" min={0} step={0.01}
              placeholder="0.00" value={addPrice}
              onChange={e => setAddPrice(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </div>
        </div>

        {selectedSpeciesItem && (
          <div style={s.stockRow}>
            <span style={{
              ...s.stockBadge,
              background: selectedSpeciesItem.qtyAvailable > 0 ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${selectedSpeciesItem.qtyAvailable > 0 ? "#bbf7d0" : "#fca5a5"}`,
              color: selectedSpeciesItem.qtyAvailable > 0 ? "#166534" : "#dc2626",
            }}>
              {selectedSpeciesItem.qtyAvailable > 0
                ? `✓ ${selectedSpeciesItem.qtyAvailable} available`
                : "✗ Out of stock"}
            </span>
            <span style={{ ...s.stockBadge, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}>
              {selectedSpeciesItem.qtyOnHandHub} on hand
            </span>
          </div>
        )}
        {selectedSpeciesItem && addQty > selectedSpeciesItem.qtyAvailable && selectedSpeciesItem.qtyAvailable >= 0 && (
          <div style={s.stockWarning}>
            ⚠️ Qty ({addQty}) exceeds available stock ({selectedSpeciesItem.qtyAvailable})
          </div>
        )}

        <button
          style={{ ...s.btnPrimary, width: "100%", marginTop: 12 }}
          onClick={addLine}
          disabled={!addSpeciesId || addQty <= 0 || !addPrice || Number(addPrice) <= 0}
        >
          + Add to Sale
        </button>
      </div>

      {/* Lines */}
      {lines.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>Sale Lines</div>
          {lines.map(l => (
            <div key={l.speciesId} style={s.lineRow}>
              <div style={s.lineName}>{l.speciesName}</div>
              <div style={s.lineInputs}>
                <div>
                  <label style={s.label}>Qty</label>
                  <input
                    style={{ ...s.input, width: 70 }} type="number" min={1} value={l.quantity}
                    onChange={e => updateLine(l.speciesId, "quantity", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                  />
                </div>
                <div>
                  <label style={s.label}>Price (incl. VAT)</label>
                  <input
                    style={{ ...s.input, width: 100 }} type="number" min={0} step={0.01} value={l.unitPrice}
                    onChange={e => updateLine(l.speciesId, "unitPrice", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                  />
                </div>
                <div style={s.lineTotal}>{fmt(l.quantity * l.unitPrice)}</div>
                <button style={s.removeBtn} onClick={() => removeLine(l.speciesId)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment + totals */}
      <div style={s.card}>
        <div style={s.cardTitle}>Payment</div>
        <div style={s.modeRow}>
          {PAYMENT_TYPES.map(pt => (
            <button
              key={pt}
              style={paymentType === pt ? { ...s.modeBtn, ...s.modeBtnActive } : s.modeBtn}
              onClick={() => setPaymentType(pt)}
            >{pt}</button>
          ))}
          {mode === "existing" && selectedClientId && (
            <button
              style={paymentType === "AccountCredit" ? { ...s.modeBtn, ...s.modeBtnActive } : s.modeBtn}
              onClick={() => setPaymentType("AccountCredit")}
            >💳 Client Credit</button>
          )}
        </div>

        {paymentType === "AccountCredit" && (
          creditLoading
            ? <div style={s.creditInfo}>Loading balance…</div>
            : creditBalance === null
              ? <div style={s.creditInfo}>Could not load balance.</div>
              : grandTotal > creditBalance
                ? <div style={s.creditWarn}>⚠️ Balance ({fmt(creditBalance)}) less than total ({fmt(grandTotal)}). Account will go negative.</div>
                : <div style={s.creditOk}>✓ Balance: {fmt(creditBalance)} — {fmt(creditBalance - grandTotal)} remaining after this sale.</div>
        )}

        {(paymentType === "EFT" || paymentType === "Card") && (
          <div style={{ ...s.infoBanner, marginTop: 8 }}>
            📎 You'll be asked to upload proof of payment after the sale is recorded.
          </div>
        )}

        {lines.length > 0 && (
          <div style={s.summaryBox}>
            <div style={s.summaryRow}><span>Subtotal</span><span>{fmt(subTotal)}</span></div>
            <div style={s.summaryRow}><span>VAT (15%)</span><span>{fmt(vatTotal)}</span></div>
            <div style={{ ...s.summaryRow, ...s.summaryTotal }}><span>Total</span><span>{fmt(grandTotal)}</span></div>
          </div>
        )}

        {error && <div style={s.errorText}>{error}</div>}

        <button
          style={{ ...s.btnPrimary, width: "100%", marginTop: 16, padding: 14, fontSize: 16 }}
          onClick={handleSubmit}
          disabled={busy || lines.length === 0}
        >
          {busy ? "Processing…" : "Complete Sale"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:          { maxWidth: 600, margin: "0 auto", padding: "20px 14px", fontFamily: "system-ui, -apple-system, sans-serif" },
  pageHeader:    { marginBottom: 20 },
  pageTitle:     { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  pageSub:       { fontSize: 13, color: "#64748b", marginTop: 2 },
  card:          { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  cardTitle:     { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 },
  modeRow:       { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 },
  modeBtn:       { padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer", fontSize: 13 },
  modeBtnActive: { background: "#166534", color: "#fff", borderColor: "#166534", fontWeight: 600 },
  label:         { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 },
  input:         { width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" },
  select:        { width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, background: "#fff", boxSizing: "border-box", marginTop: 4 },
  infoBanner:    { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#166534", marginTop: 8 },
  creditBadge:   { marginTop: 8, padding: "7px 10px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, fontSize: 13, color: "#0369a1" },
  creditInfo:    { fontSize: 12, color: "#64748b", marginTop: 6, padding: "7px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" },
  creditWarn:    { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#92400e", marginTop: 6 },
  creditOk:      { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#166534", marginTop: 6 },
  stockRow:      { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 },
  stockBadge:    { fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20 },
  stockWarning:  { fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "5px 10px", marginTop: 6 },
  lineRow:       { background: "#f8fafc", borderRadius: 8, padding: 10, marginBottom: 8, border: "1px solid #e2e8f0" },
  lineName:      { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  lineInputs:    { display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" },
  lineTotal:     { fontSize: 15, fontWeight: 700, color: "#166534", alignSelf: "flex-end", paddingBottom: 6 },
  removeBtn:     { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "4px 6px", alignSelf: "flex-end" },
  summaryBox:    { background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginTop: 14, display: "flex", flexDirection: "column", gap: 6 },
  summaryRow:    { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#374151" },
  summaryTotal:  { fontSize: 17, fontWeight: 800, color: "#166534", borderTop: "1px solid #e2e8f0", paddingTop: 6, marginTop: 2 },
  btnPrimary:    { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary:  { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  errorText:     { color: "#dc2626", fontSize: 13, marginTop: 8 },
  successBox:    { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "36px 24px", maxWidth: 420, margin: "40px auto", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", textAlign: "center" },
  successTitle:  { fontSize: 20, fontWeight: 800, color: "#166534", marginBottom: 6 },
  successSub:    { fontSize: 14, color: "#374151", marginBottom: 12 },
  successNote:   { fontSize: 13, color: "#15803d", marginTop: 8 },
  attachBtn:     { display: "block", width: "100%", padding: 14, background: "#f0f9ff", border: "2px dashed #7dd3fc", borderRadius: 8, color: "#0369a1", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 16 },
  fileChosen:    { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#166534" },
  removeFile:    { background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700 },
};
