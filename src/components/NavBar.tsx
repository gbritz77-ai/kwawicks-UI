import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { clearAuth, getProfileFromIdToken, hasRole, hasAnyRole } from "../api/auth";

// ── Types ──────────────────────────────────────────────────────────────────

type Leaf = { kind: "leaf"; label: string; path: string; tabParam?: string };
type Group = { kind: "group"; label: string; items: Leaf[] };
type Entry = Leaf | Group;

function leaf(label: string, path: string, tabParam?: string): Leaf {
  return { kind: "leaf", label, path, tabParam };
}
function group(label: string, items: Leaf[]): Group {
  return { kind: "group", label, items };
}

// ── Active helpers ─────────────────────────────────────────────────────────

function leafHref(l: Leaf) {
  return l.tabParam !== undefined ? `${l.path}?tab=${l.tabParam}` : l.path;
}

function isLeafActive(l: Leaf, pathname: string, search: string): boolean {
  if (l.tabParam !== undefined)
    return pathname === l.path && new URLSearchParams(search).get("tab") === l.tabParam;
  if (l.path === "/app/reports") {
    const tab = new URLSearchParams(search).get("tab");
    return pathname === l.path && tab !== "invoices" && tab !== "statement";
  }
  return pathname === l.path || (l.path !== "/app" && l.path !== "/driver" && pathname.startsWith(l.path));
}

