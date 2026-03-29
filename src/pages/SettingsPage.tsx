import React, { useEffect, useState } from "react";
import { settingsApi } from "../api/settingsApi";
import type { AppSettingsDto } from "../api/settingsApi";

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-ZA", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "Never";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Hub WhatsApp edit
  const [editing, setEditing] = useState(false);
  const [hubPhone, setHubPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const s = await settingsApi.get();
      setSettings(s);
      setHubPhone(s.hubWhatsAppNumber ?? "");
    } catch {
      setError("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSavedOk(false);
    try {
      const updated = await settingsApi.update({ hubWhatsAppNumber: hubPhone.trim() });
      setSettings(updated);
      setEditing(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setHubPhone(settings?.hubWhatsAppNumber ?? "");
    setSaveError("");
    setEditing(true);
  }

  function cancelEdit() {
    setHubPhone(settings?.hubWhatsAppNumber ?? "");
    setSaveError("");
    setEditing(false);
  }

  return (
    <div style={s.page}>
      <h1 style={s.heading}>System Settings</h1>
      <p style={s.sub}>Configure system-wide settings for KwaWicks.</p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error  && <p style={{ color: "#ef4444" }}>{error}</p>}

      {!loading && !error && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div>
              <div style={s.sectionTitle}>📱 Hub WhatsApp Number</div>
              <div style={s.sectionDesc}>
                This is the number that receives a WhatsApp notification whenever a new Hub Request is created.
                Must be a valid South African mobile number.
              </div>
            </div>
          </div>

          <div style={s.card}>
            {!editing ? (
              <div style={s.viewRow}>
                <div>
                  <div style={s.fieldLabel}>Current number</div>
                  <div style={s.fieldValue}>
                    {settings?.hubWhatsAppNumber
                      ? <span style={s.phoneVal}>{settings.hubWhatsAppNumber}</span>
                      : <span style={s.notSet}>Not configured</span>}
                  </div>
                  {settings?.updatedAtUtc && (
                    <div style={s.lastUpdated}>
                      Last updated {fmtDate(settings.updatedAtUtc)}
                      {settings.updatedBy ? ` by ${settings.updatedBy}` : ""}
                    </div>
                  )}
                </div>
                <button style={s.btnEdit} onClick={startEdit}>
                  ✏️ Edit
                </button>
              </div>
            ) : (
              <div>
                <div style={s.fieldLabel}>WhatsApp / phone number</div>
                <input
                  type="tel"
                  style={s.input}
                  placeholder="e.g. 0821234567 or 27821234567"
                  value={hubPhone}
                  onChange={e => setHubPhone(e.target.value)}
                  autoFocus
                />
                <div style={s.inputHint}>
                  Enter a South African mobile number. Both formats work: <code>0821234567</code> or <code>27821234567</code>.
                </div>
                {saveError && <p style={s.errText}>{saveError}</p>}
                <div style={s.editActions}>
                  <button style={s.btnSecondary} onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </button>
                  <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {savedOk && (
            <div style={s.successBanner}>
              ✓ Hub WhatsApp number updated successfully.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 24px 64px",
    maxWidth: 640,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#e2e8f0",
  },
  heading: { margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#f1f5f9" },
  sub: { margin: "0 0 28px", fontSize: 14, color: "#94a3b8" },
  section: { marginBottom: 32 },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: "#94a3b8", lineHeight: 1.6 },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "18px 20px",
  },
  viewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  fieldLabel: { fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 },
  fieldValue: { fontSize: 16, marginBottom: 4 },
  phoneVal: { color: "#f1f5f9", fontWeight: 600, fontFamily: "ui-monospace, monospace" },
  notSet: { color: "#ef4444", fontStyle: "italic" },
  lastUpdated: { fontSize: 12, color: "#64748b" },
  btnEdit: {
    background: "none",
    border: "1px solid #475569",
    color: "#94a3b8",
    borderRadius: 7,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  input: {
    background: "#0f172a",
    border: "1px solid #475569",
    borderRadius: 6,
    color: "#e2e8f0",
    padding: "9px 12px",
    fontSize: 15,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 6,
  },
  inputHint: { fontSize: 12, color: "#64748b", marginBottom: 14 },
  errText: { color: "#ef4444", fontSize: 13, margin: "0 0 10px" },
  editActions: { display: "flex", justifyContent: "flex-end", gap: 10 },
  btnPrimary: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#1e293b",
    color: "#94a3b8",
    border: "1px solid #475569",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 14,
    cursor: "pointer",
  },
  successBanner: {
    marginTop: 12,
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#4ade80",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
  },
};
