import React, { useEffect, useState } from "react";
import { suppliersApi, emptySupplier } from "../api/suppliersApi";
import type { SupplierDto, CreateSupplierRequest } from "../api/suppliersApi";
import { hasAnyRole } from "../api/auth";

const ACCOUNT_TYPES = ["Current", "Savings", "Transmission"];
const canManage = () => hasAnyRole("Owner", "Admin", "Procurement");

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [form, setForm] = useState<CreateSupplierRequest>(emptySupplier());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setSuppliers(await suppliersApi.list());
    } catch { setError("Failed to load suppliers."); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptySupplier());
    setFormError("");
    setShowForm(true);
  }

  function openEdit(s: SupplierDto) {
    setEditing(s);
    setForm({
      name: s.name,
      address: { ...s.address },
      contactPerson: { ...s.contactPerson },
      contactFinance: { ...s.contactFinance },
      bankDetails: { ...s.bankDetails },
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this supplier?")) return;
    try {
      await suppliersApi.remove(id);
      setSuppliers(s => s.filter(x => x.supplierId !== id));
      setExpanded(null);
    } catch { setError("Failed to delete supplier."); }
  }

  async function submit() {
    if (!form.name.trim()) { setFormError("Supplier name is required."); return; }
    setBusy(true); setFormError("");
    try {
      if (editing) {
        const updated = await suppliersApi.update(editing.supplierId, form);
        setSuppliers(s => s.map(x => x.supplierId === editing.supplierId ? updated : x));
      } else {
        const created = await suppliersApi.create(form);
        setSuppliers(s => [...s, created]);
      }
      setShowForm(false);
    } catch (e: any) { setFormError(e?.message ?? "Save failed."); }
    finally { setBusy(false); }
  }

  const setAddr = (k: keyof typeof form.address, v: string) =>
    setForm(p => ({ ...p, address: { ...p.address, [k]: v } }));
  const setCp = (k: keyof typeof form.contactPerson, v: string) =>
    setForm(p => ({ ...p, contactPerson: { ...p.contactPerson, [k]: v } }));
  const setCf = (k: keyof typeof form.contactFinance, v: string) =>
    setForm(p => ({ ...p, contactFinance: { ...p.contactFinance, [k]: v } }));
  const setBd = (k: keyof typeof form.bankDetails, v: string) =>
    setForm(p => ({ ...p, bankDetails: { ...p.bankDetails, [k]: v } }));

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>Suppliers</div>
          <div style={s.pageSub}>Manage your supplier directory</div>
        </div>
        {canManage() && (
          <button style={s.primaryBtn} onClick={openCreate}>+ Add Supplier</button>
        )}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={s.loading}>Loading suppliers…</div>
      ) : suppliers.length === 0 ? (
        <div style={s.empty}>No suppliers yet. {canManage() && "Click \"+ Add Supplier\" to get started."}</div>
      ) : (
        <div style={s.list}>
          {suppliers.map(sup => (
            <div key={sup.supplierId} style={s.card}>
              <div style={s.cardHeader} onClick={() => setExpanded(expanded === sup.supplierId ? null : sup.supplierId)}>
                <div style={s.cardLeft}>
                  <div style={s.supplierName}>{sup.name}</div>
                  <div style={s.supplierMeta}>
                    {sup.address.city && <span>{sup.address.city}</span>}
                    {sup.contactPerson.name && <span> · {sup.contactPerson.name}</span>}
                    {sup.contactPerson.phone && <span> · {sup.contactPerson.phone}</span>}
                  </div>
                </div>
                <span style={s.chevron}>{expanded === sup.supplierId ? "▲" : "▼"}</span>
              </div>

              {expanded === sup.supplierId && (
                <div style={s.cardBody}>
                  <div style={s.detailGrid}>
                    <div style={s.detailSection}>
                      <div style={s.detailHeading}>📍 Address</div>
                      <div style={s.detailText}>{sup.address.street}</div>
                      <div style={s.detailText}>{[sup.address.city, sup.address.province, sup.address.postalCode].filter(Boolean).join(", ")}</div>
                    </div>
                    <div style={s.detailSection}>
                      <div style={s.detailHeading}>👤 Contact Person</div>
                      <div style={s.detailText}>{sup.contactPerson.name}</div>
                      <div style={s.detailText}>{sup.contactPerson.phone}</div>
                    </div>
                    <div style={s.detailSection}>
                      <div style={s.detailHeading}>💼 Finance Contact</div>
                      <div style={s.detailText}>{sup.contactFinance.name}</div>
                      <div style={s.detailText}>{sup.contactFinance.phone}</div>
                      <div style={s.detailText}>{sup.contactFinance.email}</div>
                    </div>
                    <div style={s.detailSection}>
                      <div style={s.detailHeading}>🏦 Bank Details</div>
                      <div style={s.detailText}>{sup.bankDetails.bankName}</div>
                      <div style={s.detailText}>Acc: {sup.bankDetails.accountNumber}</div>
                      <div style={s.detailText}>Branch: {sup.bankDetails.branchCode} · {sup.bankDetails.accountType}</div>
                    </div>
                  </div>
                  {canManage() && (
                    <div style={s.cardActions}>
                      <button style={s.editBtn} onClick={() => openEdit(sup)}>Edit</button>
                      <button style={s.deleteBtn} onClick={() => handleDelete(sup.supplierId)}>Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={s.backdrop} onClick={() => !busy && setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>{editing ? "Edit Supplier" : "New Supplier"}</div>
            {formError && <div style={s.formError}>{formError}</div>}

            <label style={s.label}>Supplier Name *
              <input style={s.input} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} disabled={busy} />
            </label>

            <div style={s.sectionHeading}>Address</div>
            <label style={s.label}>Street Address
              <input style={s.input} value={form.address.street} onChange={e => setAddr("street", e.target.value)} disabled={busy} />
            </label>
            <div style={s.twoCol}>
              <label style={s.label}>City
                <input style={s.input} value={form.address.city} onChange={e => setAddr("city", e.target.value)} disabled={busy} />
              </label>
              <label style={s.label}>Province
                <input style={s.input} value={form.address.province} onChange={e => setAddr("province", e.target.value)} disabled={busy} />
              </label>
            </div>
            <label style={s.label}>Postal Code
              <input style={{ ...s.input, maxWidth: 160 }} value={form.address.postalCode} onChange={e => setAddr("postalCode", e.target.value)} disabled={busy} />
            </label>

            <div style={s.sectionHeading}>Contact Person (Driver/Collections)</div>
            <div style={s.twoCol}>
              <label style={s.label}>Name
                <input style={s.input} value={form.contactPerson.name} onChange={e => setCp("name", e.target.value)} disabled={busy} />
              </label>
              <label style={s.label}>Phone
                <input style={s.input} value={form.contactPerson.phone} onChange={e => setCp("phone", e.target.value)} disabled={busy} inputMode="tel" />
              </label>
            </div>

            <div style={s.sectionHeading}>Finance Contact</div>
            <label style={s.label}>Name
              <input style={s.input} value={form.contactFinance.name} onChange={e => setCf("name", e.target.value)} disabled={busy} />
            </label>
            <div style={s.twoCol}>
              <label style={s.label}>Phone
                <input style={s.input} value={form.contactFinance.phone} onChange={e => setCf("phone", e.target.value)} disabled={busy} inputMode="tel" />
              </label>
              <label style={s.label}>Email
                <input style={s.input} value={form.contactFinance.email} onChange={e => setCf("email", e.target.value)} disabled={busy} inputMode="email" />
              </label>
            </div>

            <div style={s.sectionHeading}>Bank Details</div>
            <label style={s.label}>Bank Name
              <input style={s.input} value={form.bankDetails.bankName} onChange={e => setBd("bankName", e.target.value)} disabled={busy} />
            </label>
            <div style={s.twoCol}>
              <label style={s.label}>Account Number
                <input style={s.input} value={form.bankDetails.accountNumber} onChange={e => setBd("accountNumber", e.target.value)} disabled={busy} inputMode="numeric" />
              </label>
              <label style={s.label}>Branch Code
                <input style={s.input} value={form.bankDetails.branchCode} onChange={e => setBd("branchCode", e.target.value)} disabled={busy} inputMode="numeric" />
              </label>
            </div>
            <label style={s.label}>Account Type
              <select style={s.input} value={form.bankDetails.accountType} onChange={e => setBd("accountType", e.target.value)} disabled={busy}>
                {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submit} disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Create Supplier"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" },
  cardLeft: { flex: 1, minWidth: 0 },
  supplierName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  supplierMeta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  chevron: { fontSize: 12, color: "#94a3b8", marginLeft: 12 },
  cardBody: { padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 14 },
  detailSection: {},
  detailHeading: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 },
  detailText: { fontSize: 14, color: "#374151", lineHeight: 1.5 },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  editBtn: { padding: "7px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  deleteBtn: { padding: "7px 16px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, boxSizing: "border-box", marginTop: 32 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  formError: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  sectionHeading: { fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 16, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  label: { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb", color: "#111827", outline: "none" },
  modalBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 },
  primaryBtn: { padding: "10px 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
};
