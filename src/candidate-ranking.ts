import { boundingBoxForPoints, type BoundingBox } from "./geo";
import { scoreCandidateHazards, type HazardIssue } from "./hazard-scoring";
import {
  decodeHereFlexiblePolyline,
  decodeHereFlexiblePolylines,
  type RoutePoint,
} from "./polyline";
import type {
  ApprovedRouteResponse,
  RouteCandidateSummary,
} from "./route-response";

/**
 * Candidate evaluation, ranking, and crowdsourced-hazard enrichment, extracted
 * from the route service. The service around this (cache, persistence,
 * provider calls, request dedupe) is not part of this package; these are the
 * pure decisions it makes about which HERE candidate a truck should take.
 */

// Pad the candidate bounding box before querying reported issues so hazards
// just off the decoded geometry are still considered for on-path matching.
export const HAZARD_BBOX_PAD_METERS = 200;

/** A provider route candidate as normalized from HERE. */
export type ProviderRouteCandidate = Pick<
  ApprovedRouteResponse,
  "geometry" | "providerMetadata" | "routeNotices" | "summary" | "warnings"
> & {
  candidateId: string;
};

export type EvaluatedRouteCandidate = {
  blockingNotices: ApprovedRouteResponse["routeNotices"];
  candidate: ProviderRouteCandidate;
  highestSeverity:
    | ApprovedRouteResponse["routeNotices"][number]["severity"]
    | null;
  noticeCounts: RouteCandidateSummary["noticeCounts"];
  originalIndex: number;
  rejectionReason: RouteCandidateSummary["rejectionReason"];
  status: RouteCandidateSummary["status"];
};

/**
 * The padded bounding box to query reported issues in, covering every
 * candidate's decoded geometry. Null when no candidate has usable geometry.
 */
export function hazardQueryBoxForCandidates(
  candidates: ProviderRouteCandidate[],
  padMeters = HAZARD_BBOX_PAD_METERS,
): BoundingBox | null {
  const allPoints = candidates.flatMap((candidate) =>
    decodeCandidateGeometryPoints(candidate.geometry),
  );
  return boundingBoxForPoints(allPoints, padMeters);
}

/**
 * Attach crowdsourced-hazard notices to each candidate for driver-reported
 * issues that lie on its geometry. The issue lookup itself is the caller's
 * job (in production it is a best-effort bbox query that never blocks route
 * compute); this only does the on-path matching and merge.
 */
export function attachHazardNotices(
  candidates: ProviderRouteCandidate[],
  issues: HazardIssue[],
): ProviderRouteCandidate[] {
  if (issues.length === 0) {
    return candidates;
  }

  return candidates.map((candidate) => {
    const hazardNotices = scoreCandidateHazards({
      candidatePoints: decodeCandidateGeometryPoints(candidate.geometry),
      issues,
    });
    if (hazardNotices.length === 0) {
      return candidate;
    }
    return {
      ...candidate,
      routeNotices: [...candidate.routeNotices, ...hazardNotices],
      warnings: dedupeWarnings([
        ...candidate.warnings,
        ...hazardNotices.map((notice) => notice.message),
      ]),
    };
  });
}

export function evaluateRouteCandidates(candidates: ProviderRouteCandidate[]) {
  const evaluated = candidates.map((candidate, originalIndex) => {
    const routeNotices = normalizeStoredRouteNotices(candidate.routeNotices);
    const blockingNotices = routeNotices.filter(
      (notice) => notice.severity === "critical",
    );
    const noticeCounts = countRouteNotices(routeNotices);
    const highestSeverity = routeNotices[0]?.severity ?? null;

    return {
      blockingNotices,
      candidate: {
        ...candidate,
        routeNotices,
      },
      highestSeverity,
      noticeCounts,
      originalIndex,
      rejectionReason:
        blockingNotices.length > 0 ? ("critical_notice" as const) : null,
      status:
        blockingNotices.length > 0
          ? ("rejected" as const)
          : ("eligible" as const),
    } satisfies EvaluatedRouteCandidate;
  });

  return [...evaluated].sort(compareEvaluatedCandidates);
}

