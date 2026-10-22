import { describe, expect, test } from "vitest";

import { decodeHereFlexiblePolyline } from "../src/polyline";
import { reconcileGoogleRoute } from "../src/route-reconcile";

const HERE_POLYLINE = "BFoz5xJ67i1B1B7PzIhaxL7Y";

describe("reconcileGoogleRoute", () => {
  test("continues Google guidance when the SDK route stays inside the HERE corridor", () => {
    const herePoints = decodeHereFlexiblePolyline(HERE_POLYLINE);

    const response = reconcileGoogleRoute({
      approvedRouteId: "approved_route_1",
      eventType: "google_route_changed",
      googleRouteSegments: [
        {
          points: herePoints.map((point) => ({
            lat: point.latitude,
            lng: point.longitude,
          })),
        },
      ],
      hereGeometry: {
        polyline: HERE_POLYLINE,
        sections: [],
      },
      metadata: {},
      orgId: "org_1",
      tripId: "trip_1",
    });

    expect(response.action).toBe("CONTINUE_GOOGLE");
    expect(response.reason).toBe(
      "Google route remains inside the HERE-approved corridor.",
    );
    expect(response.metrics.corridorCoverage).toBe(1);
    expect(response.approvedRouteId).toBe("approved_route_1");
  });

  test("switches to HERE-only guidance when the SDK route leaves the corridor", () => {
    const herePoints = decodeHereFlexiblePolyline(HERE_POLYLINE);

    const response = reconcileGoogleRoute({
      approvedRouteId: "approved_route_1",
      eventType: "google_off_route_reroute_requested",
      googleRouteSegments: [
        {
          points: herePoints.map((point) => ({
            lat: point.latitude + 0.02,
            lng: point.longitude + 0.02,
          })),
        },
      ],
      hereGeometry: {
        polyline: HERE_POLYLINE,
        sections: [],
      },
      metadata: {},
      orgId: "org_1",
      tripId: "trip_1",
    });

    expect(response.action).toBe("SWITCH_HERE_ONLY");
    expect(response.metrics.corridorCoverage).toBeLessThan(0.97);
    expect(response.reason).toContain("Google route corridor coverage");
  });
});
