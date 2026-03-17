import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { usersApi } from "../api/usersApi";
import type { UserDto } from "../api/usersApi";
import { getProfileFromIdToken } from "../api/auth";

const GROUPS = ["Owner", "Finance", "Admin", "HubStaff", "Driver"] as const;

const GROUP_COLORS: Record<string, { bg: string; color: string }> = {
  Owner:    { bg: "#ede9fe", color: "#6d28d9" },
  Finance:  { bg: "#dbeafe", color: "#1d4ed8" },
  Admin:    { bg: "#dcfce7", color: "#166534" },
  HubStaff: { bg: "#cffafe", color: "#0e7490" },
  Driver:   { bg: "#fef9c3", color: "#92400e" },
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formGroup, setFormGroup] = useState<string>("Driver");
  const [formPin, setFormPin] = useState("");
  const [formPinConfirm, setFormPinConfirm] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const profile = getProfileFromIdToken();

  async function loadUsers() {
    setPageLoading(true);
    setPageError("");
    try {
      setUsers(await usersApi.list());
    } catch {
      setPageError("Failed to load users.");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function openCreate() {
    setFormUsername("");
    setFormGroup("Driver");
    setFormPin("");
    setFormPinConfirm("");
    setModalError("");
    setModal("create");
  }

  function openEdit(user: UserDto) {
    setEditTarget(user);
    setFormGroup(user.group || "Driver");
    setFormPin("");
    setFormPinConfirm("");
    setModalError("");
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
  }

  async function handleCreate() {
    if (!formUsername.trim()) { setModalError("Username is required."); return; }
    if (!formPin) { setModalError("PIN / password is required."); return; }
    if (formPin.length < 6) { setModalError("PIN must be at least 6 characters."); return; }
    if (formPin !== formPinConfirm) { setModalError("PINs do not match."); return; }
    setSaving(true);
    setModalError("");
    try {
      await usersApi.create({ username: formUsername.trim(), pin: formPin, group: formGroup });
      closeModal();
      await loadUsers();
    } catch (e: any) {
      setModalError(e?.message ?? "Failed to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (formPin) {
      if (formPin.length < 6) { setModalError("PIN must be at least 6 characters."); return; }
      if (formPin !== formPinConfirm) { setModalError("PINs do not match."); return; }
    }
    setSaving(true);
    setModalError("");
    try {
      const groupChanged = formGroup !== editTarget.group;
      if (groupChanged) {
        await usersApi.updateGroup(editTarget.username, { newGroup: formGroup, oldGroup: editTarget.group });
      }
      if (formPin) {
        await usersApi.setPin(editTarget.username, { pin: formPin });
      }
      if (!groupChanged && !formPin) {
        setModalError("No changes made.");
        setSaving(false);
        return;
      }
      closeModal();
      await loadUsers();
    } catch (e: any) {
      setModalError(e?.message ?? "Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(username: string) {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await usersApi.deleteUser(username);
      await loadUsers();
    } catch {
      alert("Failed to delete user.");
    }
  }

  const isDriver = formGroup === "Driver" || editTarget?.group === "Driver";

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.heading}>User Management</h2>
        <button style={s.addBtn} onClick={openCreate}>+ Add User</button>
      </div>

      {pageError && <p style={{ color: "#dc2626", marginBottom: 16 }}>{pageError}</p>}
      {pageLoading && <p style={{ color: "#94a3b8" }}>Loading…</p>}

      {!pageLoading && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Username</th>
                <th style={s.th}>Group</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const c = GROUP_COLORS[u.group] ?? { bg: "#f1f5f9", color: "#475569" };
                return (
                  <tr key={u.username}>
                    <td style={s.td}>
                      <strong>{u.username}</strong>
                      {u.username === profile?.username && (
                        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>(you)</span>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: c.bg, color: c.color }}>
                        {u.group || "—"}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, color: u.enabled ? "#166534" : "#dc2626" }}>
                        {u.userStatus === "CONFIRMED" ? (u.enabled ? "Active" : "Disabled") : u.userStatus}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={s.editBtn} onClick={() => openEdit(u)}>Edit</button>
                        {u.username !== profile?.username && (
                          <button style={s.deleteBtn} onClick={() => handleDelete(u.username)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "24px 12px", color: "#94a3b8", textAlign: "center" }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={s.overlay} onClick={closeModal}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <strong style={{ fontSize: 16 }}>
                {modal === "create" ? "Add New User" : `Edit: ${editTarget?.username}`}
              </strong>
              <button onClick={closeModal} style={s.closeBtn}>&#x2715;</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {modal === "create" && (
                <div>
                  <label style={s.label}>Username</label>
                  <input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    style={s.input}
                    placeholder="e.g. john_driver"
                    autoComplete="off"
                  />
                </div>
              )}

              <div>
                <label style={s.label}>Group</label>
                <select value={formGroup} onChange={(e) => setFormGroup(e.target.value)} style={s.input}>
                  {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label style={s.label}>
                  {modal === "create" ? "PIN / Password" : "New PIN / Password (leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value)}
                  style={s.input}
                  placeholder={modal === "create" ? "Min. 6 characters" : "Leave blank to keep unchanged"}
                  autoComplete="new-password"
                />
              </div>

              {(modal === "create" || formPin) && (
                <div>
                  <label style={s.label}>Confirm PIN / Password</label>
                  <input
                    type="password"
                    value={formPinConfirm}
                    onChange={(e) => setFormPinConfirm(e.target.value)}
                    style={s.input}
                    placeholder="Repeat PIN"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {isDriver && (
                <div style={s.driverNote}>
                  Drivers cannot view or change their own PIN. Only admins can manage driver access.
                </div>
              )}
            </div>

            {modalError && (
              <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12, marginBottom: 0 }}>{modalError}</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
              <button style={s.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button
                style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
                disabled={saving}
                onClick={modal === "create" ? handleCreate : handleEdit}
              >
                {saving ? "Saving…" : modal === "create" ? "Create User" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 20px", maxWidth: 900, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 },
  addBtn: {
    padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    background: "#15803d", color: "#fff", fontSize: 14, fontWeight: 600,
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0",
    fontWeight: 600, color: "#475569", fontSize: 12, textTransform: "uppercase",
    letterSpacing: "0.05em", whiteSpace: "nowrap",
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1e293b", whiteSpace: "nowrap" },
  badge: { padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  editBtn: {
    padding: "5px 14px", borderRadius: 6, border: "1px solid #cbd5e1", cursor: "pointer",
    background: "#f8fafc", color: "#475569", fontSize: 13,
  },
  deleteBtn: {
    padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    background: "#fee2e2", color: "#dc2626", fontSize: 13,
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modalBox: {
    background: "#fff", borderRadius: 12, padding: 24, maxWidth: 480, width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#64748b" },
  label: { display: "block", fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 4 },
  input: {
    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1",
    fontSize: 14, boxSizing: "border-box",
  },
  driverNote: {
    background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6,
    padding: "10px 12px", fontSize: 13, color: "#92400e",
  },
  cancelBtn: {
    padding: "8px 18px", borderRadius: 6, border: "1px solid #cbd5e1", cursor: "pointer",
    background: "#fff", color: "#475569", fontSize: 14,
  },
  saveBtn: {
    padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
    background: "#15803d", color: "#fff", fontSize: 14, fontWeight: 600,
  },
};