function isGroupActive(g: Group, pathname: string, search: string): boolean {
  return g.items.some(i => isLeafActive(i, pathname, search));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NavBar() {
  const nav          = useNavigate();
  const { pathname, search } = useLocation();
  const profile      = getProfileFromIdToken();
  const navRef       = useRef<HTMLDivElement>(null);

  const isOperational  = hasAnyRole("Owner", "Finance", "Admin", "HubStaff", "Procurement");
  const isFinancial    = hasAnyRole("Owner", "Finance", "Admin");
  const canSeePettyCash   = hasAnyRole("Owner", "Finance", "Admin");
  const isUserManager  = hasAnyRole("Owner", "Admin");
  const isDriverRole   = hasRole("Driver");
  const isProcurement  = hasAnyRole("Owner", "Admin", "Procurement", "Finance");
  const canSeeCollections  = hasAnyRole("Owner", "Admin", "HubStaff", "Procurement", "Finance");
  const canSeeHubSales     = hasAnyRole("Owner", "Finance", "Admin", "HubStaff");
  const canManageClients   = hasAnyRole("Owner", "Finance", "Admin", "Procurement");
  const canSeeStaff        = hasAnyRole("Owner", "Finance", "Admin");
  const isOwner            = hasRole("Owner");
  const canSeeHubRequests  = hasAnyRole("Owner", "Finance", "Admin", "HubStaff", "Procurement");

  const [menuOpen,     setMenuOpen]     = useState(false);
  const [openGroup,    setOpenGroup]    = useState<string | null>(null);
  const [expandedMob,  setExpandedMob]  = useState<string[]>([]);
  const [isMobile,     setIsMobile]     = useState(window.innerWidth < 1100);

  // Build entry list ─────────────────────────────────────────────────────
  const entries: Entry[] = [];

  if (isDriverRole) {
    entries.push(leaf("Dashboard",        "/driver"));
    entries.push(leaf("Sales",            "/driver/sales"));
    entries.push(leaf("Stock Sales",      "/driver/stock-sales"));
    entries.push(leaf("Delivery History", "/driver/reports"));
    entries.push(leaf("Help",             "/driver/help"));
  } else {
    entries.push(leaf("Dashboard", "/app"));

    // Sales group
    const salesItems: Leaf[] = [];
    if (canSeeHubSales)    salesItems.push(leaf("Hub Sales",           "/app/hub-sales"));
    if (canSeeHubSales)    salesItems.push(leaf("Client Accounts",    "/app/client-accounts"));
    if (canSeeHubRequests) salesItems.push(leaf("Hub Requests",       "/app/hub-requests"));
    if (isOperational)     salesItems.push(leaf("Deliveries",         "/app/delivery-orders"));
    if (isOperational)     salesItems.push(leaf("Delivery Runs",      "/app/delivery-runs"));
    if (canSeeCollections) salesItems.push(leaf("Collections",        "/app/collection-requests"));
    if (isOperational)     salesItems.push(leaf("Driver Allocations", "/app/driver-allocations"));
    if (isOperational)     salesItems.push(leaf("Slaughter",          "/app/slaughter"));
    if (salesItems.length) entries.push(group("Sales", salesItems));

    // Stock — Species as a top-level leaf (no longer a group)
    if (isOperational)    entries.push(leaf("Species", "/app/hub-tasks", "species"));

    // Clients as a top-level leaf
    if (canManageClients) entries.push(leaf("Clients", "/app/hub-tasks", "clients"));

    // Reports as a top-level leaf
    if (isOperational) entries.push(leaf("Reports", "/app/reports"));

    // Finance group
    const financeItems: Leaf[] = [];
    if (isFinancial) {
      financeItems.push(leaf("Invoices",        "/app/reports",         "invoices"));
      financeItems.push(leaf("Statements",      "/app/reports",         "statement"));
      financeItems.push(leaf("Recon",           "/app/recon"));
      financeItems.push(leaf("Client Accounts", "/app/client-accounts"));
      financeItems.push(leaf("Cost Averages",   "/app/cost-averages"));
    }
    if (canSeePettyCash) {
      financeItems.push(leaf("Petty Cash", "/app/petty-cash"));
    }
    if (financeItems.length) entries.push(group("Finance", financeItems));

    // Procurement group
    const procItems: Leaf[] = [];
    if (isProcurement)                            procItems.push(leaf("Orders",    "/app/procurement-orders"));
    if (hasAnyRole("Owner", "Admin", "Procurement")) procItems.push(leaf("Suppliers", "/app/suppliers"));
    if (procItems.length) entries.push(group("Procurement", procItems));

    // Admin group
    const adminItems: Leaf[] = [];
    if (canSeeStaff)   adminItems.push(leaf("Staff",            "/app/staff-members"));
    if (isUserManager) adminItems.push(leaf("Users",            "/app/users"));
    if (isUserManager) adminItems.push(leaf("Price Approvals",  "/app/price-approvals"));
    if (isUserManager) adminItems.push(leaf("OTP Audit",        "/app/otp-report"));
    if (isOwner)       adminItems.push(leaf("Settings",         "/app/settings"));
    if (adminItems.length) entries.push(group("Admin", adminItems));

    entries.push(leaf("Help", "/app/help"));
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node))
        setOpenGroup(null);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close everything on route change
  useEffect(() => { setMenuOpen(false); setOpenGroup(null); }, [pathname, search]);

  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 1100);
      if (window.innerWidth >= 1100) setMenuOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function navigate(path: string) {
    setMenuOpen(false);
    setOpenGroup(null);
    nav(path);
  }

  function logout() {
    clearAuth();
    nav("/login", { replace: true });
  }

  function toggleGroup(label: string) {
    setOpenGroup(g => g === label ? null : label);
  }

  function toggleMobGroup(label: string) {
    setExpandedMob(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div ref={navRef} style={{ position: "sticky", top: 0, zIndex: 200 }}>
      <nav style={s.bar}>
        {/* Brand */}
        <button style={s.brand} onClick={() => navigate(isDriverRole ? "/driver" : "/app")}>
          <img src="/logo.jpeg" alt="KwaWicks" style={s.brandLogo} />
          KwaWicks
        </button>

        {/* Desktop entries */}
        {!isMobile && (
          <div style={s.links}>
            {entries.map(entry => {
              if (entry.kind === "leaf") {
                const active = isLeafActive(entry, pathname, search);
                return (
                  <button
                    key={leafHref(entry)}
                    style={active ? { ...s.link, ...s.linkActive } : s.link}
                    onClick={() => navigate(leafHref(entry))}
                  >
                    {entry.label}
                  </button>
                );
              }

              // Group
              const active  = isGroupActive(entry, pathname, search);
              const open    = openGroup === entry.label;
              return (
                <div key={entry.label} style={s.groupWrap}>
                  <button
                    style={active ? { ...s.link, ...s.linkActive } : open ? { ...s.link, ...s.linkOpen } : s.link}
                    onClick={() => toggleGroup(entry.label)}
                  >
                    {entry.label} <span style={s.chevron}>{open ? "▲" : "▾"}</span>
                  </button>

                  {open && (
                    <div style={s.dropdown}>
                      {entry.items.map(item => {
                        const ia = isLeafActive(item, pathname, search);
                        return (
                          <button
                            key={leafHref(item)}
                            style={ia ? { ...s.dropItem, ...s.dropItemActive } : s.dropItem}
                            onClick={() => navigate(leafHref(item))}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Right side */}
        <div style={s.right}>
          {!isMobile && profile?.username && (
            <span style={s.username}>{profile.username}</span>
          )}
          {!isMobile && (
            <button style={s.logoutBtn} onClick={logout}>Log out</button>
          )}
          {isMobile && (
            <button style={s.hamburger} onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
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

          {entries.map(entry => {
            if (entry.kind === "leaf") {
              const active = isLeafActive(entry, pathname, search);
              return (
                <button
                  key={leafHref(entry)}
                  style={active ? { ...s.drawerLink, ...s.drawerLinkActive } : s.drawerLink}
                  onClick={() => navigate(leafHref(entry))}
                >
                  {entry.label}
                </button>
              );
            }

            // Group accordion
            const expanded = expandedMob.includes(entry.label);
            const groupActive = isGroupActive(entry, pathname, search);
            return (
              <div key={entry.label}>
                <button
                  style={groupActive ? { ...s.drawerGroup, ...s.drawerGroupActive } : s.drawerGroup}
                  onClick={() => toggleMobGroup(entry.label)}
                >
                  <span>{entry.label}</span>
                  <span style={s.mobChevron}>{expanded ? "▲" : "▾"}</span>
                </button>
                {expanded && entry.items.map(item => {
                  const ia = isLeafActive(item, pathname, search);
                  return (
                    <button
                      key={leafHref(item)}
                      style={ia ? { ...s.drawerSubLink, ...s.drawerSubLinkActive } : s.drawerSubLink}
                      onClick={() => navigate(leafHref(item))}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div style={s.drawerDivider} />
          <button style={s.drawerLogout} onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  bar: {
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
    flexShrink: 0,
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
    height: 52,
  },
  link: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    padding: "0 16px",
    height: "100%",
    whiteSpace: "nowrap",
    borderBottom: "3px solid transparent",
    transition: "color 0.15s, background 0.15s",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  linkActive: {
    color: "#fff",
    borderBottom: "3px solid #22c55e",
    fontWeight: 600,
  },
  linkOpen: {
    color: "#fff",
    background: "rgba(255,255,255,0.07)",
  },
  chevron: {
    fontSize: 10,
    opacity: 0.7,
    marginTop: 1,
  },

  // Dropdown group wrapper
  groupWrap: {
    position: "relative",
    height: "100%",
    display: "flex",
    alignItems: "stretch",
  },
  dropdown: {
    position: "absolute",
    top: 52,
    left: 0,
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "0 0 10px 10px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    minWidth: 170,
    zIndex: 300,
    padding: "4px 0",
    display: "flex",
    flexDirection: "column",
  },
  dropItem: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    padding: "10px 18px",
    textAlign: "left",
    whiteSpace: "nowrap",
    transition: "background 0.1s, color 0.1s",
  },
  dropItemActive: {
    color: "#22c55e",
    fontWeight: 700,
    background: "rgba(34,197,94,0.08)",
    borderLeft: "3px solid #22c55e",
    paddingLeft: 15,
  },

  // Right side
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
    paddingLeft: 16,
    flexShrink: 0,
  },
  username: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
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
    background: "#1e293b",
    display: "flex",
    flexDirection: "column",
    padding: "8px 0 16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxHeight: "calc(100vh - 52px)",
    overflowY: "auto",
  },
  drawerUser: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    padding: "8px 20px 12px",
  },
  // Standalone leaf in drawer
  drawerLink: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    padding: "13px 20px",
    textAlign: "left",
    borderLeft: "3px solid transparent",
  },
  drawerLinkActive: {
    color: "#fff",
    fontWeight: 700,
    borderLeft: "3px solid #22c55e",
    background: "rgba(255,255,255,0.05)",
  },
  // Group header in drawer
  drawerGroup: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    padding: "14px 20px 6px",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  drawerGroupActive: {
    color: "#22c55e",
  },
  mobChevron: {
    fontSize: 10,
    marginRight: 4,
  },
  // Sub-item in drawer
  drawerSubLink: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: 400,
    cursor: "pointer",
    padding: "11px 20px 11px 32px",
    textAlign: "left",
    borderLeft: "3px solid transparent",
    width: "100%",
  },
  drawerSubLinkActive: {
    color: "#22c55e",
    fontWeight: 600,
    borderLeft: "3px solid #22c55e",
    background: "rgba(34,197,94,0.06)",
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
