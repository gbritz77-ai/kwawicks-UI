import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasRole, isLoggedIn, login, saveAuthTokens, saveBranchAuth } from "../api/auth";
import { branchLogin } from "../api/branchesApi";
import PinInput from "../components/PinInput";

export default function LoginPage() {
  const nav = useNavigate();

  const [tab, setTab] = useState<"staff" | "branch">("staff");

  // Staff login
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Branch login
  const [branchUsername, setBranchUsername] = useState("");
  const [branchPin, setBranchPin]           = useState("");
  const [branchLoading, setBranchLoading]   = useState(false);
  const [branchError, setBranchError]       = useState<string | null>(null);

  // If already logged in, skip this screen
  useEffect(() => {
    if (isLoggedIn()) nav(hasRole("Driver") ? "/driver" : "/app", { replace: true });
  }, [nav]);

  const canSubmit = useMemo(
    () => usernameOrEmail.trim().length > 0 && pin.length === 6 && !loading,
    [usernameOrEmail, pin, loading]
  );

  const canBranchSubmit = useMemo(
    () => branchUsername.trim().length > 0 && branchPin.length >= 4 && !branchLoading,
    [branchUsername, branchPin, branchLoading]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    try {
      setLoading(true);
      const resp = await login(usernameOrEmail.trim(), pin);
      saveAuthTokens(resp);
      nav(hasRole("Driver") ? "/driver" : "/app", { replace: true });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      setError(
        msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("unauthorized")
          ? "Incorrect username or PIN. Please try again."
          : msg || "Login failed. Please try again."
      );
    } finally { setLoading(false); }
  }

  async function onBranchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBranchError(null);
    if (!canBranchSubmit) return;
    try {
      setBranchLoading(true);
      const resp = await branchLogin(branchUsername.trim(), branchPin);
      saveBranchAuth(resp.token, {
        username:   resp.username,
        hubId:      resp.branchId,
        branchName: resp.branchName,
        permissions: resp.permissions,
      }, resp.expiresIn);
      nav("/app", { replace: true });
    } catch (err: any) {
      setBranchError(err?.message || "Branch login failed. Please try again.");
    } finally { setBranchLoading(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <img src="/logo.jpeg" alt="KwaWicks logo" style={s.logoImg} />
        </div>

        {/* Login type tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tabBtn, ...(tab === "staff"  ? s.tabActive : {}) }} onClick={() => setTab("staff")}>Staff Login</button>
          <button style={{ ...s.tabBtn, ...(tab === "branch" ? s.tabActive : {}) }} onClick={() => setTab("branch")}>Branch Login</button>
        </div>

        {tab === "staff" ? (
          <form onSubmit={onSubmit} style={s.form} aria-label="Staff login form">
            <label style={s.label}>
              Username / Email
              <input style={s.input} value={usernameOrEmail} onChange={e => setUsernameOrEmail(e.target.value)} placeholder="Enter your username" autoComplete="username" disabled={loading} />
            </label>
            <label style={s.label}>
              PIN (6 digits)
              <div style={s.pwRow}><PinInput value={pin} onChange={setPin} disabled={loading} /></div>
            </label>
            {error && <div style={s.error} role="alert">{error}</div>}
            <button type="submit" style={{ ...s.btn, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <div style={s.help}>Need help? Contact your admin.</div>
          </form>
        ) : (
          <form onSubmit={onBranchSubmit} style={s.form} aria-label="Branch login form">
            <label style={s.label}>
              Branch Username
              <input style={s.input} value={branchUsername} onChange={e => setBranchUsername(e.target.value)} placeholder="Enter branch username" autoComplete="username" disabled={branchLoading} />
            </label>
            <label style={s.label}>
              PIN
              <div style={s.pwRow}><PinInput value={branchPin} onChange={setBranchPin} disabled={branchLoading} /></div>
            </label>
            {branchError && <div style={s.error} role="alert">{branchError}</div>}
            <button type="submit" style={{ ...s.btn, opacity: canBranchSubmit ? 1 : 0.6 }} disabled={!canBranchSubmit}>
              {branchLoading ? "Signing in..." : "Sign in"}
            </button>
            <div style={s.help}>Use the credentials set up by your Master user.</div>
          </form>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#f1f2f5",
    color: "#111827",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },

  tabs: {
    display: "flex",
    borderBottom: "2px solid #e5e7eb",
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    background: "none",
    border: "none",
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    color: "#6b7280",
    borderBottom: "2px solid transparent",
    marginBottom: -2,
  },
  tabActive: {
    color: "#16a34a",
    borderBottom: "2px solid #16a34a",
  },

  card: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: "20px 20px",
    boxSizing: "border-box" as const,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },

  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },

  logoImg: {
    width: 180,
    height: 180,
    borderRadius: 999,
    objectFit: "cover" as const,
  },

  subtitle: { fontSize: 13, color: "#6b7280", textAlign: "center" },

  form: { display: "grid", gap: 12, minWidth: 0 },

  label: {
    display: "grid",
    gap: 6,
    fontWeight: 600,
    fontSize: 14,
    minWidth: 0,
  },

  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    fontSize: 16,
    outline: "none",
  },

  pwRow: { display: "flex", gap: 10, alignItems: "center", width: "100%", minWidth: 0 },

  error: {
    padding: 12,
    borderRadius: 12,
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 14,
  },

  btn: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    boxSizing: "border-box" as const,
  },

  help: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
  },
};