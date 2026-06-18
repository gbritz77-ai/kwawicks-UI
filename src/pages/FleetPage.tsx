import React, { useEffect, useState } from "react";
import { fleetApi } from "../api/fleetApi";
import type { VehicleDto, CreateVehicleRequest, UpdateVehicleRequest } from "../api/fleetApi";
import { hasAnyRole } from "../api/auth";

const canManage = () => hasAnyRole("Owner", "Admin");

type FormState = {
  fleetNumber: string;
  registration: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  odoType: string;
  odometerKm: string;
  expectedConsumption: string;
  licenceExpiry: string;
  licenceRemindDays: string;
  lastServiceOdo: string;
  serviceInterval: string;
  serviceNotifyBefore: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  fleetNumber: "",
  registration: "",
  make: "",
  model: "",
  year: "",
  fuelType: "diesel",
  odoType: "km",
  odometerKm: "",
  expectedConsumption: "",
  licenceExpiry: "",
  licenceRemindDays: "",
  lastServiceOdo: "",
  serviceInterval: "",
  serviceNotifyBefore: "",
  notes: "",
});

function vehicleToForm(v: VehicleDto): FormState {
  return {
    fleetNumber: v.fleetNumber,
    registration: v.registration,
    make: v.make,
    model: v.model,
    year: v.year != null ? String(v.year) : "",
    fuelType: v.fuelType,
    odoType: v.odoType,
    odometerKm: v.odometerKm != null ? String(v.odometerKm) : "",
    expectedConsumption: v.expectedConsumption != null ? String(v.expectedConsumption) : "",
    licenceExpiry: v.licenceExpiry ?? "",
    licenceRemindDays: v.licenceRemindDays != null ? String(v.licenceRemindDays) : "",
    lastServiceOdo: v.lastServiceOdo != null ? String(v.lastServiceOdo) : "",
    serviceInterval: v.serviceInterval != null ? String(v.serviceInterval) : "",
    serviceNotifyBefore: v.serviceNotifyBefore != null ? String(v.serviceNotifyBefore) : "",
    notes: v.notes,
  };
}

