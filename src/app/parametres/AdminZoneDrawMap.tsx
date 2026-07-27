"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898];

function ClickAdd({ onAdd }: { onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitToPoints({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView(DEFAULT_CENTER, 12);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 14);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [24, 24] },
    );
  }, [map, points]);
  return null;
}

const vertexIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:#0f766e;border:2px solid #fff"></span>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

type Props = {
  points: Array<{ lat: number; lng: number }>;
  onChange: (points: Array<{ lat: number; lng: number }>) => void;
  height?: number;
};

export default function AdminZoneDrawMap({ points, onChange, height = 380 }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points],
  );

  if (!ready) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
        style={{ height }}
      >
        Chargement carte…
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%" }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        style={{ height: "100%", width: "100%", borderRadius: 8 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints points={points} />
        <ClickAdd onAdd={(lat, lng) => onChange([...points, { lat, lng }])} />
        {positions.length >= 2 ? (
          <Polygon
            positions={positions}
            pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.25, weight: 2 }}
          />
        ) : null}
        {points.map((p, i) => (
          <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]} icon={vertexIcon} />
        ))}
      </MapContainer>
    </div>
  );
}
