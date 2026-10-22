import type { NormalizedRouteRequest } from "./route-request";

export const PROVIDER_VERSION = "here-v8-truck-v3";

export function deriveHotCacheTtlSeconds(
  request: NormalizedRouteRequest,
  defaultTtlSeconds: number,
) {
  if (request.routePreference.departureTime === "any") {
    return defaultTtlSeconds;
  }

  return Math.max(60 * 30, Math.round(defaultTtlSeconds / 2));
}

export function buildCoverageMetadata() {
  return {
    confidence: "unknown" as const,
    note:
      "HERE truck routing is the primary provider, but regional truck restriction coverage still needs corridor-level verification.",
    regionTag: null,
  };
}

export function buildRequestWarnings(request: NormalizedRouteRequest) {
  const warnings = new Set<string>();

  if (request.truckProfile.hazmatClasses.length > 0) {
    warnings.add(
      `Hazmat constraints requested: ${request.truckProfile.hazmatClasses.join(", ")}`,
    );
  }

  if (request.truckProfile.axleWeightKg != null) {
    warnings.add(
      "Axle-weight constraints are captured in the request and audit trail; verify the exact HERE parameter mapping before treating them as fully enforced.",
    );
  }

  if (!request.truckProfile.grossWeightKg) {
    warnings.add(
      "Gross vehicle weight was not provided. Route quality may degrade on weight-restricted corridors.",
    );
  }

  return [...warnings];
}
