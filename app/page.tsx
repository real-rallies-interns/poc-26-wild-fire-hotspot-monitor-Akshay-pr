"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

/* ─── Types (shared with WildfireMap) ───────────────────────── */
export interface Hotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  brightness_normalized: number;
  confidence: number;
  frp?: number;
  acq_date?: string;
  acq_time?: string; // HHMM format from NASA
  satellite?: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/* ─── Dynamic import of the map ─────────────────────────────── */
const WildfireMap = dynamic(() => import("@/components/WildfireMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#030712]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-[#38BDF8]/20 border-t-[#38BDF8] rounded-full animate-spin" />
        <p className="text-[10px] font-medium text-[#38BDF8] tracking-[0.2em] uppercase">
          Initializing Engine
        </p>
      </div>
    </div>
  ),
});

/* ─── Helpers ───────────────────────────────────────────────── */
function confidenceLabel(c: number) {
  if (c >= 80) return { label: "CRITICAL", color: "#FF4136" };
  if (c >= 60) return { label: "MEDIUM",   color: "#F59E0B" };
  return            { label: "LOW",        color: "#38BDF8" };
}

function formatCoord(lat: number, lon: number) {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

/* ─── SidebarLogo ───────────────────────────────────────────── */
function SidebarLogo() {
  return (
    <div className="sidebar-header">
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="pulse-dot" />
        </div>
        <div>
          <h1 className="text-sm font-700 tracking-tighter gradient-text">
            INTELLIGENCE
          </h1>
          <p className="text-[10px] text-muted font-medium tracking-wide-sm uppercase">
            Wildfire Monitor · FIRMS
          </p>
        </div>
        <span className="badge badge-emerald ml-auto">LIVE</span>
      </div>
    </div>
  );
}

/* ─── Live StatGrid ─────────────────────────────────────────── */
function LiveStatGrid({ hotspots }: { hotspots: Hotspot[] }) {
  const total    = hotspots.length;
  const critical = hotspots.filter((h) => h.confidence >= 80).length;
  const avgTemp  = total
    ? Math.round(hotspots.reduce((s, h) => s + h.brightness, 0) / total)
    : 0;
  const avgFRP   = hotspots.filter((h) => h.frp != null).length
    ? (hotspots.reduce((s, h) => s + (h.frp ?? 0), 0) /
        hotspots.filter((h) => h.frp != null).length).toFixed(1)
    : "—";

  const stats = [
    { value: total.toLocaleString(), label: "In View"  },
    { value: String(critical),       label: "Critical" },
    { value: avgTemp ? `${avgTemp}K` : "—", label: "Avg Temp" },
    { value: avgFRP !== "—" ? `${avgFRP}MW` : "—", label: "Avg FRP" },
  ];

  return (
    <div className="glass-card">
      <div className="grid grid-cols-2 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-item">
            <span
              className="stat-value"
              style={{ color: s.label === "Critical" && critical > 0 ? "#FF4136" : undefined }}
            >
              {s.value}
            </span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── IncidentCard ──────────────────────────────────────────── */
function IncidentCard({ hotspot, rank }: { hotspot: Hotspot; rank: number }) {
  const { label, color } = confidenceLabel(hotspot.confidence);
  const barWidth = `${hotspot.confidence}%`;

  return (
    <div className="incident-card" style={{ "--accent-color": color } as React.CSSProperties}>
      <div className="incident-card-header">
        <div className="flex items-center gap-2">
          <span className="incident-rank">#{rank}</span>
          <span className="incident-severity" style={{ color }}>
            {label}
          </span>
        </div>
        <span className="incident-satellite">
          {hotspot.satellite ?? "MODIS"}
        </span>
      </div>

      <p className="incident-coord">
        {formatCoord(hotspot.latitude, hotspot.longitude)}
      </p>

      {/* Confidence bar */}
      <div className="severity-bar-track">
        <div className="severity-bar-fill" style={{ width: barWidth, background: color }} />
      </div>

      <div className="incident-meta">
        <span>{hotspot.confidence.toFixed(0)}% conf</span>
        <span>{hotspot.brightness.toFixed(0)} K</span>
        {hotspot.frp != null && <span>{hotspot.frp.toFixed(1)} MW</span>}
        {hotspot.acq_date && (
          <span>{hotspot.acq_date}</span>
        )}
      </div>
    </div>
  );
}

/* ─── IncidentCards Section ─────────────────────────────────── */
function IncidentCards({ hotspots }: { hotspots: Hotspot[] }) {
  const top10 = [...hotspots]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  if (top10.length === 0) {
    return (
      <div className="glass-card flex items-center justify-center py-6">
        <p className="text-[11px] text-muted text-center">
          Pan / zoom the map<br />to load incident data
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {top10.map((h, i) => (
        <IncidentCard key={`${h.latitude}-${h.longitude}-${i}`} hotspot={h} rank={i + 1} />
      ))}
    </div>
  );
}

/* ─── Why This Matters Panel ────────────────────────────────── */
function WhyThisMattersPanel() {
  return (
    <div className="panel-narrative">
      <div className="panel-narrative-header">
        <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" style={{ boxShadow: "0 0 8px #FBBF24" }} />
        <span className="panel-label">Why This Matters</span>
      </div>
      <p className="panel-narrative-body">
        Active wildfire hotspots detected by spaceborne thermal sensors correlate
        directly with infrastructure risk corridors. High-brightness events
        (≥ 340 K) within 50 km of rail or energy assets trigger escalated
        response protocols under{" "}
        <span className="text-[#22D3EE]">NDMA Circular 2024-G7</span>.
      </p>
      <div className="panel-narrative-stats">
        <div className="panel-stat">
          <span className="panel-stat-value text-amber-400">7-day</span>
          <span className="panel-stat-label">Rolling window</span>
        </div>
        <div className="panel-stat">
          <span className="panel-stat-value text-amber-400">MODIS C6.1</span>
          <span className="panel-stat-label">Data product</span>
        </div>
        <div className="panel-stat">
          <span className="panel-stat-value text-amber-400">375m</span>
          <span className="panel-stat-label">Resolution</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Who Controls the Rail Panel ──────────────────────────── */
function WhoControlsRailPanel() {
  const stakeholders = [
    {
      agency: "NASA ESDS",
      role: "MODIS / Terra & Aqua operator",
      protocol: "FIRMS Open Data",
      color: "#22D3EE",
    },
    {
      agency: "ESA",
      role: "Copernicus / Sentinel-3 SLSTR",
      protocol: "Copernicus Data Space",
      color: "#7C3AED",
    },
  ];

  return (
    <div className="panel-rail">
      <div className="panel-rail-header">
        <div className="w-2 h-2 rounded-full bg-[#22D3EE] flex-shrink-0" style={{ boxShadow: "0 0 8px #22D3EE" }} />
        <span className="panel-label">Who Controls the Rail</span>
      </div>

      <p className="panel-rail-subtitle">
        The <span className="text-[#22D3EE] font-semibold">Sensor Rail</span> is
        the geospatial data infrastructure managed by international space agencies.
        Raw thermal telemetry flows through open-access protocols governed by
        space cooperation agreements ensuring climate-resilience intelligence.
      </p>

      <div className="panel-rail-table">
        <div className="panel-rail-table-header">
          <span>Agency</span>
          <span>Constellation Role</span>
          <span>Protocol</span>
        </div>
        {stakeholders.map((s) => (
          <div key={s.agency} className="panel-rail-row">
            <span className="panel-rail-agency" style={{ color: s.color }}>
              {s.agency}
            </span>
            <span className="panel-rail-role">{s.role}</span>
            <span className="panel-rail-protocol">{s.protocol}</span>
          </div>
        ))}
      </div>

      <p className="panel-rail-footnote">
        Governance: International Space Cooperation Agreements · Copernicus
        Data Space protocols · Open-access for global climate resilience.
      </p>
    </div>
  );
}

/* ─── Intelligence Sidebar ──────────────────────────────────── */
function IntelligenceSidebar({ 
  hotspots, 
  satelliteFilter, 
  setSatelliteFilter,
  timeFilter,
  setTimeFilter
}: { 
  hotspots: Hotspot[];
  satelliteFilter: string[];
  setSatelliteFilter: (filter: string[]) => void;
  timeFilter: number;
  setTimeFilter: (hours: number) => void;
}) {
  const toggleFilter = (satellite: string) => {
    if (satelliteFilter.includes(satellite)) {
      setSatelliteFilter(satelliteFilter.filter(s => s !== satellite));
    } else {
      setSatelliteFilter([...satelliteFilter, satellite]);
    }
  };

  return (
    <aside className="intelligence-sidebar">
      <SidebarLogo />

      <div className="sidebar-content">
        {/* Live stat grid */}
        <div className="sidebar-section">
          <p className="sidebar-section-label">Live Statistics · Current View</p>
          <LiveStatGrid hotspots={hotspots} />
        </div>

        <div className="divider" />

        {/* Map Layers / Filters */}
        <div className="sidebar-section">
          <p className="sidebar-section-label">Sensor Rail Filters</p>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => toggleFilter("MODIS")}
              className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg border transition-all duration-200 ${
                satelliteFilter.includes("MODIS") 
                  ? "border-[rgba(34,211,238,0.15)] bg-[rgba(34,211,238,0.03)]" 
                  : "border-[#1F2937] bg-transparent opacity-60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${satelliteFilter.includes("MODIS") ? "bg-[#22D3EE]" : "bg-[#374151]"}`} />
                <span className="text-xs font-medium text-primary">MODIS (Terra/Aqua)</span>
              </div>
              <span className="badge badge-cyan">7-day</span>
            </button>
            <button
              onClick={() => toggleFilter("VIIRS")}
              className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg border transition-all duration-200 ${
                satelliteFilter.includes("VIIRS") 
                  ? "border-[rgba(34,211,238,0.15)] bg-[rgba(34,211,238,0.03)]" 
                  : "border-[#1F2937] bg-transparent opacity-60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${satelliteFilter.includes("VIIRS") ? "bg-[#7C3AED]" : "bg-[#374151]"}`} />
                <span className="text-xs font-medium text-primary">VIIRS (SNPP/NOAA)</span>
              </div>
              <span className="badge badge-violet">375m</span>
            </button>
          </div>
        </div>

        <div className="divider" />

        {/* Time Filter Slider */}
        <div className="sidebar-section">
          <div className="flex items-center justify-between mb-3">
            <p className="sidebar-section-label">Time Window</p>
            <span className="text-[10px] font-bold text-[#38BDF8] tabular-nums">{timeFilter}h</span>
          </div>
          <div className="px-1">
            <input 
              type="range" 
              min="24" 
              max="168" 
              step="24" 
              value={timeFilter}
              onChange={(e) => setTimeFilter(parseInt(e.target.value))}
              className="w-full accent-[#38BDF8] bg-[#1F2937] h-1 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between mt-2 px-0.5">
              <span className="text-[9px] text-muted">24h</span>
              <span className="text-[9px] text-muted">72h</span>
              <span className="text-[9px] text-muted">168h</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Incident cards */}
        <div className="sidebar-section">
          <div className="flex items-center justify-between">
            <p className="sidebar-section-label">Incident Feed</p>
            {hotspots.length > 0 && (
              <span className="badge badge-cyan">{hotspots.length} visible</span>
            )}
          </div>
          <IncidentCards hotspots={hotspots} />
        </div>

        <div className="divider" />

        {/* Why This Matters */}
        <div className="sidebar-section">
          <WhyThisMattersPanel />
        </div>

        <div className="divider" />

        {/* Who Controls the Rail */}
        <div className="sidebar-section">
          <WhoControlsRailPanel />
        </div>

        {/* Footer */}
        <div className="mt-auto pb-2">
          <p className="text-[10px] text-subtle text-center tracking-wide-sm uppercase">
            Classification: UNCLASSIFIED · Open Data
          </p>
        </div>
      </div>
    </aside>
  );
}

/* ─── Main Stage ────────────────────────────────────────────── */
function MainStage({
  onHotspotsChange,
  satelliteFilter,
  timeFilter,
}: {
  onHotspotsChange: (hotspots: Hotspot[], bounds: MapBounds) => void;
  satelliteFilter: string[];
  timeFilter: number;
}) {
  return (
    <main className="main-stage">
      <div className="map-container overflow-hidden">
        <WildfireMap 
          onHotspotsChange={onHotspotsChange} 
          satelliteFilter={satelliteFilter} 
          timeFilter={timeFilter}
        />

        {/* Corner HUD decorations */}
        <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-[#1F2937] pointer-events-none z-[1000]" />
        <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-[#1F2937] pointer-events-none z-[1000]" />
        <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-[#1F2937] pointer-events-none z-[1000]" />
        <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-[#1F2937] pointer-events-none z-[1000]" />

        {/* Header HUD overlay */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="glass-card !py-1.5 !px-4 flex items-center gap-4 border-[#38BDF8]/20">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
              <span className="text-[10px] font-bold text-[#38BDF8] tracking-widest uppercase">
                Active Surveillance
              </span>
            </div>
            <div className="w-px h-3 bg-[#1F2937]" />
            <span className="text-[10px] text-muted font-medium uppercase tracking-tight">
              Source: NASA FIRMS · MODIS C6.1
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─── Page root ─────────────────────────────────────────────── */
export default function Home() {
  const [visibleHotspots, setVisibleHotspots] = useState<Hotspot[]>([]);
  const [satelliteFilter, setSatelliteFilter] = useState<string[]>(["MODIS", "VIIRS"]);
  const [timeFilter, setTimeFilter] = useState<number>(72); // Default to 72 hours

  const handleHotspotsChange = useCallback(
    (hotspots: Hotspot[]) => {
      setVisibleHotspots(hotspots);
    },
    []
  );

  return (
    <div className="app-shell">
      <IntelligenceSidebar 
        hotspots={visibleHotspots} 
        satelliteFilter={satelliteFilter}
        setSatelliteFilter={setSatelliteFilter}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
      />
      <MainStage 
        onHotspotsChange={handleHotspotsChange} 
        satelliteFilter={satelliteFilter} 
        timeFilter={timeFilter}
      />
    </div>
  );
}
