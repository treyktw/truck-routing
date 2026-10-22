import type { RoutePoint } from "./polyline";

export const EARTH_RADIUS_METERS = 6_371_000;

export type BoundingBox = {
  maxLat: number;
  maxLng: number;
  minLat: number;
  minLng: number;
};

/**
 * Shortest distance in meters from a point to a line segment, using a local
 * equirectangular projection anchored at the point. Accurate at the small
 * scales (tens of meters to a few km) this is used for.
 */
export function distanceToSegmentMeters(
  point: RoutePoint,
  start: RoutePoint,
  end: RoutePoint,
): number {
  const originLatRadians = (point.latitude * Math.PI) / 180;
  const scaleX = Math.cos(originLatRadians) * EARTH_RADIUS_METERS;
  const toXY = (candidate: RoutePoint) => ({
    x: (((candidate.longitude - point.longitude) * Math.PI) / 180) * scaleX,
    y:
      (((candidate.latitude - point.latitude) * Math.PI) / 180) *
      EARTH_RADIUS_METERS,
  });
  const startXY = toXY(start);
  const endXY = toXY(end);
  const dx = endXY.x - startXY.x;
  const dy = endXY.y - startXY.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(startXY.x, startXY.y);
  }
  const t = Math.max(
    0,
    Math.min(1, -(startXY.x * dx + startXY.y * dy) / lengthSquared),
  );
  return Math.hypot(startXY.x + t * dx, startXY.y + t * dy);
}

/**
 * Shortest distance in meters from a point to a polyline (array of points).
 * Returns Infinity for a polyline with fewer than 2 points.
 */
export function minDistanceToPolylineMeters(
  point: RoutePoint,
  polyline: RoutePoint[],
): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    minDistance = Math.min(
      minDistance,
      distanceToSegmentMeters(point, polyline[index], polyline[index + 1]),
    );
  }
  return minDistance;
}

/**
 * Axis-aligned bounding box around a set of points, padded by `padMeters` on
 * every side. Latitude/longitude padding is derived from the meter pad at the
 * box's mean latitude. Returns null when no points are supplied.
 */
export function boundingBoxForPoints(
  points: RoutePoint[],
  padMeters = 0,
): BoundingBox | null {
  if (points.length === 0) {
    return null;
  }

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  if (padMeters <= 0) {
    return { maxLat, maxLng, minLat, minLng };
  }

  const latPad = (padMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const meanLatRadians = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const cosLat = Math.max(0.01, Math.abs(Math.cos(meanLatRadians)));
  const lngPad = latPad / cosLat;

  return {
    maxLat: maxLat + latPad,
    maxLng: maxLng + lngPad,
    minLat: minLat - latPad,
    minLng: minLng - lngPad,
  };
}
