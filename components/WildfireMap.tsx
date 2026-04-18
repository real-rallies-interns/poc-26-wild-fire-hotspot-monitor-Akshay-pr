"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import type { Hotspot, MapBounds } from "@/app/page";

/* ─── LayerGroupWrapper (Clustering toggle) ─────────────────── */

function LayerGroupWrapper({
  children,
  useClustering,
}: {
  children: React.ReactNode;
  useClustering: boolean;
}) {
  if (useClustering) {
    return (
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom={true}
      >
        {children}
      </MarkerClusterGroup>
    );
  }
  return <>{children}</>;
}

/* ─── Types ─────────────────────────────────────────────────── */

interface ApiResponse {
  source: string;
  cached_at: number;
  count: number;
  data: Hotspot[];
}

interface FetchState {
  hotspots: Hotspot[];
  loading: boolean;
  error: string | null;
  source: string | null;
  count: number;
  lastUpdated: Date | null;
}

/* ─── Colour helpers ─────────────────────────────────────────── */

function markerColor(confidence: number): string {
  if (confidence >= 80) return "#FF4136";
  if (confidence >= 60) return "#F59E0B";
  return "#38BDF8";
}

function markerOpacity(confidence: number): number {
  if (confidence >= 80) return 0.85;
  if (confidence >= 60) return 0.75;
  return 0.6;
}

/* ─── Bounds Tracker — fires parent callback on every view change */

function MapBoundsTracker({
  hotspots,
  satelliteFilter,
  timeFilter,
  onHotspotsChange,
}: {
  hotspots: Hotspot[];
  satelliteFilter: string[];
  timeFilter: number;
  onHotspotsChange: (hotspots: Hotspot[], bounds: MapBounds) => void;
}) {
  const map = useMap();

  const compute = useCallback(() => {
    const b = map.getBounds();
    const bounds: MapBounds = {
      north: b.getNorth(),
      south: b.getSouth(),
      east:  b.getEast(),
      west:  b.getWest(),
    };
    const visible = hotspots
      .filter((h) => {
        // 1. Satellite filter
        const sat = h.satellite?.toUpperCase() || "MODIS";
        if (sat.includes("VIIRS") && !satelliteFilter.includes("VIIRS")) return false;
        if ((sat.includes("MODIS") || sat.includes("TERRA") || sat.includes("AQUA")) && !satelliteFilter.includes("MODIS")) return false;

        // 2. Time filter (simple date check if acq_date is available)
        if (h.acq_date) {
          const now = new Date();
          const acq = new Date(h.acq_date);
          const diffHours = (now.getTime() - acq.getTime()) / (1000 * 60 * 60);
          if (diffHours > timeFilter) return false;
        }
        return true;
      })
      .filter(
        (h) =>
          h.latitude  >= bounds.south &&
          h.latitude  <= bounds.north &&
          h.longitude >= bounds.west  &&
          h.longitude <= bounds.east
      );
    onHotspotsChange(visible, bounds);
  }, [map, hotspots, satelliteFilter, timeFilter, onHotspotsChange]);

  // Recompute when map moves or zooms
  useMapEvents({
    moveend: compute,
    zoomend: compute,
  });

  // Also recompute when hotspots data changes
  useEffect(() => {
    compute();
  }, [compute]);

  // Trigger SVG repaint
  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  return null;
}

/* ─── Live stats HUD ─────────────────────────────────────────── */

