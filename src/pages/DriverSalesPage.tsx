import React, { useEffect, useRef, useState } from "react";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { driverSalesApi } from "../api/driverSalesApi";
import { clientCreditApi } from "../api/clientCreditApi";
import { otpApi } from "../api/otpApi";
import { hasAnyRole } from "../api/auth";
import { invoicesApi } from "../api/invoicesApi";
import { deliveryOrdersApi } from "../api/deliveryOrdersApi";
import type { DriverStockItem } from "../api/deliveryOrdersApi";
import { NumericInput } from "../components/NumericInput";


type CustomerMode = "existing" | "walkin";
const PAYMENT_TYPES = ["Cash", "EFT", "Card", "Split"] as const;
const SPLIT_METHODS = ["Cash", "Card", "EFT"] as const;

type SplitLine = { method: string; amount: string };

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
  const [clients, setClients]       = useState<ClientDto[]>([]);
  const [driverStock, setDriverStock] = useState<DriverStockItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [stockEmpty, setStockEmpty] = useState(false);

  // Customer
  const [mode, setMode]                   = useState<CustomerMode>("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch]   = useState("");

  // Credit
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // Add-item row
  const [addSpeciesId, setAddSpeciesId]   = useState("");
  const [addQty, setAddQty]               = useState("");
  const [addPrice, setAddPrice]           = useState("");

  // Lines
  const [lines, setLines] = useState<SaleLine[]>([]);

  // Payment
  const [paymentType, setPaymentType]     = useState("Cash");
  const [splitLines, setSplitLines]       = useState<SplitLine[]>([{ method: "Cash", amount: "" }, { method: "Card", amount: "" }]);

  // Submission
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Success + receipt upload
  type SuccessState = {
    invoiceId: string;
    awaitingOtp: boolean;
    otpSent: boolean;
    creditCharged?: boolean;
    newCreditBalance?: number;
    needsReceipt: boolean;  // EFT or Card
  };
  const [success, setSuccess]             = useState<SuccessState | null>(null);
  const [receiptFile, setReceiptFile]     = useState<File | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [uploadDone, setUploadDone]       = useState(false);
  const [uploadError, setUploadError]     = useState("");

  // OTP state
  const [otpCode, setOtpCode]         = useState("");
  const [otpBusy, setOtpBusy]         = useState(false);
  const [otpError, setOtpError]       = useState("");
  const [otpDone, setOtpDone]         = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [showBypass, setShowBypass]   = useState(false);
  const isAdmin = hasAnyRole("Owner", "Admin", "Finance");
  const receiptInputRef                   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([clientsApi.list(200), deliveryOrdersApi.getDriverStock()])
      .then(([c, stock]) => {
        setClients(c);
        setDriverStock(stock);
        setStockEmpty(stock.length === 0);
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
    const stockItem = driverStock.find(s => s.speciesId === addSpeciesId);
    const parsedQty = parseInt(addQty);
    const parsedPrice = Number(addPrice);
    if (!stockItem || !addQty || parsedQty <= 0 || !addPrice || parsedPrice <= 0) return;
    // Enforce qty cap: cannot exceed available stock
    const alreadyOnLine = lines.find(l => l.speciesId === addSpeciesId)?.quantity ?? 0;
    if (parsedQty + alreadyOnLine > stockItem.availableQty) return;
    if (lines.find(l => l.speciesId === addSpeciesId)) {
      setLines(ls => ls.map(l => l.speciesId === addSpeciesId
        ? { ...l, quantity: l.quantity + parsedQty, unitPrice: parsedPrice }
        : l));
    } else {
      setLines(ls => [...ls, {
        speciesId: addSpeciesId,
        speciesName: stockItem.speciesName,
        quantity: parsedQty,
        unitPrice: parsedPrice,
        vatRate: stockItem.vat,
      }]);
    }
    setAddSpeciesId("");
    setAddQty("");
    setAddPrice("");
  }

  function removeLine(speciesId: string) {
    setLines(ls => ls.filter(l => l.speciesId !== speciesId));
  }

  function updateLine(speciesId: string, field: "quantity" | "unitPrice", value: number) {
    if (field === "quantity") {
      const stockItem = driverStock.find(s => s.speciesId === speciesId);
      const cap = stockItem?.availableQty ?? Infinity;
      value = Math.min(value, cap);
    }
    setLines(ls => ls.map(l => l.speciesId === speciesId ? { ...l, [field]: value } : l));
  }

  function reset() {
    setMode("existing");
    setSelectedClientId("");
    setClientSearch("");
    setLines([]);
    setPaymentType("Cash");
    setSplitLines([{ method: "Cash", amount: "" }, { method: "Card", amount: "" }]);
    setCreditBalance(null);
    setError("");
    setSuccess(null);
    setShowPreview(false);
    setReceiptFile(null);
    setUploadDone(false);
    setUploadError("");
    setAddSpeciesId("");
    setAddQty("");
    setAddPrice("");
  }

  // Split payment helpers
  const splitAllocated = paymentType === "Split"
    ? splitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    : 0;
  const splitRemaining = grandTotal - splitAllocated;

  function validate(): string | null {
    if (lines.length === 0) return "Add at least one item.";
    const zeroPrice = lines.find(l => l.unitPrice <= 0);
    if (zeroPrice) return `Price for "${zeroPrice.speciesName}" cannot be R 0.`;
    if (mode === "existing" && !selectedClientId) return "Select a customer.";
    if (paymentType === "Split") {
      const validSplitLines = splitLines.filter(l => parseFloat(l.amount) > 0);
      if (validSplitLines.length === 0) return "Add at least one split payment amount.";
      if (Math.abs(splitAllocated - grandTotal) > 0.05)
        return `Split payments total ${fmt(splitAllocated)} must equal sale total ${fmt(grandTotal)}.`;
    }
    return null;
  }

  function reviewInvoice() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setShowPreview(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setError("");
    const err = validate();
    if (err) { setError(err); return; }

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
        splitPayments: paymentType === "Split"
          ? splitLines
              .filter(l => parseFloat(l.amount) > 0)
              .map(l => ({ method: l.method, amount: parseFloat(l.amount) }))
          : undefined,
      });
      setSuccess({
        invoiceId: result.invoiceId,
        awaitingOtp: result.awaitingOtp ?? false,
        otpSent: result.otpSent ?? false,
        creditCharged: result.creditCharged,
        newCreditBalance: result.newCreditBalance,
        needsReceipt: paymentType === "EFT" || paymentType === "Card"
          || (paymentType === "Split" && splitLines.some(l => parseFloat(l.amount) > 0 && (l.method === "EFT" || l.method === "Card"))),
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
    !c.isWalkIn && (!clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase()))
  );
  const selectedStockItem = driverStock.find(s => s.speciesId === addSpeciesId);
  const alreadyOnLineQty = lines.find(l => l.speciesId === addSpeciesId)?.quantity ?? 0;
  const remainingQty = selectedStockItem ? selectedStockItem.availableQty - alreadyOnLineQty : 0;

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;

  // ── Invoice preview screen ───────────────────────────────────────────────────
  if (showPreview) {
    const customerName = mode === "walkin"
      ? "Walk-in Customer"
      : clients.find(c => c.clientId === selectedClientId)?.clientName ?? "—";
    const today = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });

    return (
      <div style={s.page}>
        <div style={s.previewDoc}>
          {/* Header */}
          <div style={s.previewHeader}>
            <div>
              <div style={s.previewBrand}>KwaWicks</div>
              <div style={s.previewLabel}>INVOICE PREVIEW</div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={s.previewMeta}>Date: {today}</div>
              <div style={s.previewMeta}>Payment: {paymentType}</div>
            </div>
          </div>

          {/* Customer */}
          <div style={s.previewTo}>
            <div style={s.previewToLabel}>Bill To</div>
            <div style={s.previewToName}>{customerName}</div>
          </div>

          {/* Lines table */}
          <div style={s.previewTableWrap}>
            <div style={{ ...s.previewRow, ...s.previewRowHead }}>
              <div style={{ flex: 3 }}>Item</div>
              <div style={{ flex: 1, textAlign: "right" as const }}>Qty</div>
              <div style={{ flex: 2, textAlign: "right" as const }}>Unit (incl. VAT)</div>
              <div style={{ flex: 2, textAlign: "right" as const }}>Line Total</div>
            </div>
            {lines.map(l => (
              <div key={l.speciesId} style={s.previewRow}>
                <div style={{ flex: 3, fontWeight: 600 }}>{l.speciesName}</div>
                <div style={{ flex: 1, textAlign: "right" as const }}>{l.quantity}</div>
                <div style={{ flex: 2, textAlign: "right" as const }}>{fmt(l.unitPrice)}</div>
                <div style={{ flex: 2, textAlign: "right" as const, fontWeight: 700 }}>{fmt(l.quantity * l.unitPrice)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={s.previewTotals}>
            <div style={s.previewTotalRow}>
              <span>Subtotal (excl. VAT)</span>
              <span>{fmt(subTotal)}</span>
            </div>
            <div style={s.previewTotalRow}>
              <span>VAT (15%)</span>
              <span>{fmt(vatTotal)}</span>
            </div>
            <div style={{ ...s.previewTotalRow, ...s.previewGrand }}>
              <span>Total</span>
              <span>{fmt(grandTotal)}</span>
            </div>
          </div>

          {/* Actions */}
          {error && <div style={s.errorText}>{error}</div>}
          <div style={s.previewActions}>
            <button style={{ ...s.btnSecondary, flex: 1 }} onClick={() => setShowPreview(false)} disabled={busy}>
              ← Back to Edit
            </button>
            <button
              style={{ ...s.btnPrimary, flex: 2, padding: 14, fontSize: 15 }}
              onClick={handleSubmit}
              disabled={busy}
            >
              {busy ? "Processing…" : "✓ Confirm & Send"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    // OTP confirmation step
    if (success.awaitingOtp && !otpDone) {
      return (
        <div style={s.page}>
          <div style={s.successBox}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📲</div>
            <div style={{ ...s.successTitle, color: "#1e3a8a" }}>Awaiting Client Confirmation</div>
            <div style={{ ...s.successSub, marginBottom: 16 }}>
              OTP sent to client's WhatsApp.<br />Ask them for the code.
            </div>

            {!showBypass ? (
              <>
                <input
                  style={{ fontSize: 28, fontWeight: 800, letterSpacing: 12, textAlign: "center", padding: "10px 16px", border: "2px solid #2563eb", borderRadius: 10, width: 200 }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
                {otpError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{otpError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    style={{ ...s.btnPrimary, fontSize: 15, padding: "10px 24px" }}
                    disabled={otpBusy || otpCode.length < 6}
                    onClick={async () => {
                      setOtpBusy(true); setOtpError("");
                      try { await otpApi.verify(success.invoiceId, otpCode); setOtpDone(true); }
                      catch (e: any) { setOtpError(e?.message ?? "Incorrect code."); }
                      finally { setOtpBusy(false); }
                    }}
                  >{otpBusy ? "Verifying…" : "✓ Verify"}</button>
                  <button
                    style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 13 }}
                    disabled={otpBusy}
                    onClick={async () => {
                      setOtpBusy(true); setOtpError("");
                      try { await otpApi.resend(success.invoiceId); setOtpError("✓ New code sent!"); }
                      catch (e: any) { setOtpError(e?.message ?? "Resend failed."); }
                      finally { setOtpBusy(false); }
                    }}
                  >↺ Resend</button>
                  {isAdmin && (
                    <button
                      style={{ background: "#fef9c3", border: "1px solid #fde047", color: "#854d0e", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 12 }}
                      onClick={() => setShowBypass(true)}
                    >⚠ Bypass</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <input
                  style={{ fontSize: 14, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 7, width: "100%", maxWidth: 300, marginBottom: 10 }}
                  placeholder="Reason for bypass (required)"
                  value={bypassReason}
                  onChange={e => setBypassReason(e.target.value)}
                />
                {otpError && <div style={{ color: "#ef4444", fontSize: 13 }}>{otpError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
                  <button style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={() => setShowBypass(false)}>Cancel</button>
                  <button
                    style={{ background: "#dc2626", border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}
                    disabled={otpBusy || !bypassReason.trim()}
                    onClick={async () => {
                      setOtpBusy(true); setOtpError("");
                      try { await otpApi.bypass(success.invoiceId, bypassReason); setOtpDone(true); }
                      catch (e: any) { setOtpError(e?.message ?? "Bypass failed."); }
                      finally { setOtpBusy(false); }
                    }}
                  >{otpBusy ? "…" : "Confirm Bypass"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={s.page}>
        <div style={s.successBox}>
          {uploadDone || !success.needsReceipt ? (
            <>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <div style={s.successTitle}>Sale Complete</div>
              <div style={s.successSub}>Invoice created and client confirmed.</div>
              <div style={s.successNote}>📱 Invoice sent via WhatsApp</div>
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

        {stockEmpty ? (
          <div style={s.emptyStock}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>No leftover stock available</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              You can only sell stock that was returned (not wanted) from your deliveries.
              Complete a delivery with not-wanted returns to see available items here.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={s.label}>Species</label>
                <select
                  style={s.select}
                  value={addSpeciesId}
                  onChange={e => {
                    const item = driverStock.find(x => x.speciesId === e.target.value);
                    setAddSpeciesId(e.target.value);
                    if (item) setAddPrice(String(item.unitPrice));
                  }}
                >
                  <option value="">— Select —</option>
                  {driverStock.map(item => (
                    <option key={item.speciesId} value={item.speciesId}>
                      {item.speciesName} — {item.availableQty} available
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>Qty {selectedStockItem ? `(max ${remainingQty})` : ""}</label>
                <NumericInput
                  style={s.input}
                  allowDecimal={false}
                  min={1}
                  max={selectedStockItem ? remainingQty : undefined}
                  placeholder="1"
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>Unit Price (incl. VAT)</label>
                <NumericInput
                  style={s.input}  min={0} step={0.01}
                  placeholder="0.00" value={addPrice}
                  onChange={e => setAddPrice(e.target.value)}
                  onFocus={e => e.target.select()}
                />
              </div>
            </div>

            {selectedStockItem && (
              <div style={s.stockRow}>
                <span style={{
                  ...s.stockBadge,
                  background: remainingQty > 0 ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${remainingQty > 0 ? "#bbf7d0" : "#fca5a5"}`,
                  color: remainingQty > 0 ? "#166534" : "#dc2626",
                }}>
                  {remainingQty > 0 ? `✓ ${remainingQty} available to sell` : "✗ None remaining"}
                </span>
              </div>
            )}
            {selectedStockItem && addQty && parseInt(addQty) > remainingQty && (
              <div style={s.stockWarning}>
                ⚠️ Qty ({addQty}) exceeds your available stock ({remainingQty})
              </div>
            )}

            <button
              style={{ ...s.btnPrimary, width: "100%", marginTop: 12 }}
              onClick={addLine}
              disabled={
                !addSpeciesId || !addQty || parseInt(addQty) <= 0 || !addPrice || Number(addPrice) <= 0
                || parseInt(addQty) > remainingQty
              }
            >
              + Add to Sale
            </button>
          </>
        )}
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
                  <NumericInput
                    style={{ ...s.input, width: 70 }}  min={1} value={l.quantity}
                    onChange={e => updateLine(l.speciesId, "quantity", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                  />
                </div>
                <div>
                  <label style={s.label}>Price (incl. VAT)</label>
                  <NumericInput
                    style={{ ...s.input, width: 100 }}  min={0} step={0.01} value={l.unitPrice}
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

        {/* ── Split payment panel ── */}
        {paymentType === "Split" && (
          <div style={s.splitPanel}>
            <div style={s.splitPanelTitle}>Split Payment Breakdown</div>
            {splitLines.map((sl, i) => (
              <div key={i} style={s.splitRow}>
                <select
                  style={{ ...s.select, flex: 1, marginTop: 0 }}
                  value={sl.method}
                  onChange={e => setSplitLines(prev => prev.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                >
                  {SPLIT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <NumericInput
                  style={{ ...s.input, width: 110, textAlign: "right" }}
                  
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={sl.amount}
                  onChange={e => setSplitLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  onFocus={e => e.target.select()}
                />
                <button
                  style={s.removeBtn}
                  disabled={splitLines.length <= 1}
                  onClick={() => setSplitLines(prev => prev.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
            <button
              style={s.splitAddBtn}
              onClick={() => setSplitLines(prev => [...prev, { method: "Cash", amount: "" }])}
            >+ Add method</button>
            <div style={{
              ...s.splitTotal,
              color: Math.abs(splitRemaining) < 0.01 ? "#166534" : Math.abs(splitRemaining) > 0.05 ? "#dc2626" : "#92400e"
            }}>
              {Math.abs(splitRemaining) < 0.01
                ? `✓ Allocated: ${fmt(splitAllocated)}`
                : splitRemaining > 0
                  ? `Still to allocate: ${fmt(splitRemaining)}`
                  : `Over-allocated by: ${fmt(Math.abs(splitRemaining))}`
              }
            </div>
          </div>
        )}

        {(paymentType === "EFT" || paymentType === "Card"
          || (paymentType === "Split" && splitLines.some(l => parseFloat(l.amount) > 0 && (l.method === "EFT" || l.method === "Card")))
        ) && (
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
          onClick={reviewInvoice}
          disabled={lines.length === 0 || stockEmpty}
        >
          Review Invoice
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
  emptyStock:    { textAlign: "center" as const, padding: "24px 16px", color: "#64748b", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" },

  // Invoice preview
  previewDoc:      { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px 20px", maxWidth: 560, margin: "0 auto", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" },
  previewHeader:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #e2e8f0" },
  previewBrand:    { fontSize: 22, fontWeight: 800, color: "#166534" },
  previewLabel:    { fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginTop: 2, textTransform: "uppercase" as const },
  previewMeta:     { fontSize: 13, color: "#374151", marginBottom: 2 },
  previewTo:       { marginBottom: 18 },
  previewToLabel:  { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 2 },
  previewToName:   { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  previewTableWrap:{ marginBottom: 16 },
  previewRow:      { display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: "#374151" },
  previewRowHead:  { fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5, borderBottom: "2px solid #e2e8f0" },
  previewTotals:   { background: "#f8fafc", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 20 },
  previewTotalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#374151" },
  previewGrand:    { fontSize: 18, fontWeight: 800, color: "#166534", borderTop: "1px solid #e2e8f0", paddingTop: 8, marginTop: 4 },
  previewActions:  { display: "flex", gap: 10, marginTop: 4 },
  splitPanel:      { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginTop: 10 },
  splitPanelTitle: { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 },
  splitRow:        { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  splitAddBtn:     { background: "none", border: "1px dashed #94a3b8", color: "#64748b", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, width: "100%", marginBottom: 8 },
  splitTotal:      { fontSize: 13, fontWeight: 700, textAlign: "right" as const, paddingTop: 4, borderTop: "1px solid #e2e8f0" },
};
