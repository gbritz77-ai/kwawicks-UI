import { useEffect, useRef, useState } from "react";
import NavBar from "./NavBar";
import { hasRole } from "../api/auth";
import { trackingApi } from "../api/trackingApi";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type PermState = "checking" | "prompt" | "granted" | "denied" | "unavailable";
type TrackStatus = "idle" | "ok" | "error";

export default function Layout({ children }: { children: React.ReactNode }) {
  const isDriver = hasRole("Driver");

  const [permState,   setPermState]   = useState<PermState>("checking");
  const [trackStatus, setTrackStatus] = useState<TrackStatus>("idle");
  const [showModal,   setShowModal]   = useState(false);
  const [requesting,  setRequesting]  = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Query current browser geolocation permission on mount ─────────────────
  useEffect(() => {
    if (!isDriver) return;
    if (!("geolocation" in navigator)) { setPermState("unavailable"); return; }

    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then(status => {
          const map = (s: string): PermState =>
            s === "granted" ? "granted" : s === "denied" ? "denied" : "prompt";
          setPermState(map(status.state));
          // Listen for the driver toggling permission in browser settings while the app is open
          status.onchange = () => setPermState(map(status.state));
        })
        .catch(() => setPermState("prompt")); // Permissions API unavailable (older Safari)
    } else {
      setPermState("prompt");
    }
  }, [isDriver]);

  // ── React to permission state ──────────────────────────────────────────────
  useEffect(() => {
    if (!isDriver || permState === "checking") return;

    if (permState === "granted") {
      setShowModal(false);
      startPinging();
    } else {
      // prompt or denied — stop any active pinging and show modal
      stopPinging();
      setShowModal(true);
    }

    return stopPinging;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permState, isDriver]);

  // ── Pinging helpers ───────────────────────────────────────────────────────
  function startPinging() {
    stopPinging();
    sendPing();
    intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);
  }

  function stopPinging() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  function sendPing() {
    navigator.geolocation.getCurrentPosition(
      pos => {
        trackingApi.recordLocation({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy ?? undefined,
          speed:     pos.coords.speed    ?? undefined,
        })
          .then(() => setTrackStatus("ok"))
          .catch((e: unknown) => { console.warn("[GPS Tracking] API error:", e); setTrackStatus("error"); });
      },
      err => { console.warn("[GPS Tracking] geolocation error:", err.message); },
      { timeout: 15_000, maximumAge: 120_000 }
    );
  }

  // ── "Enable Location" button — triggers the browser's native Allow/Block prompt
  function requestPermission() {
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      () => { setPermState("granted"); setRequesting(false); },
      err => {
        setPermState(err.code === err.PERMISSION_DENIED ? "denied" : "prompt");
        setRequesting(false);
      },
      { timeout: 15_000, maximumAge: 0 }
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f1f5f9" }}>
      <NavBar />
      <main style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </main>

      {/* ── GPS permission modal ────────────────────────────────────────── */}
      {isDriver && showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#fff", borderRadius: 18, padding: "36px 32px", maxWidth: 400, width: "100%",
            boxShadow: "0 24px 60px rgba(0,0,0,0.3)", textAlign: "center" as const,
          }}>
            {permState === "denied" ? (
              // ── Already blocked ─────────────────────────────────────────
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>
                  Location is blocked
                </div>
                <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
                  Your browser is blocking KwaWicks from accessing your location.
                  To re-enable it:
                </div>
                <ol style={{ textAlign: "left" as const, fontSize: 13, color: "#374151", lineHeight: 2, paddingLeft: 20, marginBottom: 24 }}>
                  <li>Click the <strong>lock 🔒</strong> or <strong>info ℹ️</strong> icon in your browser's address bar</li>
                  <li>Find <strong>Location</strong> and set it to <strong>Allow</strong></li>
                  <li>Reload the page</li>
                </ol>
                <button
                  onClick={() => window.location.reload()}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                >
                  Reload after enabling
                </button>
              </>
            ) : (
              // ── Prompt — first ask ──────────────────────────────────────
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>
                  Enable Location
                </div>
                <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
                  KwaWicks uses your location to track your vehicle on the admin map.
                  Your position is recorded every 5 minutes while the app is open.
                </div>
                <button
                  onClick={requestPermission}
                  disabled={requesting}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
                    background: requesting ? "#93c5fd" : "#2563eb",
                    color: "#fff", fontWeight: 700, fontSize: 15, cursor: requesting ? "not-allowed" : "pointer",
                    marginBottom: 12,
                  }}
                >
                  {requesting ? "Waiting for browser…" : "Enable Location"}
                </button>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Your browser will ask for permission. Tap <strong>Allow</strong>.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tracking status badge (bottom-right, once permission granted) ── */}
      {isDriver && permState === "granted" && trackStatus !== "idle" && (
        <div style={{
          position: "fixed", bottom: 14, right: 14, zIndex: 9999,
          background: trackStatus === "ok" ? "#dcfce7" : "#fee2e2",
          border: `1px solid ${trackStatus === "ok" ? "#86efac" : "#fca5a5"}`,
          borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600,
          color: trackStatus === "ok" ? "#166534" : "#dc2626",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)", pointerEvents: "none",
        }}>
          {trackStatus === "ok" ? "📍 Location shared" : "📍 Tracking error — check connection"}
        </div>
      )}
    </div>
  );
}
