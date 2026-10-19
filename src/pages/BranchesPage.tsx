import React, { useEffect, useState } from "react";
import { branchesApi, PERMISSION_GROUPS } from "../api/branchesApi";
import type { BranchDto, BranchUserDto, CreateBranchRequest, UpdateBranchRequest } from "../api/branchesApi";

// ── helpers ────────────────────────────────────────────────────────────────

function allPermKeys(): string[] {
  return PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));
}

// ── component ──────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");

  // selected branch
  const [selected, setSelected] = useState<BranchDto | null>(null);

  // create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formLoc, setFormLoc]   = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formPerms, setFormPerms]   = useState<string[]>([]);
  const [formBusy, setFormBusy]     = useState(false);
  const [formErr, setFormErr]       = useState("");

  // new user form
  const [showUserForm, setShowUserForm] = useState(false);
  const [userUsername, setUserUsername] = useState("");
  const [userPin, setUserPin]           = useState("");
  const [userPin2, setUserPin2]         = useState("");
  const [userBusy, setUserBusy]         = useState(false);
  const [userErr, setUserErr]           = useState("");

  // change PIN modal
  const [changePinFor, setChangePinFor] = useState<BranchUserDto | null>(null);
  const [newPin, setNewPin]             = useState("");
  const [newPin2, setNewPin2]           = useState("");
  const [pinBusy, setPinBusy]           = useState(false);
  const [pinErr, setPinErr]             = useState("");

  async function load() {
    try {
      setLoading(true);
      const data = await branchesApi.list();
      setBranches(data);
      if (selected) {
        const fresh = data.find(b => b.branchId === selected.branchId);
        setSelected(fresh ?? null);
      }
    } catch (e: any) { setErr(e.message ?? "Failed to load branches."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // ── branch form helpers ──────────────────────────────────────────────────

  function openCreate() {
    setEditId(null);
    setFormName(""); setFormLoc(""); setFormActive(true); setFormPerms([]); setFormErr("");
    setShowForm(true);
  }

  function openEdit(b: BranchDto) {
    setEditId(b.branchId);
    setFormName(b.name); setFormLoc(b.location); setFormActive(b.isActive);
    setFormPerms([...b.permissions]); setFormErr("");
    setShowForm(true);
  }

  function togglePerm(key: string) {
    setFormPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleGroup(keys: string[]) {
    const all = keys.every(k => formPerms.includes(k));
    if (all) setFormPerms(prev => prev.filter(k => !keys.includes(k)));
    else setFormPerms(prev => [...new Set([...prev, ...keys])]);
  }

  function selectAll() { setFormPerms(allPermKeys()); }
  function clearAll()  { setFormPerms([]); }

  async function submitBranchForm() {
    if (!formName.trim()) { setFormErr("Name is required."); return; }
    setFormBusy(true); setFormErr("");
    try {
      if (editId) {
        const req: UpdateBranchRequest = { name: formName.trim(), location: formLoc.trim(), isActive: formActive, permissions: formPerms };
        const updated = await branchesApi.update(editId, req);
        if (selected?.branchId === editId) setSelected(updated);
      } else {
        const req: CreateBranchRequest = { name: formName.trim(), location: formLoc.trim(), permissions: formPerms };
        await branchesApi.create(req);
      }
      setShowForm(false);
      await load();
    } catch (e: any) { setFormErr(e.message ?? "Failed to save branch."); }
    finally { setFormBusy(false); }
  }

  async function deleteBranch(b: BranchDto) {
    if (!window.confirm(`Delete branch "${b.name}"? This also removes all its users.`)) return;
    try {
      await branchesApi.delete(b.branchId);
      if (selected?.branchId === b.branchId) setSelected(null);
      await load();
    } catch (e: any) { alert(e.message ?? "Failed to delete."); }
  }

  // ── user form helpers ────────────────────────────────────────────────────

  function openUserForm() {
    setUserUsername(""); setUserPin(""); setUserPin2(""); setUserErr("");
    setShowUserForm(true);
  }

  async function submitUserForm() {
    if (!userUsername.trim()) { setUserErr("Username is required."); return; }
    if (userPin.length < 4)   { setUserErr("PIN must be at least 4 digits."); return; }
    if (userPin !== userPin2) { setUserErr("PINs do not match."); return; }
    if (!selected) return;
    setUserBusy(true); setUserErr("");
    try {
      await branchesApi.createUser(selected.branchId, userUsername.trim(), userPin);
      setShowUserForm(false);
      await load();
    } catch (e: any) { setUserErr(e.message ?? "Failed to create user."); }
    finally { setUserBusy(false); }
  }

  async function deleteUser(u: BranchUserDto) {
    if (!selected) return;
    if (!window.confirm(`Remove user "${u.username}"?`)) return;
    try {
      await branchesApi.deleteUser(selected.branchId, u.branchUserId);
      await load();
    } catch (e: any) { alert(e.message ?? "Failed to delete user."); }
  }

  async function submitChangePin() {
    if (!changePinFor || !selected) return;
    if (newPin.length < 4)   { setPinErr("PIN must be at least 4 digits."); return; }
    if (newPin !== newPin2)  { setPinErr("PINs do not match."); return; }
    setPinBusy(true); setPinErr("");
    try {
      await branchesApi.updateUserPin(selected.branchId, changePinFor.branchUserId, newPin);
      setChangePinFor(null);
    } catch (e: any) { setPinErr(e.message ?? "Failed to update PIN."); }
    finally { setPinBusy(false); }
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <h1 style={s.title}>Branches</h1>
        <button style={s.btn} onClick={openCreate}>+ New Branch</button>
      </div>

      {err && <div style={s.errBanner}>{err}</div>}

      <div style={s.layout}>
        {/* Left: branch list */}
        <div style={s.sidebar}>
          {loading ? <div style={s.dim}>Loading…</div> : branches.length === 0 ? (
            <div style={s.dim}>No branches yet.</div>
          ) : branches.map(b => (
            <div
              key={b.branchId}
              style={{ ...s.branchCard, ...(selected?.branchId === b.branchId ? s.branchCardActive : {}) }}
              onClick={() => setSelected(b)}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={s.branchName}>{b.name}</div>
                  {b.location && <div style={s.branchLoc}>{b.location}</div>}
                  <div style={{ marginTop:4, display:"flex", gap:6, flexWrap:"wrap" }}>
                    <span style={{ ...s.badge, background: b.isActive ? "#dcfce7" : "#fee2e2", color: b.isActive ? "#166534" : "#991b1b" }}>
                      {b.isActive ? "Active" : "Inactive"}
                    </span>
                    <span style={{ ...s.badge, background:"#e0f2fe", color:"#0369a1" }}>{b.users.length} user{b.users.length !== 1 ? "s" : ""}</span>
                    <span style={{ ...s.badge, background:"#f3e8ff", color:"#7e22ce" }}>{b.permissions.length} permissions</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button style={s.iconBtn} onClick={e => { e.stopPropagation(); openEdit(b); }}>✎</button>
                  <button style={{ ...s.iconBtn, color:"#dc2626" }} onClick={e => { e.stopPropagation(); deleteBranch(b); }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right: selected branch detail */}
        <div style={s.detail}>
          {!selected ? (
            <div style={s.dim}>Select a branch to manage users and permissions.</div>
          ) : (
            <>
              <div style={s.detailHeader}>
                <div>
                  <div style={s.detailTitle}>{selected.name}</div>
                  {selected.location && <div style={s.dim}>{selected.location}</div>}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={s.btn} onClick={() => openEdit(selected)}>Edit</button>
                  <button style={s.btnSecondary} onClick={openUserForm}>+ Add User</button>
                </div>
              </div>

              {/* Users */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Users</div>
                {selected.users.length === 0 ? (
                  <div style={s.dim}>No users yet. Add a user to allow branch login.</div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr>{["Username","Status","Actions"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {selected.users.map(u => (
                        <tr key={u.branchUserId} style={s.tr}>
                          <td style={s.td}>{u.username}</td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, background: u.isActive ? "#dcfce7" : "#fee2e2", color: u.isActive ? "#166534" : "#991b1b" }}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={s.td}>
                            <div style={{ display:"flex", gap:6 }}>
                              <button style={s.smallBtn} onClick={() => { setChangePinFor(u); setNewPin(""); setNewPin2(""); setPinErr(""); }}>Change PIN</button>
                              <button style={{ ...s.smallBtn, color:"#dc2626", borderColor:"#fca5a5" }} onClick={() => deleteUser(u)}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Permissions summary */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Permissions ({selected.permissions.length})</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
                  {selected.permissions.length === 0
                    ? <span style={s.dim}>None assigned — click Edit to set permissions.</span>
                    : selected.permissions.map(p => (
                        <span key={p} style={{ ...s.badge, background:"#f3e8ff", color:"#7e22ce" }}>{p}</span>
                      ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Branch form modal */}
      {showForm && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={s.modal}>
            <div style={s.modalTitle}>{editId ? "Edit Branch" : "New Branch"}</div>

            <div style={s.fieldRow}>
              <label style={s.label}>Name *</label>
              <input style={s.input} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Main Street Branch" />
            </div>
            <div style={s.fieldRow}>
              <label style={s.label}>Location</label>
              <input style={s.input} value={formLoc} onChange={e => setFormLoc(e.target.value)} placeholder="e.g. 12 Main St, Pretoria" />
            </div>
            {editId && (
              <div style={s.fieldRow}>
                <label style={s.label}>Active</label>
                <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
              </div>
            )}

            {/* Permissions */}
            <div style={{ marginTop:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={s.sectionTitle}>Menu Permissions</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={s.smallBtn} onClick={selectAll}>Select All</button>
                  <button style={s.smallBtn} onClick={clearAll}>Clear All</button>
                </div>
              </div>
              {PERMISSION_GROUPS.map(g => {
                const keys = g.items.map(i => i.key);
                const allOn = keys.every(k => formPerms.includes(k));
                const someOn = keys.some(k => formPerms.includes(k));
                return (
                  <div key={g.group} style={s.permGroup}>
                    <div style={s.permGroupHeader}>
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                        onChange={() => toggleGroup(keys)}
                      />
                      <span style={s.permGroupLabel}>{g.group}</span>
                    </div>
                    <div style={s.permItems}>
                      {g.items.map(item => (
                        <label key={item.key} style={s.permItem}>
                          <input
                            type="checkbox"
                            checked={formPerms.includes(item.key)}
                            onChange={() => togglePerm(item.key)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {formErr && <div style={s.errBanner}>{formErr}</div>}
            <div style={s.modalActions}>
              <button style={s.btnSecondary} onClick={() => setShowForm(false)} disabled={formBusy}>Cancel</button>
              <button style={s.btn} onClick={submitBranchForm} disabled={formBusy}>{formBusy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showUserForm && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowUserForm(false); }}>
          <div style={{ ...s.modal, maxWidth:420 }}>
            <div style={s.modalTitle}>Add Branch User</div>
            <div style={s.fieldRow}>
              <label style={s.label}>Username *</label>
              <input style={s.input} value={userUsername} onChange={e => setUserUsername(e.target.value)} placeholder="e.g. branchstaff1" autoComplete="off" />
            </div>
            <div style={s.fieldRow}>
              <label style={s.label}>PIN *</label>
              <input style={s.input} type="password" value={userPin} onChange={e => setUserPin(e.target.value)} placeholder="Min 4 digits" autoComplete="new-password" />
            </div>
            <div style={s.fieldRow}>
              <label style={s.label}>Confirm PIN *</label>
              <input style={s.input} type="password" value={userPin2} onChange={e => setUserPin2(e.target.value)} placeholder="Re-enter PIN" autoComplete="new-password" />
            </div>
            {userErr && <div style={s.errBanner}>{userErr}</div>}
            <div style={s.modalActions}>
              <button style={s.btnSecondary} onClick={() => setShowUserForm(false)} disabled={userBusy}>Cancel</button>
              <button style={s.btn} onClick={submitUserForm} disabled={userBusy}>{userBusy ? "Creating…" : "Create User"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN modal */}
      {changePinFor && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setChangePinFor(null); }}>
          <div style={{ ...s.modal, maxWidth:380 }}>
            <div style={s.modalTitle}>Change PIN — {changePinFor.username}</div>
            <div style={s.fieldRow}>
              <label style={s.label}>New PIN *</label>
              <input style={s.input} type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Min 4 digits" autoComplete="new-password" />
            </div>
            <div style={s.fieldRow}>
              <label style={s.label}>Confirm PIN *</label>
              <input style={s.input} type="password" value={newPin2} onChange={e => setNewPin2(e.target.value)} placeholder="Re-enter PIN" autoComplete="new-password" />
            </div>
            {pinErr && <div style={s.errBanner}>{pinErr}</div>}
            <div style={s.modalActions}>
              <button style={s.btnSecondary} onClick={() => setChangePinFor(null)} disabled={pinBusy}>Cancel</button>
              <button style={s.btn} onClick={submitChangePin} disabled={pinBusy}>{pinBusy ? "Saving…" : "Update PIN"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:        { padding:"24px 28px", fontFamily:"system-ui, sans-serif", maxWidth:1200 },
  topRow:      { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  title:       { margin:0, fontSize:22, fontWeight:800, color:"#0f172a" },
  layout:      { display:"grid", gridTemplateColumns:"340px 1fr", gap:20, alignItems:"start" },
  sidebar:     { display:"flex", flexDirection:"column", gap:10 },
  branchCard:  { background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"14px 16px", cursor:"pointer", transition:"border-color .15s" },
  branchCardActive: { borderColor:"#22c55e", background:"#f0fdf4" },
  branchName:  { fontWeight:700, fontSize:15, color:"#0f172a" },
  branchLoc:   { fontSize:13, color:"#64748b", marginTop:2 },
  detail:      { background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 24px", minHeight:300 },
  detailHeader:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 },
  detailTitle: { fontSize:18, fontWeight:800, color:"#0f172a" },
  section:     { marginTop:24, paddingTop:20, borderTop:"1px solid #f1f5f9" },
  sectionTitle:{ fontSize:13, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em", color:"#64748b" },
  dim:         { color:"#94a3b8", fontSize:14 },
  errBanner:   { background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, marginTop:10 },

  btn:          { background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:14, fontWeight:600, cursor:"pointer" },
  btnSecondary: { background:"#f8fafc", color:"#374151", border:"1px solid #d1d5db", borderRadius:8, padding:"8px 16px", fontSize:14, fontWeight:500, cursor:"pointer" },
  smallBtn:     { background:"none", border:"1px solid #d1d5db", borderRadius:6, padding:"3px 10px", fontSize:12, cursor:"pointer", color:"#374151" },
  iconBtn:      { background:"none", border:"1px solid #e2e8f0", borderRadius:6, padding:"2px 8px", fontSize:14, cursor:"pointer", color:"#374151" },

  badge:  { fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:20, whiteSpace:"nowrap" as const },
  table:  { width:"100%", borderCollapse:"collapse" as const, marginTop:10 },
  th:     { padding:"8px 12px", borderBottom:"2px solid #f1f5f9", textAlign:"left" as const, fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase" as const, letterSpacing:"0.04em" },
  tr:     { borderBottom:"1px solid #f8fafc" },
  td:     { padding:"10px 12px", fontSize:14 },

  // Modal
  overlay:      { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modal:        { background:"#fff", borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:640, maxHeight:"85vh", overflowY:"auto" as const, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle:   { fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:20 },
  modalActions: { display:"flex", gap:10, justifyContent:"flex-end", marginTop:24 },
  fieldRow:     { marginBottom:14 },
  label:        { display:"block", fontSize:13, fontWeight:600, color:"#374151", marginBottom:5 },
  input:        { width:"100%", border:"1px solid #d1d5db", borderRadius:8, padding:"8px 12px", fontSize:14, boxSizing:"border-box" as const },

  // Permissions
  permGroup:       { marginBottom:16 },
  permGroupHeader: { display:"flex", alignItems:"center", gap:8, marginBottom:8 },
  permGroupLabel:  { fontWeight:700, fontSize:13, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.04em" },
  permItems:       { display:"flex", flexWrap:"wrap" as const, gap:10, paddingLeft:24 },
  permItem:        { display:"flex", alignItems:"center", gap:6, fontSize:14, cursor:"pointer", color:"#374151" },
};
