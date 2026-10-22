import { z } from "zod";

import { navigationAdapterSchema } from "./navigation-adapter";
import { rerouteModeSchema } from "./route-request";
import { routingPolicyPresetSchema } from "./routing-policy-preset";

export const routeCacheSchema = z.object({
  ageSeconds: z.number().int().nonnegative().nullable(),
  key: z.string(),
  providerVersion: z.string(),
  status: z.enum(["bypass", "hit", "miss", "stale"]),
  ttlSeconds: z.number().int().positive(),
});

export const routeCoverageSchema = z.object({
  confidence: z.enum(["limited", "standard", "unknown"]),
  note: z.string(),
  regionTag: z.string().nullable(),
});

export const routeSectionSchema = z.object({
  baseDurationSeconds: z.number().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  id: z.string().nullable(),
  notices: z.array(z.string()).default([]),
  polyline: z.string().nullable(),
});

export const routeGeometrySchema = z.object({
  polyline: z.string(),
  sections: z.array(routeSectionSchema).default([]),
});

export const routeNoticeSeveritySchema = z.enum([
  "advisory",
  "warning",
  "critical",
]);

export const routeNoticeSchema = z.object({
  code: z.string().nullable(),
  kind: z.enum([
    "access_restriction",
    "clearance",
    "crowdsourced_hazard",
    "hazmat",
    "time_restriction",
    "toll",
    "truck_restriction",
    "weight_restriction",
    "info",
    "unknown",
  ]),
  message: z.string(),
  sectionId: z.string().nullable(),
  severity: routeNoticeSeveritySchema,
  title: z.string(),
});

export const relatedFacilityNoteSchema = z.object({
  id: z.string(),
  snippet: z.string(),
});

export const routeRequestFingerprintSchema = z.object({
  cacheKey: z.string(),
  requestHash: z.string(),
  rerouteMode: rerouteModeSchema,
});

export const routeRoutingPolicySchema = z.object({
  preset: routingPolicyPresetSchema,
});

export const routeSummarySchema = z.object({
  baseDurationSeconds: z.number().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  tollEstimate: z
    .object({
      currency: z.string(),
      value: z.number(),
    })
    .nullable(),
});

export const routeProviderMetadataSchema = z.object({
  routeCount: z.number().int().nonnegative(),
  routeId: z.string().nullable(),
  source: z.literal("here-routing-v8"),
});

export const approvedRouteResponseSchema = z.object({
  approvedRouteId: z.string(),
  cache: routeCacheSchema,
  computedAt: z.string(),
  coverage: routeCoverageSchema,
  driverId: z.string(),
  geometry: routeGeometrySchema,
  navigationAdapter: navigationAdapterSchema.optional(),
  orgId: z.string(),
  provider: z.literal("here"),
  providerMetadata: routeProviderMetadataSchema,
  routeNotices: z.array(routeNoticeSchema).default([]),
  relatedFacilityNotes: z.array(relatedFacilityNoteSchema).default([]),
  requestFingerprint: routeRequestFingerprintSchema,
  requestId: z.string(),
  routingPolicy: routeRoutingPolicySchema,
  summary: routeSummarySchema,
  tripId: z.string(),
  truckId: z.string().nullable(),
  truckProfileHash: z.string(),
  warnings: z.array(z.string()).default([]),
});

export const routeCandidateNoticeCountsSchema = z.object({
  advisory: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
});

export const routeCandidateSummarySchema = z.object({
  blockingNotices: z.array(routeNoticeSchema).default([]),
  candidateId: z.string(),
  highestSeverity: routeNoticeSeveritySchema.nullable(),
  noticeCounts: routeCandidateNoticeCountsSchema,
  providerRouteId: z.string().nullable(),
  rank: z.number().int().nonnegative(),
  rejectionReason: z.enum(["critical_notice"]).nullable(),
  status: z.enum(["eligible", "rejected"]),
  summary: routeSummarySchema,
});

export const blockedRouteResponseSchema = z.object({
  blockedRouteId: z.string(),
  blockReason: z.literal("critical_notice"),
  blockingNotices: z.array(routeNoticeSchema).default([]),
  cache: routeCacheSchema,
  candidateSummaries: z.array(routeCandidateSummarySchema).default([]),
  computedAt: z.string(),
  coverage: routeCoverageSchema,
  driverId: z.string(),
  orgId: z.string(),
  provider: z.literal("here"),
  providerMetadata: routeProviderMetadataSchema,
  relatedFacilityNotes: z.array(relatedFacilityNoteSchema).default([]),
  requestFingerprint: routeRequestFingerprintSchema,
  requestId: z.string(),
  routingPolicy: routeRoutingPolicySchema,
  tripId: z.string(),
  truckId: z.string().nullable(),
  truckProfileHash: z.string(),
  warnings: z.array(z.string()).default([]),
});

export const approvedRouteDecisionSchema = z.object({
  approvedRoute: approvedRouteResponseSchema,
  candidateSummaries: z.array(routeCandidateSummarySchema).default([]),
  decision: z.literal("approved"),
});

export const blockedRouteDecisionSchema = z.object({
  blockedRoute: blockedRouteResponseSchema,
  decision: z.literal("blocked"),
});

export const routeDecisionResponseSchema = z.discriminatedUnion("decision", [
  approvedRouteDecisionSchema,
  blockedRouteDecisionSchema,
]);

export type ApprovedRouteResponse = z.infer<typeof approvedRouteResponseSchema>;
export type BlockedRouteResponse = z.infer<typeof blockedRouteResponseSchema>;
export type RouteCandidateSummary = z.infer<typeof routeCandidateSummarySchema>;
export type RouteDecisionResponse = z.infer<typeof routeDecisionResponseSchema>;
