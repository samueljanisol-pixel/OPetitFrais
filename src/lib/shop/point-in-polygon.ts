import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@/lib/shop/livraison-types";

type Ring = number[][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  // Ray casting ; ring = [[lng, lat], ...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, coords: number[][][]): boolean {
  const outer = coords[0];
  if (!outer || outer.length < 3) return false;
  if (!pointInRing(lng, lat, outer)) return false;
  for (let h = 1; h < coords.length; h++) {
    const hole = coords[h];
    if (hole && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

export function isValidDeliveryGeoJson(
  value: unknown,
): value is GeoJsonPolygon | GeoJsonMultiPolygon {
  if (!value || typeof value !== "object") return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) return true;
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) return true;
  return false;
}

/** Test point-dans-polygone (lng/lat WGS84, GeoJSON). */
export function pointInDeliveryZone(
  lat: number,
  lng: number,
  geojson: GeoJsonPolygon | GeoJsonMultiPolygon,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (geojson.type === "Polygon") {
    return pointInPolygonCoords(lng, lat, geojson.coordinates);
  }
  for (const poly of geojson.coordinates) {
    if (pointInPolygonCoords(lng, lat, poly)) return true;
  }
  return false;
}

export function ringFromLatLngs(points: Array<{ lat: number; lng: number }>): number[][] {
  if (points.length === 0) return [];
  const ring = points.map((p) => [p.lng, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0]!, first[1]!]);
  }
  return ring;
}

export function polygonFromLatLngs(
  points: Array<{ lat: number; lng: number }>,
): GeoJsonPolygon | null {
  if (points.length < 3) return null;
  return { type: "Polygon", coordinates: [ringFromLatLngs(points)] };
}

export function latLngsFromGeoJson(
  geojson: GeoJsonPolygon | GeoJsonMultiPolygon,
): Array<{ lat: number; lng: number }> {
  const ring =
    geojson.type === "Polygon"
      ? geojson.coordinates[0]
      : geojson.coordinates[0]?.[0];
  if (!ring) return [];
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const pair of ring) {
    const lng = pair[0];
    const lat = pair[1];
    if (lng == null || lat == null) continue;
    pts.push({ lat, lng });
  }
  if (pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a.lat === b.lat && a.lng === b.lng) pts.pop();
  }
  return pts;
}
