import React, { useEffect, useState } from "react";
import { dipTanksApi } from "../api/dipTanksApi";
import { sitesApi } from "../api/sitesApi";
import type { DipTankDto, DipReadingDto, TankSummaryDto, CreateDipTankRequest, CreateDipReadingRequest, LoadTankRequest } from "../api/dipTanksApi";
import type { SiteDto } from "../api/sitesApi";
import { hasAnyRole } from "../api/auth";

const canManage = () => hasAnyRole("Owner", "Admin");

type Tab = "tanks" | "readings";

function LevelBar({ pct, isLow }: { pct: number; isLow: boolean }) {
  const color = isLow ? "#ef4444" : pct < 40 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
    </div>
  );
}

const emptyTankForm = (): CreateDipTankRequest => ({
  name: "", description: "", siteId: "", fuelType: "diesel", capacityLitres: 0, lowQtyLitres: null,
});

const emptyReadingForm = (): CreateDipReadingRequest => ({
  tankId: "", readingLitres: 0, readingMm: null, notes: "",
});

export default function DipTanksPage() {
  const [tab, setTab] = useState<Tab>("tanks");
  const [tanks, setTanks] = useState<DipTankDto[]>([]);
  const [summary, setSummary] = useState<Record<string, TankSummaryDto>>({});
  const [readings, setReadings] = useState<DipReadingDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showTankForm, setShowTankForm] = useState(false);
  const [tankForm, setTankForm] = useState<CreateDipTankRequest>(emptyTankForm());
  const [tankFormError, setTankFormError] = useState("");
  const [tankBusy, setTankBusy] = useState(false);

  const [showReadingForm, setShowReadingForm] = useState(false);
  const [readingForm, setReadingForm] = useState<CreateDipReadingRequest>(emptyReadingForm());
  const [readingFormError, setReadingFormError] = useState("");
  const [readingBusy, setReadingBusy] = useState(false);

  const [loadingTankId, setLoadingTankId] = useState<string | null>(null);
  const [loadForm, setLoadForm] = useState<LoadTankRequest>({ litres: 0, costPerLitre: null, notes: "" });
  const [loadError, setLoadError] = useState("");
  const [loadBusy, setLoadBusy] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === "readings" && readings.length === 0) loadReadings(); }, [tab]);

  async function loadAll() {
    try {
      setLoading(true);
      const [t, s, sites_] = await Promise.all([
        dipTanksApi.listTanks(),
        dipTanksApi.getSummary(),
        sitesApi.list(),
      ]);
      setTanks(t);
      setSummary(Object.fromEntries(s.map(x => [x.tankId, x])));
      setSites(sites_);
    } catch { setError("Failed to load dip tanks."); }
    finally { setLoading(false); }
  }

  async function loadReadings() {
    try { setReadings(await dipTanksApi.listReadings()); } catch { setError("Failed to load readings."); }
  }

  async function saveTank() {
    if (!tankForm.name.trim()) { setTankFormError("Name is required."); return; }
    if (!tankForm.capacityLitres || tankForm.capacityLitres <= 0) { setTankFormError("Capacity must be > 0."); return; }
    setTankBusy(true); setTankFormError("");
    try {
      const created = await dipTanksApi.createTank(tankForm);
      setTanks(ts => [...ts, created]);
      const sumRefresh = await dipTanksApi.getSummary();
      setSummary(Object.fromEntries(sumRefresh.map(x => [x.tankId, x])));
      setShowTankForm(false);
      setTankForm(emptyTankForm());
    } catch (e: any) { setTankFormError(e?.message ?? "Save failed."); }
    finally { setTankBusy(false); }
  }

  async function saveReading() {
    if (!readingForm.tankId) { setReadingFormError("Tank is required."); return; }
    if (readingForm.readingLitres < 0) { setReadingFormError("Reading must be >= 0."); return; }
    setReadingBusy(true); setReadingFormError("");
    try {
      const created = await dipTanksApi.createReading(readingForm);
      setReadings(rs => [created, ...rs]);
      const sumRefresh = await dipTanksApi.getSummary();
      setSummary(Object.fromEntries(sumRefresh.map(x => [x.tankId, x])));
      setShowReadingForm(false);
      setReadingForm(emptyReadingForm());
    } catch (e: any) { setReadingFormError(e?.message ?? "Save failed."); }
    finally { setReadingBusy(false); }
  }

  async function loadTank(tankId: string) {
    if (!loadForm.litres || loadForm.litres <= 0) { setLoadError("Litres must be > 0."); return; }
    setLoadBusy(true); setLoadError("");
    try {
      await dipTanksApi.loadTank(tankId, loadForm);
      const sumRefresh = await dipTanksApi.getSummary();
      setSummary(Object.fromEntries(sumRefresh.map(x => [x.tankId, x])));
      if (tab === "readings") {
        const updatedReadings = await dipTanksApi.listReadings();
        setReadings(updatedReadings);
      }
      setLoadingTankId(null);
      setLoadForm({ litres: 0, costPerLitre: null, notes: "" });
    } catch (e: any) { setLoadError(e?.message ?? "Load failed."); }
    finally { setLoadBusy(false); }
  }

  const siteName = (siteId: string) => sites.find(s => s.siteId === siteId)?.name ?? "—";
  const tankName = (tankId: string) => tanks.find(t => t.tankId === tankId)?.name ?? tankId;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>💧 Dip Tanks</div>
          <div style={s.sub}>{tanks.length} tank{tanks.length !== 1 ? "s" : ""} configured</div>
        </div>
        {tab === "tanks" && canManage() && (
          <button style={s.btnPrimary} onClick={() => { setShowTankForm(true); setTankFormError(""); }}>+ Add Tank</button>
        )}
        {tab === "readings" && (
          <button style={s.btnPrimary} onClick={() => { setShowReadingForm(true); setReadingFormError(""); }}>+ Record Reading</button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {(["tanks", "readings"] as Tab[]).map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === "tanks" ? "💧 Tanks" : "📋 Readings"}
          </button>
        ))}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}
      {loading ? <div style={s.loadingText}>Loading…</div> : (

        <>
          {/* ── TANKS TAB ── */}
          {tab === "tanks" && (
            <>
              {showTankForm && (
                <div style={s.formCard}>
                  <div style={s.formTitle}>New Dip Tank</div>
                  <div style={s.formGrid}>
                    <div>
                      <label style={s.label}>Tank Name *</label>
                      <input style={s.input} value={tankForm.name} onChange={e => setTankForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. T001, Main Tank" />
                    </div>
                    <div>
                      <label style={s.label}>Description</label>
                      <input style={s.input} value={tankForm.description} onChange={e => setTankForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Diesel storage north yard" />
                    </div>
                    <div>
                      <label style={s.label}>Site</label>
                      <select style={s.input} value={tankForm.siteId} onChange={e => setTankForm(f => ({ ...f, siteId: e.target.value }))}>
                        <option value="">Select site…</option>
                        {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Fuel Type</label>
                      <select style={s.input} value={tankForm.fuelType} onChange={e => setTankForm(f => ({ ...f, fuelType: e.target.value }))}>
                        <option value="diesel">Diesel</option>
                        <option value="petrol">Petrol</option>
                        <option value="avgas">AvGas</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Capacity (Litres) *</label>
                      <input style={s.input} type="number" min="1" value={tankForm.capacityLitres || ""} onChange={e => setTankForm(f => ({ ...f, capacityLitres: Number(e.target.value) }))} placeholder="e.g. 5000" />
                    </div>
                    <div>
                      <label style={s.label}>Low Level Alert (Litres)</label>
                      <input style={s.input} type="number" min="0" value={tankForm.lowQtyLitres ?? ""} onChange={e => setTankForm(f => ({ ...f, lowQtyLitres: e.target.value ? Number(e.target.value) : null }))} placeholder="e.g. 500" />
                    </div>
                  </div>
                  {tankFormError && <div style={s.formError}>{tankFormError}</div>}
                  <div style={s.formFooter}>
                    <button style={s.btnSecondary} onClick={() => setShowTankForm(false)} disabled={tankBusy}>Cancel</button>
                    <button style={s.btnPrimary} onClick={saveTank} disabled={tankBusy}>{tankBusy ? "Saving…" : "Save Tank"}</button>
                  </div>
                </div>
              )}

              {tanks.length === 0 ? (
                <div style={s.emptyText}>No tanks yet.</div>
              ) : (
                <div style={s.grid}>
                  {tanks.map(tank => {
                    const sum = summary[tank.tankId];
                    const pct = sum?.pctFull ?? 0;
                    const isLow = sum?.isLow ?? false;
                    return (
                      <div key={tank.tankId} style={{ ...s.card, ...(isLow ? { borderColor: "#fca5a5", background: "#fff5f5" } : {}) }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={s.tankName}>{tank.name}</div>
                            {tank.description && <div style={s.tankSub}>{tank.description}</div>}
                            <div style={s.tankSub}>{siteName(tank.siteId)} · {tank.fuelType}</div>
                          </div>
                          <span style={{ fontSize: 20 }}>{isLow ? "⚠️" : "💧"}</span>
                        </div>
                        <LevelBar pct={pct} isLow={isLow} />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                          <span style={{ fontWeight: 700, color: isLow ? "#dc2626" : "#1e293b" }}>{pct}% full</span>
                          <span style={{ color: "#64748b" }}>{sum?.currentLitres ?? "—"}L / {tank.capacityLitres}L</span>
                        </div>
                        {tank.lowQtyLitres && <div style={s.tankSub}>Alert below: {tank.lowQtyLitres}L</div>}
                        {sum?.lastReadingAt && (
                          <div style={s.tankSub}>Last dip: {new Date(sum.lastReadingAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        )}
                        <button
                          style={{ ...s.loadBtn, marginTop: 10 }}
                          onClick={() => { setLoadingTankId(loadingTankId === tank.tankId ? null : tank.tankId); setLoadError(""); setLoadForm({ litres: 0, costPerLitre: null, notes: "" }); }}
                        >
                          {loadingTankId === tank.tankId ? "✕ Cancel" : "⛽ Load Fuel"}
                        </button>
                        {loadingTankId === tank.tankId && (
                          <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                            <div style={s.formGrid}>
                              <div>
                                <label style={s.label}>Litres Received *</label>
                                <input style={s.input} type="number" step="0.01" min="0" value={loadForm.litres || ""} onChange={e => setLoadForm(f => ({ ...f, litres: Number(e.target.value) }))} placeholder="e.g. 5000" />
                              </div>
                              <div>
                                <label style={s.label}>Cost per Litre (R)</label>
                                <input style={s.input} type="number" step="0.0001" min="0" value={loadForm.costPerLitre ?? ""} onChange={e => setLoadForm(f => ({ ...f, costPerLitre: e.target.value ? Number(e.target.value) : null }))} placeholder="e.g. 22.50" />
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <label style={s.label}>Notes</label>
                                <input style={s.input} value={loadForm.notes ?? ""} onChange={e => setLoadForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Supplier, delivery ref" />
                              </div>
                            </div>
                            {loadError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}>{loadError}</div>}
                            <button style={{ ...s.btnPrimary, marginTop: 10 }} onClick={() => loadTank(tank.tankId)} disabled={loadBusy}>
                              {loadBusy ? "Saving…" : "Record Delivery"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── READINGS TAB ── */}
          {tab === "readings" && (
            <>
              {showReadingForm && (
                <div style={s.formCard}>
                  <div style={s.formTitle}>Record Dip Reading</div>
                  <div style={s.formGrid}>
                    <div>
                      <label style={s.label}>Tank *</label>
                      <select style={s.input} value={readingForm.tankId} onChange={e => setReadingForm(f => ({ ...f, tankId: e.target.value }))}>
                        <option value="">Select tank…</option>
                        {tanks.map(t => <option key={t.tankId} value={t.tankId}>{t.name}{t.siteId ? ` (${siteName(t.siteId)})` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Reading (Litres) *</label>
                      <input style={s.input} type="number" step="0.1" min="0" value={readingForm.readingLitres || ""} onChange={e => setReadingForm(f => ({ ...f, readingLitres: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={s.label}>Dip Stick (mm)</label>
                      <input style={s.input} type="number" step="1" value={readingForm.readingMm ?? ""} onChange={e => setReadingForm(f => ({ ...f, readingMm: e.target.value ? Number(e.target.value) : null }))} />
                    </div>
                    <div>
                      <label style={s.label}>Notes</label>
                      <input style={s.input} value={readingForm.notes ?? ""} onChange={e => setReadingForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  {readingFormError && <div style={s.formError}>{readingFormError}</div>}
                  <div style={s.formFooter}>
                    <button style={s.btnSecondary} onClick={() => setShowReadingForm(false)} disabled={readingBusy}>Cancel</button>
                    <button style={s.btnPrimary} onClick={saveReading} disabled={readingBusy}>{readingBusy ? "Saving…" : "Save Reading"}</button>
                  </div>
                </div>
              )}

              {readings.length === 0 ? (
                <div style={s.emptyText}>No readings yet.</div>
              ) : (
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Date/Time", "Tank", "Site", "Litres", "mm", "% Full", "By"].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {readings.map(r => {
                        const tank = tanks.find(t => t.tankId === r.tankId);
                        const pct = r.pctFull;
                        const pctColor = pct != null && pct < 20 ? "#dc2626" : pct != null && pct < 40 ? "#d97706" : "#16a34a";
                        return (
                          <tr key={r.readingId} style={s.tr}>
                            <td style={s.td}>{new Date(r.recordedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                            <td style={{ ...s.td, fontWeight: 600 }}>{tankName(r.tankId)}</td>
                            <td style={s.td}>{tank ? siteName(tank.siteId) : "—"}</td>
                            <td style={s.td}>{r.readingLitres}L</td>
                            <td style={s.td}>{r.readingMm ?? "—"}</td>
                            <td style={s.td}>{pct != null ? <span style={{ fontWeight: 700, color: pctColor }}>{pct}%</span> : "—"}</td>
                            <td style={{ ...s.td, color: "#64748b" }}>{r.recordedBy || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  tabBar: { display: "flex", borderBottom: "2px solid #e2e8f0", marginBottom: 20, gap: 4 },
  tab: { padding: "8px 16px", fontSize: 14, fontWeight: 500, border: "none", background: "none", cursor: "pointer", color: "#64748b", borderBottom: "2px solid transparent", marginBottom: -2 },
  tabActive: { color: "#166534", borderBottom: "2px solid #166534", fontWeight: 700 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  tankName: { fontSize: 15, fontWeight: 700, color: "#1e293b" },
  tankSub: { fontSize: 12, color: "#64748b", marginTop: 3 },
  formCard: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 20, marginBottom: 20 },
  formTitle: { fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  formFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  loadBtn: { background: "#f0fdf4", color: "#166534", border: "1px solid #86efac", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" },
  tableWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "10px 14px", whiteSpace: "nowrap" as const },
};
