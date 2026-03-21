import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasRole, isLoggedIn, login, saveAuthTokens } from "../api/auth";
import PinInput from "../components/PinInput";

export default function LoginPage() {
  const nav = useNavigate();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [pin, setPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, skip this screen
  useEffect(() => {
    if (isLoggedIn()) nav(hasRole("Driver") ? "/driver" : "/app", { replace: true });
  }, [nav]);

  const canSubmit = useMemo(() => {
    return usernameOrEmail.trim().length > 0 && pin.length === 6 && !loading;
  }, [usernameOrEmail, pin, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    try {
      setLoading(true);

      // backend expects { usernameOrEmail, password }
      const resp = await login(usernameOrEmail.trim(), pin);

      saveAuthTokens(resp);
      nav(hasRole("Driver") ? "/driver" : "/app", { replace: true });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("unauthorized")) {
        setError("Incorrect username or PIN. Please try again.");
      } else {
        setError(msg || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <img src="/logo.jpeg" alt="KwaWicks logo" style={s.logoImg} />
          <div style={s.subtitle}>Sign in to continue</div>
        </div>

        <form onSubmit={onSubmit} style={s.form} aria-label="Login form">
          <label style={s.label}>
            Username / Email
            <input
              style={s.input}
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              disabled={loading}
            />
          </label>

          <label style={s.label}>
            PIN (6 digits)
            <div style={s.pwRow}>
              <PinInput value={pin} onChange={setPin} disabled={loading} />
            </div>
          </label>

          {error && (
            <div style={s.error} role="alert">
              {error}
            </div>
          )}

          <button type="submit" style={{ ...s.btn, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div style={s.help}>Need help? Contact your admin.</div>
        </form>
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