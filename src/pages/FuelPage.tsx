import React, { useEffect, useState } from "react";
import { fuelIssuesApi } from "../api/fuelIssuesApi";
import { fleetApi } from "../api/fleetApi";
import { dipTanksApi } from "../api/dipTanksApi";
import { sitesApi } from "../api/sitesApi";
import type { FuelIssueDto, CreateFuelIssueRequest } from "../api/fuelIssuesApi";
import type { VehicleDto } from "../api/fleetApi";
import type { DipTankDto } from "../api/dipTanksApi";
import type { SiteDto } from "../api/sitesApi";

const emptyForm = (): CreateFuelIssueRequest => ({
  vehicleId: "", tankId: "", siteId: "", litres: 0, odometerKm: null, costPerLitre: null, reference: "",
});

function fmt(n: number | null | undefined, suffix = "") {
  return n != null ? `${n.toLocaleString("en-ZA")}${suffix}` : "—";
}

export default function FuelPage() {
  const [issues, setIssues] = useState<FuelIssueDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [tanks, setTanks] = useState<DipTankDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateFuelIssueRequest>(emptyForm());
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      setLoading(true);
      const [i, v, t, s] = await Promise.all([
        fuelIssuesApi.list(),
        fleetApi.list(),
        dipTanksApi.listTanks(),
        sitesApi.list(),
      ]);
      setIssues(i);
      setVehicles(v);
      setTanks(t);
      setSites(s);
    } catch { setError("Failed to load fuel records."); }
    finally { setLoading(false); }
  }

  function setF<K extends keyof CreateFuelIssueRequest>(field: K, value: CreateFuelIssueRequest[K]) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.vehicleId) { setFormError("Vehicle is required."); return; }
    if (!form.litres || form.litres <= 0) { setFormError("Litres must be > 0."); return; }
    setBusy(true); setFormError("");
    try {
      const created = await fuelIssuesApi.create(form);
      setIssues(is => [created, ...is]);
      setShowForm(false);
      setForm(emptyForm());
    } catch (e: any) { setFormError(e?.message ?? "Save failed."); }
    finally { setBusy(false); }
  }

  // Auto-populate siteId from tank selection
  function onTankChange(tankId: string) {
    const tank = tanks.find(t => t.tankId === tankId);
    setForm(f => ({ ...f, tankId, siteId: tank?.siteId ?? f.siteId }));
  }

  const totalLitres = issues.reduce((sum, i) => sum + i.litres, 0);
  const totalCost = issues.reduce((sum, i) => sum + (i.totalCost ?? 0), 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>⛽ Fuel Issues</div>
          <div style={s.sub}>{issues.length} records · {totalLitres.toFixed(0)}L total{totalCost > 0 ? ` · R${totalCost.toFixed(2)}` : ""}</div>
        </div>
        <button style={s.btnPrimary} onClick={() => { setShowForm(true); setFormError(""); }}>+ Record Issue</button>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {showForm && (
        <div style={s.formCard}>
          <div style={s.formTitle}>Record Fuel Issue</div>
          <div style={s.formGrid}>
            <div>
              <label style={s.label}>Vehicle *</label>
              <select style={s.input} value={form.vehicleId} onChange={e => setF("vehicleId", e.target.value)}>
                <option value="">Select vehicle…</option>
                {vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.fleetNumber}{v.registration ? ` (${v.registration})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Tank</label>
              <select style={s.input} value={form.tankId ?? ""} onChange={e => onTankChange(e.target.value)}>
                <option value="">Select tank…</option>
                {tanks.map(t => <option key={t.tankId} value={t.tankId}>{t.name}{t.siteId ? ` (${sites.find(s => s.siteId === t.siteId)?.name ?? ""})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Site</label>
              <select style={s.input} value={form.siteId ?? ""} onChange={e => setF("siteId", e.target.value)}>
                <option value="">Select site…</option>
                {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
              </select>
            </div>
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
            <div style={{ gridColumn: "span 2" }}>
              <label style={s.label}>Reference</label>
              <input style={s.input} value={form.reference ?? ""} onChange={e => setF("reference", e.target.value)} placeholder="e.g. slip number" />
            </div>
          </div>
          {formError && <div style={s.formError}>{formError}</div>}
          <div style={s.formFooter}>
            <button style={s.btnSecondary} onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
            <button style={s.btnPrimary} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={s.loadingText}>Loading…</div>
      ) : issues.length === 0 ? (
        <div style={s.emptyText}>No fuel issues recorded yet.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {["Date", "Vehicle", "Tank", "Site", "Litres", "Odometer", "Cost/L", "Total", "Issued By"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {issues.map(r => (
                <tr key={r.issueId} style={s.tr}>
                  <td style={s.td}>{new Date(r.issuedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={{ ...s.td, fontWeight: 700, color: "#166534" }}>{r.fleetNumber || r.vehicleId}</td>
                  <td style={s.td}>{r.tankName || "—"}</td>
                  <td style={s.td}>{r.siteName || "—"}</td>
                  <td style={s.td}>{r.litres}L</td>
                  <td style={s.td}>{fmt(r.odometerKm, " km")}</td>
                  <td style={s.td}>{r.costPerLitre != null ? `R${r.costPerLitre}` : "—"}</td>
                  <td style={s.td}>{r.totalCost != null ? `R${r.totalCost.toFixed(2)}` : "—"}</td>
                  <td style={{ ...s.td, color: "#64748b" }}>{r.issuedByName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  formCard: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 20, marginBottom: 20 },
  formTitle: { fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  formFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  tableWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "10px 14px", whiteSpace: "nowrap" as const },
};
