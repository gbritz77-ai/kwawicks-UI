import { useNavigate } from "react-router-dom";
import { clearAuth, getProfileFromIdToken, hasRole } from "../api/auth";
import { useAutoLogout } from "../hooks/useAutoLogout";

export default function AppShell() {
  useAutoLogout();

  const nav = useNavigate();
  const profile = getProfileFromIdToken();

  const isAdmin = hasRole("Admin");
  const isHubStaff = hasRole("HubStaff");
  const isDriver = hasRole("Driver");

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>KwaWicks</h2>
      <p>
        Welcome{profile?.username ? `, ${profile.username}` : ""} ✅
      </p>

      <div style={{ display: "grid", gap: 12, maxWidth: 520, marginTop: 16 }}>
        {isAdmin && (
          <button style={tileBtn} onClick={() => alert("Admin panel next")}>
            Admin Panel
          </button>
        )}

        {(isAdmin || isHubStaff) && (
          <button style={tileBtn} onClick={() => nav("/app/hub-tasks")}>
            Hub Tasks
          </button>
        )}

        {(isAdmin || isDriver) && (
          <button style={tileBtn} onClick={() => alert("Driver screen next")}>
            Driver Screen
          </button>
        )}

        <button style={tileBtn} onClick={() => alert("Reports next")}>
          Reports
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => {
            clearAuth();
            nav("/login", { replace: true });
          }}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

const tileBtn: React.CSSProperties = {
  padding: "16px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};