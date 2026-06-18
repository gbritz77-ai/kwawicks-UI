import React, { useEffect, useState } from "react";
import { sitesApi } from "../api/sitesApi";
import type { SiteDto, CreateSiteRequest } from "../api/sitesApi";
import { hasAnyRole } from "../api/auth";

const canManage = () => hasAnyRole("Owner", "Admin");

const emptyForm = (): CreateSiteRequest => ({ name: "", address: "", contactName: "", contactPhone: "" });

export default function SitesPage() {
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSiteRequest>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setSites(await sitesApi.list());
    } catch { setError("Failed to load sites."); }
    finally { setLoading(false); }
  }

  function setF(field: keyof CreateSiteRequest, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) { setFormError("Site name is required."); return; }
    setBusy(true);
    setFormError("");
    try {
      const created = await sitesApi.create(form);
      setSites(s => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowForm(false);
      setForm(emptyForm());
    } catch (e: any) {
      setFormError(e?.message ?? "Save failed.");
    } finally { setBusy(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>📍 Sites</div>
          <div style={s.sub}>Manage your farm / depot locations</div>
        </div>
        {canManage() && (
          <button style={s.btnPrimary} onClick={() => { setShowForm(true); setFormError(""); }}>+ Add Site</button>
        )}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {showForm && (
        <div style={s.formCard}>
          <div style={s.formTitle}>New Site</div>
          <label style={s.label}>Site Name *</label>
          <input style={s.input} value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Main Farm, North Depot" />
          <label style={s.label}>Address</label>
          <input style={s.input} value={form.address} onChange={e => setF("address", e.target.value)} placeholder="Physical address" />
          <div style={s.formRow}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Contact Name</label>
              <input style={s.input} value={form.contactName} onChange={e => setF("contactName", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Contact Phone</label>
              <input style={s.input} value={form.contactPhone} onChange={e => setF("contactPhone", e.target.value)} />
            </div>
          </div>
          {formError && <div style={s.formError}>{formError}</div>}
          <div style={s.formFooter}>
            <button style={s.btnSecondary} onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
            <button style={s.btnPrimary} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save Site"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={s.loadingText}>Loading…</div>
      ) : sites.length === 0 ? (
        <div style={s.emptyText}>No sites yet. Add your first site above.</div>
      ) : (
        <div style={s.list}>
          {sites.map(site => (
            <div key={site.siteId} style={s.card}>
              <div style={s.siteIcon}>📍</div>
              <div>
                <div style={s.siteName}>{site.name}</div>
                {site.address && <div style={s.siteSub}>{site.address}</div>}
                {site.contactName && (
                  <div style={s.siteSub}>
                    {site.contactName}{site.contactPhone ? ` · ${site.contactPhone}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", gap: 12, alignItems: "flex-start" },
  siteIcon: { fontSize: 20, marginTop: 2 },
  siteName: { fontSize: 15, fontWeight: 700, color: "#1e293b" },
  siteSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  formCard: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 20, marginBottom: 24 },
  formTitle: { fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12 },
  formRow: { display: "flex", gap: 16, marginTop: 0 },
  formFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
};
