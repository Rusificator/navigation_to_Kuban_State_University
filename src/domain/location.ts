import type { GeoReference, Point } from "./types";
export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}
export type FixResult =
  | { status: "ready"; point: Point; accuracy: number }
  | { status: "uncalibrated" | "stale" | "low-accuracy" | "outside" };
export function insidePolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
/** No default/synthetic position and no inferred indoor floor. */
export function projectFix(
  fix: Fix,
  geo: GeoReference | null,
  now = Date.now(),
): FixResult {
  if (!geo || geo.status !== "surveyed") return { status: "uncalibrated" };
  if (now - fix.timestamp > 15000 || fix.timestamp > now + 5000)
    return { status: "stale" };
  if (
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy > 35 ||
    fix.accuracy < 0 ||
    !Number.isFinite(fix.latitude) ||
    !Number.isFinite(fix.longitude)
  )
    return { status: "low-accuracy" };
  const [a, b, c, d, e, f] = geo.transform;
  const point = {
    x: a * fix.longitude + b * fix.latitude + c,
    y: d * fix.longitude + e * fix.latitude + f,
  };
  if (!insidePolygon(point, geo.boundary)) return { status: "outside" };
  return {
    status: "ready",
    point,
    accuracy: (fix.accuracy + geo.maxResidualMeters) / geo.metersPerUnit,
  };
}