function formToRequest(f: FormState): CreateVehicleRequest {
  const num = (v: string) => v.trim() === "" ? undefined : Number(v);
  return {
    fleetNumber: f.fleetNumber.trim(),
    registration: f.registration.trim() || undefined,
    make: f.make.trim() || undefined,
    model: f.model.trim() || undefined,
    year: num(f.year),
    fuelType: f.fuelType,
    odoType: f.odoType,
    odometerKm: num(f.odometerKm),
    expectedConsumption: num(f.expectedConsumption),
    licenceExpiry: f.licenceExpiry || undefined,
    licenceRemindDays: num(f.licenceRemindDays),
    lastServiceOdo: num(f.lastServiceOdo),
    serviceInterval: num(f.serviceInterval),
    serviceNotifyBefore: num(f.serviceNotifyBefore),
    notes: f.notes.trim() || undefined,
  };
}

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formIsActive, setFormIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<VehicleDto | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setVehicles(await fleetApi.list());
    } catch { setError("Failed to load fleet."); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormIsActive(true);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(v: VehicleDto) {
    setEditing(v);
    setForm(vehicleToForm(v));
    setFormIsActive(v.isActive);
    setFormError("");
    setShowForm(true);
  }

  function setF(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.fleetNumber.trim()) { setFormError("Fleet Number is required."); return; }
    setBusy(true);
    setFormError("");
    try {
      if (editing) {
        const req: UpdateVehicleRequest = { ...formToRequest(form), isActive: formIsActive };
        const updated = await fleetApi.update(editing.vehicleId, req);
        setVehicles(vs => vs.map(v => v.vehicleId === updated.vehicleId ? updated : v));
      } else {
        const created = await fleetApi.create(formToRequest(form));
        setVehicles(vs => [created, ...vs]);
      }
      setShowForm(false);
    } catch (e: any) {
      setFormError(e?.message ?? "Save failed.");
    } finally { setBusy(false); }
  }

  async function handleDeactivate(v: VehicleDto) {
    setConfirmDeactivate(null);
    try {
      await fleetApi.deactivate(v.vehicleId);
      setVehicles(vs => vs.map(x => x.vehicleId === v.vehicleId ? { ...x, isActive: false } : x));
    } catch { setError("Failed to deactivate vehicle."); }
  }

  const q = search.toLowerCase();
  const filtered = vehicles.filter(v =>
    !q ||
    v.fleetNumber.toLowerCase().includes(q) ||
    v.registration.toLowerCase().includes(q) ||
    v.make.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q)
  );
  const active = filtered.filter(v => v.isActive);
  const inactive = filtered.filter(v => !v.isActive);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>🚛 Fleet</div>
          <div style={s.sub}>Manage vehicles, licence renewals, and service intervals</div>
        </div>
        {canManage() && (
          <button style={s.btnPrimary} onClick={openCreate}>+ Add Vehicle</button>
        )}
      </div>

      <input
        style={s.searchInput}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by fleet number, registration, make or model…"
      />

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={s.loadingText}>Loading…</div>
      ) : (
        <>
          <Section title={`Active (${active.length})`}>
            {active.length === 0 ? (
              <div style={s.emptyText}>No active vehicles.</div>
            ) : (
              <div style={s.grid}>
                {active.map(v => (
                  <VehicleCard
                    key={v.vehicleId}
                    vehicle={v}
                    canManage={canManage()}
                    onEdit={openEdit}
                    onDeactivate={setConfirmDeactivate}
                  />
                ))}
              </div>
            )}
          </Section>

          {inactive.length > 0 && (
            <Section title={`Inactive (${inactive.length})`}>
              <div style={s.grid}>
                {inactive.map(v => (
                  <VehicleCard
                    key={v.vehicleId}
                    vehicle={v}
                    canManage={canManage()}
                    onEdit={openEdit}
                    onDeactivate={setConfirmDeactivate}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <strong>{editing ? "Edit Vehicle" : "Add Vehicle"}</strong>
              <button style={s.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div style={s.formGrid}>
              <div>
                <label style={s.label}>Fleet Number *</label>
                <input style={s.input} value={form.fleetNumber} onChange={e => setF("fleetNumber", e.target.value)} placeholder="e.g. KW-01" />
              </div>
              <div>
                <label style={s.label}>Registration</label>
                <input style={s.input} value={form.registration} onChange={e => setF("registration", e.target.value)} placeholder="e.g. CA 123-456" />
              </div>
              <div>
                <label style={s.label}>Make</label>
                <input style={s.input} value={form.make} onChange={e => setF("make", e.target.value)} placeholder="e.g. Toyota" />
              </div>
              <div>
                <label style={s.label}>Model</label>
                <input style={s.input} value={form.model} onChange={e => setF("model", e.target.value)} placeholder="e.g. Hilux" />
              </div>
              <div>
                <label style={s.label}>Year</label>
                <input style={s.input} type="number" value={form.year} onChange={e => setF("year", e.target.value)} placeholder="e.g. 2022" />
              </div>
              <div>
                <label style={s.label}>Fuel Type</label>
                <select style={s.input} value={form.fuelType} onChange={e => setF("fuelType", e.target.value)}>
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Odometer Type</label>
                <select style={s.input} value={form.odoType} onChange={e => setF("odoType", e.target.value)}>
                  <option value="km">km</option>
                  <option value="hrs">hrs</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Current Odometer ({form.odoType})</label>
                <input style={s.input} type="number" value={form.odometerKm} onChange={e => setF("odometerKm", e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={s.label}>Expected Consumption (L/{form.odoType})</label>
                <input style={s.input} type="number" value={form.expectedConsumption} onChange={e => setF("expectedConsumption", e.target.value)} placeholder="e.g. 12.5" />
              </div>
            </div>

            <div style={s.sectionDivider}>Licence</div>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>Licence Expiry</label>
                <input style={s.input} type="date" value={form.licenceExpiry} onChange={e => setF("licenceExpiry", e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Remind Me (days before)</label>
                <input style={s.input} type="number" value={form.licenceRemindDays} onChange={e => setF("licenceRemindDays", e.target.value)} placeholder="e.g. 30" />
              </div>
            </div>

            <div style={s.sectionDivider}>Service Intervals</div>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>Last Service Odo ({form.odoType})</label>
                <input style={s.input} type="number" value={form.lastServiceOdo} onChange={e => setF("lastServiceOdo", e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={s.label}>Service Interval ({form.odoType})</label>
                <input style={s.input} type="number" value={form.serviceInterval} onChange={e => setF("serviceInterval", e.target.value)} placeholder="e.g. 10000" />
              </div>
              <div>
                <label style={s.label}>Notify Before ({form.odoType})</label>
                <input style={s.input} type="number" value={form.serviceNotifyBefore} onChange={e => setF("serviceNotifyBefore", e.target.value)} placeholder="e.g. 500" />
              </div>
            </div>

            <label style={s.label}>Notes</label>
            <textarea style={{ ...s.input, minHeight: 64, resize: "vertical" }} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Any additional notes…" />

            {editing && (
              <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <input type="checkbox" checked={formIsActive} onChange={e => setFormIsActive(e.target.checked)} />
                Active
              </label>
            )}

            {formError && <div style={s.formError}>{formError}</div>}

            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
              <button style={s.btnPrimary} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {confirmDeactivate && (
        <div style={s.overlay} onClick={() => setConfirmDeactivate(null)}>
          <div style={{ ...s.modal, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <strong>Deactivate Vehicle</strong>
              <button style={s.closeBtn} onClick={() => setConfirmDeactivate(null)}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: "#374151", margin: "0 0 20px" }}>
              Deactivate <strong>{confirmDeactivate.fleetNumber}</strong>? It will be hidden from the active list.
            </p>
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setConfirmDeactivate(null)}>Cancel</button>
              <button
                style={{ ...s.btnPrimary, background: "#dc2626" }}
                onClick={() => handleDeactivate(confirmDeactivate)}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function VehicleCard({
  vehicle, canManage, onEdit, onDeactivate,
}: {
  vehicle: VehicleDto;
  canManage: boolean;
  onEdit: (v: VehicleDto) => void;
  onDeactivate: (v: VehicleDto) => void;
}) {
  const odo = vehicle.odometerKm != null ? `${vehicle.odometerKm.toLocaleString()} ${vehicle.odoType}` : null;

  const licenceWarning = (() => {
    if (!vehicle.licenceExpiry) return null;
    const days = Math.ceil((new Date(vehicle.licenceExpiry).getTime() - Date.now()) / 86400000);
    const remind = vehicle.licenceRemindDays ?? 30;
    if (days < 0) return { text: "Licence EXPIRED", color: "#dc2626" };
    if (days <= remind) return { text: `Licence expires in ${days}d`, color: "#d97706" };
    return null;
  })();

  const serviceWarning = (() => {
    if (vehicle.odometerKm == null || vehicle.lastServiceOdo == null || vehicle.serviceInterval == null) return null;
    const nextService = vehicle.lastServiceOdo + vehicle.serviceInterval;
    const remaining = nextService - vehicle.odometerKm;
    const notify = vehicle.serviceNotifyBefore ?? vehicle.serviceInterval * 0.1;
    if (remaining <= 0) return { text: "SERVICE OVERDUE", color: "#dc2626" };
    if (remaining <= notify) return { text: `Service due in ${remaining.toFixed(0)} ${vehicle.odoType}`, color: "#d97706" };
    return null;
  })();

  return (
    <div style={{ ...s.card, opacity: vehicle.isActive ? 1 : 0.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={s.fleetNum}>{vehicle.fleetNumber}</div>
          <div style={s.vehicleSub}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</div>
          {vehicle.registration && <div style={s.vehicleSub}>🪪 {vehicle.registration}</div>}
        </div>
        {canManage && vehicle.isActive && (
          <div style={{ display: "flex", gap: 6 }}>
            <button style={s.editBtn} onClick={() => onEdit(vehicle)}>Edit</button>
            <button style={{ ...s.editBtn, color: "#dc2626" }} onClick={() => onDeactivate(vehicle)}>Deactivate</button>
          </div>
        )}
        {canManage && !vehicle.isActive && (
          <button style={s.editBtn} onClick={() => onEdit(vehicle)}>Reactivate</button>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12, color: "#64748b" }}>
        {odo && <span>📏 {odo}</span>}
        <span>⛽ {vehicle.fuelType}</span>
        {vehicle.licenceExpiry && <span>📋 Licence: {vehicle.licenceExpiry}</span>}
      </div>

      {licenceWarning && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: licenceWarning.color }}>
          ⚠ {licenceWarning.text}
        </div>
      )}
      {serviceWarning && (
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: serviceWarning.color }}>
          🔧 {serviceWarning.text}
        </div>
      )}

      {vehicle.notes && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{vehicle.notes}</div>
      )}

      {!vehicle.isActive && (
        <div style={{ ...s.badge, background: "#fee2e2", color: "#991b1b", marginTop: 8 }}>Inactive</div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  searchInput: { width: "100%", maxWidth: 400, padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, marginBottom: 24, boxSizing: "border-box" as const },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  fleetNum: { fontSize: 16, fontWeight: 800, color: "#1e293b" },
  vehicleSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  badge: { display: "inline-block", fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 6px" },
  editBtn: { fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 560, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, fontSize: 16 },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#64748b" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  sectionDivider: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginTop: 20, marginBottom: 4, borderTop: "1px solid #e2e8f0", paddingTop: 16 },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
};
