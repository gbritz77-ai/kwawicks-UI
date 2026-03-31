import React, { useEffect, useState } from "react";
import { pettyCashApi, CATEGORIES } from "../api/pettyCashApi";
import type {
  PettyCashSummaryDto,
  PettyCashEntryDto,
  PettyCashupDto,
  CreatePettyCashEntryRequest,
  CreateCashupRequest,
} from "../api/pettyCashApi";

type Tab = "cashbook" | "cashup" | "history";

const fmt = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = (): CreatePettyCashEntryRequest => ({
  type: "Out",
  amount: 0,
  description: "",
  category: "Other",
  recipientName: "",
  entryDate: today(),
  assignedDriverId: "",
});

export default function PettyCashPage() {
  const [tab, setTab] = useState<Tab>("cashbook");
  const [summary, setSummary] = useState<PettyCashSummaryDto | null>(null);
  const [entries, setEntries] = useState<PettyCashEntryDto[]>([]);
  const [cashups, setCashups] = useState<PettyCashupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add entry form
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entry, setEntry] = useState<CreatePettyCashEntryRequest>(emptyEntry());
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState("");

  // Cashup form
  const [actualBalance, setActualBalance] = useState("");
  const [cashupNotes, setCashupNotes] = useState("");
  const [cashupBusy, setCashupBusy] = useState(false);
  const [cashupError, setCashupError] = useState("");
  const [cashupDone, setCashupDone] = useState<PettyCashupDto | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [s, e, c] = await Promise.all([
        pettyCashApi.getSummary(),
        pettyCashApi.listEntries(),
        pettyCashApi.listCashups(),
      ]);
      setSummary(s);
      setEntries(e);
      setCashups(c);
    } catch {
      setError("Failed to load petty cash data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEntry() {
    if (!entry.description.trim()) { setEntryError("Description is required."); return; }
    if (!entry.amount || entry.amount <= 0) { setEntryError("Amount must be greater than zero."); return; }
    setEntryBusy(true);
    setEntryError("");
    try {
      const created = await pettyCashApi.createEntry(entry);
      setEntries(prev => [...prev, created]);
      // refresh summary
      const s = await pettyCashApi.getSummary();
      setSummary(s);
      setEntry(emptyEntry());
      setShowEntryForm(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create entry.";
      setEntryError(msg);
    } finally {
      setEntryBusy(false);
    }
  }

  async function handleCashup() {
    const actual = parseFloat(actualBalance);
    if (isNaN(actual) || actual < 0) { setCashupError("Enter a valid actual balance."); return; }
    if (!summary || summary.openEntryCount === 0) { setCashupError("No open entries to cash up."); return; }
    setCashupBusy(true);
    setCashupError("");
    try {
      const req: CreateCashupRequest = {
        actualBalance: actual,
        notes: cashupNotes,
        cashupDate: today(),
      };
      const result = await pettyCashApi.createCashup(req);
      setCashupDone(result);
      // refresh all
      const [s, e, c] = await Promise.all([
        pettyCashApi.getSummary(),
        pettyCashApi.listEntries(),
        pettyCashApi.listCashups(),
      ]);
      setSummary(s);
      setEntries(e);
      setCashups(c);
      setActualBalance("");
      setCashupNotes("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Cashup failed.";
      setCashupError(msg);
    } finally {
      setCashupBusy(false);
    }
  }

  if (loading) return <div style={s.page}><p style={{ color: "#94a3b8" }}>Loading…</p></div>;
  if (error) return <div style={s.page}><p style={{ color: "#ef4444" }}>{error}</p></div>;

  const expectedBalance = summary ? summary.currentBalance : 0;
  const actualNum = parseFloat(actualBalance);
  const variance = !isNaN(actualNum) ? actualNum - expectedBalance : null;

  return (
    <div style={s.page}>
      <h1 style={s.heading}>Petty Cash</h1>

      {/* KPI cards */}
      {summary && (
        <>
          {/* Total Cash In Custody — hero card */}
          <div style={s.custodyCard}>
            <div style={s.custodyLeft}>
              <div style={s.custodyLabel}>💵 Total Cash In Custody</div>
              <div style={s.custodySub}>All physical cash on hand since last cashup</div>
              <div style={s.custodyBreakdown}>
                <div style={s.breakdownRow}>
                  <span style={s.breakdownLabel}>Petty Cash Float</span>
                  <span style={{ color: summary.currentBalance >= 0 ? "#4ade80" : "#f87171" }}>
                    {fmt(summary.currentBalance)}
                  </span>
                </div>
                <div style={s.breakdownRow}>
                  <span style={s.breakdownLabel}>Hub Sales (Cash)</span>
                  <span style={{ color: "#4ade80" }}>{fmt(summary.cashFromHubSales)}</span>
                </div>
                <div style={s.breakdownRow}>
                  <span style={s.breakdownLabel}>Client Deposits (Cash)</span>
                  <span style={{ color: "#4ade80" }}>{fmt(summary.cashFromCreditDeposits)}</span>
                </div>
              </div>
            </div>
            <div style={s.custodyRight}>
              <div style={{ ...s.custodyTotal, color: summary.totalCashInCustody >= 0 ? "#22c55e" : "#ef4444" }}>
                {fmt(summary.totalCashInCustody)}
              </div>
              {summary.totalCashInCustody < 0 && (
                <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>⚠ Negative — check entries</div>
              )}
            </div>
          </div>

          {/* Secondary KPI row */}
          <div style={s.kpiRow}>
            <div style={s.kpiCard}>
              <div style={s.kpiLabel}>Petty Cash Float</div>
              <div style={{ ...s.kpiValue, color: summary.currentBalance >= 0 ? "#22c55e" : "#ef4444" }}>
                {fmt(summary.currentBalance)}
              </div>
            </div>
            <div style={s.kpiCard}>
              <div style={s.kpiLabel}>Cash In (since cashup)</div>
              <div style={{ ...s.kpiValue, color: "#22c55e" }}>{fmt(summary.totalInSinceLastCashup)}</div>
            </div>
            <div style={s.kpiCard}>
              <div style={s.kpiLabel}>Cash Out (since cashup)</div>
              <div style={{ ...s.kpiValue, color: "#ef4444" }}>{fmt(summary.totalOutSinceLastCashup)}</div>
            </div>
            <div style={s.kpiCard}>
              <div style={s.kpiLabel}>Open Entries</div>
              <div style={s.kpiValue}>{summary.openEntryCount}</div>
            </div>
            <div style={s.kpiCard}>
              <div style={s.kpiLabel}>Last Cashup</div>
              <div style={{ ...s.kpiValue, fontSize: 16 }}>{summary.lastCashupDate ?? "Never"}</div>
            </div>
          </div>
        </>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {(["cashbook", "cashup", "history"] as Tab[]).map(t => (
          <button
            key={t}
            style={tab === t ? { ...s.tab, ...s.tabActive } : s.tab}
            onClick={() => { setTab(t); setCashupDone(null); }}
          >
            {t === "cashbook" ? "Cash Book" : t === "cashup" ? "Do Cashup" : "Cashup History"}
          </button>
        ))}
      </div>

      {/* ── CASH BOOK ── */}
      {tab === "cashbook" && (
        <div>
          <div style={s.rowBetween}>
            <h2 style={s.subHeading}>Open Entries</h2>
            <button style={s.btnPrimary} onClick={() => { setShowEntryForm(true); setEntryError(""); }}>
              + Add Entry
            </button>
          </div>

          {/* Add Entry Form */}
          {showEntryForm && (
            <div style={s.formCard}>
              <h3 style={s.formTitle}>New Entry</h3>
              {entryError && <p style={s.errText}>{entryError}</p>}
              <div style={s.formGrid}>
                <label style={s.label}>
                  Type
                  <select
                    style={s.input}
                    value={entry.type}
                    onChange={e => setEntry(prev => ({ ...prev, type: e.target.value as "In" | "Out" }))}
                  >
                    <option value="Out">Out (Payment)</option>
                    <option value="In">In (Receipt)</option>
                  </select>
                </label>
                <label style={s.label}>
                  Amount (R)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    style={s.input}
                    value={entry.amount || ""}
                    onChange={e => setEntry(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  />
                </label>
                <label style={s.label}>
                  Category
                  <select
                    style={s.input}
                    value={entry.category}
                    onChange={e => setEntry(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={s.label}>
                  Date
                  <input
                    type="date"
                    style={s.input}
                    value={entry.entryDate}
                    onChange={e => setEntry(prev => ({ ...prev, entryDate: e.target.value }))}
                  />
                </label>
                <label style={{ ...s.label, gridColumn: "1 / -1" }}>
                  Description *
                  <input
                    type="text"
                    style={s.input}
                    placeholder="e.g. Diesel for Truck 3"
                    value={entry.description}
                    onChange={e => setEntry(prev => ({ ...prev, description: e.target.value }))}
                  />
                </label>
                <label style={s.label}>
                  Recipient / Payee
                  <input
                    type="text"
                    style={s.input}
                    placeholder="e.g. Driver John"
                    value={entry.recipientName}
                    onChange={e => setEntry(prev => ({ ...prev, recipientName: e.target.value }))}
                  />
                </label>
                <label style={s.label}>
                  Assign to Driver (username)
                  <input
                    type="text"
                    style={s.input}
                    placeholder="e.g. driver1 (optional)"
                    value={entry.assignedDriverId ?? ""}
                    onChange={e => setEntry(prev => ({ ...prev, assignedDriverId: e.target.value }))}
                  />
                </label>
              </div>
              <div style={s.formActions}>
                <button style={s.btnSecondary} onClick={() => setShowEntryForm(false)} disabled={entryBusy}>
                  Cancel
                </button>
                <button style={s.btnPrimary} onClick={handleAddEntry} disabled={entryBusy}>
                  {entryBusy ? "Saving…" : "Save Entry"}
                </button>
              </div>
            </div>
          )}

          {/* Open entries list */}
          {summary && summary.openEntries.length === 0 ? (
            <p style={{ color: "#94a3b8", marginTop: 16 }}>No open entries — all caught up.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Type</th>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Description</th>
                    <th style={s.th}>Recipient</th>
                    <th style={s.th}>Driver</th>
                    <th style={s.th}>Recorded By</th>
                    <th style={s.th}>Slip</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.openEntries ?? []).map(e => (
                    <tr key={e.entryId} style={s.tr}>
                      <td style={s.td}>{e.entryDate}</td>
                      <td style={s.td}>
                        <span style={e.type === "In" ? s.badgeIn : s.badgeOut}>{e.type}</span>
                      </td>
                      <td style={s.td}><span style={s.badgeCat}>{e.category}</span></td>
                      <td style={s.td}>{e.description}</td>
                      <td style={s.td}>{e.recipientName || "—"}</td>
                      <td style={s.td}>{e.assignedDriverId || "—"}</td>
                      <td style={s.td}>{e.recordedBy}</td>
                      <td style={s.td}>{e.slipS3Key ? <span style={s.badgeCashedUp}>Uploaded</span> : <span style={{ color: "#94a3b8", fontSize: 12 }}>None</span>}</td>
                      <td style={{ ...s.td, textAlign: "right", color: e.type === "In" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                        {e.type === "In" ? "+" : "-"}{fmt(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All entries section */}
          <div style={{ marginTop: 32 }}>
            <h2 style={s.subHeading}>All Entries</h2>
            {entries.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No entries yet.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>Category</th>
                      <th style={s.th}>Description</th>
                      <th style={s.th}>Recipient</th>
                      <th style={s.th}>Recorded By</th>
                      <th style={s.th}>Status</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.entryId} style={s.tr}>
                        <td style={s.td}>{e.entryDate}</td>
                        <td style={s.td}>
                          <span style={e.type === "In" ? s.badgeIn : s.badgeOut}>{e.type}</span>
                        </td>
                        <td style={s.td}><span style={s.badgeCat}>{e.category}</span></td>
                        <td style={s.td}>{e.description}</td>
                        <td style={s.td}>{e.recipientName || "—"}</td>
                        <td style={s.td}>{e.recordedBy}</td>
                        <td style={s.td}>
                          {e.cashupId ? (
                            <span style={s.badgeCashedUp}>Cashed Up</span>
                          ) : (
                            <span style={s.badgeOpen}>Open</span>
                          )}
                        </td>
                        <td style={{ ...s.td, textAlign: "right", color: e.type === "In" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                          {e.type === "In" ? "+" : "-"}{fmt(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DO CASHUP ── */}
      {tab === "cashup" && (
        <div style={s.cashupWrap}>
          {cashupDone ? (
            <div style={s.cashupSuccess}>
              <div style={s.successIcon}>✓</div>
              <h2 style={{ margin: "0 0 8px", color: "#fff" }}>Cashup Complete</h2>
              <p style={{ color: "#94a3b8", margin: "0 0 20px" }}>Date: {cashupDone.cashupDate}</p>
              <div style={s.cashupResultGrid}>
                <div style={s.cashupResultItem}>
                  <span style={s.cashupResultLabel}>Opening Balance</span>
                  <span style={s.cashupResultVal}>{fmt(cashupDone.openingBalance)}</span>
                </div>
                <div style={s.cashupResultItem}>
                  <span style={s.cashupResultLabel}>+ Cash In</span>
                  <span style={{ ...s.cashupResultVal, color: "#22c55e" }}>{fmt(cashupDone.totalIn)}</span>
                </div>
                <div style={s.cashupResultItem}>
                  <span style={s.cashupResultLabel}>− Cash Out</span>
                  <span style={{ ...s.cashupResultVal, color: "#ef4444" }}>{fmt(cashupDone.totalOut)}</span>
                </div>
                <div style={s.cashupResultItem}>
                  <span style={s.cashupResultLabel}>Expected Balance</span>
                  <span style={s.cashupResultVal}>{fmt(cashupDone.expectedBalance)}</span>
                </div>
                <div style={s.cashupResultItem}>
                  <span style={s.cashupResultLabel}>Actual Balance</span>
                  <span style={s.cashupResultVal}>{fmt(cashupDone.actualBalance)}</span>
                </div>
                <div style={{ ...s.cashupResultItem, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
                  <span style={s.cashupResultLabel}>Variance</span>
                  <span style={{ ...s.cashupResultVal, color: cashupDone.variance === 0 ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
                    {cashupDone.variance >= 0 ? "+" : ""}{fmt(cashupDone.variance)}
                  </span>
                </div>
              </div>
              {cashupDone.notes && <p style={{ color: "#94a3b8", marginTop: 16 }}>Notes: {cashupDone.notes}</p>}
              <button style={{ ...s.btnPrimary, marginTop: 20 }} onClick={() => setCashupDone(null)}>
                Do Another Cashup
              </button>
            </div>
          ) : (
            <div style={s.cashupCard}>
              <h2 style={s.subHeading}>Perform Cashup</h2>

              {summary && summary.openEntryCount === 0 && (
                <div style={s.infoBox}>No open entries. There is nothing to cash up right now.</div>
              )}

              {summary && summary.openEntryCount > 0 && (
                <div style={s.summaryPreview}>
                  <div style={s.previewRow}>
                    <span>Opening Balance</span>
                    <strong>{fmt((cashups[0]?.actualBalance) ?? 0)}</strong>
                  </div>
                  <div style={s.previewRow}>
                    <span>+ Cash In</span>
                    <strong style={{ color: "#22c55e" }}>{fmt(summary.totalInSinceLastCashup)}</strong>
                  </div>
                  <div style={s.previewRow}>
                    <span>− Cash Out</span>
                    <strong style={{ color: "#ef4444" }}>{fmt(summary.totalOutSinceLastCashup)}</strong>
                  </div>
                  <div style={{ ...s.previewRow, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10, marginTop: 4 }}>
                    <span>Expected Balance</span>
                    <strong style={{ fontSize: 18 }}>{fmt(expectedBalance)}</strong>
                  </div>
                </div>
              )}

              {summary && summary.openEntryCount > 0 && (
                <>
                  <label style={{ ...s.label, marginTop: 20 }}>
                    Actual Cash Count (R) *
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      style={s.input}
                      placeholder="Enter the physical cash amount"
                      value={actualBalance}
                      onChange={e => setActualBalance(e.target.value)}
                    />
                  </label>

                  {actualBalance !== "" && !isNaN(actualNum) && variance !== null && (
                    <div style={{ ...s.varianceBox, borderColor: variance === 0 ? "#22c55e" : Math.abs(variance) < 10 ? "#f59e0b" : "#ef4444" }}>
                      <span>Variance: </span>
                      <strong style={{ color: variance === 0 ? "#22c55e" : Math.abs(variance) < 10 ? "#f59e0b" : "#ef4444" }}>
                        {variance >= 0 ? "+" : ""}{fmt(variance)}
                      </strong>
                      {variance === 0 && <span style={{ color: "#22c55e", marginLeft: 8 }}>All balanced!</span>}
                      {variance !== 0 && Math.abs(variance) < 10 && <span style={{ color: "#f59e0b", marginLeft: 8 }}>Small discrepancy</span>}
                      {Math.abs(variance) >= 10 && <span style={{ color: "#ef4444", marginLeft: 8 }}>Large discrepancy — check entries</span>}
                    </div>
                  )}

                  <label style={{ ...s.label, marginTop: 16 }}>
                    Notes (optional)
                    <textarea
                      style={{ ...s.input, height: 80, resize: "vertical" }}
                      placeholder="Any discrepancies or notes..."
                      value={cashupNotes}
                      onChange={e => setCashupNotes(e.target.value)}
                    />
                  </label>

                  {cashupError && <p style={s.errText}>{cashupError}</p>}

                  <button
                    style={{ ...s.btnPrimary, marginTop: 16, width: "100%" }}
                    onClick={handleCashup}
                    disabled={cashupBusy || !actualBalance}
                  >
                    {cashupBusy ? "Processing…" : `Confirm Cashup (${summary.openEntryCount} entries)`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CASHUP HISTORY ── */}
      {tab === "history" && (
        <div>
          <h2 style={s.subHeading}>Cashup History</h2>
          {cashups.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No cashups yet.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Opening</th>
                    <th style={{ ...s.th, textAlign: "right" }}>In</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Out</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Expected</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Actual</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Variance</th>
                    <th style={s.th}>Closed By</th>
                    <th style={s.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {cashups.map(c => (
                    <tr key={c.cashupId} style={s.tr}>
                      <td style={s.td}>{c.cashupDate}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>{fmt(c.openingBalance)}</td>
                      <td style={{ ...s.td, textAlign: "right", color: "#22c55e" }}>{fmt(c.totalIn)}</td>
                      <td style={{ ...s.td, textAlign: "right", color: "#ef4444" }}>{fmt(c.totalOut)}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>{fmt(c.expectedBalance)}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>{fmt(c.actualBalance)}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        <span style={{
                          color: c.variance === 0 ? "#22c55e" : Math.abs(c.variance) < 10 ? "#f59e0b" : "#ef4444",
                          fontWeight: 600,
                        }}>
                          {c.variance >= 0 ? "+" : ""}{fmt(c.variance)}
                        </span>
                      </td>
                      <td style={s.td}>{c.closedBy}</td>
                      <td style={s.td}>{c.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 24px 48px",
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#e2e8f0",
  },
  heading: {
    margin: "0 0 20px",
    fontSize: 26,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  subHeading: {
    margin: "0 0 16px",
    fontSize: 18,
    fontWeight: 600,
    color: "#f1f5f9",
  },
  custodyCard: {
    background: "#1e293b",
    border: "1px solid #22c55e",
    borderRadius: 14,
    padding: "20px 24px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  custodyLeft: { flex: 1 },
  custodyLabel: { fontSize: 15, fontWeight: 700, color: "#22c55e", marginBottom: 4 },
  custodySub: { fontSize: 12, color: "#64748b", marginBottom: 14 },
  custodyBreakdown: { display: "flex", flexDirection: "column" as const, gap: 6 },
  breakdownRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#94a3b8", gap: 32 },
  breakdownLabel: { color: "#64748b" },
  custodyRight: { textAlign: "right" as const },
  custodyTotal: { fontSize: 38, fontWeight: 900, lineHeight: 1 },
  kpiRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 28,
  },
  kpiCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "14px 20px",
    minWidth: 150,
    flex: "1 1 150px",
  },
  kpiLabel: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  tabs: {
    display: "flex",
    gap: 4,
    marginBottom: 24,
    borderBottom: "1px solid #334155",
  },
  tab: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    padding: "10px 18px",
    borderBottom: "2px solid transparent",
    transition: "color 0.15s",
  },
  tabActive: {
    color: "#22c55e",
    borderBottom: "2px solid #22c55e",
    fontWeight: 600,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  formCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 20,
    marginBottom: 24,
  },
  formTitle: {
    margin: "0 0 16px",
    fontSize: 16,
    fontWeight: 600,
    color: "#f1f5f9",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 14,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: 500,
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
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
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
  errText: {
    color: "#ef4444",
    fontSize: 13,
    margin: "0 0 12px",
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 8,
    border: "1px solid #334155",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    background: "#1e293b",
    color: "#94a3b8",
    fontWeight: 600,
    padding: "10px 12px",
    textAlign: "left",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #334155",
  },
  tr: {
    borderBottom: "1px solid #1e293b",
  },
  td: {
    padding: "10px 12px",
    color: "#e2e8f0",
    verticalAlign: "middle",
  },
  badgeIn: {
    background: "rgba(34,197,94,0.15)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 4,
    padding: "2px 7px",
    fontSize: 12,
    fontWeight: 600,
  },
  badgeOut: {
    background: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 4,
    padding: "2px 7px",
    fontSize: 12,
    fontWeight: 600,
  },
  badgeCat: {
    background: "rgba(99,102,241,0.15)",
    color: "#818cf8",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 4,
    padding: "2px 7px",
    fontSize: 12,
  },
  badgeOpen: {
    background: "rgba(245,158,11,0.15)",
    color: "#f59e0b",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 4,
    padding: "2px 7px",
    fontSize: 12,
  },
  badgeCashedUp: {
    background: "rgba(34,197,94,0.1)",
    color: "#4ade80",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "2px 7px",
    fontSize: 12,
  },
  cashupWrap: {
    maxWidth: 560,
  },
  cashupCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 24,
  },
  summaryPreview: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
    color: "#e2e8f0",
  },
  varianceBox: {
    background: "#0f172a",
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: "#e2e8f0",
  },
  infoBox: {
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.3)",
    color: "#a5b4fc",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 14,
    marginBottom: 16,
  },
  cashupSuccess: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 28,
    textAlign: "center",
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.15)",
    border: "2px solid #22c55e",
    color: "#22c55e",
    fontSize: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  cashupResultGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    textAlign: "left",
    marginTop: 8,
  },
  cashupResultItem: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "#e2e8f0",
  },
  cashupResultLabel: {
    color: "#94a3b8",
  },
  cashupResultVal: {
    fontWeight: 600,
    fontSize: 15,
  },
};
