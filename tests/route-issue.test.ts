import { describe, expect, test } from "vitest";

import {
  buildRelatedFacilityNoteLookup,
  buildRouteIssueRecord,
} from "../src/route-issue";
import {
  normalizeRouteRequest,
  type ComputeRouteRequest,
} from "../src/route-request";

describe("route issue fingerprinting", () => {
  test("matches route compute destinations and issue reports for the same facility", () => {
    const request = normalizeRouteRequest(buildComputeRouteRequest());
    const issue = buildRouteIssueRecord({
      destination: {
        label: "destination warehouse",
        lat: 35.46761,
        lng: -97.51639,
      },
      driverId: "driver_123",
      issueType: "wrong_entrance",
      metadata: {},
      orgId: "org_123",
      summary: "Use the south truck gate",
      tripId: "trip_123",
    });

    expect(issue.destinationFingerprint).toBe(
      buildRelatedFacilityNoteLookup(request).destinationFingerprint,
    );
  });
});

function buildComputeRouteRequest(): ComputeRouteRequest {
  return {
    cacheMode: "default",
    destination: {
      label: "Destination Warehouse",
      lat: 35.4676,
      lng: -97.5164,
    },
    driverId: "driver_123",
    includeNavigationAdapter: false,
    intermediateStops: [],
    orgId: "org_123",
    origin: {
      label: "Origin yard",
      lat: 35.222,
      lng: -97.4395,
    },
    persistMode: "default",
    requestMetadata: {},
    rerouteMode: "initial_plan",
    routingPolicyPreset: "standard_semi_default",
    routePreference: {
      alternativeCount: 1,
      avoidFerries: false,
      avoidHighways: false,
      avoidRestrictedBridges: true,
      avoidRestrictedRoads: true,
      avoidTolls: false,
      departureTime: "any",
      mode: "fastest",
    },
    tripId: "trip_123",
    truckId: "truck_123",
    truckProfile: {
      hazmatClasses: [],
    },
  };
}