export function buildCandidateSummaries(
  candidates: EvaluatedRouteCandidate[],
): RouteCandidateSummary[] {
  return candidates.map((candidate, rank) => ({
    blockingNotices: candidate.blockingNotices,
    candidateId: candidate.candidate.candidateId,
    highestSeverity: candidate.highestSeverity,
    noticeCounts: candidate.noticeCounts,
    providerRouteId: candidate.candidate.providerMetadata.routeId,
    rank,
    rejectionReason: candidate.rejectionReason,
    status: candidate.status,
    summary: candidate.candidate.summary,
  }));
}

export function compareEvaluatedCandidates(
  left: EvaluatedRouteCandidate,
  right: EvaluatedRouteCandidate,
) {
  if (left.status !== right.status) {
    return left.status === "eligible" ? -1 : 1;
  }

  const criticalDiff = left.noticeCounts.critical - right.noticeCounts.critical;
  if (criticalDiff !== 0) {
    return criticalDiff;
  }

  const warningDiff = left.noticeCounts.warning - right.noticeCounts.warning;
  if (warningDiff !== 0) {
    return warningDiff;
  }

  const advisoryDiff = left.noticeCounts.advisory - right.noticeCounts.advisory;
  if (advisoryDiff !== 0) {
    return advisoryDiff;
  }

  const durationDiff =
    left.candidate.summary.durationSeconds -
    right.candidate.summary.durationSeconds;
  if (durationDiff !== 0) {
    return durationDiff;
  }

  const distanceDiff =
    left.candidate.summary.distanceMeters -
    right.candidate.summary.distanceMeters;
  if (distanceDiff !== 0) {
    return distanceDiff;
  }

  return left.originalIndex - right.originalIndex;
}

function countRouteNotices(notices: ApprovedRouteResponse["routeNotices"]) {
  return notices.reduce<RouteCandidateSummary["noticeCounts"]>(
    (counts, notice) => {
      counts[notice.severity] += 1;
      counts.total += 1;
      return counts;
    },
    {
      advisory: 0,
      critical: 0,
      total: 0,
      warning: 0,
    },
  );
}

function dedupeWarnings(warnings: string[]) {
  return [...new Set(warnings)];
}

export function decodeCandidateGeometryPoints(geometry: {
  polyline: string;
  sections: Array<{ polyline?: string | null }>;
}): RoutePoint[] {
  try {
    const sectionPolylines = geometry.sections
      .map((section) => section.polyline)
      .filter((polyline): polyline is string => Boolean(polyline));

    if (sectionPolylines.length > 0) {
      return decodeHereFlexiblePolylines(sectionPolylines);
    }
    return decodeHereFlexiblePolyline(geometry.polyline);
  } catch {
    return [];
  }
}

function normalizeStoredRouteNotices(
  notices: ApprovedRouteResponse["routeNotices"],
): ApprovedRouteResponse["routeNotices"] {
  return [...notices]
    .map((notice) => ({
      ...notice,
      severity:
        notice.severity ??
        inferLegacyRouteNoticeSeverity(
          notice.kind,
          notice.message,
          notice.title,
        ),
    }))
    .sort((left, right) => {
      const severityDiff =
        routeNoticeSeverityRank(right.severity) -
        routeNoticeSeverityRank(left.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      return left.title.localeCompare(right.title);
    });
}

function inferLegacyRouteNoticeSeverity(
  kind: ApprovedRouteResponse["routeNotices"][number]["kind"],
  message: string,
  title: string,
): ApprovedRouteResponse["routeNotices"][number]["severity"] {
  const haystack = `${title} ${message}`.toLowerCase();
  const isViolation =
    haystack.includes("violat") ||
    haystack.includes("prohibit") ||
    haystack.includes("not allowed") ||
    haystack.includes("forbidden");

  switch (kind) {
    case "clearance":
    case "hazmat":
    case "weight_restriction":
      return "critical";
    case "truck_restriction":
      return isViolation ? "critical" : "warning";
    case "access_restriction":
    case "time_restriction":
      return "warning";
    // case "toll":
    // case "info":
    // case "unknown":
    default:
      return "advisory";
  }
}

function routeNoticeSeverityRank(
  severity: ApprovedRouteResponse["routeNotices"][number]["severity"],
) {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    // case "advisory":
    default:
      return 1;
  }
}
