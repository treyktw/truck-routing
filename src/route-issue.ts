import { z } from "zod";

import { hashStable } from "./cache-key";
import { coordinateSchema, type NormalizedRouteRequest } from "./route-request";

export const routeIssueTypeSchema = z.enum([
  "bad_dock_approach",
  "low_bridge",
  "no_truck_road",
  "unsafe_turn",
  "wrong_entrance",
]);

export const reportRouteIssueRequestSchema = z.object({
  approvedRouteId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(4_000).optional(),
  destination: coordinateSchema,
  driverId: z.string().trim().min(1),
  issueType: routeIssueTypeSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  orgId: z.string().trim().min(1),
  reportedLocation: coordinateSchema.optional(),
  requestId: z.string().trim().min(1).optional(),
  routeSectionId: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).max(240),
  tripId: z.string().trim().min(1),
});

export type RelatedFacilityNote = {
  id: string;
  snippet: string;
};

export type ReportRouteIssueRequest = z.infer<typeof reportRouteIssueRequestSchema>;
export type RouteIssueType = z.infer<typeof routeIssueTypeSchema>;

export type PersistedRouteIssue = {
  approvedRouteId: string | null;
  createdAt: string;
  description: string | null;
  destination: z.infer<typeof coordinateSchema>;
  destinationFingerprint: string;
  driverId: string;
  id: string;
  issueType: RouteIssueType;
  metadata: Record<string, unknown>;
  orgId: string;
  reportedLocation: z.infer<typeof coordinateSchema> | null;
  requestId: string | null;
  routeSectionId: string | null;
  snippet: string;
  summary: string;
  tripId: string;
};

export function buildDestinationFingerprint(destination: {
  label?: string;
  lat: number;
  lng: number;
}) {
  return hashStable({
    label: normalizeFacilityLabel(destination.label),
    lat: roundCoordinate(destination.lat),
    lng: roundCoordinate(destination.lng),
  });
}

export function buildRouteIssueSnippet(
  issueType: RouteIssueType,
  summary: string,
) {
  return `${formatIssueType(issueType)}: ${summary.trim()}`;
}

export function buildRouteIssueRecord(
  input: ReportRouteIssueRequest,
): PersistedRouteIssue {
  return {
    approvedRouteId: input.approvedRouteId ?? null,
    createdAt: new Date().toISOString(),
    description: input.description ?? null,
    destination: input.destination,
    destinationFingerprint: buildDestinationFingerprint(input.destination),
    driverId: input.driverId,
    id: crypto.randomUUID(),
    issueType: input.issueType,
    metadata: input.metadata,
    orgId: input.orgId,
    reportedLocation: input.reportedLocation ?? null,
    requestId: input.requestId ?? null,
    routeSectionId: input.routeSectionId ?? null,
    snippet: buildRouteIssueSnippet(input.issueType, input.summary),
    summary: input.summary.trim(),
    tripId: input.tripId,
  };
}

export function buildRelatedFacilityNoteLookup(
  request: NormalizedRouteRequest,
) {
  return {
    destinationFingerprint: buildDestinationFingerprint(request.destination),
    orgId: request.orgId,
  };
}

function formatIssueType(issueType: RouteIssueType) {
  switch (issueType) {
    case "bad_dock_approach":
      return "Bad dock approach";
    case "low_bridge":
      return "Low bridge";
    case "no_truck_road":
      return "No truck road";
    case "unsafe_turn":
      return "Unsafe turn";
    case "wrong_entrance":
      return "Wrong entrance";
  }
}

function normalizeFacilityLabel(label?: string) {
  if (!label) {
    return null;
  }

  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(3));
}
