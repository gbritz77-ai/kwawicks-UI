import React, { useEffect, useState } from "react";
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

  const isOperational  = hasAnyRole("Owner", "Finance", "Admin", "HubStaff", "Procurement");
  const isFinancial    = hasAnyRole("Owner", "Finance");
  const isUserManager  = hasAnyRole("Owner", "Admin");
  const isDriverRole   = hasRole("Driver");
  const isProcurement  = hasAnyRole("Owner", "Admin", "Procurement", "Finance");
  const canSeeCollections = hasAnyRole("Owner", "Admin", "HubStaff", "Procurement", "Finance");
  const canSeeHubSales     = hasAnyRole("Owner", "Finance", "Admin", "HubStaff");
  const canManageClients   = hasAnyRole("Owner", "Finance", "Admin", "Procurement");
  const canSeeStaff      = hasAnyRole("Owner", "Finance", "Admin");
  const canSeePettyCash   = hasAnyRole("Owner", "Finance");
  const isOwner           = hasRole("Owner");
  const canSeeHubRequests = hasAnyRole("Owner", "Finance", "Admin", "HubStaff", "Procurement");

  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close drawer on route change
  useEffect(() => { setMenuOpen(false); }, [pathname, search]);

  const items: NavItem[] = [];
  if (isOperational) {
    items.push({ label: "Dashboard",       path: "/app" });
    items.push({ label: "Species",         path: "/app/hub-tasks", tabParam: "species" });
    items.push({ label: "Delivery Orders", path: "/app/delivery-orders" });
    items.push({ label: "Reports",         path: "/app/reports" });
  }
  if (canManageClients) {
    items.push({ label: "Clients", path: "/app/hub-tasks", tabParam: "clients" });
  }
  if (isFinancial) {
    items.push({ label: "Invoices",   path: "/app/reports", tabParam: "invoices" });
    items.push({ label: "Statements", path: "/app/reports", tabParam: "statement" });
  }
  if (isUserManager) {
    items.push({ label: "Users", path: "/app/users" });
  }
  if (hasAnyRole("Owner", "Admin", "Procurement")) {
    items.push({ label: "Suppliers", path: "/app/suppliers" });
  }
  if (isProcurement) {
    items.push({ label: "Procurement", path: "/app/procurement-orders" });
  }
  if (canSeeCollections) {
    items.push({ label: "Collections", path: "/app/collection-requests" });
  }
  if (canSeeHubSales) {
    items.push({ label: "Hub Sales", path: "/app/hub-sales" });
  }
  if (canSeeStaff) {
    items.push({ label: "Staff", path: "/app/staff-members" });
  }
  if (canSeePettyCash) {
    items.push({ label: "Petty Cash", path: "/app/petty-cash" });
  }
  if (canSeeHubRequests) {
    items.push({ label: "Hub Requests", path: "/app/hub-requests" });
  }
  if (isOwner) {
    items.push({ label: "Settings", path: "/app/settings" });
  }
  if (isDriverRole) {
    items.push({ label: "Dashboard",        path: "/driver" });
    items.push({ label: "Delivery History", path: "/driver/reports" });
    items.push({ label: "Help Me",          path: "/driver/help" });
  } else {
    items.push({ label: "Help Me", path: "/app/help" });
  }

  function navigate(path: string) {
    setMenuOpen(false);
    nav(path);
  }

  function logout() {
    clearAuth();
    nav("/login", { replace: true });
  }

  return (
    <>
      <nav style={s.bar}>
        <button style={s.brand} onClick={() => navigate(isDriverRole ? "/driver" : "/app")}>
          <img src="/logo.jpeg" alt="KwaWicks" style={s.brandLogo} />
          KwaWicks
        </button>

        {/* Desktop links */}
        {!isMobile && (
          <div style={s.links}>
            {items.map((item) => {
              const active = isActive(item, pathname, search);
              const href = item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path;
              return (
                <button
                  key={item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path}
                  style={active ? { ...s.link, ...s.linkActive } : s.link}
                  onClick={() => navigate(href)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={s.right}>
          {!isMobile && profile?.username && (
            <span style={s.username}>{profile.username}</span>
          )}
          {!isMobile && (
            <button style={s.logoutBtn} onClick={logout}>Log out</button>
          )}
          {isMobile && (
            <button style={s.hamburger} onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
              {menuOpen ? "✕" : "☰"}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <div style={s.drawer}>
          {profile?.username && (
            <div style={s.drawerUser}>Signed in as <strong>{profile.username}</strong></div>
          )}
          {items.map((item) => {
            const active = isActive(item, pathname, search);
            const href = item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path;
            return (
              <button
                key={item.tabParam !== undefined ? `${item.path}?tab=${item.tabParam}` : item.path}
                style={active ? { ...s.drawerLink, ...s.drawerLinkActive } : s.drawerLink}
                onClick={() => navigate(href)}
              >
                {item.label}
              </button>
            );
          })}
          <div style={s.drawerDivider} />
          <button style={s.drawerLogout} onClick={logout}>Log out</button>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    background: "#1e293b",
    color: "#fff",
    padding: "0 16px",
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
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    objectFit: "cover" as const,
    flexShrink: 0,
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
  hamburger: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 22,
    cursor: "pointer",
    padding: 0,
    minWidth: 44,
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Mobile drawer
  drawer: {
    position: "sticky",
    top: 52,
    zIndex: 199,
    background: "#1e293b",
    display: "flex",
    flexDirection: "column",
    padding: "8px 0 16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  drawerUser: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    padding: "8px 20px 12px",
  },
  drawerLink: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: 500,
    cursor: "pointer",
    padding: "14px 20px",
    textAlign: "left",
    borderLeft: "3px solid transparent",
  },
  drawerLinkActive: {
    color: "#fff",
    fontWeight: 700,
    borderLeft: "3px solid #22c55e",
    background: "rgba(255,255,255,0.05)",
  },
  drawerDivider: {
    height: 1,
    background: "rgba(255,255,255,0.1)",
    margin: "8px 0",
  },
  drawerLogout: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    cursor: "pointer",
    padding: "12px 20px",
    textAlign: "left",
  },
};