function StatsHUD({
  hotspots,
  source,
  lastUpdated,
}: {
  hotspots: Hotspot[];
  source: string | null;
  lastUpdated: Date | null;
}) {
  const high = hotspots.filter((h) => h.confidence >= 80).length;
  const med  = hotspots.filter((h) => h.confidence >= 60 && h.confidence < 80).length;
  const low  = hotspots.filter((h) => h.confidence < 60).length;

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  return (
    <div className="absolute bottom-8 left-4 z-[1000] pointer-events-none" style={{ maxWidth: 220 }}>
      <div style={{
        background: "rgba(11,17,23,0.88)",
        border: "1px solid #1F2937",
        borderRadius: 10,
        backdropFilter: "blur(14px)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#10B981", boxShadow: "0 0 6px #10B981",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#6B7280" }}>
            Hotspot Intelligence
          </span>
          {source && (
            <span style={{
              marginLeft: "auto", fontSize: 9,
              color: source === "nasa" ? "#10B981" : "#F59E0B",
              fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              {source === "nasa" ? "LIVE" : "MOCK"}
            </span>
          )}
        </div>

        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.04em", color: "#F9FAFB", lineHeight: 1 }}>
          {hotspots.length.toLocaleString()}
          <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400, marginLeft: 4 }}>total</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Critical", count: high, color: "#FF4136" },
            { label: "Medium",   count: med,  color: "#F59E0B" },
            { label: "Low",      count: low,  color: "#38BDF8" },
          ].map((tier) => (
            <div key={tier.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tier.color }}>{tier.count}</span>
              <span style={{ fontSize: 9, color: "#6B7280", letterSpacing: "0.06em" }}>{tier.label}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #1F2937", paddingTop: 6, fontSize: 9, color: "#374151", letterSpacing: "0.06em" }}>
          UPDATED {timeStr}
        </div>
      </div>
    </div>
  );
}

/* ─── Legend ─────────────────────────────────────────────────── */

function Legend() {
  return (
    <div className="absolute bottom-8 right-4 z-[1000] pointer-events-none" style={{ maxWidth: 160 }}>
      <div style={{
        background: "rgba(11,17,23,0.88)",
        border: "1px solid #1F2937",
        borderRadius: 10,
        backdropFilter: "blur(14px)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#6B7280" }}>
          Confidence
        </span>
        {[
          { color: "#FF4136", label: "≥ 80% — Critical", glow: true  },
          { color: "#F59E0B", label: "≥ 60% — Medium",   glow: false },
          { color: "#38BDF8", label: "< 60% — Low",       glow: false },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: item.color, flexShrink: 0,
              boxShadow: item.glow ? `0 0 8px ${item.color}` : undefined,
            }} />
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>{item.label}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #1F2937", paddingTop: 6 }}>
          <span style={{ fontSize: 9, color: "#6B7280" }}>Size ∝ brightness (K)</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Download AOI Button ────────────────────────────────────── */

function DownloadAOIButton({ hotspots }: { hotspots: Hotspot[] }) {
  const map = useMap();

  const handleDownload = useCallback(async () => {
    const b = map.getBounds();
    const north = b.getNorth();
    const south = b.getSouth();
    const east  = b.getEast();
    const west  = b.getWest();

    const features = hotspots
      .filter(
        (h) =>
          h.latitude  >= south &&
          h.latitude  <= north &&
          h.longitude >= west  &&
          h.longitude <= east
      )
      .map((h) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [h.longitude, h.latitude],
        },
        properties: {
          brightness:            h.brightness,
          brightness_normalized: h.brightness_normalized,
          confidence:            h.confidence,
          frp:       h.frp       ?? null,
          acq_date:  h.acq_date  ?? null,
          satellite: h.satellite ?? null,
        },
      }));

    const geojson = {
      type: "FeatureCollection",
      features,
      metadata: {
        exported_at: new Date().toISOString(),
        bbox: { west, south, east, north },
        count: features.length,
        source: "NASA FIRMS MODIS C6.1 · Wildfire Hotspot Monitor",
      },
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `wildfire_aoi_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [map, hotspots]);

  return (
    <button
      id="download-aoi-btn"
      onClick={handleDownload}
      className="download-aoi-btn"
      title="Export all fire points within current map view as GeoJSON"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Download AOI
    </button>
  );
}

/* ─── Main WildfireMap component ─────────────────────────────── */

interface WildfireMapProps {
  onHotspotsChange: (hotspots: Hotspot[], bounds: MapBounds) => void;
  satelliteFilter: string[];
  timeFilter: number;
}

export default function WildfireMap({ onHotspotsChange, satelliteFilter, timeFilter }: WildfireMapProps) {
  const [state, setState] = useState<FetchState>({
    hotspots: [],
    loading: true,
    error: null,
    source: null,
    count: 0,
    lastUpdated: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setState((prev) => ({ ...prev, loading: prev.hotspots.length === 0, error: null }));
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/hotspots`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const json: ApiResponse = await response.json();
        setState({
          hotspots: json.data ?? [],
          loading: false,
          error: null,
          source: json.source,
          count: json.count,
          lastUpdated: new Date(),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Error fetching hotspots:", msg);
        setState((prev) => ({ ...prev, loading: false, error: msg }));
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full relative" style={{ background: "#030712" }}>
      <MapContainer
        center={[20, 0]}
        zoom={3}
        className="w-full h-full"
        zoomControl={false}
        preferCanvas={true}
        style={{ background: "#030712" }}
      >
        {/* Bounds tracker wires map view → parent state */}
        <MapBoundsTracker
          hotspots={state.hotspots}
          satelliteFilter={satelliteFilter}
          timeFilter={timeFilter}
          onHotspotsChange={onHotspotsChange}
        />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <ZoomControl position="bottomright" />

        {/* Download AOI button lives inside MapContainer so useMap() works */}
        {!state.loading && state.hotspots.length > 0 && (
          <DownloadAOIButton hotspots={state.hotspots} />
        )}

        <LayerGroupWrapper useClustering={state.hotspots.length > 1000}>
          {state.hotspots
            .filter((h) => {
              const sat = h.satellite?.toUpperCase() || "MODIS";
              if (sat.includes("VIIRS") && !satelliteFilter.includes("VIIRS")) return false;
              if ((sat.includes("MODIS") || sat.includes("TERRA") || sat.includes("AQUA")) && !satelliteFilter.includes("MODIS")) return false;
              
              if (h.acq_date) {
                const now = new Date();
                const acq = new Date(h.acq_date);
                const diffHours = (now.getTime() - acq.getTime()) / (1000 * 60 * 60);
                if (diffHours > timeFilter) return false;
              }
              return true;
            })
            .map((h, idx) => {
              const radius     = 3 + h.brightness_normalized * 10;
              const isHighConf = h.confidence >= 80;
              const isMedConf  = h.confidence >= 60;
              const color      = markerColor(h.confidence);
              const opacity    = markerOpacity(h.confidence);

              // 2-Hour Rule: Data Pulse for recent detections
              let isRecent = false;
              if (h.acq_date && h.acq_time) {
                try {
                  const now = new Date();
                  const acq = new Date(h.acq_date);
                  const hh = parseInt(h.acq_time.substring(0, 2));
                  const mm = parseInt(h.acq_time.substring(2, 4));
                  acq.setUTCHours(hh, mm, 0, 0);
                  const diffHours = (now.getTime() - acq.getTime()) / (1000 * 60 * 60);
                  isRecent = diffHours <= 2 && diffHours >= 0;
                } catch { /* ignore */ }
              }

              const classNames = [
                isHighConf ? "hotspot-glow-critical" : isMedConf ? "hotspot-glow-medium" : "hotspot-marker-low",
                isRecent ? "hotspot-pulse-realtime" : ""
              ].filter(Boolean).join(" ");

              return (
                <CircleMarker
                  key={`${h.latitude}-${h.longitude}-${idx}`}
                  center={[h.latitude, h.longitude]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: opacity,
                    color: color,
                    weight: isRecent ? 2 : (isHighConf ? 1.5 : 0.8),
                    className: classNames,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -radius]} className="hotspot-tooltip" opacity={1}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold">{h.confidence >= 70 ? 'HIGH' : 'NOMINAL'} / {h.confidence}% CONF</span>
                      <span className="opacity-70 text-[8px] uppercase">{h.satellite || 'MODIS'} • {h.acq_date} {h.acq_time?.replace(/(..)(..)/, '$1:$2')} UTC</span>
                    </div>
                  </Tooltip>
                  
                  <Popup className="hotspot-popup">
                    <div style={{ padding: "4px 2px" }}>
                      <p style={{
                        fontSize: 10, fontWeight: 700, color,
                        textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
                      }}>
                        {isRecent ? "⚡ REAL-TIME DETECTION" : (isHighConf ? "⚠ Critical Hotspot" : isMedConf ? "◈ Active Hotspot" : "○ Low Hotspot")}
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[
                          { label: "Brightness",  value: `${h.brightness} K`                             },
                          { label: "Confidence",  value: `${h.confidence}%`                              },
                          { label: "Intensity",   value: `${(h.brightness_normalized * 100).toFixed(1)}%` },
                          ...(h.frp      != null ? [{ label: "FRP",       value: `${h.frp} MW`         }] : []),
                          ...(h.satellite       ? [{ label: "Satellite",  value: h.satellite             }] : []),
                          ...(h.acq_date        ? [{ label: "Acquired",   value: `${h.acq_date} ${h.acq_time || ''}`.trim() }] : []),
                          { label: "Location",   value: `${h.latitude.toFixed(3)}, ${h.longitude.toFixed(3)}` },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                            <span style={{ fontSize: 10, color: "#6B7280" }}>{label}</span>
                            <span style={{ fontSize: 10, color: "#F9FAFB", fontFamily: "monospace" }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
        </LayerGroupWrapper>
      </MapContainer>

      {/* HUD Overlays */}
      {!state.loading && !state.error && state.hotspots.length > 0 && (
        <>
          <StatsHUD hotspots={state.hotspots} source={state.source} lastUpdated={state.lastUpdated} />
          <Legend />
        </>
      )}

      {/* Loading spinner */}
      {state.loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#030712]/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-[#38BDF8]/10 border-t-[#38BDF8] animate-spin" />
              <div className="absolute inset-2 rounded-full border border-[#38BDF8]/20" />
            </div>
            <p className="text-[10px] font-bold text-[#38BDF8] tracking-[0.25em] uppercase">
              Loading Intelligence
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.error && !state.loading && state.hotspots.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#030712]/80 backdrop-blur-sm">
          <div style={{
            background: "rgba(11,17,23,0.9)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 12,
            padding: "24px 32px",
            maxWidth: 320,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ fontSize: 24 }}>⚠</div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", letterSpacing: "0.08em" }}>
              CONNECTION FAILED
            </p>
            <p style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.6 }}>{state.error}</p>
            <p style={{ fontSize: 10, color: "#374151" }}>
              Ensure the FastAPI backend is running on{" "}
              <span style={{ color: "#38BDF8", fontFamily: "monospace" }}>localhost:8000</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
