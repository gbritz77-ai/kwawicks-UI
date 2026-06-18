import React, { useEffect, useRef, useState } from "react";
import { fuelIssuesApi } from "../api/fuelIssuesApi";
import { fleetApi } from "../api/fleetApi";
import { dipTanksApi } from "../api/dipTanksApi";
import { sitesApi } from "../api/sitesApi";
import type { FuelIssueDto, CreateFuelIssueRequest, VehicleFuelReportDto, MonthlyFuelDto } from "../api/fuelIssuesApi";
import type { VehicleDto } from "../api/fleetApi";
import type { DipTankDto } from "../api/dipTanksApi";
import type { SiteDto } from "../api/sitesApi";

type Tab = "issues" | "report";
type FuelSource = "tank" | "offsite";

const emptyForm = (): CreateFuelIssueRequest => ({
  vehicleId: "", fuelSource: "tank", tankId: "", tankIssuedBy: "", supplierStation: "",
  siteId: "", litres: 0, odometerKm: null, costPerLitre: null, reference: "",
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("en-ZA", { month: "short", year: "numeric" });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function BarChart({ data, valueKey, color }: { data: MonthlyFuelDto[]; valueKey: "litres" | "cost"; color: string }) {
  if (!data.length) return null;
  const values = data.map(d => (valueKey === "litres" ? d.litres : (d.cost ?? 0)));
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginTop: 8 }}>
      {data.map((d, i) => {
        const val = values[i];
        const pct = (val / max) * 100;
        return (
          <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap" as const }}>
              {val > 0 ? (valueKey === "litres" ? `${val.toFixed(0)}L` : `R${val.toFixed(0)}`) : ""}
            </div>
            <div style={{ width: "100%", height: `${Math.max(pct, 4)}%`, background: color, borderRadius: "3px 3px 0 0", minHeight: 3 }} />
            <div style={{ fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap" as const }}>{fmtMonth(d.month).split(" ")[0]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Vehicle report card ───────────────────────────────────────────────────────

function VehicleReportCard({ v }: { v: VehicleFuelReportDto }) {
  const [expanded, setExpanded] = useState(false);
  const outOfRange = v.isOutOfRange;
  return (
    <div style={{ ...s.card, borderColor: outOfRange ? "#fca5a5" : "#e2e8f0", background: outOfRange ? "#fff5f5" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={s.vehicleName}>{v.fleetNumber}</span>
            {v.registration && <span style={s.vehicleSub}>{v.registration}</span>}
            {outOfRange && <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b" }}>⚠ High Consumption</span>}
          </div>
          {outOfRange && v.topIssuedBy && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 2 }}>
              Issued by: <strong>{v.topIssuedBy}</strong>
            </div>
          )}
        </div>
        <button style={s.expandBtn} onClick={() => setExpanded(e => !e)}>{expanded ? "▲" : "▼"}</button>
      </div>

      <div style={s.statsRow}>
        <Stat label="Fills" value={String(v.fillCount)} />
        <Stat label="Total Litres" value={`${v.totalLitres.toFixed(0)} L`} />
        {v.totalCost != null && <Stat label="Total Cost" value={`R${v.totalCost.toFixed(2)}`} />}
        {v.avgConsumptionPer100 != null && (
          <Stat label={`L/100${v.odoType}`} value={`${v.avgConsumptionPer100.toFixed(1)}`} highlight={outOfRange} />
        )}
        {v.expectedConsumption != null && (
          <Stat label={`Expected L/100${v.odoType}`} value={`${v.expectedConsumption}`} dim />
        )}
      </div>

      {expanded && v.monthly.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={s.chartSection}>
            <div style={s.chartLabel}>Litres per month</div>
            <BarChart data={v.monthly} valueKey="litres" color="#166534" />
          </div>
          {v.monthly.some(m => m.cost) && (
            <div style={{ ...s.chartSection, marginTop: 10 }}>
              <div style={s.chartLabel}>Cost per month (R)</div>
              <BarChart data={v.monthly} valueKey="cost" color="#0284c7" />
            </div>
          )}
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" as const, marginTop: 10 }}>
            <thead>
              <tr>{["Month", "Fills", "Litres", "Cost"].map(h => (
                <th key={h} style={{ textAlign: "left" as const, padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {v.monthly.map(m => (
                <tr key={m.month} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px" }}>{fmtMonth(m.month)}</td>
                  <td style={{ padding: "4px 8px" }}>{m.fillCount}</td>
                  <td style={{ padding: "4px 8px" }}>{m.litres.toFixed(0)} L</td>
                  <td style={{ padding: "4px 8px" }}>{m.cost != null ? `R${m.cost.toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, dim }: { label: string; value: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlight ? "#dc2626" : dim ? "#94a3b8" : "#1e293b" }}>{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "#fee2e2" : "#f8fafc", border: `1px solid ${highlight ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 20px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" as const, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: highlight ? "#dc2626" : "#1e293b", marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Source toggle ─────────────────────────────────────────────────────────────

function SourceToggle({ value, onChange }: { value: FuelSource; onChange: (v: FuelSource) => void }) {
  const btn = (v: FuelSource, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      style={{
        flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
        background: value === v ? "#166534" : "#f1f5f9",
        color: value === v ? "#fff" : "#374151",
        borderRadius: v === "tank" ? "6px 0 0 6px" : "0 6px 6px 0",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 7, overflow: "hidden", marginTop: 4 }}>
      {btn("tank", "🛢 Tank")}
      {btn("offsite", "⛽ Off Site")}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FuelPage() {
  const [tab, setTab] = useState<Tab>("issues");
  const [issues, setIssues] = useState<FuelIssueDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [tanks, setTanks] = useState<DipTankDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateFuelIssueRequest>(emptyForm());
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Report filters
  const [report, setReport] = useState<VehicleFuelReportDto[] | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportVehicleId, setReportVehicleId] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === "report") loadReport(); }, [tab]);

  async function loadAll() {
    try {
      setLoading(true);
      const [i, v, t, s] = await Promise.all([
        fuelIssuesApi.list(), fleetApi.list(), dipTanksApi.listTanks(), sitesApi.list(),
      ]);
      setIssues(i); setVehicles(v); setTanks(t); setSites(s);
    } catch { setError("Failed to load fuel records."); }
    finally { setLoading(false); }
  }

  async function loadReport() {
    setReportLoading(true);
    try {
      setReport(await fuelIssuesApi.getReport(
        reportVehicleId || undefined,
        reportFrom || undefined,
        reportTo || undefined,
      ));
    } catch { setError("Failed to load report."); }
    finally { setReportLoading(false); }
  }

  function setF<K extends keyof CreateFuelIssueRequest>(field: K, value: CreateFuelIssueRequest[K]) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function onSourceChange(src: FuelSource) {
    setForm(f => ({ ...f, fuelSource: src, tankId: "", tankIssuedBy: "", supplierStation: "" }));
  }

  function onTankChange(tankId: string) {
    const tank = tanks.find(t => t.tankId === tankId);
    setForm(f => ({ ...f, tankId, siteId: tank?.siteId ?? f.siteId }));
  }

  async function handleSave() {
    if (!form.vehicleId) { setFormError("Vehicle is required."); return; }
    if (!form.litres || form.litres <= 0) { setFormError("Litres must be > 0."); return; }
    if (form.fuelSource === "tank" && !form.tankId) { setFormError("Please select a tank."); return; }
    setBusy(true); setFormError(""); setUploadProgress("");
    try {
      const created = await fuelIssuesApi.create(form);
      let final = created;
      if (slipFile) {
        setUploadProgress("Uploading slip…");
        const { uploadUrl, s3Key } = await fuelIssuesApi.getSlipUploadUrl(created.issueId, slipFile.type || "image/jpeg");
        await fetch(uploadUrl, { method: "PUT", body: slipFile, headers: { "Content-Type": slipFile.type || "image/jpeg" } });
        final = await fuelIssuesApi.confirmSlip(created.issueId, s3Key);
      }
      setIssues(is => [final, ...is]);
      setShowForm(false);
      setForm(emptyForm());
      setSlipFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (e: any) { setFormError(e?.message ?? "Save failed."); }
    finally { setBusy(false); setUploadProgress(""); }
  }

  const totalLitres = issues.reduce((sum, i) => sum + i.litres, 0);
  const totalCost = issues.reduce((sum, i) => sum + (i.totalCost ?? 0), 0);
  const outOfRange = report?.filter(v => v.isOutOfRange) ?? [];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>⛽ Fuel</div>
          <div style={s.sub}>{issues.length} records · {totalLitres.toFixed(0)}L{totalCost > 0 ? ` · R${totalCost.toFixed(2)}` : ""}</div>
        </div>
        {tab === "issues" && (
          <button style={s.btnPrimary} onClick={() => { setShowForm(true); setFormError(""); }}>+ Add Fuel</button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {(["issues", "report"] as Tab[]).map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === "issues" ? "📋 Issues" : "📊 Report"}
          </button>
        ))}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* ── ADD FUEL FORM ── */}
      {tab === "issues" && showForm && (
        <div style={s.formCard}>
          <div style={s.formTitle}>Add Fuel</div>

          {/* Vehicle */}
          <label style={s.label}>Vehicle *</label>
          <select style={s.input} value={form.vehicleId} onChange={e => setF("vehicleId", e.target.value)}>
            <option value="">Select vehicle…</option>
            {vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.fleetNumber}{v.registration ? ` (${v.registration})` : ""}</option>)}
          </select>

          {/* Source toggle */}
          <label style={s.label}>Fuel Source *</label>
          <SourceToggle value={form.fuelSource as FuelSource} onChange={onSourceChange} />

          <div style={s.formGrid}>
            {/* Tank fields */}
            {form.fuelSource === "tank" && (
              <>
                <div>
                  <label style={s.label}>Tank *</label>
                  <select style={s.input} value={form.tankId ?? ""} onChange={e => onTankChange(e.target.value)}>
                    <option value="">Select tank…</option>
                    {tanks.map(t => <option key={t.tankId} value={t.tankId}>{t.name}{t.siteId ? ` (${sites.find(s => s.siteId === t.siteId)?.name ?? ""})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Issued by (tank operator) *</label>
                  <input style={s.input} value={form.tankIssuedBy ?? ""} onChange={e => setF("tankIssuedBy", e.target.value)} placeholder="Name of person who dispensed fuel" />
                </div>
                <div>
                  <label style={s.label}>Site</label>
                  <select style={s.input} value={form.siteId ?? ""} onChange={e => setF("siteId", e.target.value)}>
                    <option value="">Select site…</option>
                    {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* Off-site fields */}
            {form.fuelSource === "offsite" && (
              <div style={{ gridColumn: "span 2" }}>
                <label style={s.label}>Supplier / Station</label>
                <input style={s.input} value={form.supplierStation ?? ""} onChange={e => setF("supplierStation", e.target.value)} placeholder="e.g. Engen Main Road, Shell N1" />
              </div>
            )}

            {/* Common fields */}
            <div>
              <label style={s.label}>Litres *</label>
              <input style={s.input} type="number" step="0.01" min="0" value={form.litres || ""} onChange={e => setF("litres", Number(e.target.value))} />
            </div>
            <div>
              <label style={s.label}>Odometer (km)</label>
              <input style={s.input} type="number" value={form.odometerKm ?? ""} onChange={e => setF("odometerKm", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={s.label}>Cost per Litre (R)</label>
              <input style={s.input} type="number" step="0.0001" value={form.costPerLitre ?? ""} onChange={e => setF("costPerLitre", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={s.label}>Reference</label>
              <input style={s.input} value={form.reference ?? ""} onChange={e => setF("reference", e.target.value)} placeholder="e.g. slip number" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={s.label}>Fuel Slip</label>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" as const }}>
                <button type="button" style={s.slipBtn} onClick={() => fileInputRef.current?.click()}>
                  📎 Browse File
                </button>
                <button type="button" style={s.slipBtn} onClick={() => cameraInputRef.current?.click()}>
                  📷 Take Photo
                </button>
                {/* hidden inputs */}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                  onChange={e => { setSlipFile(e.target.files?.[0] ?? null); if (cameraInputRef.current) cameraInputRef.current.value = ""; }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={e => { setSlipFile(e.target.files?.[0] ?? null); if (fileInputRef.current) fileInputRef.current.value = ""; }} />
              </div>
              {slipFile && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>📎 {slipFile.name}</span>
                  <button type="button" onClick={() => { setSlipFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; if (cameraInputRef.current) cameraInputRef.current.value = ""; }}
                    style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ remove</button>
                </div>
              )}
            </div>
          </div>

          {uploadProgress && <div style={{ fontSize: 13, color: "#0284c7", marginTop: 8 }}>{uploadProgress}</div>}
          {formError && <div style={s.formError}>{formError}</div>}
          <div style={s.formFooter}>
            <button style={s.btnSecondary} onClick={() => { setShowForm(false); setSlipFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; if (cameraInputRef.current) cameraInputRef.current.value = ""; }} disabled={busy}>Cancel</button>
            <button style={s.btnPrimary} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {/* ── ISSUES TABLE ── */}
      {tab === "issues" && (
        loading ? <div style={s.loadingText}>Loading…</div> :
        issues.length === 0 ? <div style={s.emptyText}>No fuel records yet.</div> : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Date", "Vehicle", "Source", "Tank / Station", "Issued By", "Litres", "Odometer", "Cost/L", "Total", "Slip"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map(r => (
                  <tr key={r.issueId} style={s.tr}>
                    <td style={s.td}>{fmtDate(r.issuedAt)}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#166534" }}>{r.fleetNumber || r.vehicleId}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: r.fuelSource === "tank" ? "#dcfce7" : "#e0f2fe", color: r.fuelSource === "tank" ? "#166534" : "#0369a1" }}>
                        {r.fuelSource === "tank" ? "🛢 Tank" : "⛽ Off Site"}
                      </span>
                    </td>
                    <td style={s.td}>{r.fuelSource === "tank" ? (r.tankName || "—") : (r.supplierStation || "—")}</td>
                    <td style={s.td}>{r.fuelSource === "tank" ? (r.tankIssuedBy || "—") : (r.issuedByName || "—")}</td>
                    <td style={s.td}>{r.litres}L</td>
                    <td style={s.td}>{r.odometerKm != null ? `${r.odometerKm.toLocaleString("en-ZA")} km` : "—"}</td>
                    <td style={s.td}>{r.costPerLitre != null ? `R${r.costPerLitre}` : "—"}</td>
                    <td style={s.td}>{r.totalCost != null ? `R${r.totalCost.toFixed(2)}` : "—"}</td>
                    <td style={s.td}>
                      {r.slipUrl
                        ? <a href={r.slipUrl} target="_blank" rel="noreferrer" style={{ color: "#0284c7", fontSize: 12 }}>View</a>
                        : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── REPORT TAB ── */}
      {tab === "report" && (
        <>
          {/* Filters */}
          <div style={s.reportFilters}>
            <div style={{ flex: "0 0 220px" }}>
              <label style={s.label}>Vehicle</label>
              <select style={s.input} value={reportVehicleId} onChange={e => setReportVehicleId(e.target.value)}>
                <option value="">All Vehicles</option>
                {vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.fleetNumber}{v.registration ? ` – ${v.registration}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>From</label>
              <input style={s.input} type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>To</label>
              <input style={s.input} type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button style={s.btnPrimary} onClick={loadReport} disabled={reportLoading}>
                {reportLoading ? "Loading…" : "Apply"}
              </button>
            </div>
          </div>

          {reportLoading ? <div style={s.loadingText}>Loading report…</div> :
           !report ? null :
           report.length === 0 ? <div style={s.emptyText}>No fuel data for this selection.</div> : (
            <>
              {outOfRange.length > 0 && (
                <div style={s.alertBanner}>
                  ⚠ <strong>{outOfRange.length} vehicle{outOfRange.length > 1 ? "s" : ""}</strong> with consumption outside expected range:{" "}
                  {outOfRange.map(v => v.fleetNumber).join(", ")}
                </div>
              )}
              <div style={s.reportSummary}>
                <SummaryCard label="Vehicles" value={String(report.length)} />
                <SummaryCard label="Total Litres" value={`${report.reduce((s, v) => s + v.totalLitres, 0).toFixed(0)} L`} />
                {report.some(v => v.totalCost != null) && (
                  <SummaryCard label="Total Cost" value={`R${report.reduce((s, v) => s + (v.totalCost ?? 0), 0).toFixed(2)}`} />
                )}
                <SummaryCard label="Out of Range" value={String(outOfRange.length)} highlight={outOfRange.length > 0} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
                {report
                  .sort((a, b) => (b.isOutOfRange ? 1 : 0) - (a.isOutOfRange ? 1 : 0))
                  .map(v => <VehicleReportCard key={v.vehicleId} v={v} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  tabBar: { display: "flex", borderBottom: "2px solid #e2e8f0", marginBottom: 20, gap: 4 },
  tab: { padding: "8px 16px", fontSize: 14, fontWeight: 500, border: "none", background: "none", cursor: "pointer", color: "#64748b", borderBottom: "2px solid transparent", marginBottom: -2 },
  tabActive: { color: "#166534", borderBottom: "2px solid #166534", fontWeight: 700 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  alertBanner: { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  reportFilters: { display: "flex", gap: 16, flexWrap: "wrap" as const, alignItems: "flex-start", marginBottom: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 },
  reportSummary: { display: "flex", gap: 12, flexWrap: "wrap" as const },
  formCard: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 20, marginBottom: 20 },
  formTitle: { fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", marginTop: 4 },
  formFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  slipBtn: { background: "#f8fafc", color: "#374151", border: "1px solid #d1d5db", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  tableWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "10px 14px", whiteSpace: "nowrap" as const },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  vehicleName: { fontSize: 16, fontWeight: 800, color: "#1e293b" },
  vehicleSub: { fontSize: 12, color: "#64748b" },
  badge: { fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 7px" },
  statsRow: { display: "flex", gap: 24, flexWrap: "wrap" as const, marginTop: 12 },
  chartSection: { background: "#f8fafc", borderRadius: 8, padding: "10px 12px" },
  chartLabel: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  expandBtn: { background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 12, padding: "4px 8px" },
};
