import { z } from "zod";

import type { ApprovedRouteResponse } from "./route-response";
import {
  decodeGooglePolyline,
  decodeHereFlexiblePolyline,
  decodeHereFlexiblePolylines,
  type RoutePoint,
} from "./polyline";

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_SAMPLE_POINTS = 250;
const CORRIDOR_THRESHOLD_METERS = 150;
const ACCEPTANCE_MIN_CORRIDOR_COVERAGE = 0.97;
const ACCEPTANCE_MAX_DIVERGENCE_METERS = 150;
const ACCEPTANCE_MAX_DISTANCE_DELTA_RATIO = 0.05;
const ACCEPTANCE_MAX_DURATION_DELTA_RATIO = 0.15;

export const navigationAdapterSchema = z.object({
  provider: z.literal("google_navigation"),
  status: z.enum(["accepted", "rejected", "disabled", "error"]),
  generatedAt: z.string(),
  expiresAt: z.string().nullable(),
  routeHandoffId: z.string().nullable(),
  googlePolyline: z.string().nullable(),
  selectedCandidateIndex: z.number().int().nonnegative().nullable(),
  match: z
    .object({
      corridorCoverage: z.number(),
      distanceDeltaRatio: z.number(),
      durationDeltaRatio: z.number(),
      maxDivergenceMeters: z.number(),
      meanDivergenceMeters: z.number(),
      score: z.number(),
    })
    .nullable(),
  rejectionReason: z.string().nullable(),
});

export type NavigationAdapter = z.infer<typeof navigationAdapterSchema>;

export type GoogleNavigationCandidate = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  routeHandoffId: string;
};

type MatchMetrics = NonNullable<NavigationAdapter["match"]>;

export function buildDisabledNavigationAdapter(
  reason = "Google navigation adapter is not configured.",
): NavigationAdapter {
  return navigationAdapterSchema.parse({
    provider: "google_navigation",
    status: "disabled",
    generatedAt: new Date().toISOString(),
    expiresAt: null,
    routeHandoffId: null,
    googlePolyline: null,
    selectedCandidateIndex: null,
    match: null,
    rejectionReason: reason,
  });
}

export function buildErrorNavigationAdapter(error: unknown): NavigationAdapter {
  return navigationAdapterSchema.parse({
    provider: "google_navigation",
    status: "error",
    generatedAt: new Date().toISOString(),
    expiresAt: null,
    routeHandoffId: null,
    googlePolyline: null,
    selectedCandidateIndex: null,
    match: null,
    rejectionReason:
      error instanceof Error
        ? error.message
        : "Google navigation adapter failed.",
  });
}

export function selectGoogleNavigationAdapter(args: {
  googleCandidates: GoogleNavigationCandidate[];
  hereRoute: ApprovedRouteResponse;
  handoffTtlSeconds: number;
}): NavigationAdapter {
  const generatedAt = new Date();
  const expiresAt = new Date(
    generatedAt.getTime() + args.handoffTtlSeconds * 1000,
  ).toISOString();

  const herePoints = getHereRoutePoints(args.hereRoute);
  if (herePoints.length < 2) {
    return buildRejectedNavigationAdapter({
      generatedAt: generatedAt.toISOString(),
      reason: "HERE route geometry is unavailable for Google matching.",
    });
  }

  const scored = args.googleCandidates.flatMap((candidate, index) => {
    try {
      const googlePoints = decodeGooglePolyline(candidate.encodedPolyline);
      if (googlePoints.length < 2) {
        return [];
      }

      return [
        {
          candidate,
          index,
          metrics: scoreGoogleCandidate({
            googlePoints,
            googleSummary: candidate,
            herePoints,
            hereSummary: args.hereRoute.summary,
          }),
        },
      ];
    } catch {
      return [];
    }
  });

  const best = scored.sort(
    (left, right) => right.metrics.score - left.metrics.score,
  )[0];
  if (!best) {
    return buildRejectedNavigationAdapter({
      generatedAt: generatedAt.toISOString(),
      reason: "Google Routes did not return a decodable route candidate.",
    });
  }

  const rejectionReason = getMatchRejectionReason(best.metrics);
  if (rejectionReason) {
    return navigationAdapterSchema.parse({
      provider: "google_navigation",
      status: "rejected",
      generatedAt: generatedAt.toISOString(),
      expiresAt: null,
      routeHandoffId: null,
      googlePolyline: best.candidate.encodedPolyline,
      selectedCandidateIndex: best.index,
      match: best.metrics,
      rejectionReason,
    });
  }

  return navigationAdapterSchema.parse({
    provider: "google_navigation",
    status: "accepted",
    generatedAt: generatedAt.toISOString(),
    expiresAt,
    routeHandoffId: best.candidate.routeHandoffId,
    googlePolyline: best.candidate.encodedPolyline,
    selectedCandidateIndex: best.index,
    match: best.metrics,
    rejectionReason: null,
  });
}

