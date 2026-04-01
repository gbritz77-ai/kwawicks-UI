import React, { useEffect, useState } from "react";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";
import { staffMembersApi } from "../api/staffMembersApi";
import type { StaffMemberDto } from "../api/staffMembersApi";
import { hubSalesApi } from "../api/hubSalesApi";
import { clientCreditApi } from "../api/clientCreditApi";

const VAT_RATE = 0.15;

type CustomerMode = "existing" | "walkin" | "staff";

type SaleLine = {
  speciesId: string;
  speciesName: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};


const PAYMENT_TYPES = ["Cash", "EFT", "Card"] as const;

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
  const [addQty, setAddQty] = useState(1);
  const [addPrice, setAddPrice] = useState("");

  // Payment
  const [paymentType, setPaymentType] = useState("Cash");

  // Submission
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ invoiceId: string; invoiceNumber?: string; whatsAppSent: boolean; creditCharged?: boolean; newCreditBalance?: number } | null>(null);

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
    setCreditBalance(null);
    setError("");
    setSuccess(null);
  }

  async function handleSubmit() {
    setError("");
    if (lines.length === 0) { setError("Add at least one item."); return; }

    const zeroPrice = lines.find(l => l.unitPrice <= 0);
    if (zeroPrice) { setError(`Unit price for "${zeroPrice.speciesName}" cannot be R 0.`); return; }

    if (mode === "existing" && !selectedClientId) { setError("Select a customer."); return; }
    if (mode === "staff" && !selectedStaffId) { setError("Select a staff member."); return; }

    setBusy(true);
    try {
      const result = await hubSalesApi.create({
        customerId: mode === "existing" ? selectedClientId : undefined,
        newClient: mode === "walkin" ? { clientName: "Walk-in", clientType: 0, isWalkIn: true } : undefined,
        staffMemberId: mode === "staff" ? selectedStaffId : undefined,
        hubId: "main",
        paymentType: mode === "staff" ? "OnAccount" : paymentType,
        lines: lines.map(l => ({
          speciesId: l.speciesId,
          quantity: l.quantity,
          // User enters incl. VAT; back-calc to ex-VAT for the backend invoice engine
          unitPrice: l.unitPrice / (1 + l.vatRate),
          vatRate: l.vatRate,
        })),
      });
      setSuccess({ invoiceId: result.invoiceId, whatsAppSent: result.whatsAppSent, creditCharged: result.creditCharged, newCreditBalance: result.newCreditBalance });
    } catch (e: any) {
      setError(e?.message ?? "Failed to create sale.");
    } finally { setBusy(false); }
  }

  const filteredClients = clients.filter(c =>
    !clientSearch || c.clientName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const selectedSpeciesItem = species.find(s => s.speciesId === addSpeciesId);

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;

  if (success) {
    return (
      <div style={s.page}>
        <div style={s.successBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#166534", marginBottom: 6 }}>Sale Complete</div>
          <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>Invoice created successfully.</div>
          {success.whatsAppSent
            ? <div style={{ fontSize: 13, color: "#15803d", marginTop: 8 }}>📱 Invoice sent via WhatsApp</div>
            : <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>WhatsApp not sent (no phone number on file)</div>
          }
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
              {(["existing", "walkin", "staff"] as CustomerMode[]).map(m => (
                <button
                  key={m}
                  style={mode === m ? { ...s.modeBtn, ...s.modeBtnActive } : s.modeBtn}
                  onClick={() => { setMode(m); setError(""); }}
                >
                  {m === "existing" ? "Existing Client" : m === "walkin" ? "Walk-in" : "Staff Member"}
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

          {/* Add item */}
          <div style={s.card}>
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
                <input style={{ ...s.input, width: 70 }} type="number" min={1} value={addQty} onChange={e => setAddQty(Number(e.target.value))} />
              </div>
              <div>
                <label style={s.label}>Unit Price (incl. VAT)</label>
                <input style={{ ...s.input, width: 100 }} type="number" min={0} step={0.01} placeholder="0.00" value={addPrice} onChange={e => setAddPrice(e.target.value)} />
              </div>
              <button
                style={{ ...s.btnPrimary, alignSelf: "flex-end" }}
                onClick={addLine}
                disabled={!addSpeciesId || addQty <= 0 || !addPrice || Number(addPrice) <= 0}
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
            {selectedSpeciesItem && addQty > selectedSpeciesItem.qtyAvailable && selectedSpeciesItem.qtyAvailable >= 0 && (
              <div style={s.stockWarning}>
                ⚠️ Qty ({addQty}) exceeds available stock ({selectedSpeciesItem.qtyAvailable})
              </div>
            )}
            <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>✓ Enter all prices inclusive of VAT — the VAT portion is calculated automatically</div>
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
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
                        <input
                          style={{ ...s.input, width: 60, padding: "4px 6px" }}
                          type="number" min={1} value={l.quantity}
                          onChange={e => updateLine(l.speciesId, "quantity", Number(e.target.value))}
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          style={{ ...s.input, width: 90, padding: "4px 6px" }}
                          type="number" min={0} step={0.01} value={l.unitPrice}
                          onChange={e => updateLine(l.speciesId, "unitPrice", Number(e.target.value))}
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
          <div style={s.card}>
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
                        ? <div style={s.creditWarning}>
                            ⚠️ Balance ({fmt(creditBalance)}) is less than the total ({fmt(grandTotal)}). Account will go negative.
                          </div>
                        : <div style={s.creditOk}>
                            ✓ Balance: {fmt(creditBalance)} — {fmt(creditBalance - grandTotal)} remaining after this sale.
                          </div>
                )}
              </>
            ) : (
              <div style={s.infoBanner}>On Account (salary deduction at month-end)</div>
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
              {busy ? "Processing…" : "Complete Sale"}
            </button>
          </div>
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
};
