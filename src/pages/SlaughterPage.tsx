import React, { useEffect, useState } from "react";
import { slaughterApi } from "../api/slaughterApi";
import type { SlaughterBatchDto, SlaughterYieldLineRequest } from "../api/slaughterApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";

const fmt = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

// ── Empty yield line ──────────────────────────────────────────────────────────

const emptyYield = (): SlaughterYieldLineRequest & { _key: number } => ({
  _key: Date.now() + Math.random(),
  speciesId: "",
  qty: 1,
  unitCost: 0,
  unitPrice: 0,
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function SlaughterPage() {
  const [tab, setTab] = useState<"history" | "new">("history");
  const [batches, setBatches] = useState<SlaughterBatchDto[]>([]);
  const [species, setSpecies] = useState<SpeciesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [sourceSpeciesId, setSourceSpeciesId] = useState("");
  const [sourceQty, setSourceQty] = useState(1);
  const [sourceUnitCost, setSourceUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [yields, setYields] = useState<(SlaughterYieldLineRequest & { _key: number })[]>([emptyYield()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([slaughterApi.list(), speciesApi.list()])
      .then(([b, sp]) => {
        setBatches(b);
        setSpecies(sp.filter(s => s.isActive));
      })
      .catch(() => setError("Failed to load data."))
      .finally(() => setLoading(false));
  }, []);

  const activeSpecies = species.filter(s => s.isActive);
  const sourceSpecies = activeSpecies.find(s => s.speciesId === sourceSpeciesId);

  function setYieldField(key: number, field: keyof SlaughterYieldLineRequest, value: string | number) {
    setYields(prev => prev.map(y => y._key === key ? { ...y, [field]: value } : y));
  }

  function addYieldLine() {
    setYields(prev => [...prev, emptyYield()]);
  }

  function removeYieldLine(key: number) {
    setYields(prev => prev.filter(y => y._key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!sourceSpeciesId) { setFormError("Select a source species."); return; }
    if (sourceQty < 1)    { setFormError("Source quantity must be at least 1."); return; }
    if (yields.length === 0) { setFormError("Add at least one yield line."); return; }

    for (const y of yields) {
      if (!y.speciesId)  { setFormError("Select a species for every yield line."); return; }
      if (y.qty < 1)     { setFormError("Yield quantities must be at least 1."); return; }
    }

    setSubmitting(true);
    try {
      const batch = await slaughterApi.create({
        sourceSpeciesId,
        sourceQty,
        sourceUnitCost: sourceUnitCost !== "" ? parseFloat(sourceUnitCost) : undefined,
        yields: yields.map(({ _key, ...rest }) => rest),
        notes: notes || undefined,
      });
      setBatches(prev => [batch, ...prev]);
      // Reset form
      setSourceSpeciesId("");
      setSourceQty(1);
      setSourceUnitCost("");
      setNotes("");
      setYields([emptyYield()]);
      setTab("history");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Failed to record slaughter batch.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header + tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Slaughter & Processing</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            Record the breakdown of a live bird into its yield cuts. Stock is adjusted automatically.
          </p>
        </div>
        <button
          style={tab === "new" ? s.tabBtnActive : s.tabBtn}
          onClick={() => setTab(t => t === "new" ? "history" : "new")}
        >
          {tab === "new" ? "← Back to History" : "+ New Batch"}
        </button>
      </div>

      {loading && <div style={{ color: "#64748b" }}>Loading...</div>}
      {error  && <div style={{ color: "#ef4444" }}>{error}</div>}

      {/* ── New Batch Form ──────────────────────────────────────────────────── */}
      {tab === "new" && (
        <form onSubmit={handleSubmit} style={s.card}>
          <h3 style={s.sectionTitle}>Source (what is being slaughtered)</h3>

          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Species *</label>
              <select
                style={s.select}
                value={sourceSpeciesId}
                onChange={e => {
                  setSourceSpeciesId(e.target.value);
                  const sp = activeSpecies.find(s => s.speciesId === e.target.value);
                  if (sp) setSourceUnitCost(sp.unitCost.toFixed(2));
                }}
                required
              >
                <option value="">Select species...</option>
                {activeSpecies.map(sp => (
                  <option key={sp.speciesId} value={sp.speciesId}>
                    {sp.name} — {sp.qtyOnHandHub} on hand
                  </option>
                ))}
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Quantity *</label>
              <input
                style={s.input}
                type="number" inputMode="decimal"
                min={1}
                value={sourceQty}
                onChange={e => setSourceQty(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Unit Cost (R, ex-VAT)</label>
              <input
                style={s.input}
                type="number" inputMode="decimal"
                step="0.01"
                min={0}
                placeholder={sourceSpecies ? sourceSpecies.unitCost.toFixed(2) : "0.00"}
                value={sourceUnitCost}
                onChange={e => setSourceUnitCost(e.target.value)}
              />
              {sourceSpecies && (
                <span style={s.hint}>
                  {sourceSpecies.qtyOnHandHub} on hand — default cost {fmt(sourceSpecies.unitCost)}
                </span>
              )}
            </div>
          </div>

          {/* Yield lines */}
          <h3 style={{ ...s.sectionTitle, marginTop: 24 }}>Yield Cuts (what comes out)</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: -8, marginBottom: 12 }}>
            Prices set here will update the species default cost &amp; selling price.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Species</th>
                  <th style={{ ...s.th, width: 90 }}>Qty</th>
                  <th style={{ ...s.th, width: 140 }}>Cost Price (R, ex-VAT)</th>
                  <th style={{ ...s.th, width: 140 }}>Selling Price (R, ex-VAT)</th>
                  <th style={{ ...s.th, width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {yields.map(y => {
                  const ysp = activeSpecies.find(s => s.speciesId === y.speciesId);
                  return (
                    <tr key={y._key}>
                      <td style={s.td}>
                        <select
                          style={{ ...s.select, margin: 0 }}
                          value={y.speciesId}
                          onChange={e => {
                            const sp = activeSpecies.find(s => s.speciesId === e.target.value);
                            setYields(prev => prev.map(line =>
                              line._key === y._key
                                ? { ...line, speciesId: e.target.value, unitCost: sp?.unitCost ?? 0, unitPrice: sp?.sellPrice ?? 0 }
                                : line
                            ));
                          }}
                          required
                        >
                          <option value="">Select...</option>
                          {activeSpecies.map(sp => (
                            <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>
                          ))}
                        </select>
                        {ysp && <div style={s.hint}>{ysp.qtyOnHandHub} on hand</div>}
                      </td>
                      <td style={s.td}>
                        <input
                          style={{ ...s.input, width: 70, textAlign: "right" }}
                          type="number" inputMode="decimal"
                          min={1}
                          value={y.qty}
                          onChange={e => setYieldField(y._key, "qty", parseInt(e.target.value) || 1)}
                          required
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          style={{ ...s.input, width: 110, textAlign: "right" }}
                          type="number" inputMode="decimal"
                          step="0.01"
                          min={0}
                          value={y.unitCost}
                          onFocus={e => e.target.select()}
                          onChange={e => setYieldField(y._key, "unitCost", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          style={{ ...s.input, width: 110, textAlign: "right" }}
                          type="number" inputMode="decimal"
                          step="0.01"
                          min={0}
                          value={y.unitPrice}
                          onFocus={e => e.target.select()}
                          onChange={e => setYieldField(y._key, "unitPrice", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td style={s.td}>
                        {yields.length > 1 && (
                          <button
                            type="button"
                            style={s.removeBtn}
                            onClick={() => removeYieldLine(y._key)}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" style={s.addLineBtn} onClick={addYieldLine}>
            + Add yield cut
          </button>

          <div style={{ marginTop: 20 }}>
            <label style={s.label}>Notes (optional)</label>
            <input
              style={{ ...s.input, width: "100%" }}
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. batch from morning slaughter"
            />
          </div>

          {formError && <div style={s.formError}>{formError}</div>}

          <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" style={s.cancelBtn} onClick={() => setTab("history")}>Cancel</button>
            <button type="submit" style={s.submitBtn} disabled={submitting}>
              {submitting ? "Recording..." : "Record Slaughter Batch"}
            </button>
          </div>
        </form>
      )}

      {/* ── History ─────────────────────────────────────────────────────────── */}
      {tab === "history" && !loading && (
        <>
          {batches.length === 0 && (
            <div style={s.emptyState}>No slaughter batches recorded yet.</div>
          )}

          {batches.map(b => (
            <div key={b.batchId} style={s.card}>
              <div
                style={s.batchHeader}
                onClick={() => setExpanded(e => e === b.batchId ? null : b.batchId)}
              >
                <div>
                  <span style={s.batchTitle}>{b.sourceQty}× {b.sourceSpeciesName}</span>
                  <span style={s.badge}>Total input: {fmt(b.totalInputCost)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>{fmtDate(b.slaughteredAtUtc)}</span>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{expanded === b.batchId ? "▲" : "▾"}</span>
                </div>
              </div>

              {expanded === b.batchId && (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ marginBottom: 10, color: "#64748b", fontSize: 13 }}>
                    Unit cost: {fmt(b.sourceUnitCost)} each
                    {b.notes && <> — <em>{b.notes}</em></>}
                  </div>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Yield Cut</th>
                        <th style={{ ...s.th, textAlign: "right" }}>Qty Added</th>
                        <th style={{ ...s.th, textAlign: "right" }}>Cost Price</th>
                        <th style={{ ...s.th, textAlign: "right" }}>Selling Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.yields.map(y => (
                        <tr key={y.speciesId}>
                          <td style={s.td}>{y.speciesName}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{y.qty}</td>
                          <td style={{ ...s.td, textAlign: "right", color: "#64748b" }}>{fmt(y.unitCost)}</td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(y.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 15,
    fontWeight: 700,
    color: "#1e293b",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: 6,
  },
  row: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minWidth: 180,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  hint: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 3,
  },
  input: {
    padding: "7px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    color: "#1e293b",
    outline: "none",
  },
  select: {
    padding: "7px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    color: "#1e293b",
    background: "#fff",
    marginBottom: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 14,
  },
  th: {
    textAlign: "left" as const,
    padding: "6px 8px",
    borderBottom: "2px solid #e2e8f0",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "8px",
    borderBottom: "1px solid #f1f5f9",
    color: "#1e293b",
    verticalAlign: "top" as const,
  },
  removeBtn: {
    background: "none",
    border: "1px solid #fca5a5",
    color: "#ef4444",
    borderRadius: 5,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12,
  },
  addLineBtn: {
    marginTop: 10,
    background: "none",
    border: "1px dashed #94a3b8",
    color: "#475569",
    borderRadius: 7,
    padding: "6px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
  formError: {
    color: "#ef4444",
    fontSize: 13,
    marginTop: 12,
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: 6,
    padding: "8px 12px",
  },
  cancelBtn: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 7,
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  submitBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 22px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabBtn: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  tabBtnActive: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  emptyState: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "40px 24px",
    textAlign: "center",
    color: "#64748b",
    fontSize: 15,
  },
  batchHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  batchTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: "#1e293b",
    marginRight: 10,
  },
  badge: {
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 500,
  },
};
