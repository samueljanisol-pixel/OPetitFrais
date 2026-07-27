"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonMultiPolygon, GeoJsonPolygon, ShopPublicMagasin } from "@/lib/shop/livraison-types";

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898]; // Casablanca
const DEFAULT_ZOOM = 12;

function MagasinIcon() {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#059669;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({
  zone,
  magasins,
  userPoint,
}: {
  zone: GeoJsonPolygon | GeoJsonMultiPolygon | null;
  magasins: ShopPublicMagasin[];
  userPoint: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const key = useMemo(() => {
    return JSON.stringify({
      z: zone?.type,
      m: magasins.map((x) => [x.lat, x.lng]),
      u: userPoint,
    });
  }, [zone, magasins, userPoint]);

  useEffect(() => {
    const points: [number, number][] = [];
    for (const m of magasins) {
      if (m.lat != null && m.lng != null) points.push([m.lat, m.lng]);
    }
    if (userPoint) points.push([userPoint.lat, userPoint.lng]);
    if (zone?.type === "Polygon") {
      for (const pair of zone.coordinates[0] ?? []) {
        const lng = pair[0];
        const lat = pair[1];
        if (lat != null && lng != null) points.push([lat, lng]);
      }
    } else if (zone?.type === "MultiPolygon") {
      for (const poly of zone.coordinates) {
        for (const pair of poly[0] ?? []) {
          const lng = pair[0];
          const lat = pair[1];
          if (lat != null && lng != null) points.push([lat, lng]);
        }
      }
    }
    if (points.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0]!, 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28] });
  }, [map, key, zone, magasins, userPoint]);

  return null;
}

function MapClickCapture({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function zoneLatLngs(zone: GeoJsonPolygon | GeoJsonMultiPolygon): [number, number][][] {
  if (zone.type === "Polygon") {
    return [
      (zone.coordinates[0] ?? []).flatMap((pair) => {
        const lng = pair[0];
        const lat = pair[1];
        return lat != null && lng != null ? ([[lat, lng]] as [number, number][]) : [];
      }),
    ];
  }
  return zone.coordinates.map((poly) =>
    (poly[0] ?? []).flatMap((pair) => {
      const lng = pair[0];
      const lat = pair[1];
      return lat != null && lng != null ? ([[lat, lng]] as [number, number][]) : [];
    }),
  );
}

type Props = {
  zone: GeoJsonPolygon | GeoJsonMultiPolygon | null;
  magasins: ShopPublicMagasin[];
  userPoint?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  height?: number | string;
  className?: string;
};

export default function ShopLivraisonMap({
  zone,
  magasins,
  userPoint = null,
  onMapClick,
  height = 360,
  className,
}: Props) {
  const icon = useMemo(() => MagasinIcon(), []);
  const polygons = zone ? zoneLatLngs(zone) : [];

  return (
    <div className={className} style={{ height, width: "100%" }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%", borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds zone={zone} magasins={magasins} userPoint={userPoint} />
        {onMapClick ? <MapClickCapture onClick={onMapClick} /> : null}
        {polygons.map((positions, i) => (
          <Polygon
            key={`zone-${i}`}
            positions={positions}
            pathOptions={{ color: "#059669", fillColor: "#10b981", fillOpacity: 0.22, weight: 2 }}
          />
        ))}
        {magasins.map((m) =>
          m.lat != null && m.lng != null ? (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={icon}>
              <Popup>
                <strong>{m.nom}</strong>
                {m.adresse ? (
                  <>
                    <br />
                    {m.adresse}
                    {m.ville ? `, ${m.ville}` : ""}
                  </>
                ) : null}
                {m.google_maps_url ? (
                  <>
                    <br />
                    <a href={m.google_maps_url} target="_blank" rel="noopener noreferrer">
                      Google Maps
                    </a>
                  </>
                ) : null}
              </Popup>
            </Marker>
          ) : null,
        )}
        {userPoint ? (
          <CircleMarker
            center={[userPoint.lat, userPoint.lng]}
            radius={9}
            pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.9 }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
