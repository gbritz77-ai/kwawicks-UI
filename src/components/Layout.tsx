import { useEffect, useRef, useState } from "react";
import NavBar from "./NavBar";
import { hasRole } from "../api/auth";
import { trackingApi } from "../api/trackingApi";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type TrackStatus = "idle" | "ok" | "error" | "denied";

/** GPS tracker for Driver-role users. Returns current status so the UI can show feedback. */
function useDriverLocationTracker(): TrackStatus {
  const [status, setStatus] = useState<TrackStatus>("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hasRole("Driver")) return;
    if (!("geolocation" in navigator)) { setStatus("denied"); return; }

    function ping() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          trackingApi.recordLocation({
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy  ?? undefined,
            speed:     pos.coords.speed     ?? undefined,
          })
            .then(() => setStatus("ok"))
            .catch((e: unknown) => {
              console.warn("[GPS Tracking] ping failed:", e);
              setStatus("error");
            });
        },
        (err) => {
          console.warn("[GPS Tracking] geolocation error:", err.message);
          setStatus("denied");
        },
        // No enableHighAccuracy — laptops/tablets without GPS hardware stall on that flag
        { timeout: 15_000, maximumAge: 120_000 }
      );
    }

    // Immediate first ping, then every 5 minutes
    ping();
    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return status;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const trackStatus = useDriverLocationTracker();
  const isDriver    = hasRole("Driver");

  const badgeStyle: Record<TrackStatus, { bg: string; border: string; color: string }> = {
    idle:   { bg: "#f1f5f9", border: "#e2e8f0",  color: "#64748b" },
    ok:     { bg: "#dcfce7", border: "#86efac",  color: "#166534" },
    error:  { bg: "#fee2e2", border: "#fca5a5",  color: "#dc2626" },
    denied: { bg: "#fef9c3", border: "#fde68a",  color: "#92400e" },
  };

  const { bg, border, color } = badgeStyle[trackStatus];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f1f5f9" }}>
      <NavBar />
      <main style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </main>

      {/* GPS status badge — visible to drivers only, fades in once status is known */}
      {isDriver && trackStatus !== "idle" && (
        <div style={{
          position: "fixed", bottom: 14, right: 14, zIndex: 9999,
          background: bg, border: `1px solid ${border}`, borderRadius: 20,
          padding: "5px 14px", fontSize: 12, fontWeight: 600, color,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}>
          {trackStatus === "ok"     && "📍 Location shared"}
          {trackStatus === "denied" && "📍 Location unavailable — check browser permissions"}
          {trackStatus === "error"  && "📍 Tracking error — check connection"}
        </div>
      )}
    </div>
  );
}
