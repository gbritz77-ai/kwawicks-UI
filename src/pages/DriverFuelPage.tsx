import React, { useEffect, useRef, useState } from "react";
import { fuelIssuesApi } from "../api/fuelIssuesApi";
import { fleetApi } from "../api/fleetApi";
import type { VehicleDto } from "../api/fleetApi";
import { NumericInput } from "../components/NumericInput";

type Step = "form" | "pump-photo" | "slip-photo" | "done";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DriverFuelPage() {
  const [vehicles, setVehicles]     = useState<VehicleDto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState("");

  // Form fields
  const [vehicleId, setVehicleId]         = useState("");
  const [litres, setLitres]               = useState(0);
  const [odometer, setOdometer]           = useState<number | "">("");
  const [costPerLitre, setCostPerLitre]   = useState<number | "">("");
  const [station, setStation]             = useState("");
  const [reference, setReference]        = useState("");

  // Photos
  const [pumpFile, setPumpFile]   = useState<File | null>(null);
  const [slipFile, setSlipFile]   = useState<File | null>(null);
  const [pumpPreview, setPumpPreview] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const pumpInputRef = useRef<HTMLInputElement>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // Submission
  const [step, setStep]       = useState<Step>("form");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [issueId, setIssueId] = useState("");
  const [doneAt, setDoneAt]   = useState("");

  useEffect(() => {
    fleetApi.list()
      .then(vs => { setVehicles(vs.filter(v => v.isActive)); setLoading(false); })
      .catch(() => { setLoadError("Could not load vehicles."); setLoading(false); });
  }, []);

  function handlePumpPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPumpFile(f);
    if (f) setPumpPreview(URL.createObjectURL(f));
    else setPumpPreview(null);
  }

  function handleSlipPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSlipFile(f);
    if (f) setSlipPreview(URL.createObjectURL(f));
    else setSlipPreview(null);
  }

  async function handleSubmit() {
    if (!vehicleId)        { setError("Select a vehicle."); return; }
    if (litres <= 0)       { setError("Enter litres filled (must be > 0)."); return; }
    if (!pumpFile)         { setError("Take a photo of the fuel pump display."); return; }
    if (!slipFile)         { setError("Take a photo of the slip."); return; }

    setError("");
    setBusy(true);

    try {
      // 1. Create the fuel issue record (offsite — driver fills at a station)
      const issue = await fuelIssuesApi.create({
        vehicleId,
        fuelSource: "offsite",
        supplierStation: station.trim() || undefined,
        litres,
        odometerKm: odometer !== "" ? Number(odometer) : null,
        costPerLitre: costPerLitre !== "" ? Number(costPerLitre) : null,
        reference: reference.trim() || undefined,
      });

      setIssueId(issue.issueId);
      setDoneAt(issue.issuedAt);

      // 2. Upload pump photo (stored as the slip — first upload)
      const { uploadUrl: pumpUrl, s3Key: pumpKey } = await fuelIssuesApi.getSlipUploadUrl(
        issue.issueId, pumpFile.type || "image/jpeg"
      );
      await fetch(pumpUrl, { method: "PUT", body: pumpFile, headers: { "Content-Type": pumpFile.type || "image/jpeg" } });

      // 3. Upload slip photo (second upload — overwrites slip key to point to slip)
      const { uploadUrl: slipUrl, s3Key: slipKey } = await fuelIssuesApi.getSlipUploadUrl(
        issue.issueId, slipFile.type || "image/jpeg"
      );
      await fetch(slipUrl, { method: "PUT", body: slipFile, headers: { "Content-Type": slipFile.type || "image/jpeg" } });
      await fuelIssuesApi.confirmSlip(issue.issueId, slipKey);

      setStep("done");
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setVehicleId(""); setLitres(0); setOdometer(""); setCostPerLitre("");
    setStation(""); setReference(""); setPumpFile(null); setSlipFile(null);
    setPumpPreview(null); setSlipPreview(null); setError(""); setStep("form");
    setIssueId(""); setDoneAt("");
  }

  if (loading) return <div style={s.page}><p style={{ color: "#64748b" }}>Loading vehicles…</p></div>;
  if (loadError) return <div style={s.page}><p style={{ color: "#ef4444" }}>{loadError}</p></div>;

  // ── Done screen ────────────────────────────────────────────────────────────
  if (step === "done") {
    const v = vehicles.find(x => x.vehicleId === vehicleId);
    return (
      <div style={s.page}>
        <div style={s.doneCard}>
          <div style={s.doneCheck}>✓</div>
          <h2 style={s.doneTitle}>Fuel logged!</h2>
          <p style={s.doneSub}>{fmtDate(doneAt)}</p>
          <div style={s.doneSummary}>
            <Row label="Vehicle" value={v?.fleetNumber ?? vehicleId} />
            <Row label="Litres" value={`${litres} L`} />
            {odometer !== "" && <Row label="Odometer" value={`${odometer} ${v?.odoType ?? "km"}`} />}
            {costPerLitre !== "" && <Row label="Cost/L" value={`R ${Number(costPerLitre).toFixed(4)}`} />}
            {costPerLitre !== "" && <Row label="Total Cost" value={`R ${(litres * Number(costPerLitre)).toFixed(2)}`} />}
            {station && <Row label="Station" value={station} />}
            <Row label="Pump photo" value="✓ Uploaded" green />
            <Row label="Slip photo" value="✓ Uploaded" green />
          </div>
          <button style={s.btnPrimary} onClick={reset}>Log Another Fill</button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <h1 style={s.heading}>⛽ Log Fuel</h1>
      <p style={s.sub}>Record a fuel fill and upload the pump photo and slip.</p>

      <div style={s.card}>

        {/* Vehicle */}
        <label style={s.label}>
          Vehicle <span style={s.required}>*</span>
          <select
            style={s.select}
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            disabled={busy}
          >
            <option value="">— Select vehicle —</option>
            {vehicles.map(v => (
              <option key={v.vehicleId} value={v.vehicleId}>
                {v.fleetNumber}{v.registration ? ` (${v.registration})` : ""}
              </option>
            ))}
          </select>
        </label>

        {/* Litres */}
        <label style={s.label}>
          Litres filled <span style={s.required}>*</span>
          <NumericInput
            value={litres || ""}
            onChange={v => setLitres(Number(v) || 0)}
            placeholder="e.g. 50"
            style={s.input}
            disabled={busy}
          />
        </label>

        {/* Odometer */}
        <label style={s.label}>
          Odometer reading
          <NumericInput
            value={odometer}
            onChange={v => setOdometer(v === "" ? "" : Number(v))}
            placeholder="e.g. 123456"
            style={s.input}
            disabled={busy}
          />
        </label>

        {/* Cost per litre */}
        <label style={s.label}>
          Cost per litre (R)
          <NumericInput
            value={costPerLitre}
            onChange={v => setCostPerLitre(v === "" ? "" : Number(v))}
            placeholder="e.g. 22.50"
            style={s.input}
            disabled={busy}
          />
        </label>

        {/* Total cost preview */}
        {litres > 0 && costPerLitre !== "" && (
          <div style={s.totalRow}>
            Total: <strong>R {(litres * Number(costPerLitre)).toFixed(2)}</strong>
          </div>
        )}

        {/* Station */}
        <label style={s.label}>
          Station / Supplier
          <input
            type="text"
            style={s.input}
            value={station}
            onChange={e => setStation(e.target.value)}
            placeholder="e.g. Sasol N1"
            disabled={busy}
          />
        </label>

        {/* Reference */}
        <label style={s.label}>
          Reference / Invoice #
          <input
            type="text"
            style={s.input}
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Optional"
            disabled={busy}
          />
        </label>

        {/* Pump photo */}
        <div style={s.photoSection}>
          <div style={s.photoLabel}>
            📷 Pump photo <span style={s.required}>*</span>
            <span style={s.photoHint}>Show the litres and price on the pump display</span>
          </div>
          <input
            ref={pumpInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handlePumpPhoto}
          />
          {pumpPreview ? (
            <div style={s.previewWrap}>
              <img src={pumpPreview} alt="Pump" style={s.preview} />
              <button style={s.retakeBtn} onClick={() => { setPumpFile(null); setPumpPreview(null); }} disabled={busy}>
                Retake
              </button>
            </div>
          ) : (
            <button style={s.photoBtn} onClick={() => pumpInputRef.current?.click()} disabled={busy}>
              📷 Take Pump Photo
            </button>
          )}
        </div>

        {/* Slip photo */}
        <div style={s.photoSection}>
          <div style={s.photoLabel}>
            🧾 Slip photo <span style={s.required}>*</span>
            <span style={s.photoHint}>Photograph the printed till slip</span>
          </div>
          <input
            ref={slipInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleSlipPhoto}
          />
          {slipPreview ? (
            <div style={s.previewWrap}>
              <img src={slipPreview} alt="Slip" style={s.preview} />
              <button style={s.retakeBtn} onClick={() => { setSlipFile(null); setSlipPreview(null); }} disabled={busy}>
                Retake
              </button>
            </div>
          ) : (
            <button style={s.photoBtn} onClick={() => slipInputRef.current?.click()} disabled={busy}>
              📷 Take Slip Photo
            </button>
          )}
        </div>

        {error && <p style={s.errorMsg}>{error}</p>}

        <button
          style={{ ...s.btnPrimary, opacity: busy ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={busy}
        >
          {busy ? "Submitting…" : "Submit Fuel Log"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ color: "#64748b", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 14, color: green ? "#166534" : "#0f172a" }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "24px 16px 48px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  heading: { fontSize: 24, fontWeight: 900, color: "#0f172a", margin: "0 0 4px" },
  sub: { color: "#64748b", fontSize: 14, margin: "0 0 24px" },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
  required: { color: "#ef4444", marginLeft: 2 },
  input: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  totalRow: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 15,
    color: "#166534",
    marginTop: -8,
  },
  photoSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  photoLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
  photoHint: {
    fontSize: 12,
    fontWeight: 400,
    color: "#94a3b8",
  },
  photoBtn: {
    padding: "14px",
    fontSize: 15,
    fontWeight: 600,
    border: "2px dashed #94a3b8",
    borderRadius: 10,
    background: "#f8fafc",
    color: "#475569",
    cursor: "pointer",
    width: "100%",
  },
  previewWrap: {
    position: "relative",
    borderRadius: 10,
    overflow: "hidden",
    border: "2px solid #86efac",
  },
  preview: {
    width: "100%",
    display: "block",
    maxHeight: 220,
    objectFit: "cover",
  },
  retakeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    background: "rgba(0,0,0,0.65)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "14px",
    fontSize: 16,
    fontWeight: 700,
    background: "#166534",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    width: "100%",
  },
  errorMsg: {
    color: "#dc2626",
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    margin: 0,
  },
  // Done screen
  doneCard: {
    background: "#fff",
    border: "1px solid #bbf7d0",
    borderRadius: 20,
    padding: "36px 24px",
    textAlign: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  },
  doneCheck: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#dcfce7",
    color: "#166534",
    fontSize: 32,
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  doneTitle: { fontSize: 22, fontWeight: 900, color: "#14532d", margin: "0 0 4px" },
  doneSub: { color: "#64748b", fontSize: 13, margin: "0 0 20px" },
  doneSummary: { textAlign: "left", marginBottom: 24 },
};
