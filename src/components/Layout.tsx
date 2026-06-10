import React, { useEffect, useRef } from "react";
import NavBar from "./NavBar";
import { hasRole } from "../api/auth";
import { trackingApi } from "../api/trackingApi";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Silently records GPS every 5 minutes while a Driver is logged in. */
function useDriverLocationTracker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hasRole("Driver")) return;
    if (!("geolocation" in navigator)) return;

    function ping() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          trackingApi.recordLocation({
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy ?? undefined,
            speed:     pos.coords.speed    ?? undefined,
          }).catch(() => {/* silent — no user-visible error */});
        },
        () => {/* permission denied or unavailable — ignore */},
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
      );
    }

    // First ping immediately, then every 5 minutes
    ping();
    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  useDriverLocationTracker();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f1f5f9" }}>
      <NavBar />
      <main style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </main>
    </div>
  );
}
