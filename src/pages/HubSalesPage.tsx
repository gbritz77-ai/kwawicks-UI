import React, { useEffect, useState } from "react";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { staffMembersApi } from "../api/staffMembersApi";
import type { StaffMemberDto } from "../api/staffMembersApi";
import { hubSalesApi } from "../api/hubSalesApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientCreditApi } from "../api/clientCreditApi";
import { otpApi } from "../api/otpApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

const VAT_RATE = 0.15;

type CustomerMode = "existing" | "walkin" | "staff" | "credit";

type SaleLine = {
  speciesId: string;
  speciesName: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};


const PAYMENT_TYPES = ["Cash", "EFT", "Card", "Split"] as const;
const SPLIT_METHODS = ["Cash", "Card", "EFT"] as const;

type SplitLine = { method: string; amount: string };

export default function HubSalesPage() {
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMemberDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Customer selection
  const [mode, setMode] = useState<CustomerMode>("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  // Credit balance for selected existing client
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // Lines
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [addSpeciesId, setAddSpeciesId] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");

  // Payment
  const [paymentType, setPaymentType] = useState("Cash");
  const [splitLines, setSplitLines] = useState<SplitLine[]>([{ method: "Cash", amount: "" }, { method: "Card", amount: "" }]);

  // EFT proof of payment
  const [eftProof, setEftProof] = useState<File | null>(null);
  const [eftUploading, setEftUploading] = useState(false);

  // Submission
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ invoiceId: string; awaitingOtp: boolean; otpSent: boolean; creditCharged?: boolean; newCreditBalance?: number; isDeposit?: boolean; depositAmount?: number; depositClientName?: string } | null>(null);

  // Credit deposit mode state
  const [depositAmount, setDepositAmount]   = useState("");
  const [depositMethod, setDepositMethod]   = useState<"Cash" | "EFT" | "CardMachine">("Cash");
  const [depositNotes, setDepositNotes]     = useState("");
  const [depositProof, setDepositProof]     = useState<File | null>(null);
  const [depositBusy, setDepositBusy]       = useState(false);
  const [depositUpload, setDepositUpload]   = useState<"idle" | "uploading" | "done">("idle");

  // OTP verification
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpDone, setOtpDone] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [showBypass, setShowBypass] = useState(false);
  const isAdmin = hasAnyRole("Owner", "Admin", "Finance");

  useEffect(() => {
    Promise.all([
      clientsApi.list(200),
      speciesApi.list(),
      staffMembersApi.list(),
    ]).then(([c, sp, st]) => {
      setClients(c);
      setSpecies(sp.filter((x: SpeciesResponse) => x.isActive));
      setStaffMembers(st.filter((m: StaffMemberDto) => m.isActive));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Fetch credit balance when an existing client is selected
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
    // If switching away from AccountCredit when client changes, reset to Cash
    if (paymentType === "AccountCredit") setPaymentType("Cash");
  }, [selectedClientId, mode]);

  function addLine() {
    const sp = species.find(s => s.speciesId === addSpeciesId);
    const parsedQty = parseInt(addQty);
    const parsedPrice = Number(addPrice);
    if (!sp || !addQty || parsedQty <= 0 || !addPrice || parsedPrice <= 0) return;
    if (lines.find(l => l.speciesId === addSpeciesId)) {
      setLines(ls => ls.map(l => l.speciesId === addSpeciesId
        ? { ...l, quantity: l.quantity + parsedQty, unitPrice: parsedPrice }
        : l));
    } else {
      setLines(ls => [...ls, {
        speciesId: addSpeciesId,
        speciesName: sp.name,
        quantity: parsedQty,
        unitPrice: parsedPrice,
        vatRate: VAT_RATE,
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
    setLines(ls => ls.map(l => l.speciesId === speciesId ? { ...l, [field]: value } : l));
  }

  // Prices are entered inclusive of VAT; back-calculate ex-VAT components for display
  const grandTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const subTotal   = lines.reduce((s, l) => s + (l.quantity * l.unitPrice) / (1 + l.vatRate), 0);
  const vatTotal   = grandTotal - subTotal;

  function fmt(n: number) {
    return `R\u00A0${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function reset() {
    setMode("existing");
    setSelectedClientId("");
    setSelectedStaffId("");
    setClientSearch("");
    setLines([]);
    setPaymentType("Cash");
    setSplitLines([{ method: "Cash", amount: "" }, { method: "Card", amount: "" }]);
    setCreditBalance(null);
    setError("");
    setSuccess(null);
    setEftProof(null); setEftUploading(false);
    setDepositAmount(""); setDepositMethod("Cash"); setDepositNotes(""); setDepositProof(null); setDepositUpload("idle");
  }

  // Split payment helpers
  const splitAllocated = paymentType === "Split"
    ? splitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    : 0;
  const splitRemaining = grandTotal - splitAllocated;

  async function handleSubmit() {
    setError("");
    if (lines.length === 0) { setError("Add at least one item."); return; }

    const zeroPrice = lines.find(l => l.unitPrice <= 0);
    if (zeroPrice) { setError(`Unit price for "${zeroPrice.speciesName}" cannot be R 0.`); return; }

    if (mode === "existing" && !selectedClientId) { setError("Select a customer."); return; }
    if (mode === "staff" && !selectedStaffId) { setError("Select a staff member."); return; }

    if (paymentType === "Split") {
      const validSplitLines = splitLines.filter(l => parseFloat(l.amount) > 0);
      if (validSplitLines.length === 0) { setError("Add at least one split payment amount."); return; }
      if (Math.abs(splitAllocated - grandTotal) > 0.05) {
        setError(`Split payments total ${fmt(splitAllocated)} must equal sale total ${fmt(grandTotal)}.`);
        return;
      }
    }

    setBusy(true);
    try {
      const effectivePay = mode === "staff" ? "OnAccount" : paymentType;
      const result = await hubSalesApi.create({
        customerId: mode === "existing" ? selectedClientId : undefined,
        newClient: mode === "walkin" ? { clientName: "Walk-in", clientType: 0, isWalkIn: true } : undefined,
        staffMemberId: mode === "staff" ? selectedStaffId : undefined,
        hubId: "main",
        paymentType: effectivePay,
        lines: lines.map(l => ({
          speciesId: l.speciesId,
          quantity: l.quantity,
          // User enters incl. VAT; back-calc to ex-VAT for the backend invoice engine
          unitPrice: l.unitPrice / (1 + l.vatRate),
          vatRate: l.vatRate,
        })),
        splitPayments: effectivePay === "Split"
          ? splitLines
              .filter(l => parseFloat(l.amount) > 0)
              .map(l => ({ method: l.method, amount: parseFloat(l.amount) }))
          : undefined,
      });

      // Upload EFT proof of payment if provided
      if (eftProof && result.invoiceId) {
        try {
          setEftUploading(true);
          const { presignedUrl } = await invoicesApi.getReceiptUploadUrl(result.invoiceId);
          await fetch(presignedUrl, {
            method: "PUT",
            body: eftProof,
            headers: { "Content-Type": eftProof.type || "image/jpeg" },
          });
        } catch { /* non-fatal — sale was recorded, POP upload failure is logged silently */ }
        finally { setEftUploading(false); }
      }

      setSuccess({ invoiceId: result.invoiceId, awaitingOtp: result.awaitingOtp ?? false, otpSent: result.otpSent ?? false, creditCharged: result.creditCharged, newCreditBalance: result.newCreditBalance });
    } catch (e: any) {
      setError(e?.message ?? "Failed to create sale.");
    } finally { setBusy(false); }
  }

  async function handleDepositSubmit() {
    if (!selectedClientId) { setError("Select a client."); return; }
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { setError("Enter a valid deposit amount greater than zero."); return; }
    setDepositBusy(true); setError("");
    try {
      let proofS3Key: string | undefined;
      if (depositProof) {
        setDepositUpload("uploading");
        const { uploadUrl, s3Key } = await clientCreditApi.getProofUploadUrl(
          selectedClientId, depositProof.type || "application/octet-stream"
        );
        await fetch(uploadUrl, { method: "PUT", body: depositProof, headers: { "Content-Type": depositProof.type || "application/octet-stream" } });
        proofS3Key = s3Key;
        setDepositUpload("done");
      }
      await clientCreditApi.addDeposit(selectedClientId, {
        amount,
        paymentMethod: depositMethod,
        notes: depositNotes || undefined,
        proofS3Key,
      });
      const clientName = clients.find(c => c.clientId === selectedClientId)?.clientName ?? "Client";
      setSuccess({ invoiceId: "", awaitingOtp: false, otpSent: false, isDeposit: true, depositAmount: amount, depositClientName: clientName });
    } catch (e: any) { setError(e?.message ?? "Failed to record credit deposit."); }
    finally { setDepositBusy(false); }
  }

  const filteredClients = clients.filter(c =>
    !c.isWalkIn && (!clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase()))
  );

  const selectedSpeciesItem = species.find(s => s.speciesId === addSpeciesId);

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;

  if (success) {
    // ── Credit deposit success ────────────────────────────────────────────
    if (success.isDeposit) {
      return (
        <div style={s.page}>
          <div style={s.successBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#166534", marginBottom: 8 }}>Credit Deposited</div>
            <div style={{ fontSize: 15, color: "#374151", marginBottom: 4 }}>
              <strong>{fmt(success.depositAmount!)}</strong> added to {success.depositClientName}'s account.
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {depositMethod === "CardMachine" ? "Card Machine" : depositMethod}
              {depositNotes ? ` · ${depositNotes}` : ""}
            </div>
            <button style={{ ...s.btnPrimary, marginTop: 28 }} onClick={reset}>Done</button>
          </div>
        </div>
      );
    }

    // ── OTP confirmation step ─────────────────────────────────────────────
    if (success.awaitingOtp && !otpDone) {
      return (
        <div style={s.page}>
          <div style={s.successBox}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📲</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#1e3a8a", marginBottom: 6 }}>
              Awaiting Client Confirmation
            </div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
              An OTP has been sent to the client's WhatsApp.<br />
              Ask the client for the code and enter it below.
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

                <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    style={{ ...s.btnPrimary, fontSize: 15, padding: "10px 28px" }}
                    disabled={otpBusy || otpCode.length < 6}
                    onClick={async () => {
                      setOtpBusy(true); setOtpError("");
                      try { await otpApi.verify(success.invoiceId, otpCode); setOtpDone(true); }
                      catch (e: any) { setOtpError(e?.message ?? "Incorrect code — try again."); }
                      finally { setOtpBusy(false); }
                    }}
                  >{otpBusy ? "Verifying…" : "✓ Verify"}</button>

                  <button
                    style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14 }}
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
                      style={{ background: "#fef9c3", border: "1px solid #fde047", color: "#854d0e", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 13 }}
                      onClick={() => setShowBypass(true)}
                    >⚠ Bypass</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Reason for bypass (required):</div>
                <input
                  style={{ fontSize: 14, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 7, width: "100%", maxWidth: 320 }}
                  placeholder="e.g. No WhatsApp, confirmed verbally"
                  value={bypassReason}
                  onChange={e => setBypassReason(e.target.value)}
                />
                {otpError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 6 }}>{otpError}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "center" }}>
                  <button style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }} onClick={() => setShowBypass(false)}>Cancel</button>
                  <button
                    style={{ background: "#dc2626", border: "none", color: "#fff", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600 }}
                    disabled={otpBusy || !bypassReason.trim()}
                    onClick={async () => {
                      setOtpBusy(true); setOtpError("");
                      try { await otpApi.bypass(success.invoiceId, bypassReason); setOtpDone(true); }
                      catch (e: any) { setOtpError(e?.message ?? "Bypass failed."); }
                      finally { setOtpBusy(false); }
                    }}
                  >{otpBusy ? "Processing…" : "Confirm Bypass"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    // ── Final success ─────────────────────────────────────────────────────
    return (
      <div style={s.page}>
        <div style={s.successBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#166534", marginBottom: 6 }}>Sale Complete</div>
          <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>Invoice created and client confirmed.</div>
          <div style={{ fontSize: 13, color: "#15803d", marginTop: 8 }}>📱 Invoice sent via WhatsApp</div>
          {success.creditCharged && success.newCreditBalance !== undefined && (
            <div style={{ fontSize: 13, color: "#1d4ed8", marginTop: 8 }}>
              💳 Account credit charged — new balance: {fmt(success.newCreditBalance)}
            </div>
          )}
          <button style={{ ...s.btnPrimary, marginTop: 24 }} onClick={reset}>New Sale</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>🛒 Hub Sales</div>
          <div style={s.pageSub}>Create a direct sale at the hub</div>
        </div>
      </div>

      <div style={s.layout}>
        {/* ── Left: Customer + Items ── */}
        <div style={s.leftCol}>

          {/* Customer selection */}
          <div style={s.card}>
            <div style={s.cardTitle}>Customer</div>
            <div style={s.modeRow}>
              {(["existing", "walkin", "staff", "credit"] as CustomerMode[]).map(m => (
                <button
                  key={m}
                  style={mode === m
                    ? { ...s.modeBtn, ...(m === "credit" ? s.modeBtnCredit : s.modeBtnActive) }
                    : s.modeBtn}
                  onClick={() => { setMode(m); setError(""); if (m !== "existing" && m !== "credit") setSelectedClientId(""); }}
                >
                  {m === "existing" ? "Existing Client" : m === "walkin" ? "Walk-in" : m === "staff" ? "Staff Member" : "💰 Credit Deposit"}
                </button>
              ))}
            </div>

            {(mode === "existing" || mode === "credit") && (
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
                  <div style={s.creditBalanceBadge}>
                    {creditLoading
                      ? <span style={{ color: "#64748b" }}>Loading credit balance…</span>
                      : creditBalance !== null
                        ? <>
                            💳 Account credit balance:{" "}
                            <strong style={{ color: creditBalance >= 0 ? "#166534" : "#dc2626" }}>
                              {fmt(creditBalance)}
                            </strong>
                          </>
                        : <span style={{ color: "#94a3b8" }}>Credit balance unavailable</span>
                    }
                  </div>
                )}
              </>
            )}

            {mode === "walkin" && (
              <div style={s.infoBanner}>🛒 Walk-in sale — no customer details required. Sale will be recorded as "Walk-in".</div>
            )}

            {mode === "staff" && (
              <>
                <select
                  style={s.select}
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                >
                  <option value="">— Select staff member —</option>
                  {staffMembers.map(m => (
                    <option key={m.staffMemberId} value={m.staffMemberId}>
                      {m.name}{m.department ? ` — ${m.department}` : ""}
                    </option>
                  ))}
                </select>
                <div style={s.infoBanner}>Staff purchases are recorded on account. No invoice sent now — statement at month-end.</div>
              </>
            )}
          </div>

          {/* Credit deposit form */}
          {mode === "credit" && (
            <div style={{ ...s.card, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
              <div style={s.cardTitle}>💰 Deposit Details</div>
              <label style={s.label}>Amount (R) *</label>
              <NumericInput
                style={{ ...s.input, fontSize: 20, fontWeight: 700, marginBottom: 14 }}
                min={0}
                step={0.01}
                placeholder="0.00"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                disabled={depositBusy}
              />
              <label style={s.label}>Payment Method *</label>
              <div style={{ ...s.modeRow, marginBottom: 14 }}>
                {(["Cash", "EFT", "CardMachine"] as const).map(m => (
                  <button
                    key={m}
                    style={depositMethod === m ? { ...s.modeBtn, ...s.modeBtnActive } : s.modeBtn}
                    onClick={() => setDepositMethod(m)}
                    disabled={depositBusy}
                    type="button"
                  >
                    {m === "CardMachine" ? "Card Machine" : m}
                  </button>
                ))}
              </div>
              <label style={s.label}>Reference / Notes (optional)</label>
              <NumericInput
                style={{ ...s.input, marginBottom: 14 }}
                placeholder="e.g. EFT ref, reason…"
                value={depositNotes}
                onChange={e => setDepositNotes(e.target.value)}
                disabled={depositBusy}
              />
              <label style={s.label}>Proof of Payment (optional)</label>
              <div
                style={{
                  border: "2px dashed #d1d5db", borderRadius: 8, padding: "12px 14px",
                  background: depositProof ? "#f0fdf4" : "#f9fafb", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  borderColor: depositProof ? "#16a34a" : "#d1d5db", fontSize: 13, color: "#64748b",
                }}
                onClick={() => !depositBusy && (document.getElementById("deposit-proof-input") as HTMLInputElement)?.click()}
              >
                {depositProof
                  ? <><span>{depositProof.type === "application/pdf" ? "📄" : "🖼️"}</span><span style={{ fontWeight: 600, color: "#15803d" }}>{depositProof.name}</span><button style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }} onClick={e => { e.stopPropagation(); setDepositProof(null); }}>✕</button></>
                  : <><span>📎</span><span>Click to attach photo or PDF</span></>
                }
              </div>
              <input id="deposit-proof-input" type="file" accept="image/jpeg,image/png,image/heic,application/pdf" style={{ display: "none" }} onChange={e => { setDepositProof(e.target.files?.[0] ?? null); e.target.value = ""; }} disabled={depositBusy} />
              {depositUpload === "uploading" && <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>⏳ Uploading proof…</div>}
            </div>
          )}

          {/* Add item */}
          {mode !== "credit" && <div style={s.card}>
            <div style={s.cardTitle}>Add Item</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "end" }}>
              <div>
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
                      {sp.name}{sp.qtyAvailable > 0
                        ? ` — ${sp.qtyAvailable} available`
                        : " — Out of stock"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>Qty</label>
                <NumericInput style={{ ...s.input, width: 70 }} min={1} placeholder="1" value={addQty} onChange={e => setAddQty(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Unit Price (incl. VAT)</label>
                <NumericInput style={{ ...s.input, width: 100 }}  min={0} step={0.01} placeholder="0.00" value={addPrice} onChange={e => setAddPrice(e.target.value)} onFocus={e => e.target.select()} />
              </div>
              <button
                style={{ ...s.btnPrimary, alignSelf: "flex-end" }}
                onClick={addLine}
                disabled={!addSpeciesId || !addQty || parseInt(addQty) <= 0 || !addPrice || Number(addPrice) <= 0}
              >Add</button>
            </div>
            {selectedSpeciesItem && (
              <div style={s.stockInfoRow}>
                {/* Stock badges */}
                <div style={s.stockBadges}>
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
                  {selectedSpeciesItem.qtyBookedOutForDelivery > 0 && (
                    <span style={{ ...s.stockBadge, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                      {selectedSpeciesItem.qtyBookedOutForDelivery} on delivery
                    </span>
                  )}
                </div>
                {/* Price hint */}
                <span style={s.stockHint}>
                  Default price: {fmt(selectedSpeciesItem.sellPrice ?? 0)} incl. VAT
                </span>
              </div>
            )}
            {/* Over-stock warning */}
            {selectedSpeciesItem && parseInt(addQty) > selectedSpeciesItem.qtyAvailable && selectedSpeciesItem.qtyAvailable >= 0 && (
              <div style={s.stockWarning}>
                ⚠️ Qty ({addQty}) exceeds available stock ({selectedSpeciesItem.qtyAvailable})
              </div>
            )}
            <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>✓ Enter all prices inclusive of VAT — the VAT portion is calculated automatically</div>
          </div>}

          {/* Lines table */}
          {mode !== "credit" && lines.length > 0 && (
            <div style={s.card}>
              <div style={s.cardTitle}>Order Lines</div>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Item", "Qty", "Unit Price", "VAT", "Line Total", ""].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.speciesId}>
                      <td style={s.td}>{l.speciesName}</td>
                      <td style={s.td}>
                        <NumericInput
                          style={{ ...s.input, width: 60, padding: "4px 6px" }}
                           min={1} value={l.quantity}
                          onChange={e => updateLine(l.speciesId, "quantity", Number(e.target.value))}
                          onFocus={e => e.target.select()}
                        />
                      </td>
                      <td style={s.td}>
                        <NumericInput
                          style={{ ...s.input, width: 90, padding: "4px 6px" }}
                           min={0} step={0.01} value={l.unitPrice}
                          onChange={e => updateLine(l.speciesId, "unitPrice", Number(e.target.value))}
                          onFocus={e => e.target.select()}
                        />
                      </td>
                      <td style={{ ...s.td, color: "#64748b" }}>{(l.vatRate * 100).toFixed(0)}%</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{fmt(l.quantity * l.unitPrice)}</td>
                      <td style={s.td}>
                        <button style={s.removeBtn} onClick={() => removeLine(l.speciesId)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Right: Summary + Payment ── */}
        <div style={s.rightCol}>

          {/* Credit deposit summary panel */}
          {mode === "credit" && (
            <div style={{ ...s.card, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
              <div style={s.cardTitle}>Deposit Summary</div>
              <div style={s.summaryBox}>
                <div style={s.summaryRow}>
                  <span>Client</span>
                  <span style={{ fontWeight: 700 }}>{clients.find(c => c.clientId === selectedClientId)?.clientName ?? "—"}</span>
                </div>
                <div style={s.summaryRow}>
                  <span>Method</span>
                  <span>{depositMethod === "CardMachine" ? "Card Machine" : depositMethod}</span>
                </div>
                <div style={{ ...s.summaryRow, ...s.summaryTotal, color: "#15803d" }}>
                  <span>Deposit Amount</span>
                  <span>{fmt(parseFloat(depositAmount) || 0)}</span>
                </div>
              </div>
              {depositProof && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>📎 {depositProof.name}</div>
              )}
              {error && <div style={s.errorText}>{error}</div>}
              <button
                style={{ ...s.btnPrimary, width: "100%", marginTop: 16, padding: "12px", fontSize: 15, background: "#15803d" }}
                onClick={handleDepositSubmit}
                disabled={depositBusy || !selectedClientId || !(parseFloat(depositAmount) > 0)}
              >
                {depositBusy
                  ? depositUpload === "uploading" ? "Uploading proof…" : "Recording…"
                  : "Record Credit Deposit 💰"}
              </button>
            </div>
          )}

          {mode !== "credit" && <div style={s.card}>
            <div style={s.cardTitle}>Payment</div>

            {mode !== "staff" ? (
              <>
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
                    >
                      💳 Client Credit
                    </button>
                  )}
                </div>

                {/* Client Credit balance feedback */}
                {paymentType === "AccountCredit" && (
                  creditLoading
                    ? <div style={s.creditInfo}>Loading balance…</div>
                    : creditBalance === null
                      ? <div style={s.creditInfo}>Could not load balance.</div>
                      : grandTotal > creditBalance
                        ? <div style={s.creditInfo}>
                            💳 Balance: {fmt(creditBalance)} — account will be {fmt(creditBalance - grandTotal)} after this sale. Sale will be processed.
                          </div>
                        : <div style={s.creditOk}>
                            ✓ Balance: {fmt(creditBalance)} — {fmt(creditBalance - grandTotal)} remaining after this sale.
                          </div>
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
                      style={{ ...s.splitAddBtn }}
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
              </>
            ) : (
              <div style={s.infoBanner}>On Account (salary deduction at month-end)</div>
            )}

            {/* EFT proof of payment prompt */}
            {(paymentType === "EFT" || (paymentType === "Split" && splitLines.some(l => l.method === "EFT"))) && (
              <div style={s.eftProofBox}>
                <div style={s.eftProofTitle}>📎 EFT Proof of Payment</div>
                <div
                  style={{
                    border: `2px dashed ${eftProof ? "#16a34a" : "#2563eb"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    background: eftProof ? "#f0fdf4" : "#eff6ff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: eftProof ? "#15803d" : "#2563eb",
                  }}
                  onClick={() => !busy && (document.getElementById("eft-proof-input") as HTMLInputElement)?.click()}
                >
                  {eftProof ? (
                    <>
                      <span>{eftProof.type === "application/pdf" ? "📄" : "🖼️"}</span>
                      <span style={{ fontWeight: 600, flex: 1 }}>{eftProof.name}</span>
                      <button
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: 0 }}
                        onClick={e => { e.stopPropagation(); setEftProof(null); }}
                      >✕</button>
                    </>
                  ) : (
                    <>
                      <span>📷</span>
                      <span>Attach EFT screenshot or bank slip</span>
                    </>
                  )}
                </div>
                <input
                  id="eft-proof-input"
                  type="file"
                  accept="image/jpeg,image/png,image/heic,application/pdf"
                  style={{ display: "none" }}
                  onChange={e => { setEftProof(e.target.files?.[0] ?? null); e.target.value = ""; }}
                  disabled={busy}
                />
                {!eftProof && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Optional — you can skip and attach later via Recon</div>
                )}
              </div>
            )}

            <div style={s.summaryBox}>
              <div style={s.summaryRow}><span>Subtotal</span><span>{fmt(subTotal)}</span></div>
              <div style={s.summaryRow}><span>VAT (15%)</span><span>{fmt(vatTotal)}</span></div>
              <div style={{ ...s.summaryRow, ...s.summaryTotal }}><span>Total</span><span>{fmt(grandTotal)}</span></div>
            </div>

            {error && <div style={s.errorText}>{error}</div>}

            <button
              style={{ ...s.btnPrimary, width: "100%", marginTop: 16, padding: "12px", fontSize: 15 }}
              onClick={handleSubmit}
              disabled={busy || lines.length === 0}
            >
              {busy
                ? eftUploading ? "Uploading proof…" : "Processing…"
                : "Complete Sale"}
            </button>
          </div>}

        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  pageHeader: { marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  layout: { display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" },
  leftCol: { display: "flex", flexDirection: "column", gap: 16 },
  rightCol: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 },
  modeRow: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" as const },
  modeBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer", fontSize: 13 },
  modeBtnActive: { background: "#166534", color: "#fff", borderColor: "#166534", fontWeight: 600 },
  modeBtnCredit: { background: "#15803d", color: "#fff", borderColor: "#15803d", fontWeight: 700 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 },
  input: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" as const },
  select: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" },
  infoBanner: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#166534", marginTop: 8 },
  stockInfoRow:  { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8, marginTop: 8 },
  stockBadges:   { display: "flex", gap: 6, flexWrap: "wrap" as const },
  stockBadge:    { fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20 },
  stockHint:     { fontSize: 11, color: "#64748b" },
  stockWarning:  { fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "5px 10px", marginTop: 4 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, fontSize: 11, fontWeight: 600, color: "#64748b", borderBottom: "2px solid #e2e8f0", padding: "6px 8px", textTransform: "uppercase" as const },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" as const },
  removeBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "2px 4px" },
  summaryBox: { background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginTop: 12, display: "flex", flexDirection: "column", gap: 6 },
  summaryRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151" },
  summaryTotal: { fontSize: 16, fontWeight: 800, color: "#166534", borderTop: "1px solid #e2e8f0", paddingTop: 6, marginTop: 2 },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  errorText: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  successBox: { textAlign: "center" as const, padding: "60px 24px", maxWidth: 400, margin: "0 auto" },
  creditBalanceBadge: { marginTop: 8, padding: "6px 10px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, fontSize: 13, color: "#0369a1" },
  creditInfo:    { fontSize: 12, color: "#64748b", marginTop: 4, padding: "7px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" },
  creditWarning: { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#92400e", marginTop: 4 },
  creditOk:      { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#166534", marginTop: 4 },
  eftProofBox:    { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginTop: 12 },
  eftProofTitle:  { fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 8 },
  splitPanel:     { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginTop: 10 },
  splitPanelTitle:{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 },
  splitRow:       { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  splitAddBtn:    { background: "none", border: "1px dashed #94a3b8", color: "#64748b", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, width: "100%", marginBottom: 8 },
  splitTotal:     { fontSize: 13, fontWeight: 700, textAlign: "right" as const, paddingTop: 4, borderTop: "1px solid #e2e8f0" },
};
