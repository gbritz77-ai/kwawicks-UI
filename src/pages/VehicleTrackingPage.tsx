import React, { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { trackingApi, type LiveVehicleResponse, type DriverRouteResponse } from "../api/trackingApi";

// ── Palette — one colour per driver index ─────────────────────────────────────
const COLOURS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#0d9488",
];

function driverColour(index: number) {
  return COLOURS[index % COLOURS.length];
}

// ── Custom div marker (avoids Vite/Leaflet icon bundling issue) ───────────────
function makeMarkerIcon(colour: string, label: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        background:${colour};border:2px solid #fff;border-radius:50% 50% 50% 0;
        width:28px;height:28px;transform:rotate(-45deg);
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
      "></div>
      <div style="
        position:absolute;top:-18px;left:50%;transform:translateX(-50%);
        background:${colour};color:#fff;padding:1px 6px;border-radius:4px;
        font-size:11px;font-weight:700;white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
      ">${label}</div>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 28],
    popupAnchor:[0, -30],
  });
}

// ── Fit map to markers whenever the vehicle list changes ─────────────────────
function FitBounds({ vehicles }: { vehicles: LiveVehicleResponse[] }) {
  const map = useMap();
  useEffect(() => {
    if (vehicles.length === 0) return;
    const bounds = L.latLngBounds(vehicles.map(v => [v.latitude, v.longitude]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [vehicles, map]);
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAge(minutes: number): string {
  if (minutes < 1)  return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function fmtSpeed(mps?: number): string {
  if (mps == null) return "—";
  return `${Math.round(mps * 3.6)} km/h`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VehicleTrackingPage() {
  const [vehicles,       setVehicles]       = useState<LiveVehicleResponse[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [route,          setRoute]          = useState<DriverRouteResponse | null>(null);
  const [routeHours,     setRouteHours]     = useState(24);
  const [routeLoading,   setRouteLoading]   = useState(false);
  const [lastRefresh,    setLastRefresh]    = useState<Date | null>(null);

  // Load live positions
  const loadLive = useCallback(() => {
    trackingApi.getLive()
      .then(data => { setVehicles(data); setLastRefresh(new Date()); setError(""); })
      .catch(e => setError(e?.message ?? "Failed to load vehicle positions."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLive();
    const interval = setInterval(loadLive, 30_000); // auto-refresh every 30 s
    return () => clearInterval(interval);
  }, [loadLive]);

  // Load route when a driver is selected
  useEffect(() => {
    if (!selectedDriver) { setRoute(null); return; }
    setRouteLoading(true);
    trackingApi.getHistory(selectedDriver, routeHours)
      .then(setRoute)
      .catch(() => setRoute(null))
      .finally(() => setRouteLoading(false));
  }, [selectedDriver, routeHours]);

  // Default centre: South Africa
  const defaultCenter: [number, number] = [-28.48, 24.68];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 280, flexShrink: 0, background: "#fff", borderRight: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
            🚛 Vehicle Tracking
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Loading…"}
          </div>
          <button
            onClick={loadLive}
            style={{ marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, cursor: "pointer", color: "#374151" }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Driver list */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>Loading vehicles…</div>}
          {error   && <div style={{ padding: 12, color: "#dc2626", fontSize: 13 }}>{error}</div>}
          {!loading && vehicles.length === 0 && !error && (
            <div style={{ padding: 16, color: "#94a3b8", fontSize: 13, textAlign: "center" as const }}>
              No vehicles have reported a location yet.
              <div style={{ marginTop: 8, fontSize: 12 }}>Drivers ping every 5 minutes while the app is open.</div>
            </div>
          )}

          {vehicles.map((v, i) => {
            const colour    = driverColour(i);
            const isActive  = v.minutesSinceLastPing <= 15;
            const isSelected = selectedDriver === v.driverId;
            return (
              <div
                key={v.driverId}
                onClick={() => setSelectedDriver(isSelected ? null : v.driverId)}
                style={{
                  padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                  border: `2px solid ${isSelected ? colour : "#e2e8f0"}`,
                  background: isSelected ? `${colour}12` : "#fff",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: isActive ? "#16a34a" : "#94a3b8", flexShrink: 0 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: colour, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {v.driverName || v.driverId}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  <div>🕐 {fmtAge(v.minutesSinceLastPing)}</div>
                  <div>🚀 {fmtSpeed(v.speed)}</div>
                  {v.deliveryOrderId && <div style={{ fontFamily: "monospace", fontSize: 11, color: "#2563eb" }}>📦 {v.deliveryOrderId.slice(0, 10)}…</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Route controls — shown when a driver is selected */}
        {selectedDriver && (
          <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Show route for last:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {[4, 8, 24, 48].map(h => (
                <button
                  key={h}
                  onClick={() => setRouteHours(h)}
                  style={{
                    flex: "1 1 auto", padding: "5px 0", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${routeHours === h ? "#2563eb" : "#e2e8f0"}`,
                    background: routeHours === h ? "#eff6ff" : "#fff",
                    color: routeHours === h ? "#2563eb" : "#374151",
                    cursor: "pointer", fontWeight: routeHours === h ? 700 : 400,
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
            {routeLoading && <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>Loading route…</div>}
            {route && !routeLoading && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                {route.points.length} pings
                {route.points.length > 0 && (
                  <> · {fmtTime(route.points[0].recordedAt)} → {fmtTime(route.points[route.points.length - 1].recordedAt)}</>
                )}
              </div>
            )}
            <button
              onClick={() => setSelectedDriver(null)}
              style={{ marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 6, border: "1px solid #fee2e2", background: "#fff", color: "#dc2626", fontSize: 12, cursor: "pointer" }}
            >
              Clear route
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" as const }}>
        <MapContainer
          center={defaultCenter}
          zoom={6}
          style={{ width: "100%", height: "100%" }}
          zoomControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />

          {/* Fit bounds to markers */}
          {vehicles.length > 0 && <FitBounds vehicles={vehicles} />}

          {/* Driver markers */}
          {vehicles.map((v, i) => {
            const colour = driverColour(i);
            const label  = (v.driverName || v.driverId).split(" ")[0];
            return (
              <Marker
                key={v.driverId}
                position={[v.latitude, v.longitude]}
                icon={makeMarkerIcon(colour, label)}
                eventHandlers={{ click: () => setSelectedDriver(v.driverId === selectedDriver ? null : v.driverId) }}
              >
                <Popup>
                  <div style={{ fontFamily: "system-ui, sans-serif", minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: colour, marginBottom: 6 }}>
                      {v.driverName || v.driverId}
                    </div>
                    <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
                      <div>🕐 Last ping: {fmtAge(v.minutesSinceLastPing)}</div>
                      <div>🚀 Speed: {fmtSpeed(v.speed)}</div>
                      {v.accuracy && <div>📡 Accuracy: ±{Math.round(v.accuracy)}m</div>}
                      {v.deliveryOrderId && <div>📦 Order: {v.deliveryOrderId.slice(0, 12)}…</div>}
                      <div style={{ color: "#94a3b8", marginTop: 4 }}>
                        {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Route polyline */}
          {selectedDriver && route && route.points.length > 1 && (() => {
            const vIdx   = vehicles.findIndex(v => v.driverId === selectedDriver);
            const colour = driverColour(vIdx >= 0 ? vIdx : 0);
            const latLngs = route.points.map(p => [p.latitude, p.longitude] as [number, number]);
            return (
              <Polyline
                positions={latLngs}
                pathOptions={{ color: colour, weight: 3, opacity: 0.75, dashArray: "6, 4" }}
              />
            );
          })()}
        </MapContainer>

        {/* Legend overlay */}
        {vehicles.length > 0 && (
          <div style={{
            position: "absolute", bottom: 24, right: 16, zIndex: 1000,
            background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: "10px 14px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)", fontSize: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a" }} />
              <span style={{ color: "#374151" }}>Active (≤15 min)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8" }} />
              <span style={{ color: "#374151" }}>Inactive</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
