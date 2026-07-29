import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { aiReportsApi } from "../api/aiReportsApi";
import type { AiReportResult } from "../api/aiReportsApi";

const EXAMPLE_PROMPTS = [
  "List all clients with outstanding balances",
  "Show me a sales summary for this month",
  "Which clients have the highest outstanding balances?",
  "Show all unpaid invoices",
  "Give me the current petty cash summary",
  "List all collection requests with dead stock",
  "Show cash sales vs EFT sales",
];

const STORAGE_KEY = "mooks_saved_reports";

type SavedReport = {
  id: string;
  name: string;
  prompt: string;
  savedAt: string;
};

function loadSaved(): SavedReport[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function persistSaved(reports: SavedReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export default function AiReportsPage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AiReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Saved reports
  const [saved, setSaved] = useState<SavedReport[]>(loadSaved);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saveMode) setTimeout(() => saveInputRef.current?.focus(), 50);
  }, [saveMode]);

  function handleSave() {
    const name = saveName.trim();
    if (!name || !prompt.trim()) return;
    const next: SavedReport[] = [
      { id: crypto.randomUUID(), name, prompt: prompt.trim(), savedAt: new Date().toISOString() },
      ...saved,
    ];
    setSaved(next);
    persistSaved(next);
    setSaveMode(false);
    setSaveName("");
  }

  function deleteSaved(id: string) {
    const next = saved.filter(r => r.id !== id);
    setSaved(next);
    persistSaved(next);
  }

  function loadSavedReport(r: SavedReport) {
    setPrompt(r.prompt);
    setResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function runReport(p = prompt) {
    if (!p.trim()) return;
    setPrompt(p);
    setLoading(true);
    setError("");
    setResult(null);
    setSaveMode(false);
    try {
      const res = await aiReportsApi.query(p.trim());
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  }

  function downloadXlsx() {
    if (!result || result.columns.length === 0) return;
    const data = [result.columns, ...result.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "6366F1" } },
      alignment: { horizontal: "center" },
    };
    result.columns.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });
    ws["!cols"] = result.columns.map((col, ci) => ({
      wch: Math.max(col.length, ...result.rows.map(row => String(row[ci] ?? "").length)) + 2,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, prompt.slice(0, 31) || "Report");
    XLSX.writeFile(wb, `report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.heroRow}>
          <img src="/mooks.png" alt="Mooks" style={s.heroImg} />
          <div>
            <h1 style={s.heading}>Ask Mooks</h1>
            <p style={s.sub}>Ask a question in plain English — Mooks queries your live data and builds the report.</p>
          </div>
        </div>
      </div>

      {/* Prompt input */}
      <div style={s.inputCard}>
        <textarea
          style={s.textarea}
          placeholder="e.g. Give me a list of all clients with outstanding balances"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runReport(); }}
          rows={3}
          disabled={loading}
        />
        <div style={s.inputFooter}>
          <span style={s.hint}>Ctrl+Enter to run</span>
          <button
            style={{ ...s.btnRun, opacity: loading || !prompt.trim() ? 0.6 : 1 }}
            onClick={() => runReport()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <span style={s.runLabel}><span style={s.spinner} /> Analysing…</span>
            ) : "Run Report"}
          </button>
        </div>
      </div>

      {/* Example prompts (only when no result) */}
      {!result && !loading && (
        <div style={s.examples}>
          <div style={s.examplesLabel}>Try an example:</div>
          <div style={s.chips}>
            {EXAMPLE_PROMPTS.map(p => (
              <button key={p} style={s.chip} onClick={() => setPrompt(p)}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {error && <div style={s.errorBox}>{error}</div>}

      {loading && (
        <div style={s.loadingBox}>
          <div style={s.loadingDots}>
            <span style={{ ...s.dot, animationDelay: "0ms" }} />
            <span style={{ ...s.dot, animationDelay: "200ms" }} />
            <span style={{ ...s.dot, animationDelay: "400ms" }} />
          </div>
          <p style={s.loadingText}>Querying your data…</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div style={s.resultSection}>
          {/* Narrative */}
          <div style={s.narrativeCard}>
            <img src="/mooks.png" alt="Mooks" style={s.narrativeAvatar} />
            <p style={s.narrativeText}>{result.narrative}</p>
          </div>

          {/* Table */}
          {result.columns.length > 0 && (
            <>
              <div style={s.tableHeader}>
                <span style={s.rowCount}>{result.rows.length} row{result.rows.length !== 1 ? "s" : ""}</span>
                <button style={s.btnDownload} onClick={downloadXlsx}>↓ Download Excel</button>
              </div>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>{result.columns.map(col => <th key={col} style={s.th}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} style={ri % 2 === 0 ? s.trEven : s.trOdd}>
                        {row.map((cell, ci) => <td key={ci} style={s.td}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Save report */}
          <div style={s.saveRow}>
            {!saveMode ? (
              <button style={s.btnSave} onClick={() => { setSaveName(""); setSaveMode(true); }}>
                🔖 Save this report
              </button>
            ) : (
              <div style={s.saveForm}>
                <input
                  ref={saveInputRef}
                  style={s.saveInput}
                  placeholder="Report name…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaveMode(false); }}
                  maxLength={80}
                />
                <button
                  style={{ ...s.btnRun, padding: "8px 18px", opacity: saveName.trim() ? 1 : 0.5 }}
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                >
                  Save
                </button>
                <button style={s.btnCancelSave} onClick={() => setSaveMode(false)}>Cancel</button>
              </div>
            )}

            <button style={s.btnNew} onClick={() => { setResult(null); setPrompt(""); setSaveMode(false); }}>
              + New Report
            </button>
          </div>
        </div>
      )}

      {/* Saved reports */}
      {saved.length > 0 && (
        <div style={s.savedSection}>
          <div style={s.savedTitle}>🔖 Saved Reports</div>
          <div style={s.savedGrid}>
            {saved.map(r => (
              <div key={r.id} style={s.savedCard}>
                <div style={s.savedCardName}>{r.name}</div>
                <div style={s.savedCardPrompt}>{r.prompt}</div>
                <div style={s.savedCardFooter}>
                  <span style={s.savedCardDate}>
                    {new Date(r.savedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={s.btnRunSaved} onClick={() => runReport(r.prompt)}>▶ Run</button>
                    <button style={s.btnDeleteSaved} onClick={() => deleteSaved(r.id)} title="Delete">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "28px 28px 60px", maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b" },
  header: { marginBottom: 24 },
  heroRow: { display: "flex", alignItems: "center", gap: 16 },
  heroImg: { width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: "0 2px 12px rgba(99,102,241,0.25)" },
  heading: { margin: "0 0 6px", fontSize: 26, fontWeight: 700, color: "#0f172a" },
  sub: { margin: 0, color: "#64748b", fontSize: 14 },

  inputCard: { background: "#fff", border: "2px solid #6366f1", borderRadius: 12, overflow: "hidden", marginBottom: 20, boxShadow: "0 4px 20px rgba(99,102,241,0.1)" },
  textarea: { width: "100%", border: "none", outline: "none", resize: "none", padding: "16px 18px", fontSize: 15, lineHeight: 1.6, color: "#1e293b", background: "transparent", boxSizing: "border-box", fontFamily: "inherit" },
  inputFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" },
  hint: { fontSize: 12, color: "#94a3b8" },
  btnRun: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  runLabel: { display: "flex", alignItems: "center", gap: 8 },
  spinner: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" },

  examples: { marginBottom: 32 },
  examplesLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 14px", fontSize: 13, color: "#475569", cursor: "pointer" },

  errorBox: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#dc2626", borderRadius: 8, padding: "12px 16px", fontSize: 14, marginBottom: 20 },
  loadingBox: { display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 16 },
  loadingDots: { display: "flex", gap: 8 },
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#6366f1", animation: "bounce 1.4s ease-in-out infinite" },
  loadingText: { color: "#64748b", fontSize: 14, margin: 0 },

  resultSection: { display: "flex", flexDirection: "column", gap: 16 },
  narrativeCard: { display: "flex", gap: 14, alignItems: "flex-start", background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "16px 18px" },
  narrativeAvatar: { width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginTop: 2 },
  narrativeText: { margin: 0, fontSize: 14, lineHeight: 1.7, color: "#1e293b" },

  tableHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rowCount: { fontSize: 13, color: "#64748b" },
  btnDownload: { background: "#fff", border: "1px solid #6366f1", color: "#6366f1", borderRadius: 7, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tableWrap: { overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: "#f8fafc", color: "#475569", fontWeight: 600, padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap", borderBottom: "2px solid #e2e8f0" },
  trEven: { background: "#fff" },
  trOdd:  { background: "#f8fafc" },
  td: { padding: "10px 14px", color: "#1e293b", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },

  saveRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  btnSave: { background: "#fff", border: "1px solid #6366f1", color: "#6366f1", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  saveForm: { display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap" },
  saveInput: { flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1px solid #6366f1", fontSize: 14, outline: "none" },
  btnCancelSave: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "#64748b", cursor: "pointer" },
  btnNew: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", fontSize: 14, color: "#475569", cursor: "pointer" },

  savedSection: { marginTop: 40, paddingTop: 32, borderTop: "1px solid #e2e8f0" },
  savedTitle: { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  savedGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  savedCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  savedCardName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  savedCardPrompt: { fontSize: 12, color: "#64748b", lineHeight: 1.5, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const },
  savedCardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  savedCardDate: { fontSize: 11, color: "#94a3b8" },
  btnRunSaved: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnDeleteSaved: { background: "none", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, color: "#dc2626", cursor: "pointer", fontSize: 12, padding: "4px 8px", fontWeight: 700 },
};
