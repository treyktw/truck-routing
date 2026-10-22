import { z } from "zod";

import {
  decodeHereFlexiblePolyline,
  decodeHereFlexiblePolylines,
  type RoutePoint,
} from "./polyline";

const MAX_RECONCILE_POINTS = 300;
const CORRIDOR_THRESHOLD_METERS = 150;
const MIN_CORRIDOR_COVERAGE = 0.97;
const MAX_DIVERGENCE_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;

export const reconcileRouteRequestSchema = z.object({
  approvedRouteId: z.string().trim().min(1).optional(),
  eventType: z.enum([
    "google_route_changed",
    "google_off_route_reroute_requested",
  ]),
  googleRouteSegments: z.array(
    z.object({
      points: z.array(
        z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
      ),
    }),
  ),
  hereGeometry: z.object({
    polyline: z.string(),
    sections: z.array(
      z.object({
        polyline: z.string().nullable().optional(),
      }),
    ).default([]),
  }),
  metadata: z.record(z.string(), z.unknown()).default({}),
  orgId: z.string().trim().min(1),
  tripId: z.string().trim().min(1).optional(),
});

export const reconcileRouteResponseSchema = z.object({
  action: z.enum(["CONTINUE_GOOGLE", "SWITCH_HERE_ONLY"]),
  approvedRouteId: z.string().nullable(),
  eventType: z.enum([
    "google_route_changed",
    "google_off_route_reroute_requested",
  ]),
  reason: z.string(),
  metrics: z.object({
    corridorCoverage: z.number(),
    maxDivergenceMeters: z.number(),
    meanDivergenceMeters: z.number(),
  }),
  routeVersion: z.string(),
});

export type ReconcileRouteRequest = z.infer<typeof reconcileRouteRequestSchema>;
export type ReconcileRouteResponse = z.infer<typeof reconcileRouteResponseSchema>;

export function reconcileGoogleRoute(
  request: ReconcileRouteRequest,
): ReconcileRouteResponse {
  const herePoints = getHereRoutePoints(request.hereGeometry);
  const googlePoints = request.googleRouteSegments.flatMap((segment) =>
    segment.points.map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
    })),
  );

  if (herePoints.length < 2 || googlePoints.length < 2) {
    return reconcileRouteResponseSchema.parse({
      action: "SWITCH_HERE_ONLY",
      approvedRouteId: request.approvedRouteId ?? null,
      eventType: request.eventType,
      reason: "Route geometry was incomplete during reconciliation.",
      metrics: {
        corridorCoverage: 0,
        maxDivergenceMeters: 0,
        meanDivergenceMeters: 0,
      },
      routeVersion: buildRouteVersion(request),
    });
  }

  const metrics = scoreAgainstCorridor({
    candidatePoints: googlePoints,
    corridorPoints: herePoints,
  });
  const reason = getRejectionReason(metrics);

  return reconcileRouteResponseSchema.parse({
    action: reason ? "SWITCH_HERE_ONLY" : "CONTINUE_GOOGLE",
    approvedRouteId: request.approvedRouteId ?? null,
    eventType: request.eventType,
    reason: reason ?? "Google route remains inside the HERE-approved corridor.",
    metrics,
    routeVersion: buildRouteVersion(request),
  });
}

function getHereRoutePoints(geometry: ReconcileRouteRequest["hereGeometry"]) {
  const sectionPolylines = geometry.sections
    .map((section) => section.polyline)
    .filter((polyline): polyline is string => Boolean(polyline));

  if (sectionPolylines.length > 0) {
    return decodeHereFlexiblePolylines(sectionPolylines);
  }
  return decodeHereFlexiblePolyline(geometry.polyline);
}

function scoreAgainstCorridor(args: {
  candidatePoints: RoutePoint[];
  corridorPoints: RoutePoint[];
}) {
  const sampledPoints = samplePoints(args.candidatePoints, MAX_RECONCILE_POINTS);
  const distances = sampledPoints.map((point) =>
    minDistanceToPolylineMeters(point, args.corridorPoints),
  );
  const matchedCount = distances.filter(
    (distance) => distance <= CORRIDOR_THRESHOLD_METERS,
  ).length;
  const maxDivergenceMeters = Math.max(...distances);
  const meanDivergenceMeters =
    distances.reduce((sum, distance) => sum + distance, 0) /
    Math.max(1, distances.length);

  return {
    corridorCoverage: roundMetric(matchedCount / Math.max(1, distances.length)),
    maxDivergenceMeters: Math.round(maxDivergenceMeters),
    meanDivergenceMeters: Math.round(meanDivergenceMeters),
  };
}

function getRejectionReason(metrics: {
  corridorCoverage: number;
  maxDivergenceMeters: number;
}) {
  if (metrics.corridorCoverage < MIN_CORRIDOR_COVERAGE) {
    return `Google route corridor coverage ${formatPercent(metrics.corridorCoverage)} is below ${formatPercent(MIN_CORRIDOR_COVERAGE)}.`;
  }
  if (metrics.maxDivergenceMeters > MAX_DIVERGENCE_METERS) {
    return `Google route diverges ${metrics.maxDivergenceMeters}m from the HERE-approved corridor.`;
  }
  return null;
}

function samplePoints(points: RoutePoint[], maxPoints: number) {
  if (points.length <= maxPoints) {
    return points;
  }
  const stride = Math.ceil(points.length / maxPoints);
  const sampled: RoutePoint[] = [];
  for (let index = 0; index < points.length; index += stride) {
    sampled.push(points[index]!);
  }
  const lastPoint = points[points.length - 1];
  if (lastPoint && sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }
  return sampled;
}

function minDistanceToPolylineMeters(point: RoutePoint, polyline: RoutePoint[]) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    minDistance = Math.min(
      minDistance,
      distanceToSegmentMeters(point, polyline[index]!, polyline[index + 1]!),
    );
  }
  return minDistance;
}

function distanceToSegmentMeters(point: RoutePoint, start: RoutePoint, end: RoutePoint) {
  const originLatRadians = (point.latitude * Math.PI) / 180;
  const scaleX = Math.cos(originLatRadians) * EARTH_RADIUS_METERS;
  const toXY = (candidate: RoutePoint) => ({
    x: ((candidate.longitude - point.longitude) * Math.PI) / 180 * scaleX,
    y: ((candidate.latitude - point.latitude) * Math.PI) / 180 * EARTH_RADIUS_METERS,
  });
  const startXY = toXY(start);
  const endXY = toXY(end);
  const dx = endXY.x - startXY.x;
  const dy = endXY.y - startXY.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(startXY.x, startXY.y);
  }
  const t = Math.max(0, Math.min(1, -(startXY.x * dx + startXY.y * dy) / lengthSquared));
  return Math.hypot(startXY.x + t * dx, startXY.y + t * dy);
}

function buildRouteVersion(request: ReconcileRouteRequest) {
  return `${request.approvedRouteId ?? request.tripId ?? request.orgId}:${Date.now()}`;
}

function roundMetric(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
