import React, { useEffect, useMemo, useState } from "react";
import { fuelIssuesApi } from "../api/fuelIssuesApi";
import { fleetApi } from "../api/fleetApi";
import type { FuelIssueDto } from "../api/fuelIssuesApi";
import type { VehicleDto } from "../api/fleetApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const R = (n: number, d = 2) =>
  "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-ZA", { month: "short", year: "numeric" });
}

function isoMonth(iso: string) {
  return iso.slice(0, 7); // "2026-07"
}

function monthsInRange(from: string, to: string): string[] {
  const result: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
}

type TabId = "overview" | "vehicles" | "sources" | "transactions";

// ── KPI card ──────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, accent, warn }: {
  label: string; value: string; sub?: string; accent?: string; warn?: boolean;
}) {
  const color = warn ? "#dc2626" : (accent ?? "#166534");
  return (
    <div style={{ ...s.kpi, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  );
}

// ── Inline SVG trend chart (litres bars + cost line) ─────────────────────────

type MonthPoint = { month: string; litres: number; cost: number | null };

function TrendChart({ data }: { data: MonthPoint[] }) {
  if (data.length === 0) return null;

  const W = 780, H = 200, PL = 56, PR = 56, PT = 16, PB = 36;
  const cw = W - PL - PR;
  const ch = H - PT - PB;

  const maxL = Math.max(...data.map(d => d.litres), 1);
  const hasCost = data.some(d => d.cost != null && d.cost > 0);
  const maxC = hasCost ? Math.max(...data.map(d => d.cost ?? 0), 1) : 0;

  const bw = Math.max(8, (cw / data.length) * 0.55);
  const gap = cw / data.length;

  const barX = (i: number) => PL + gap * i + gap / 2 - bw / 2;
  const barH = (l: number) => (l / maxL) * ch;
  const lineY = (c: number) => PT + ch - (c / maxC) * ch;

  const costPoints = hasCost
    ? data
        .map((d, i) => `${PL + gap * i + gap / 2},${lineY(d.cost ?? 0)}`)
        .join(" ")
    : "";

  // Y-axis ticks (litres)
  const litresTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: PT + ch - f * ch,
    label: Math.round(f * maxL) + "L",
  }));

  const costTicks = hasCost
    ? [0, 0.5, 1].map(f => ({
        y: PT + ch - f * ch,
        label: "R" + Math.round(f * maxC),
      }))
    : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: W }}>
        {/* Grid lines */}
        {litresTicks.map(t => (
          <g key={t.y}>
            <line x1={PL} x2={W - PR} y1={t.y} y2={t.y} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PL - 6} y={t.y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{t.label}</text>
          </g>
        ))}

        {/* Cost Y axis (right) */}
        {hasCost && costTicks.map(t => (
          <text key={t.y} x={W - PR + 6} y={t.y + 4} textAnchor="start" fontSize={9} fill="#0369a1">{t.label}</text>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const bh = barH(d.litres);
          return (
            <g key={d.month}>
              <rect
                x={barX(i)} y={PT + ch - bh}
                width={bw} height={bh}
                rx={3} fill="#166534" opacity={0.85}
              />
              {/* month label */}
              <text
                x={PL + gap * i + gap / 2} y={H - 4}
                textAnchor="middle" fontSize={9} fill="#64748b"
              >
                {fmtMonth(d.month).split(" ")[0]}
              </text>
              {/* litre label on bar if bar is tall enough */}
              {bh > 18 && (
                <text
                  x={PL + gap * i + gap / 2} y={PT + ch - bh + 12}
                  textAnchor="middle" fontSize={8} fill="#fff" fontWeight={700}
                >
                  {d.litres.toFixed(0)}
                </text>
              )}
            </g>
          );
        })}

        {/* Cost line */}
        {hasCost && data.length > 1 && (
          <polyline
            points={costPoints}
            fill="none" stroke="#0369a1" strokeWidth={2} strokeLinejoin="round"
          />
        )}
        {hasCost && data.map((d, i) => (
          d.cost != null && d.cost > 0 && (
            <circle
              key={d.month}
              cx={PL + gap * i + gap / 2}
              cy={lineY(d.cost)}
              r={3} fill="#0369a1"
            />
          )
        ))}

        {/* Legend */}
        <rect x={PL} y={4} width={10} height={8} rx={2} fill="#166534" opacity={0.85} />
        <text x={PL + 14} y={11} fontSize={9} fill="#64748b">Litres</text>
        {hasCost && (
          <>
            <circle cx={PL + 70} cy={8} r={4} fill="#0369a1" />
            <text x={PL + 78} y={11} fontSize={9} fill="#64748b">Cost (R)</text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Vehicle row ───────────────────────────────────────────────────────────────

function VehicleRow({ v, odoType }: {
  v: { fleetNumber: string; registration: string; fills: number; litres: number; cost: number | null; avgL100: number | null; expected: number | null };
  odoType: string;
}) {
  const outOfRange = v.avgL100 != null && v.expected != null && v.avgL100 > v.expected * 1.15;
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9", background: outOfRange ? "#fff5f5" : undefined }}>
      <td style={s.td}>
        <span style={{ fontWeight: 700, color: outOfRange ? "#dc2626" : "#166534" }}>{v.fleetNumber}</span>
        {v.registration && <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 6 }}>{v.registration}</span>}
      </td>
      <td style={{ ...s.td, textAlign: "center" }}>{v.fills}</td>
      <td style={{ ...s.td, textAlign: "right" }}>{v.litres.toFixed(1)} L</td>
      <td style={{ ...s.td, textAlign: "right" }}>
        {v.cost != null ? R(v.cost) : <span style={{ color: "#cbd5e1" }}>—</span>}
      </td>
      <td style={{ ...s.td, textAlign: "right" }}>
        {v.avgL100 != null
          ? <span style={{ color: outOfRange ? "#dc2626" : "#1e293b", fontWeight: outOfRange ? 700 : 400 }}>
              {v.avgL100.toFixed(1)} L/100{odoType}
              {outOfRange && " ⚠"}
            </span>
          : <span style={{ color: "#cbd5e1" }}>—</span>
        }
      </td>
      <td style={{ ...s.td, textAlign: "right" }}>
        {v.expected != null
          ? <span style={{ color: "#94a3b8", fontSize: 12 }}>{v.expected} L/100{odoType}</span>
          : <span style={{ color: "#cbd5e1" }}>—</span>
        }
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FuelReportPage() {
  const [issues, setIssues]   = useState<FuelIssueDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [tab, setTab]         = useState<TabId>("overview");

  // Filters (shared across tabs)
  const [filterVehicle, setFilterVehicle] = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");
  const [filterSource,  setFilterSource]  = useState<"" | "tank" | "offsite">("");

  useEffect(() => {
    Promise.all([fuelIssuesApi.list(), fleetApi.list()])
      .then(([i, v]) => { setIssues(i); setVehicles(v); })
      .catch(() => setError("Failed to load fuel data."))
      .finally(() => setLoading(false));
  }, []);

  // ── Filtered records ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = issues;
    if (filterVehicle) rows = rows.filter(r => r.vehicleId === filterVehicle);
    if (filterSource)  rows = rows.filter(r => r.fuelSource === filterSource);
    if (filterFrom)    rows = rows.filter(r => r.issuedAt >= filterFrom);
    if (filterTo)      rows = rows.filter(r => r.issuedAt.slice(0, 10) <= filterTo);
    return rows;
  }, [issues, filterVehicle, filterSource, filterFrom, filterTo]);

  const vehicleMap = useMemo(
    () => new Map(vehicles.map(v => [v.vehicleId, v])),
    [vehicles]
  );

  // ── Overview KPIs ─────────────────────────────────────────────────────────
  const totalLitres = filtered.reduce((s, r) => s + r.litres, 0);
  const totalCost   = filtered.reduce((s, r) => s + (r.totalCost ?? 0), 0);
  const hasCost     = filtered.some(r => r.totalCost != null);
  const avgCostL    = totalLitres > 0 && hasCost ? totalCost / totalLitres : null;
  const uniqueVehs  = new Set(filtered.map(r => r.vehicleId)).size;
  const tankLitres  = filtered.filter(r => r.fuelSource === "tank").reduce((s, r) => s + r.litres, 0);
  const offsiteLitres = totalLitres - tankLitres;

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const monthlyData = useMemo((): MonthPoint[] => {
    if (filtered.length === 0) return [];
    const byMonth = new Map<string, { litres: number; cost: number }>();
    filtered.forEach(r => {
      const m = isoMonth(r.issuedAt);
      const cur = byMonth.get(m) ?? { litres: 0, cost: 0 };
      cur.litres += r.litres;
      cur.cost   += r.totalCost ?? 0;
      byMonth.set(m, cur);
    });
    const months = Array.from(byMonth.keys()).sort();
    // fill gaps
    if (months.length < 2) return months.map(m => ({ month: m, ...byMonth.get(m)!, cost: hasCost ? byMonth.get(m)!.cost : null }));
    return monthsInRange(months[0], months[months.length - 1]).map(m => {
      const d = byMonth.get(m) ?? { litres: 0, cost: 0 };
      return { month: m, litres: d.litres, cost: hasCost ? d.cost : null };
    });
  }, [filtered, hasCost]);

  // ── By vehicle ────────────────────────────────────────────────────────────
  const vehicleRows = useMemo(() => {
    const byVeh = new Map<string, { litres: number; cost: number; fills: number; readings: number[] }>();
    filtered.forEach(r => {
      const cur = byVeh.get(r.vehicleId) ?? { litres: 0, cost: 0, fills: 0, readings: [] };
      cur.litres += r.litres;
      cur.cost   += r.totalCost ?? 0;
      cur.fills  += 1;
      if (r.odometerKm != null) cur.readings.push(r.odometerKm);
      byVeh.set(r.vehicleId, cur);
    });
    return Array.from(byVeh.entries())
      .map(([vid, d]) => {
        const v = vehicleMap.get(vid);
        const sortedOdo = [...d.readings].sort((a, b) => a - b);
        let avgL100: number | null = null;
        if (sortedOdo.length >= 2) {
          const kmDiff = sortedOdo[sortedOdo.length - 1] - sortedOdo[0];
          if (kmDiff > 0) avgL100 = Math.round((d.litres / kmDiff) * 100 * 10) / 10;
        }
        return {
          vehicleId:    vid,
          fleetNumber:  v?.fleetNumber ?? vid,
          registration: v?.registration ?? "",
          odoType:      v?.odoType ?? "km",
          fills:        d.fills,
          litres:       d.litres,
          cost:         hasCost ? d.cost : null,
          avgL100,
          expected:     v?.expectedConsumption ?? null,
        };
      })
      .sort((a, b) => b.litres - a.litres);
  }, [filtered, vehicleMap, hasCost]);

  const outOfRangeCount = vehicleRows.filter(
    v => v.avgL100 != null && v.expected != null && v.avgL100 > v.expected * 1.15
  ).length;

  // ── By source ─────────────────────────────────────────────────────────────
  const tankRows    = filtered.filter(r => r.fuelSource === "tank");
  const offsiteRows = filtered.filter(r => r.fuelSource === "offsite");

  const tankByStation = useMemo(() => {
    const map = new Map<string, { litres: number; cost: number; fills: number }>();
    tankRows.forEach(r => {
      const key = r.tankName || r.tankId || "Unknown";
      const cur = map.get(key) ?? { litres: 0, cost: 0, fills: 0 };
      cur.litres += r.litres; cur.cost += r.totalCost ?? 0; cur.fills++;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.litres - a.litres);
  }, [tankRows]);

  const offsiteByStation = useMemo(() => {
    const map = new Map<string, { litres: number; cost: number; fills: number }>();
    offsiteRows.forEach(r => {
      const key = r.supplierStation || "Unknown station";
      const cur = map.get(key) ?? { litres: 0, cost: 0, fills: 0 };
      cur.litres += r.litres; cur.cost += r.totalCost ?? 0; cur.fills++;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.litres - a.litres);
  }, [offsiteRows]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.page}><p style={{ color: "#94a3b8", padding: 24 }}>Loading…</p></div>;
  if (error)   return <div style={s.page}><p style={{ color: "#ef4444", padding: 24 }}>{error}</p></div>;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>⛽ Fuel Reports</h1>
          <p style={s.subtitle}>{filtered.length} records · {totalLitres.toFixed(0)} L{hasCost ? ` · ${R(totalCost)}` : ""}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div style={s.filterBar}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Vehicle</label>
          <select style={s.filterInput} value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.filter(v => v.isActive).map(v => (
              <option key={v.vehicleId} value={v.vehicleId}>
                {v.fleetNumber}{v.registration ? ` (${v.registration})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Source</label>
          <select style={s.filterInput} value={filterSource} onChange={e => setFilterSource(e.target.value as any)}>
            <option value="">All sources</option>
            <option value="tank">🛢 Tank</option>
            <option value="offsite">⛽ Off Site</option>
          </select>
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>From</label>
          <input type="date" style={s.filterInput} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>To</label>
          <input type="date" style={s.filterInput} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        {(filterVehicle || filterSource || filterFrom || filterTo) && (
          <button style={s.clearBtn} onClick={() => { setFilterVehicle(""); setFilterSource(""); setFilterFrom(""); setFilterTo(""); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {([
          ["overview",     "📊 Overview"],
          ["vehicles",     "🚛 By Vehicle"],
          ["sources",      "🛢 By Source"],
          ["transactions", "📋 Transactions"],
        ] as [TabId, string][]).map(([id, label]) => (
          <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <>
          {/* KPI row */}
          <div style={s.kpiRow}>
            <Kpi label="Total Litres"  value={`${totalLitres.toFixed(0)} L`} sub={`${filtered.length} fills`} accent="#166534" />
            {hasCost && <Kpi label="Total Cost"  value={R(totalCost)} accent="#0369a1" />}
            {avgCostL != null && <Kpi label="Avg Cost / L" value={`R ${avgCostL.toFixed(4)}`} accent="#7c3aed" />}
            <Kpi label="Vehicles"  value={String(uniqueVehs)} accent="#0f172a" />
            <Kpi label="Out of Range" value={String(outOfRangeCount)} warn={outOfRangeCount > 0} accent="#166534" />
          </div>

          {/* Source split */}
          <div style={s.splitRow}>
            <SourcePill label="🛢 Tank" litres={tankLitres} total={totalLitres} color="#166534" />
            <SourcePill label="⛽ Off Site" litres={offsiteLitres} total={totalLitres} color="#0369a1" />
          </div>

          {/* Trend chart */}
          {monthlyData.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Monthly Trend</div>
              <p style={s.sectionSub}>Green bars = litres · Blue line = cost (R)</p>
              <TrendChart data={monthlyData} />
              {/* Month totals table */}
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Month</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Fills</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Litres</th>
                      {hasCost && <th style={{ ...s.th, textAlign: "right" }}>Cost</th>}
                      {hasCost && <th style={{ ...s.th, textAlign: "right" }}>Avg Cost/L</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(m => {
                      const monthFills = filtered.filter(r => isoMonth(r.issuedAt) === m.month);
                      return (
                        <tr key={m.month} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={s.td}>{fmtMonth(m.month)}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{monthFills.length}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{m.litres.toFixed(1)} L</td>
                          {hasCost && <td style={{ ...s.td, textAlign: "right" }}>{m.cost != null && m.cost > 0 ? R(m.cost) : "—"}</td>}
                          {hasCost && <td style={{ ...s.td, textAlign: "right" }}>
                            {m.cost != null && m.cost > 0 && m.litres > 0 ? `R ${(m.cost / m.litres).toFixed(4)}` : "—"}
                          </td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                      <td style={{ ...s.td, fontWeight: 700 }}>Total</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{filtered.length}</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{totalLitres.toFixed(1)} L</td>
                      {hasCost && <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{R(totalCost)}</td>}
                      {hasCost && <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>
                        {totalLitres > 0 ? `R ${(totalCost / totalLitres).toFixed(4)}` : "—"}
                      </td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── BY VEHICLE ── */}
      {tab === "vehicles" && (
        <div style={s.section}>
          {outOfRangeCount > 0 && (
            <div style={s.warnBanner}>
              ⚠ <strong>{outOfRangeCount} vehicle{outOfRangeCount > 1 ? "s" : ""}</strong> exceeding expected consumption by more than 15%
            </div>
          )}
          {vehicleRows.length === 0 ? <p style={s.empty}>No data for this selection.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Vehicle</th>
                    <th style={{ ...s.th, textAlign: "center" }}>Fills</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Total Litres</th>
                    {hasCost && <th style={{ ...s.th, textAlign: "right" }}>Total Cost</th>}
                    <th style={{ ...s.th, textAlign: "right" }}>Consumption</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleRows.map(v => (
                    <VehicleRow key={v.vehicleId} v={v} odoType={v.odoType} />
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Total ({vehicleRows.length} vehicles)</td>
                    <td style={{ ...s.td, textAlign: "center", fontWeight: 700 }}>{filtered.length}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{totalLitres.toFixed(1)} L</td>
                    {hasCost && <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{R(totalCost)}</td>}
                    <td style={s.td} />
                    <td style={s.td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BY SOURCE ── */}
      {tab === "sources" && (
        <>
          {/* Summary cards */}
          <div style={s.sourceCards}>
            <SourceCard
              icon="🛢" title="Tank (On-site)"
              fills={tankRows.length} litres={tankLitres}
              cost={hasCost ? tankRows.reduce((s, r) => s + (r.totalCost ?? 0), 0) : null}
              color="#166534"
            />
            <SourceCard
              icon="⛽" title="Off-site / Supplier"
              fills={offsiteRows.length} litres={offsiteLitres}
              cost={hasCost ? offsiteRows.reduce((s, r) => s + (r.totalCost ?? 0), 0) : null}
              color="#0369a1"
            />
          </div>

          {tankByStation.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>🛢 By Tank</div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Tank</th>
                      <th style={{ ...s.th, textAlign: "center" }}>Fills</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Litres</th>
                      {hasCost && <th style={{ ...s.th, textAlign: "right" }}>Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tankByStation.map(r => (
                      <tr key={r.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{r.name}</td>
                        <td style={{ ...s.td, textAlign: "center" }}>{r.fills}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>{r.litres.toFixed(1)} L</td>
                        {hasCost && <td style={{ ...s.td, textAlign: "right" }}>{r.cost > 0 ? R(r.cost) : "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {offsiteByStation.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>⛽ By Supplier / Station</div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Station</th>
                      <th style={{ ...s.th, textAlign: "center" }}>Fills</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Litres</th>
                      {hasCost && <th style={{ ...s.th, textAlign: "right" }}>Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {offsiteByStation.map(r => (
                      <tr key={r.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{r.name}</td>
                        <td style={{ ...s.td, textAlign: "center" }}>{r.fills}</td>
                        <td style={{ ...s.td, textAlign: "right" }}>{r.litres.toFixed(1)} L</td>
                        {hasCost && <td style={{ ...s.td, textAlign: "right" }}>{r.cost > 0 ? R(r.cost) : "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TRANSACTIONS ── */}
      {tab === "transactions" && (
        <div style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={s.sectionTitle}>All Transactions ({filtered.length})</div>
          </div>
          {filtered.length === 0 ? <p style={s.empty}>No transactions for this selection.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Vehicle</th>
                    <th style={s.th}>Source</th>
                    <th style={s.th}>Tank / Station</th>
                    <th style={s.th}>Issued By</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Litres</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Odometer</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Cost/L</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Total</th>
                    <th style={s.th}>Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map(r => (
                    <tr key={r.issueId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{fmtDate(r.issuedAt)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#166534", whiteSpace: "nowrap" }}>
                        {r.fleetNumber || r.vehicleId}
                      </td>
                      <td style={s.td}>
                        <span style={{
                          ...s.badge,
                          background: r.fuelSource === "tank" ? "#dcfce7" : "#e0f2fe",
                          color: r.fuelSource === "tank" ? "#166534" : "#0369a1",
                        }}>
                          {r.fuelSource === "tank" ? "🛢 Tank" : "⛽ Off Site"}
                        </span>
                      </td>
                      <td style={s.td}>{r.fuelSource === "tank" ? (r.tankName || "—") : (r.supplierStation || "—")}</td>
                      <td style={s.td}>{r.fuelSource === "tank" ? (r.tankIssuedBy || "—") : (r.issuedByName || "—")}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>{r.litres.toFixed(1)} L</td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {r.odometerKm != null ? r.odometerKm.toLocaleString("en-ZA") : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {r.costPerLitre != null ? `R ${r.costPerLitre.toFixed(4)}` : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>
                        {r.totalCost != null ? R(r.totalCost) : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={s.td}>
                        {r.slipUrl
                          ? <a href={r.slipUrl} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontSize: 12, fontWeight: 600 }}>View</a>
                          : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                    <td colSpan={5} style={{ ...s.td, fontWeight: 700 }}>Total</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{totalLitres.toFixed(1)} L</td>
                    <td style={s.td} />
                    <td style={s.td} />
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#166534" }}>
                      {hasCost ? R(totalCost) : "—"}
                    </td>
                    <td style={s.td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Source pill (overview split bar) ─────────────────────────────────────────

function SourcePill({ label, litres, total, color }: { label: string; litres: number; total: number; color: string }) {
  const pct = total > 0 ? (litres / total * 100) : 0;
  return (
    <div style={{ flex: 1, background: "#fff", border: `1px solid ${color}20`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 6 }}>{label}</div>
      <div style={{ height: 8, borderRadius: 4, background: "#f1f5f9", overflow: "hidden", marginBottom: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>{litres.toFixed(0)} L</span>
        <span style={{ color: "#94a3b8" }}>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ── Source card ───────────────────────────────────────────────────────────────

function SourceCard({ icon, title, fills, litres, cost, color }: {
  icon: string; title: string; fills: number; litres: number; cost: number | null; color: string;
}) {
  return (
    <div style={{ flex: 1, background: "#fff", border: `2px solid ${color}30`, borderRadius: 14, padding: "20px 22px", minWidth: 200 }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row2 label="Fills" value={String(fills)} />
        <Row2 label="Litres" value={`${litres.toFixed(1)} L`} />
        {cost != null && cost > 0 && <Row2 label="Total Cost" value={"R " + cost.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />}
      </div>
    </div>
  );
}

function Row2({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 16px 48px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  title:    { fontSize: 24, fontWeight: 900, color: "#0f172a", margin: 0 },
  subtitle: { fontSize: 13, color: "#64748b", margin: "4px 0 0" },

  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 20,
  },
  filterGroup: { display: "flex", flexDirection: "column", gap: 4, minWidth: 140 },
  filterLabel: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" },
  filterInput: { padding: "7px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", minWidth: 140 },
  clearBtn: {
    padding: "7px 14px", fontSize: 13, background: "#fff", border: "1px solid #d1d5db",
    borderRadius: 7, cursor: "pointer", color: "#64748b", alignSelf: "flex-end",
  },

  tabBar: {
    display: "flex",
    borderBottom: "2px solid #e2e8f0",
    marginBottom: 24,
    gap: 2,
    flexWrap: "wrap",
  },
  tab: {
    padding: "9px 18px", fontSize: 13, fontWeight: 500, border: "none",
    background: "none", cursor: "pointer", color: "#64748b",
    borderBottom: "2px solid transparent", marginBottom: -2,
  },
  tabActive: { color: "#166534", borderBottom: "2px solid #166534", fontWeight: 700 },

  kpiRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 20,
  },
  kpi: {
    flex: "1 1 140px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  kpiLabel: { fontSize: 12, color: "#64748b", marginTop: 4, fontWeight: 600 },
  kpiSub:   { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  splitRow: {
    display: "flex",
    gap: 14,
    marginBottom: 24,
    flexWrap: "wrap",
  },

  section: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "20px",
    marginBottom: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  sectionSub:   { fontSize: 12, color: "#94a3b8", marginBottom: 12, marginTop: 0 },

  sourceCards: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
  },

  warnBanner: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#9a3412",
    marginBottom: 14,
  },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "9px 12px",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  },
  td:    { padding: "9px 12px", whiteSpace: "nowrap" },
  badge: { fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 7px" },
  empty: { color: "#94a3b8", padding: "12px 0", fontSize: 14 },
};
