import React, { useEffect, useState } from "react";
import { costAveragesApi } from "../api/costAveragesApi";
import type { CostAverageRecordDto } from "../api/costAveragesApi";
import { speciesApi } from "../api/speciesApi";
import type { SpeciesResponse } from "../api/speciesApi";

const fmt = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const fmt2 = (n: number) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-ZA", { dateStyle: "medium" });

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.0001) return <span style={s.neutral}>No change</span>;
  const up = delta > 0;
  return (
    <span style={up ? s.up : s.down}>
      {up ? "▲" : "▼"} {fmt2(Math.abs(delta))}
    </span>
  );
}

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

type Tab = "calculate" | "report";

export default function CostAveragesPage() {
  const [tab, setTab] = useState<Tab>("calculate");

  // Calculate tab
  const [calcYear,  setCalcYear]  = useState(currentYear);
  const [calcMonth, setCalcMonth] = useState(currentMonth);
  const [apply, setApply]         = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [calcResults, setCalcResults] = useState<CostAverageRecordDto[] | null>(null);
  const [calcError, setCalcError]     = useState("");

  // Report tab
  const [allRecords, setAllRecords]       = useState<CostAverageRecordDto[]>([]);
  const [species, setSpecies]             = useState<SpeciesResponse[]>([]);
  const [filterSpecies, setFilterSpecies] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError]     = useState("");
  const [expanded, setExpanded]           = useState<string | null>(null); // speciesId+month key

  // Load species list for the filter dropdown
  useEffect(() => {
    speciesApi.list().then(setSpecies).catch(() => {});
  }, []);

  async function runCalculation() {
    setCalculating(true);
    setCalcError("");
    setCalcResults(null);
    try {
      const results = await costAveragesApi.calculate({
        year: calcYear,
        month: calcMonth,
        applyToSpecies: apply,
      });
      setCalcResults(results);
    } catch (err: unknown) {
      setCalcError((err as { message?: string })?.message ?? "Calculation failed.");
    } finally {
      setCalculating(false);
    }
  }

  async function loadReport() {
    setLoadingReport(true);
    setReportError("");
    try {
      const data = await costAveragesApi.getHistory(filterSpecies || undefined);
      setAllRecords(data);
    } catch {
      setReportError("Failed to load history.");
    } finally {
      setLoadingReport(false);
    }
  }

  useEffect(() => {
    if (tab === "report") loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Group report records by species
  const bySpecies = React.useMemo(() => {
    const filtered = filterSpecies
      ? allRecords.filter(r => r.speciesId === filterSpecies)
      : allRecords;

    const map = new Map<string, CostAverageRecordDto[]>();
    for (const r of filtered) {
      const arr = map.get(r.speciesId) ?? [];
      arr.push(r);
      map.set(r.speciesId, arr);
    }
    return [...map.entries()].sort(([, a], [, b]) =>
      a[0].speciesName.localeCompare(b[0].speciesName));
  }, [allRecords, filterSpecies]);

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Unit Cost Averages</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            Weighted-average cost per species over a calendar month — pulled from procurement orders and slaughter batches.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={tab === "calculate" ? s.tabActive : s.tab} onClick={() => setTab("calculate")}>Calculate</button>
          <button style={tab === "report"    ? s.tabActive : s.tab} onClick={() => setTab("report")}>History Report</button>
        </div>
      </div>

      {/* ── Calculate Tab ──────────────────────────────────────────────────── */}
      {tab === "calculate" && (
        <div>
          <div style={s.card}>
            <h3 style={s.sectionTitle}>Run Monthly Calculation</h3>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
              Scans all completed procurement orders and slaughter batches in the selected month,
              calculates the weighted-average cost per species, and optionally updates each species' unit cost.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={s.field}>
                <label style={s.label}>Month</label>
                <select style={s.select} value={calcMonth} onChange={e => setCalcMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Year</label>
                <input
                  style={{ ...s.input, width: 90 }}
                  type="number" inputMode="decimal"
                  min={2020}
                  max={2100}
                  value={calcYear}
                  onChange={e => setCalcYear(Number(e.target.value))}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                <input
                  id="applyCheck"
                  type="checkbox"
                  checked={apply}
                  onChange={e => setApply(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label htmlFor="applyCheck" style={{ fontSize: 14, color: "#1e293b", cursor: "pointer" }}>
                  Update species unit cost to calculated average
                </label>
              </div>
              <button style={s.runBtn} onClick={runCalculation} disabled={calculating}>
                {calculating ? "Calculating..." : "Run Calculation"}
              </button>
            </div>

            {calcError && <div style={s.errorBox}>{calcError}</div>}
          </div>

          {/* Results */}
          {calcResults !== null && (
            <div style={{ marginTop: 20 }}>
              {calcResults.length === 0 ? (
                <div style={s.empty}>
                  No stock movements found for {MONTHS[calcMonth - 1]} {calcYear}. No averages were calculated.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10, fontSize: 14, color: "#475569" }}>
                    <strong>{calcResults.length}</strong> species updated for{" "}
                    <strong>{MONTHS[calcMonth - 1]} {calcYear}</strong>
                    {apply && <span style={{ color: "#22c55e", marginLeft: 8 }}>✓ Unit costs applied</span>}
                  </div>
                  <ResultsTable records={calcResults} expanded={expanded} setExpanded={setExpanded} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Report Tab ─────────────────────────────────────────────────────── */}
      {tab === "report" && (
        <div>
          {/* Filter bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={s.field}>
              <label style={s.label}>Filter by Species</label>
              <select
                style={s.select}
                value={filterSpecies}
                onChange={e => { setFilterSpecies(e.target.value); }}
              >
                <option value="">All species</option>
                {species.map(sp => (
                  <option key={sp.speciesId} value={sp.speciesId}>{sp.name}</option>
                ))}
              </select>
            </div>
            <button style={s.runBtn} onClick={loadReport} disabled={loadingReport}>
              {loadingReport ? "Loading..." : "Refresh"}
            </button>
          </div>

          {reportError && <div style={s.errorBox}>{reportError}</div>}
          {loadingReport && <div style={{ color: "#64748b" }}>Loading...</div>}

          {!loadingReport && bySpecies.length === 0 && !reportError && (
            <div style={s.empty}>No cost average records found. Run a calculation first.</div>
          )}

          {bySpecies.map(([speciesId, records]) => (
            <div key={speciesId} style={{ marginBottom: 28 }}>
              <div style={s.speciesHeader}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{records[0].speciesName}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{records.length} month{records.length !== 1 ? "s" : ""} of data</span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Month</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Prior Cost (ex-VAT)</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Avg Cost (ex-VAT)</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Avg Cost (inc-VAT)</th>
                      <th style={{ ...s.th, textAlign: "right" }}>VAT %</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Δ Change</th>
                      <th style={{ ...s.th, textAlign: "center" }}>Applied</th>
                      <th style={{ ...s.th, textAlign: "center" }}>Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => {
                      const key = r.speciesId + r.month;
                      return (
                        <React.Fragment key={key}>
                          <tr>
                            <td style={s.td}>
                              <strong>{r.month}</strong>
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                calc {fmtDate(r.calculatedAt)}
                              </div>
                            </td>
                            <td style={{ ...s.td, textAlign: "right" }}>{r.totalQty}</td>
                            <td style={{ ...s.td, textAlign: "right", color: "#64748b" }}>{fmt(r.priorUnitCost)}</td>
                            <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(r.avgCostExVat)}</td>
                            <td style={{ ...s.td, textAlign: "right", color: "#2563eb" }}>{fmt(r.avgCostIncVat)}</td>
                            <td style={{ ...s.td, textAlign: "right", color: "#94a3b8" }}>
                              {(r.vatRate * 100).toFixed(0)}%
                            </td>
                            <td style={{ ...s.td, textAlign: "right" }}><DeltaBadge delta={r.costDelta} /></td>
                            <td style={{ ...s.td, textAlign: "center" }}>
                              {r.appliedToSpecies
                                ? <span style={s.applied}>✓ Yes</span>
                                : <span style={s.notApplied}>No</span>}
                            </td>
                            <td style={{ ...s.td, textAlign: "center" }}>
                              <button
                                style={s.expandBtn}
                                onClick={() => setExpanded(e => e === key ? null : key)}
                              >
                                {expanded === key ? "Hide" : `${r.sources.length} line${r.sources.length !== 1 ? "s" : ""}`}
                              </button>
                            </td>
                          </tr>
                          {expanded === key && (
                            <tr>
                              <td colSpan={9} style={{ ...s.td, background: "#f8fafc", padding: 0 }}>
                                <SourcesTable sources={r.sources} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function ResultsTable({
  records,
  expanded,
  setExpanded,
}: {
  records: CostAverageRecordDto[];
  expanded: string | null;
  setExpanded: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Species</th>
            <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
            <th style={{ ...s.th, textAlign: "right" }}>Prior Cost</th>
            <th style={{ ...s.th, textAlign: "right" }}>Avg (ex-VAT)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Avg (inc-VAT)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Δ Change</th>
            <th style={{ ...s.th, textAlign: "center" }}>Sources</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => {
            const key = r.speciesId + r.month;
            return (
              <React.Fragment key={key}>
                <tr>
                  <td style={s.td}><strong>{r.speciesName}</strong></td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.totalQty}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#64748b" }}>{fmt(r.priorUnitCost)}</td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(r.avgCostExVat)}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#2563eb" }}>{fmt(r.avgCostIncVat)}</td>
                  <td style={{ ...s.td, textAlign: "right" }}><DeltaBadge delta={r.costDelta} /></td>
                  <td style={{ ...s.td, textAlign: "center" }}>
                    <button
                      style={s.expandBtn}
                      onClick={() => setExpanded(e => e === key ? null : key)}
                    >
                      {expanded === key ? "Hide" : `${r.sources.length} line${r.sources.length !== 1 ? "s" : ""}`}
                    </button>
                  </td>
                </tr>
                {expanded === key && (
                  <tr>
                    <td colSpan={7} style={{ ...s.td, background: "#f8fafc", padding: 0 }}>
                      <SourcesTable sources={r.sources} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourcesTable({ sources }: { sources: CostAverageRecordDto["sources"] }) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Contributing lines
      </div>
      <table style={{ ...s.table, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={s.th}>Source</th>
            <th style={s.th}>Reference</th>
            <th style={s.th}>Date</th>
            <th style={{ ...s.th, textAlign: "right" }}>Qty</th>
            <th style={{ ...s.th, textAlign: "right" }}>Unit Cost (ex-VAT)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((src, i) => (
            <tr key={i}>
              <td style={s.td}>
                <span style={src.source === "ProcurementOrder" ? s.srcBadgePO : s.srcBadgeSL}>
                  {src.source === "ProcurementOrder" ? "Procurement" : "Slaughter"}
                </span>
              </td>
              <td style={{ ...s.td, color: "#64748b" }}>{src.sourceRef || src.sourceId.slice(0, 8) + "…"}</td>
              <td style={s.td}>{fmtDate(src.date)}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{src.qty}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{fmt(src.unitCostExVat)}</td>
              <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{fmt(src.qty * src.unitCostExVat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "18px 20px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: 15,
    fontWeight: 700,
    color: "#1e293b",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  input: {
    padding: "7px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  },
  select: {
    padding: "7px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    background: "#fff",
    minWidth: 160,
  },
  runBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 22px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    alignSelf: "flex-end",
  },
  errorBox: {
    marginTop: 12,
    color: "#ef4444",
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
  },
  empty: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "40px 24px",
    textAlign: "center",
    color: "#64748b",
    fontSize: 15,
  },
  tab: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 7,
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  tabActive: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "6px 10px",
    borderBottom: "2px solid #e2e8f0",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
    background: "#f8fafc",
  },
  td: {
    padding: "10px",
    borderBottom: "1px solid #f1f5f9",
    color: "#1e293b",
    verticalAlign: "middle" as const,
  },
  speciesHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    padding: "6px 2px",
    borderBottom: "2px solid #2563eb",
  },
  neutral: { color: "#94a3b8", fontSize: 12 },
  up:      { color: "#ef4444", fontWeight: 600, fontSize: 12 },
  down:    { color: "#22c55e", fontWeight: 600, fontSize: 12 },
  applied:    { color: "#16a34a", fontSize: 12, fontWeight: 600 },
  notApplied: { color: "#94a3b8", fontSize: 12 },
  expandBtn: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 5,
    padding: "3px 10px",
    fontSize: 11,
    cursor: "pointer",
    color: "#475569",
    whiteSpace: "nowrap" as const,
  },
  srcBadgePO: {
    background: "rgba(37,99,235,0.1)",
    color: "#1e3a8a",
    borderRadius: 5,
    padding: "2px 7px",
    fontSize: 11,
    fontWeight: 600,
  },
  srcBadgeSL: {
    background: "rgba(124,58,237,0.1)",
    color: "#4c1d95",
    borderRadius: 5,
    padding: "2px 7px",
    fontSize: 11,
    fontWeight: 600,
  },
};
