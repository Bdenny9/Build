'use client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import type { Lead } from '@/types/domain';

const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';
const icon = (sel: boolean) => L.divIcon({ className: '', html: `<div class="pin${sel ? ' sel' : ''}">${PIN}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

/** Fit every pin when the list changes; pan (no zoom jump) when the selection changes. */
function Frame({ leads, lead }: { leads: Lead[]; lead: Lead | null }) {
  const map = useMap();
  const key = leads.map((l) => l.pid).join(',');
  useEffect(() => {
    if (leads.length) map.fitBounds(L.latLngBounds(leads.map((l) => [l.lat, l.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  useEffect(() => { if (lead) map.panTo([lead.lat, lead.lng], { animate: true }); }, [lead, map]);
  return null;
}

export default function MapPane({ leads, selected, onSelect }: { leads: Lead[]; selected: Lead | null; onSelect: (pid: string) => void }) {
  const [mode, setMode] = useState<'map' | 'sat'>('map');
  const center = useMemo<[number, number]>(() => [32.81, -79.98], []);
  return (
    <div className="map-pane">
      <div className="map-count">{leads.length} properties</div>
      <MapContainer center={center} zoom={11} scrollWheelZoom zoomControl={false}>
        <ZoomControl position="topright" />
        {mode === 'map'
          ? <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap contributors &copy; CARTO' />
          : <TileLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16} maxZoom={19} attribution='Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>' />}
        {leads.map((l) => <Marker key={l.pid} position={[l.lat, l.lng]} icon={icon(l.pid === selected?.pid)} eventHandlers={{ click: () => onSelect(l.pid) }} title={l.address} />)}
        <Frame leads={leads} lead={selected} />
      </MapContainer>
      <div className="map-toggle" role="group" aria-label="Map style">
        <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}>Map</button>
        <button aria-pressed={mode === 'sat'} onClick={() => setMode('sat')}>Satellite</button>
      </div>
    </div>
  );
}
