import { describe, expect, test } from "vitest";

import {
  attachHazardNotices,
  buildCandidateSummaries,
  evaluateRouteCandidates,
  hazardQueryBoxForCandidates,
  type ProviderRouteCandidate,
} from "../src/candidate-ranking";
import type { HazardIssue } from "../src/hazard-scoring";

// HERE's documented flexible-polyline sample; decodes near 50.10228, 8.69821.
const SAMPLE_POLYLINE = "BFoz5xJ67i1B1B7PzIhaxL7Y";

function buildProviderCandidate(
  overrides: Partial<ProviderRouteCandidate> = {},
): ProviderRouteCandidate {
  return {
    candidateId: "here-candidate-1",
    geometry: {
      polyline: SAMPLE_POLYLINE,
      sections: [
        {
          baseDurationSeconds: 1450,
          distanceMeters: 24500,
          durationSeconds: 1750,
          id: "section_1",
          notices: ["Stay on approved truck route"],
          polyline: SAMPLE_POLYLINE,
        },
      ],
    },
    providerMetadata: {
      routeCount: 1,
      routeId: "here-route-1",
      source: "here-routing-v8",
    },
    routeNotices: [
      {
        code: "truckRestriction",
        kind: "truck_restriction",
        message: "Stay on approved truck route",
        sectionId: "section_1",
        severity: "warning",
        title: "Stay on approved truck route",
      },
    ],
    summary: {
      baseDurationSeconds: 1450,
      distanceMeters: 24500,
      durationSeconds: 1750,
      tollEstimate: null,
    },
    warnings: [],
    ...overrides,
  };
}

const CRITICAL_VEHICLE_NOTICE = {
  code: "vehicleRestriction",
  kind: "truck_restriction" as const,
  message: "Violated vehicle restriction.",
  sectionId: "section_1",
  severity: "critical" as const,
  title: "Vehicle restriction",
};

describe("evaluateRouteCandidates", () => {
  test("prefers a safe alternative over a critically restricted primary candidate", () => {
    const evaluated = evaluateRouteCandidates([
      buildProviderCandidate({
        candidateId: "critical-primary",
        routeNotices: [CRITICAL_VEHICLE_NOTICE],
        summary: {
          baseDurationSeconds: 1300,
          distanceMeters: 24000,
          durationSeconds: 1600,
          tollEstimate: null,
        },
      }),
      buildProviderCandidate({
        candidateId: "safe-alternative",
        summary: {
          baseDurationSeconds: 1500,
          distanceMeters: 25500,
          durationSeconds: 1820,
          tollEstimate: null,
        },
      }),
    ]);
    const summaries = buildCandidateSummaries(evaluated);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.candidateId).toBe("safe-alternative");
    expect(summaries[0]?.status).toBe("eligible");
    expect(summaries[1]?.status).toBe("rejected");
    expect(summaries[1]?.rejectionReason).toBe("critical_notice");
    expect(summaries[1]?.blockingNotices).toHaveLength(1);
  });

  test("rejects every candidate when all are critically restricted", () => {
    const evaluated = evaluateRouteCandidates([
      buildProviderCandidate({
        candidateId: "blocked-a",
        routeNotices: [CRITICAL_VEHICLE_NOTICE],
      }),
      buildProviderCandidate({
        candidateId: "blocked-b",
        routeNotices: [
          {
            code: "weightRestriction",
            kind: "weight_restriction",
            message: "Weight limit exceeded.",
            sectionId: "section_1",
            severity: "critical",
            title: "Weight restriction",
          },
        ],
      }),
    ]);

    expect(evaluated.every((candidate) => candidate.status === "rejected")).toBe(
      true,
    );
  });

  test("breaks notice-count ties on duration", () => {
    const evaluated = evaluateRouteCandidates([
      buildProviderCandidate({ candidateId: "slow" }),
      buildProviderCandidate({
        candidateId: "fast",
        summary: {
          baseDurationSeconds: 1000,
          distanceMeters: 24500,
          durationSeconds: 1200,
          tollEstimate: null,
        },
      }),
    ]);

    expect(evaluated.map((candidate) => candidate.candidate.candidateId)).toEqual(
      ["fast", "slow"],
    );
  });
});

describe("crowdsourced hazards", () => {
  const onPathLowBridge: HazardIssue = {
    id: "hazard_1",
    issueType: "low_bridge",
    lat: 50.10228,
    lng: 8.69821,
    snippet: "Low bridge: 12 ft clearance",
  };

  test("builds a padded query box around candidate geometry", () => {
    const box = hazardQueryBoxForCandidates([buildProviderCandidate()]);
    expect(box).not.toBeNull();
    expect(box!.minLat).toBeLessThan(50.10228);
    expect(box!.maxLat).toBeGreaterThan(50.10228);
  });

  test("attaches a crowdsourced-hazard notice for an issue on the candidate path", () => {
    const [candidate] = attachHazardNotices(
      [buildProviderCandidate()],
      [onPathLowBridge],
    );

    const hazardNotice = candidate?.routeNotices.find(
      (notice) => notice.kind === "crowdsourced_hazard",
    );
    expect(hazardNotice?.severity).toBe("warning");
    expect(hazardNotice?.code).toBe("crowdsourced:low_bridge");
    expect(
      candidate?.warnings.some((warning) =>
        warning.includes("Low bridge: 12 ft clearance"),
      ),
    ).toBe(true);
  });

  test("does not attach hazard notices for issues off the candidate path", () => {
    const [candidate] = attachHazardNotices(
      [buildProviderCandidate()],
      // ~1 km north of the path.
      [{ ...onPathLowBridge, id: "hazard_far", lat: 50.1113 }],
    );

    expect(
      candidate?.routeNotices.some(
        (notice) => notice.kind === "crowdsourced_hazard",
      ),
    ).toBe(false);
  });

  test("a hazard downranks but never blocks a candidate", () => {
    const candidates = attachHazardNotices(
      [
        buildProviderCandidate({ candidateId: "with-hazard" }),
        // No decodable geometry, so the reported issue cannot be on this one.
        buildProviderCandidate({
          candidateId: "clean-but-slower",
          geometry: { polyline: "", sections: [] },
          summary: {
            baseDurationSeconds: 1600,
            distanceMeters: 26000,
            durationSeconds: 1900,
            tollEstimate: null,
          },
        }),
      ],
      [onPathLowBridge],
    );
    const evaluated = evaluateRouteCandidates(candidates);

    expect(evaluated[0]?.candidate.candidateId).toBe("clean-but-slower");
    expect(evaluated[1]?.status).toBe("eligible");
  });
});
