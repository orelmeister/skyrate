"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Form470Lead } from "@/lib/api";

// Leaflet is loaded from a CDN at runtime (no npm dependency, so nothing new
// enters the build graph). We guard every access behind the loaded `window.L`.
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Continental-US default view.
const US_CENTER: [number, number] = [39.5, -98.35];
const US_ZOOM = 4;

let leafletPromise: Promise<any> | null = null;

function ensureLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing && (window as any).L) {
      resolve((window as any).L);
      return;
    }
    const script = existing || document.createElement("script");
    script.src = LEAFLET_JS;
    script.crossOrigin = "";
    script.async = true;
    script.onload = () => {
      const L = (window as any).L;
      if (L) resolve(L);
      else reject("Leaflet failed to initialize");
    };
    script.onerror = () => reject("Leaflet failed to load");
    if (!existing) document.body.appendChild(script);
  });
  return leafletPromise;
}

function markerColor(): string {
  return "#4f46e5"; // indigo — single consistent pin color
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(lead: Form470Lead): string {
  const services = (lead.manufacturers || []).filter(Boolean).slice(0, 4).join(", ");
  const svcTypes = (lead.service_types || []).filter(Boolean).slice(0, 3).join(", ");
  const posting = lead.posting_date ? new Date(lead.posting_date).toLocaleDateString() : "";
  const email = lead.contact_email
    ? `<a href="mailto:${escapeHtml(lead.contact_email)}" style="color:#2563eb">${escapeHtml(lead.contact_email)}</a>`
    : "";
  return `
    <div style="min-width:220px;max-width:280px;font-family:ui-sans-serif,system-ui">
      <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:2px">${escapeHtml(lead.entity_name || "Unknown entity")}</div>
      <div style="font-size:12px;color:#475569;margin-bottom:6px">${escapeHtml(lead.city || "")}${lead.city && lead.state ? ", " : ""}${escapeHtml(lead.state || "")} ${escapeHtml(lead.zip || "")}</div>
      ${lead.ben ? `<div style="font-size:11px;color:#64748b">BEN: ${escapeHtml(lead.ben)}</div>` : ""}
      ${posting ? `<div style="font-size:11px;color:#64748b">Posted: ${escapeHtml(posting)}</div>` : ""}
      ${svcTypes ? `<div style="font-size:11px;color:#334155;margin-top:4px"><b>Services:</b> ${escapeHtml(svcTypes)}</div>` : ""}
      ${services ? `<div style="font-size:11px;color:#334155;margin-top:2px"><b>Manufacturers:</b> ${escapeHtml(services)}</div>` : ""}
      ${email ? `<div style="font-size:11px;margin-top:6px">${email}</div>` : ""}
      ${lead.application_number ? `<div style="font-size:10px;color:#94a3b8;margin-top:6px">App #${escapeHtml(lead.application_number)}</div>` : ""}
    </div>`;
}

export default function OpportunityMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const streetLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);
  const satLabelsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");

  // The map loads its own geo feed (recent Form 470s that carry USAC coords).
  const [leads, setLeads] = useState<Form470Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onReload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get470Geo({ limit: 1500 });
      if (res.success && res.data?.leads) {
        setLeads(res.data.leads);
      } else {
        setError(res.error || "Failed to load map data");
      }
    } catch {
      setError("Failed to load map data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onReload();
  }, [onReload]);

  // Only leads that actually carry coordinates can be plotted.
  const geoLeads = useMemo(
    () => leads.filter((l) => typeof l.latitude === "number" && typeof l.longitude === "number"),
    [leads]
  );

  const states = useMemo(() => {
    const s = new Set<string>();
    geoLeads.forEach((l) => l.state && s.add(l.state));
    return Array.from(s).sort();
  }, [geoLeads]);

  const filtered = useMemo(() => {
    return geoLeads.filter((l) => {
      if (stateFilter && l.state !== stateFilter) return false;
      return true;
    });
  }, [geoLeads, stateFilter]);

  // Initialize the map once Leaflet has loaded.
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(US_CENTER, US_ZOOM);

        // Street basemap (OpenStreetMap) and free satellite/aerial basemap
        // (Esri World Imagery — no API key required). A labels overlay keeps
        // city/road names readable on top of the satellite imagery.
        const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        });
        const satellite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
        );
        const satLabels = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { attribution: "", maxZoom: 19 }
        );
        streetLayerRef.current = street;
        satelliteLayerRef.current = satellite;
        satLabelsRef.current = satLabels;
        street.addTo(map);

        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
      })
      .catch((e) => setLoadError(typeof e === "string" ? e : "Map failed to load"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Swap the basemap when the user toggles Street / Satellite.
  useEffect(() => {
    const map = mapRef.current;
    const street = streetLayerRef.current;
    const satellite = satelliteLayerRef.current;
    const satLabels = satLabelsRef.current;
    if (!map || !street || !satellite) return;
    if (basemap === "satellite") {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
      if (satLabels && !map.hasLayer(satLabels)) satLabels.addTo(map);
    } else {
      if (satLabels && map.hasLayer(satLabels)) map.removeLayer(satLabels);
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(street)) street.addTo(map);
    }
    // Keep markers on top after switching basemaps.
    if (layerRef.current && layerRef.current.bringToFront) layerRef.current.bringToFront();
  }, [basemap, ready]);

  // (Re)draw markers whenever the filtered set changes.
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();

    const latlngs: [number, number][] = [];
    filtered.forEach((lead) => {
      const lat = lead.latitude as number;
      const lng = lead.longitude as number;
      latlngs.push([lat, lng]);
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#ffffff",
        weight: 1,
        fillColor: markerColor(),
        fillOpacity: 0.85,
      });
      marker.bindPopup(popupHtml(lead));
      marker.addTo(layer);
    });

    if (latlngs.length > 0) {
      try {
        mapRef.current.fitBounds(latlngs, { padding: [40, 40], maxZoom: 10 });
      } catch {
        /* ignore invalid bounds */
      }
    }
  }, [filtered, ready]);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <span className="text-2xl">🗺️</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Opportunity Map</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Live Form 470 opportunities plotted at their exact USAC-reported coordinates. Click a pin for entity, services, and contact.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReload}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-all"
          >
            🔄 Reload opportunities
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">State</label>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All states ({states.length})</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 ml-auto rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setBasemap("street")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              basemap === "street" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Street
          </button>
          <button
            type="button"
            onClick={() => setBasemap("satellite")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              basemap === "satellite" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Satellite
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="px-4 py-2 bg-white rounded-lg border border-slate-200">
          <span className="font-bold text-indigo-700">{filtered.length.toLocaleString()}</span>
          <span className="text-slate-500 ml-1">opportunities plotted</span>
        </div>
        <div className="px-4 py-2 bg-white rounded-lg border border-slate-200">
          <span className="font-bold text-slate-900">{states.length}</span>
          <span className="text-slate-500 ml-1">states covered</span>
        </div>
        {leads.length > geoLeads.length && (
          <div className="px-4 py-2 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 text-xs flex items-center">
            {(leads.length - geoLeads.length).toLocaleString()} without coordinates (not shown)
          </div>
        )}
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <div ref={containerRef} style={{ height: "600px", width: "100%", background: "#eef2f7" }} />
        {(loading || !ready) && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="text-sm text-slate-600 font-medium">
              {loading ? "Loading opportunities…" : "Loading map…"}
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90">
            <div className="text-sm text-red-600 font-medium">{loadError}</div>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && ready && geoLeads.length === 0 && (
        <div className="text-sm text-slate-500">
          No opportunities with coordinates yet. Click “Reload opportunities” to fetch the latest Form 470 postings.
        </div>
      )}
    </div>
  );
}
