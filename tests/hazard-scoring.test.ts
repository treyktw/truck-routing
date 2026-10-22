import { describe, expect, test } from "vitest";

import type { RoutePoint } from "../src/polyline";
import {
  scoreCandidateHazards,
  type HazardIssue,
} from "../src/hazard-scoring";

// A short north-south candidate path near Oklahoma City. ~0.001 deg lat ≈ 111m.
const candidatePoints: RoutePoint[] = [
  { latitude: 35.46, longitude: -97.51 },
  { latitude: 35.47, longitude: -97.51 },
  { latitude: 35.48, longitude: -97.51 },
];

function issue(overrides: Partial<HazardIssue>): HazardIssue {
  return {
    id: "issue_1",
    issueType: "low_bridge",
    lat: 35.47,
    lng: -97.51,
    snippet: "Low bridge: 12 ft clearance",
    ...overrides,
  };
}

describe("scoreCandidateHazards", () => {
  test("emits a notice for an issue on the candidate path", () => {
    const notices = scoreCandidateHazards({
      candidatePoints,
      issues: [issue({})],
    });

    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe("crowdsourced_hazard");
    expect(notices[0]?.severity).toBe("warning");
    expect(notices[0]?.code).toBe("crowdsourced:low_bridge");
    expect(notices[0]?.message).toContain("Low bridge: 12 ft clearance");
  });

  test("ignores issues off the path beyond the threshold", () => {
    const notices = scoreCandidateHazards({
      candidatePoints,
      // ~0.01 deg lng east of the path ≈ 900m, well past 80m.
      issues: [issue({ lng: -97.5 })],
    });

    expect(notices).toHaveLength(0);
  });

  test("maps approach issues to advisory severity", () => {
    const notices = scoreCandidateHazards({
      candidatePoints,
      issues: [
        issue({
          id: "issue_dock",
          issueType: "bad_dock_approach",
          snippet: "Tight dock approach",
        }),
      ],
    });

    expect(notices[0]?.severity).toBe("advisory");
    expect(notices[0]?.code).toBe("crowdsourced:bad_dock_approach");
  });

  test("dedupes by issue id, keeping the nearest match", () => {
    const notices = scoreCandidateHazards({
      candidatePoints,
      issues: [issue({}), issue({})],
    });

    expect(notices).toHaveLength(1);
  });

  test("returns nothing without enough geometry or issues", () => {
    expect(
      scoreCandidateHazards({ candidatePoints: [], issues: [issue({})] }),
    ).toHaveLength(0);
    expect(
      scoreCandidateHazards({ candidatePoints, issues: [] }),
    ).toHaveLength(0);
  });
});