function buildRejectedNavigationAdapter(args: {
  generatedAt: string;
  reason: string;
}) {
  return navigationAdapterSchema.parse({
    provider: "google_navigation",
    status: "rejected",
    generatedAt: args.generatedAt,
    expiresAt: null,
    routeHandoffId: null,
    googlePolyline: null,
    selectedCandidateIndex: null,
    match: null,
    rejectionReason: args.reason,
  });
}

function getHereRoutePoints(route: ApprovedRouteResponse) {
  const sectionPolylines = route.geometry.sections
    .map((section) => section.polyline)
    .filter((polyline): polyline is string => Boolean(polyline));

  if (sectionPolylines.length > 0) {
    return decodeHereFlexiblePolylines(sectionPolylines);
  }

  return decodeHereFlexiblePolyline(route.geometry.polyline);
}

function scoreGoogleCandidate(args: {
  googlePoints: RoutePoint[];
  googleSummary: Pick<
    GoogleNavigationCandidate,
    "distanceMeters" | "durationSeconds"
  >;
  herePoints: RoutePoint[];
  hereSummary: ApprovedRouteResponse["summary"];
}): MatchMetrics {
  const sampledGooglePoints = samplePoints(
    args.googlePoints,
    MAX_SAMPLE_POINTS,
  );
  const distances = sampledGooglePoints.map((point) =>
    minDistanceToPolylineMeters(point, args.herePoints),
  );
  const matchedCount = distances.filter(
    (distance) => distance <= CORRIDOR_THRESHOLD_METERS,
  ).length;
  const maxDivergenceMeters = Math.max(...distances);
  const meanDivergenceMeters =
    distances.reduce((sum, distance) => sum + distance, 0) /
    Math.max(1, distances.length);
  const corridorCoverage = matchedCount / Math.max(1, distances.length);
  const distanceDeltaRatio = ratioDelta(
    args.googleSummary.distanceMeters,
    args.hereSummary.distanceMeters,
  );
  const durationDeltaRatio = ratioDelta(
    args.googleSummary.durationSeconds,
    args.hereSummary.durationSeconds,
  );
  const divergenceScore = Math.max(0, 1 - meanDivergenceMeters / 250);
  const distanceScore = Math.max(0, 1 - distanceDeltaRatio / 0.2);
  const durationScore = Math.max(0, 1 - durationDeltaRatio / 0.3);
  const score =
    corridorCoverage * 0.55 +
    divergenceScore * 0.25 +
    distanceScore * 0.1 +
    durationScore * 0.1;

  return {
    corridorCoverage: roundMetric(corridorCoverage),
    distanceDeltaRatio: roundMetric(distanceDeltaRatio),
    durationDeltaRatio: roundMetric(durationDeltaRatio),
    maxDivergenceMeters: Math.round(maxDivergenceMeters),
    meanDivergenceMeters: Math.round(meanDivergenceMeters),
    score: roundMetric(score),
  };
}

function getMatchRejectionReason(metrics: MatchMetrics) {
  if (metrics.corridorCoverage < ACCEPTANCE_MIN_CORRIDOR_COVERAGE) {
    return `Google route corridor coverage ${formatPercent(metrics.corridorCoverage)} is below ${formatPercent(ACCEPTANCE_MIN_CORRIDOR_COVERAGE)}.`;
  }
  if (metrics.maxDivergenceMeters > ACCEPTANCE_MAX_DIVERGENCE_METERS) {
    return `Google route diverges ${metrics.maxDivergenceMeters}m from the HERE-approved corridor.`;
  }
  if (metrics.distanceDeltaRatio > ACCEPTANCE_MAX_DISTANCE_DELTA_RATIO) {
    return `Google route distance delta ${formatPercent(metrics.distanceDeltaRatio)} exceeds ${formatPercent(ACCEPTANCE_MAX_DISTANCE_DELTA_RATIO)}.`;
  }
  if (metrics.durationDeltaRatio > ACCEPTANCE_MAX_DURATION_DELTA_RATIO) {
    return `Google route duration delta ${formatPercent(metrics.durationDeltaRatio)} exceeds ${formatPercent(ACCEPTANCE_MAX_DURATION_DELTA_RATIO)}.`;
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
    sampled.push(points[index]);
  }
  const lastPoint = points[points.length - 1];
  if (lastPoint && sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }
  return sampled;
}

function minDistanceToPolylineMeters(
  point: RoutePoint,
  polyline: RoutePoint[],
) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    minDistance = Math.min(
      minDistance,
      distanceToSegmentMeters(point, polyline[index], polyline[index + 1]),
    );
  }
  return minDistance;
}

function distanceToSegmentMeters(
  point: RoutePoint,
  start: RoutePoint,
  end: RoutePoint,
) {
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

function ratioDelta(left: number, right: number) {
  if (right <= 0) {
    return left <= 0 ? 0 : 1;
  }
  return Math.abs(left - right) / right;
}

function roundMetric(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
