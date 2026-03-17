import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { clearAuth, getProfileFromIdToken, hasRole, hasAnyRole } from "../api/auth";

type NavItem = { label: string; path: string; tabParam?: string };

function isActive(item: NavItem, pathname: string, search: string): boolean {
  if (item.tabParam !== undefined) {
    return pathname === item.path && new URLSearchParams(search).get("tab") === item.tabParam;
  }
  if (item.path === "/app/reports") {
    const tab = new URLSearchParams(search).get("tab");
    return pathname === item.path && tab !== "invoices" && tab !== "statement";
  }
  return pathname === item.path || (item.path !== "/app" && pathname.startsWith(item.path));
}

export default function NavBar() {
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const profile = getProfileFromIdToken();

  const isOperational = hasAnyRole("Owner", "Finance", "Admin", "HubStaff");
  const isFinancial   = hasAnyRole("Owner", "Finance", "Admin");
  const isDriverRole  = hasRole("Driver");

  const items: NavItem[] = [];

  if (isOperational) {
    items.push({ label: "Dashboard",        path: "/app" });
    items.push({ label: "Hub Tasks",        path: "/app/hub-tasks" });
    items.push({ label: "Delivery Orders",  path: "/app/delivery-orders" });
    items.push({ label: "Reports",          path: "/app/reports" });
  }
  if (isFinancial) {
    items.push({ label: "Invoices",         path: "/app/reports", tabParam: "invoices" });
    items.push({ label: "Statements",       path: "/app/reports", tabParam: "statement" });
  }
  if (isOperational) {
    items.push({ label: "Users",            path: "/app/users" });
  }
  if (isDriverRole) {
    items.push({ label: "My Deliveries",    path: "/driver" });
    items.push({ label: "Delivery History", path: "/driver/reports" });
  }

  function logout() {
    clearAuth();
    nav("/login", { replace: true });
  }

  return (
    <nav style={s.bar}>
      {/* Brand */}
      <button style={s.brand} onClick={() => nav(isDriverRole ? "/driver" : "/app")}>
        KwaWicks
      </button>

      {/* Links */}
      <div style={s.links}>
        {items.map((item) => {
          const active = isActive(item, pathname, search);
          const href = item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path;
          return (
            <button
              key={item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path}
              style={active ? { ...s.link, ...s.linkActive } : s.link}
              onClick={() => nav(href)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Right side */}
      <div style={s.right}>
        {profile?.username && (
          <span style={s.username}>{profile.username}</span>
        )}
        <button style={s.logoutBtn} onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    gap: 0,
    background: "#1e293b",
    color: "#fff",
    padding: "0 20px",
    height: 52,
    fontFamily: "system-ui, -apple-system, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  },
  brand: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
    cursor: "pointer",
    padding: "0 20px 0 0",
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap",
  },
  links: {
    display: "flex",
    alignItems: "stretch",
    flex: 1,
    gap: 2,
    height: "100%",
    overflowX: "auto",
  },
  link: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    padding: "0 14px",
    height: "100%",
    whiteSpace: "nowrap",
    borderBottom: "3px solid transparent",
    transition: "color 0.15s",
  },
  linkActive: {
    color: "#fff",
    borderBottom: "3px solid #22c55e",
    fontWeight: 600,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
    paddingLeft: 16,
  },
  username: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
