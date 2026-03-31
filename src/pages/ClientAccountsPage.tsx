import React, { useEffect, useState } from "react";
import { clientCreditApi } from "../api/clientCreditApi";
import type { ClientCreditLedgerDto, ClientCreditEntryDto } from "../api/clientCreditApi";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";

export default function ClientAccountsPage() {
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [ledger, setLedger] = useState<ClientCreditLedgerDto | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Deposit modal
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"Cash" | "EFT" | "CardMachine">("Cash");
  const [depositNotes, setDepositNotes] = useState("");
  const [depositError, setDepositError] = useState("");
  const [depositSuccess, setDepositSuccess] = useState("");

  useEffect(() => {
    clientsApi.list().then(setClients).catch(() => setError("Failed to load clients."));
  }, []);

  useEffect(() => {
    if (!selectedClientId) { setLedger(null); return; }
    setLoadingLedger(true);
    setError("");
    clientCreditApi.getLedger(selectedClientId)
      .then(setLedger)
      .catch(() => setError("Failed to load credit ledger."))
      .finally(() => setLoadingLedger(false));
  }, [selectedClientId]);

  async function handleDeposit() {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { setDepositError("Enter a valid amount greater than zero."); return; }
    if (!depositMethod) { setDepositError("Select a payment method."); return; }
    setBusy(true); setDepositError(""); setDepositSuccess("");
    try {
      await clientCreditApi.addDeposit(selectedClientId, {
        amount,
        paymentMethod: depositMethod,
        notes: depositNotes,
      });
      setDepositSuccess(`✅ R ${amount.toFixed(2)} credited successfully.`);
      setDepositAmount(""); setDepositNotes("");
      // Refresh ledger
      const updated = await clientCreditApi.getLedger(selectedClientId);
      setLedger(updated);
    } catch (e: any) {
      setDepositError(e?.message ?? "Failed to add credit.");
    } finally { setBusy(false); }
  }

  function closeDeposit() {
    setShowDeposit(false);
    setDepositAmount(""); setDepositNotes(""); setDepositError(""); setDepositSuccess("");
  }

  const fmt = (n: number) =>
    `R ${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Running balance for ledger rows (oldest first for calculation, display newest first)
  function withRunningBalance(entries: ClientCreditEntryDto[]) {
    const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let running = 0;
    const withBal = sorted.map(e => {
      running += e.amount;
      return { ...e, runningBalance: running };
    });
    return withBal.reverse(); // newest first for display
  }

  const rows = ledger ? withRunningBalance(ledger.entries) : [];
  const balance = ledger?.balance ?? 0;
  const balanceColor = balance >= 0 ? "#15803d" : "#dc2626";
  const balanceBg = balance >= 0 ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)";
  const balanceBorder = balance >= 0 ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)";

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Client Accounts</div>
          <div style={s.sub}>Manage client credit balances and view transaction history</div>
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Client selector */}
      <div style={s.selectorCard}>
        <label style={s.selectorLabel}>Select Client</label>
        <select
          style={s.select}
          value={selectedClientId}
          onChange={e => setSelectedClientId(e.target.value)}
        >
          <option value="">— Choose a client —</option>
          {clients.map(c => (
            <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
          ))}
        </select>
      </div>

      {selectedClientId && (
        <>
          {loadingLedger ? (
            <div style={s.loading}>Loading account…</div>
          ) : ledger ? (
            <>
              {/* Balance card */}
              <div style={{ ...s.balanceCard, background: balanceBg, border: `1px solid ${balanceBorder}` }}>
                <div style={s.balanceLeft}>
                  <div style={s.clientNameLarge}>{ledger.clientName}</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Current Account Balance</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 34, fontWeight: 900, color: balanceColor, lineHeight: 1 }}>
                    {balance < 0 ? "−" : ""}{fmt(balance)}
                  </div>
                  {balance < 0 && (
                    <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 4 }}>
                      ⚠ Account overdrawn
                    </div>
                  )}
                </div>
                <button style={s.addCreditBtn} onClick={() => { setShowDeposit(true); setDepositSuccess(""); }}>
                  + Add Credit
                </button>
              </div>

              {/* Summary row */}
              <div style={s.summaryRow}>
                <div style={s.summaryItem}>
                  <div style={s.summaryVal}>
                    {fmt(ledger.entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0))}
                  </div>
                  <div style={s.summaryLabel}>Total Deposited</div>
                </div>
                <div style={s.summaryItem}>
                  <div style={{ ...s.summaryVal, color: "#dc2626" }}>
                    {fmt(ledger.entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0))}
                  </div>
                  <div style={s.summaryLabel}>Total Charged</div>
                </div>
                <div style={s.summaryItem}>
                  <div style={s.summaryVal}>{ledger.entries.length}</div>
                  <div style={s.summaryLabel}>Transactions</div>
                </div>
              </div>

              {/* Ledger table */}
              {rows.length === 0 ? (
                <div style={s.empty}>No transactions yet. Add a credit deposit to get started.</div>
              ) : (
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Type</th>
                        <th style={s.th}>Payment</th>
                        <th style={s.th}>Reference / Notes</th>
                        <th style={{ ...s.th, textAlign: "right" as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: "right" as const }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const isDeposit = row.amount > 0;
                        return (
                          <tr key={row.entryId} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                            <td style={s.td}>
                              {new Date(row.createdAt).toLocaleDateString("en-ZA")}<br />
                              <span style={s.time}>{new Date(row.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                            </td>
                            <td style={s.td}>
                              <span style={{
                                ...s.typeBadge,
                                background: isDeposit ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                                color: isDeposit ? "#15803d" : "#dc2626",
                                border: `1px solid ${isDeposit ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}`,
                              }}>
                                {isDeposit ? "▲ Deposit" : "▼ Charge"}
                              </span>
                            </td>
                            <td style={s.td}>
                              {row.paymentMethod || (row.entryType === "InvoiceCharge" ? "Invoice" : "—")}
                            </td>
                            <td style={{ ...s.td, maxWidth: 240, wordBreak: "break-word" as const }}>
                              {row.reference && <div style={{ fontSize: 12, color: "#2563eb", fontFamily: "monospace" }}>{row.reference.slice(0, 16)}</div>}
                              {row.notes && <div style={{ fontSize: 13, color: "#374151" }}>{row.notes}</div>}
                            </td>
                            <td style={{ ...s.td, textAlign: "right" as const, fontWeight: 700, color: isDeposit ? "#15803d" : "#dc2626" }}>
                              {isDeposit ? "+" : "−"}{fmt(row.amount)}
                            </td>
                            <td style={{ ...s.td, textAlign: "right" as const, fontWeight: 700, color: row.runningBalance >= 0 ? "#0f172a" : "#dc2626" }}>
                              {row.runningBalance < 0 ? "−" : ""}{fmt(row.runningBalance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {/* Add Credit modal */}
      {showDeposit && (
        <div style={s.backdrop} onClick={() => !busy && closeDeposit()}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Add Credit to Account</div>
            <div style={s.modalSub}>{ledger?.clientName ?? "Client"}</div>

            {depositError && <div style={s.formError}>{depositError}</div>}
            {depositSuccess && (
              <div style={s.formSuccess}>{depositSuccess}</div>
            )}

            {!depositSuccess && (
              <>
                <label style={s.label}>Amount (R) *
                  <input
                    style={s.input}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>Payment Method *
                  <div style={s.methodRow}>
                    {(["Cash", "EFT", "CardMachine"] as const).map(m => (
                      <button
                        key={m}
                        style={{
                          ...s.methodBtn,
                          ...(depositMethod === m ? s.methodBtnActive : {})
                        }}
                        onClick={() => setDepositMethod(m)}
                        disabled={busy}
                        type="button"
                      >
                        {m === "CardMachine" ? "Card Machine" : m}
                      </button>
                    ))}
                  </div>
                </label>

                <label style={s.label}>Notes (optional)
                  <input
                    style={s.input}
                    placeholder="e.g. ref number, reason…"
                    value={depositNotes}
                    onChange={e => setDepositNotes(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </>
            )}

            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={closeDeposit} disabled={busy}>
                {depositSuccess ? "Close" : "Cancel"}
              </button>
              {!depositSuccess && (
                <button style={s.primaryBtn} onClick={handleDeposit} disabled={busy}>
                  {busy ? "Adding…" : "Add Credit"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title:        { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  sub:          { fontSize: 13, color: "#64748b", marginTop: 2 },
  errorBanner:  { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  loading:      { textAlign: "center", padding: 40, color: "#64748b" },
  empty:        { textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" },

  selectorCard: { background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 },
  selectorLabel:{ fontSize: 13, fontWeight: 700, color: "#374151", flexShrink: 0 },
  select:       { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#f9fafb", outline: "none" },

  balanceCard:  { borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, marginBottom: 12, flexWrap: "wrap" },
  balanceLeft:  { flex: 1 },
  clientNameLarge: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  addCreditBtn: { padding: "10px 20px", borderRadius: 8, background: "#15803d", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", flexShrink: 0 },

  summaryRow:   { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  summaryItem:  { flex: 1, minWidth: 120, background: "#fff", borderRadius: 10, padding: "12px 16px", border: "1px solid #e2e8f0", textAlign: "center" },
  summaryVal:   { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  summaryLabel: { fontSize: 12, color: "#64748b", marginTop: 2 },

  tableWrap:    { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "auto" },
  table:        { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  thead:        { background: "#f8fafc" },
  th:           { padding: "10px 14px", fontWeight: 700, color: "#475569", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  trEven:       { background: "#fff" },
  trOdd:        { background: "#fafafa" },
  td:           { padding: "10px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" as const },
  time:         { fontSize: 11, color: "#94a3b8" },
  typeBadge:    { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 },

  backdrop:     { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal:        { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxSizing: "border-box", marginTop: 48 },
  modalTitle:   { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 2 },
  modalSub:     { fontSize: 13, color: "#64748b", marginBottom: 20 },
  formError:    { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  formSuccess:  { background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14, fontWeight: 600 },
  label:        { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 },
  input:        { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const, background: "#f9fafb", outline: "none" },
  methodRow:    { display: "flex", gap: 8 },
  methodBtn:    { flex: 1, padding: "10px 6px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" },
  methodBtnActive: { background: "#15803d", color: "#fff", border: "1px solid #15803d" },
  modalBtns:    { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 },
  cancelBtn:    { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  primaryBtn:   { padding: "10px 22px", borderRadius: 8, background: "#15803d", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
};
