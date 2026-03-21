import { useAutoLogout } from "../hooks/useAutoLogout";
import { getProfileFromIdToken, hasRole } from "../api/auth";

export default function AppShell() {
  useAutoLogout();
  const profile = getProfileFromIdToken();
  const isDriver = hasRole("Driver");

  return (
    <div style={s.page}>
      <h2 style={s.heading}>
        Welcome{profile?.username ? `, ${profile.username}` : ""}
      </h2>
      <p style={s.sub}>
        {isDriver
          ? "Use the navigation above to view your deliveries or delivery history."
          : "Use the navigation above to access Hub Tasks, Delivery Orders, and Reports."}
      </p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui, -apple-system, sans-serif" },
  heading: { fontSize: 26, fontWeight: 800, color: "#1e293b", marginBottom: 10 },
  sub: { fontSize: 15, color: "#64748b", maxWidth: 480 },
};
