import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// User's Real MapTiler Cloud API Key
const MAPTILER_KEY = 'Y7ckaR6GFnMiumKueiC1';

// Real NCR GPS Coordinates
export const HOSPITAL_COORDINATES = {
  'H-001': [28.6280, 77.3649], // Aurelia Medical Institute (Sector 62, Noida)
  'H-002': [28.5714, 77.3686], // Crescent Multispeciality (Sector 50, Noida)
  'H-003': [28.6432, 77.3712], // St. Raphael Hospital (Indirapuram, Ghaziabad)
  'H-004': [28.5708, 77.3218], // Northgate Care Centre (Sector 18, Noida)
  'H-005': [28.5085, 77.4042], // Veda Institute of Health (Sector 137, Noida)
  'H-101': [28.5982, 77.4412], // Apex Metropolitan Trauma (Greater Noida West)
  'H-102': [28.5284, 77.3592], // NCR Central Emergency Care (Sector 128, Noida Expressway)
};

export default function RealLeafletMap({ hospitals, selected, onSelect, activeRequests = [] }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});

  // Tile layer style: 'dark' (MapTiler Streets Dark) vs 'satellite' (MapTiler Satellite Hybrid)
  const [mapStyle, setMapStyle] = useState('dark');

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center on NCR (Noida - Ghaziabad - Greater Noida)
    const map = L.map(mapContainerRef.current, {
      center: [28.585, 77.365],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // MapTiler Tile Layer
    const tileUrl =
      mapStyle === 'satellite'
        ? `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`
        : `https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0,
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Zoom control
    L.control.zoom({ position: 'topright' }).addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle switching between Dark Streets and Satellite Hybrid
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !tileLayerRef.current) return;

    map.removeLayer(tileLayerRef.current);

    const tileUrl =
      mapStyle === 'satellite'
        ? `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`
        : `https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;

    const newLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0,
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [mapStyle]);

  // Update Markers & Ambulance Vectors
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    hospitals.forEach((h) => {
      const coords = HOSPITAL_COORDINATES[h.id] || [28.585 + (h.x || 0) * 0.02, 77.365 + (h.z || 0) * 0.02];
      const isSelected = h.id === selected;
      const isAvailable = h.status === 'Available';
      const isLimited = h.status === 'Limited';

      const customIcon = L.divIcon({
        className: 'custom-hosp-marker',
        html: `
          <div class="hosp-pin ${isLimited ? 'limited' : !isAvailable ? 'capacity' : ''} ${isSelected ? 'selected' : ''}">
            <span>${h.short || h.name.slice(0, 3)}</span>
            <span class="hosp-pin-badge">${h.beds || 0}</span>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker(coords, { icon: customIcon }).addTo(map);

      const popupContent = `
        <div class="map-popup-card">
          <h4>${h.name}</h4>
          <span>${h.id} • ${h.area} (${h.distance})</span>
          <div class="map-popup-stats">
            <div>General Beds: <b>${h.beds}</b></div>
            <div>ICU Units: <b>${h.icu}</b></div>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent);

      marker.on('click', () => {
        onSelect(h.id);
      });

      markersRef.current[h.id] = marker;
    });

    // Draw active ambulance dispatch vectors
    const polylines = [];
    activeRequests.slice(0, 3).forEach((req, idx) => {
      const targetHospId = req.matchId || req.matched_hospital_id || 'H-001';
      const destCoords = HOSPITAL_COORDINATES[targetHospId] || [28.6280, 77.3649];
      const originCoords = [destCoords[0] + (idx === 0 ? 0.035 : -0.028), destCoords[1] + (idx === 0 ? -0.042 : 0.031)];

      const line = L.polyline([originCoords, destCoords], {
        color: req.urgency === 'Critical' ? '#e11d48' : '#38bdf8',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.85,
      }).addTo(map);

      polylines.push(line);
    });

    return () => {
      polylines.forEach((l) => l.remove());
    };
  }, [hospitals, selected, onSelect, activeRequests]);

  // Pan to selected hospital smoothly
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selected) return;
    const coords = HOSPITAL_COORDINATES[selected];
    if (coords) {
      map.flyTo(coords, 13, { duration: 1.2 });
      if (markersRef.current[selected]) {
        markersRef.current[selected].openPopup();
      }
    }
  }, [selected]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {/* Map Header Overlay with MapTiler Style Switcher */}
      <div className="map-overlay top" style={{ zIndex: 1000, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="live-dot"></span>
          <b>MAPTILER CLOUD GPS</b>
          <span className="mono">• NOIDA / NCR MESH</span>
        </div>

        {/* Style Selector: Dark Streets vs Satellite */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.65)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginLeft: '12px' }}>
          <button
            onClick={() => setMapStyle('dark')}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              borderRadius: '4px',
              color: mapStyle === 'dark' ? '#fff' : 'var(--text-muted)',
              background: mapStyle === 'dark' ? 'var(--accent-crimson)' : 'transparent',
              transition: 'all 0.15s ease'
            }}
          >
            Dark Streets
          </button>
          <button
            onClick={() => setMapStyle('satellite')}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              borderRadius: '4px',
              color: mapStyle === 'satellite' ? '#fff' : 'var(--text-muted)',
              background: mapStyle === 'satellite' ? 'var(--accent-crimson)' : 'transparent',
              transition: 'all 0.15s ease'
            }}
          >
            🛰️ Satellite
          </button>
        </div>
      </div>

      <div className="map-overlay bottom" style={{ pointerEvents: 'none', zIndex: 1000 }}>
        <span>
          <span style={{ color: 'var(--accent-emerald)' }}>●</span> REAL-TIME GPS PINS & DISPATCH VECTORS
        </span>
        <span className="mono">POWERED BY MAPTILER CLOUD</span>
      </div>
    </div>
  );
}
