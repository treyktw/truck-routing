import { minDistanceToPolylineMeters } from "./geo";
import type { RoutePoint } from "./polyline";
import { routeIssueTypeSchema, type RouteIssueType } from "./route-issue";
import type { ApprovedRouteResponse } from "./route-response";

type RouteNotice = ApprovedRouteResponse["routeNotices"][number];
type RouteNoticeSeverity = RouteNotice["severity"];

/**
 * A driver-reported route issue with a usable coordinate, as fetched from the
 * route-issue store for hazard scoring.
 */
export type HazardIssue = {
  id: string;
  issueType: RouteIssueType;
  lat: number;
  lng: number;
  snippet: string;
};

/**
 * How close (meters) a reported issue must be to a candidate's geometry for us
 * to treat it as "on this route".
 */
export const HAZARD_ON_PATH_METERS = 80;

/**
 * Crowdsourced reports are supplementary signal, NOT the authoritative HERE
 * truck restriction. We never let them mark a candidate `critical` (which would
 * block the route) — the worst they do is `warning`, which downranks a
 * candidate via the existing notice-count comparator. Physical hazards
 * (low bridge / no-truck road) warn; approach/turn problems are advisory.
 */
const ISSUE_TYPE_NOTICE: Record<
  RouteIssueType,
  { severity: RouteNoticeSeverity; title: string }
> = {
  bad_dock_approach: {
    severity: "advisory",
    title: "Difficult dock approach reported",
  },
  low_bridge: { severity: "warning", title: "Low bridge reported by a driver" },
  no_truck_road: {
    severity: "warning",
    title: "No-truck road reported by a driver",
  },
  unsafe_turn: { severity: "advisory", title: "Unsafe turn reported" },
  wrong_entrance: { severity: "advisory", title: "Wrong entrance reported" },
};

function toRouteNotice(issue: HazardIssue, distanceMeters: number): RouteNotice {
  const mapping = ISSUE_TYPE_NOTICE[issue.issueType];
  const roundedDistance = Math.round(distanceMeters);
  return {
    code: `crowdsourced:${issue.issueType}`,
    kind: "crowdsourced_hazard",
    message: `${issue.snippet} (driver-reported ~${roundedDistance}m from this route).`,
    sectionId: null,
    severity: mapping.severity,
    title: mapping.title,
  };
}

/**
 * Build crowdsourced-hazard notices for the reported issues that lie on a
 * candidate's geometry. Pure: pass decoded candidate points + issues.
 * Deduped by issue id; if the same issue somehow appears twice, the nearest
 * match wins.
 */
export function scoreCandidateHazards(args: {
  candidatePoints: RoutePoint[];
  issues: HazardIssue[];
  thresholdMeters?: number;
}): RouteNotice[] {
  const threshold = args.thresholdMeters ?? HAZARD_ON_PATH_METERS;
  if (args.candidatePoints.length < 2 || args.issues.length === 0) {
    return [];
  }

  const nearestById = new Map<string, { distance: number; issue: HazardIssue }>();
  for (const issue of args.issues) {
    if (!routeIssueTypeSchema.safeParse(issue.issueType).success) {
      continue;
    }
    const distance = minDistanceToPolylineMeters(
      { latitude: issue.lat, longitude: issue.lng },
      args.candidatePoints,
    );
    if (distance > threshold) {
      continue;
    }
    const existing = nearestById.get(issue.id);
    if (!existing || distance < existing.distance) {
      nearestById.set(issue.id, { distance, issue });
    }
  }

  return [...nearestById.values()]
    .sort((left, right) => left.distance - right.distance)
    .map(({ distance, issue }) => toRouteNotice(issue, distance));
}
