import React, { useEffect, useState } from "react";
import { staffMembersApi } from "../api/staffMembersApi";
import type { StaffMemberDto, CreateStaffMemberRequest, UpdateStaffMemberRequest } from "../api/staffMembersApi";
import { hasAnyRole } from "../api/auth";

const canManage = () => hasAnyRole("Owner", "Finance", "Admin");

const emptyForm = (): CreateStaffMemberRequest => ({ name: "", phone: "", department: "" });

export default function StaffMembersPage() {
  const [members, setMembers] = useState<StaffMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StaffMemberDto | null>(null);
  const [form, setForm] = useState<CreateStaffMemberRequest>(emptyForm());
  const [formIsActive, setFormIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setMembers(await staffMembersApi.list());
    } catch { setError("Failed to load staff members."); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormIsActive(true);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(m: StaffMemberDto) {
    setEditing(m);
    setForm({ name: m.name, phone: m.phone, department: m.department });
    setFormIsActive(m.isActive);
    setFormError("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setBusy(true);
    setFormError("");
    try {
      if (editing) {
        const req: UpdateStaffMemberRequest = { ...form, isActive: formIsActive };
        const updated = await staffMembersApi.update(editing.staffMemberId, req);
        setMembers(ms => ms.map(m => m.staffMemberId === updated.staffMemberId ? updated : m));
      } else {
        const created = await staffMembersApi.create(form);
        setMembers(ms => [created, ...ms]);
      }
      setShowForm(false);
    } catch (e: any) {
      setFormError(e?.message ?? "Save failed.");
    } finally { setBusy(false); }
  }

  const active = members.filter(m => m.isActive);
  const inactive = members.filter(m => !m.isActive);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>👥 Staff Members</div>
          <div style={s.sub}>Staff who buy on account — statements sent monthly</div>
        </div>
        {canManage() && (
          <button style={s.btnPrimary} onClick={openCreate}>+ Add Staff Member</button>
        )}
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={s.loadingText}>Loading...</div>
      ) : (
        <>
          <Section title={`Active (${active.length})`}>
            {active.length === 0 ? (
              <div style={s.emptyText}>No active staff members.</div>
            ) : (
              <div style={s.grid}>
                {active.map(m => <MemberCard key={m.staffMemberId} member={m} onEdit={openEdit} canManage={canManage()} />)}
              </div>
            )}
          </Section>

          {inactive.length > 0 && (
            <Section title={`Inactive (${inactive.length})`}>
              <div style={s.grid}>
                {inactive.map(m => <MemberCard key={m.staffMemberId} member={m} onEdit={openEdit} canManage={canManage()} />)}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <strong>{editing ? "Edit Staff Member" : "Add Staff Member"}</strong>
              <button style={s.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>

            <label style={s.label}>Name *</label>
            <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />

            <label style={s.label}>WhatsApp / Phone</label>
            <input style={s.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 27821234567" />

            <label style={s.label}>Department</label>
            <input style={s.input} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Warehouse, Sales" />

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

function MemberCard({ member, onEdit, canManage }: { member: StaffMemberDto; onEdit: (m: StaffMemberDto) => void; canManage: boolean }) {
  return (
    <div style={{ ...s.card, opacity: member.isActive ? 1 : 0.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={s.memberName}>{member.name}</div>
          {member.department && <div style={s.memberSub}>{member.department}</div>}
          {member.phone && <div style={s.memberSub}>📱 {member.phone}</div>}
          {!member.isActive && <div style={{ ...s.badge, background: "#fee2e2", color: "#991b1b" }}>Inactive</div>}
        </div>
        {canManage && (
          <button style={s.editBtn} onClick={() => onEdit(member)}>Edit</button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loadingText: { color: "#94a3b8", padding: 24 },
  emptyText: { color: "#94a3b8", fontSize: 14, padding: "12px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  memberName: { fontSize: 15, fontWeight: 700, color: "#1e293b" },
  memberSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  badge: { display: "inline-block", fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 6px", marginTop: 6 },
  editBtn: { fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" },
  btnPrimary: { background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 18px", fontSize: 14, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, fontSize: 16 },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#64748b" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" as const },
  formError: { color: "#dc2626", fontSize: 13, marginTop: 8 },
};
