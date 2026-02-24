import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn, login, saveAuthTokens } from "../api/auth";
import PinInput from "../components/PinInput";

export default function LoginPage() {
  const nav = useNavigate();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [pin, setPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, skip this screen
  useEffect(() => {
    if (isLoggedIn()) nav("/app", { replace: true });
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
      nav("/app", { replace: true });
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
          <div style={s.logo} aria-hidden="true">
            K
          </div>
          <div>
            <div style={s.title}>KwaWicks</div>
            <div style={s.subtitle}>Sign in to continue</div>
          </div>
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
  inset: 0,                // top:0 right:0 bottom:0 left:0
  display: "grid",
  placeItems: "center",    // perfect centering
  padding: 18,
  background: "#f1f2f5",
  color: "#111827",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
},

  card: {
    width: "min(520px, 92vw)",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },

  header: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 22,
  },

  logo: {
    width: 46,
    height: 46,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    background: "#2563eb",
    color: "#ffffff",
  },

  title: { fontSize: 22, fontWeight: 900 },
  subtitle: { fontSize: 14, color: "#6b7280" },

  form: { display: "grid", gap: 16 },

  label: {
    display: "grid",
    gap: 8,
    fontWeight: 600,
    fontSize: 14,
  },

  input: {
    width: "95%",
    padding: "14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    fontSize: 16,
    outline: "none",
  },

  pwRow: { display: "flex", gap: 10, alignItems: "center" },

  error: {
    padding: 12,
    borderRadius: 12,
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 14,
  },

  btn: {
    padding: "14px 16px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },

  help: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
  },
};