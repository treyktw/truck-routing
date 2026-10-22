import { describe, expect, test } from "vitest";

import {
  collectHereRouteNotices,
  normalizeHereNotice,
} from "../src/here-notices";

// Ported from the provider-client tests: same HERE section payloads, exercised
// against the pure normalizer instead of through a stubbed fetch.
describe("collectHereRouteNotices", () => {
  test("promotes no-through restrictions into route notices", () => {
    const notices = collectHereRouteNotices([
      {
        id: "section_1",
        noThroughRestrictions: [
          {
            type: "restriction",
            unconditional: true,
          },
        ],
      },
    ]);

    expect(notices).toEqual([
      {
        code: "no_through:restriction",
        kind: "access_restriction",
        message: "No-through restriction applies on part of this route.",
        sectionId: "section_1",
        severity: "warning",
        title: "No-through restriction",
      },
    ]);
  });

  test("marks vehicle restriction notices as critical truck restrictions", () => {
    const notices = collectHereRouteNotices([
      {
        id: "section_2",
        notices: [
          {
            code: "vehicleRestriction",
            text: "Violated vehicle restriction.",
          },
        ],
      },
    ]);

    expect(notices).toEqual([
      {
        code: "vehicleRestriction",
        kind: "truck_restriction",
        message: "Violated vehicle restriction.",
        sectionId: "section_2",
        severity: "critical",
        title: "vehicleRestriction",
      },
    ]);
  });

  test("dedupes repeated notices and sorts by severity, then title", () => {
    const notices = collectHereRouteNotices([
      {
        id: "section_1",
        notices: [{ code: "tollRoad", text: "Toll road ahead." }],
        spans: [
          {
            notices: [
              {
                code: "heightRestriction",
                text: "Restriction applies on part of this route.",
              },
            ],
          },
        ],
        truckRoadTypes: ["national_network"],
      },
      {
        id: "section_1",
        notices: [{ code: "tollRoad", text: "Toll road ahead." }],
      },
    ]);

    expect(notices.map((notice) => notice.kind)).toEqual([
      "clearance",
      "toll",
      "info",
    ]);
    expect(notices[0]?.severity).toBe("critical");
  });
});

describe("normalizeHereNotice", () => {
  test("classifies by HERE code even when the text lacks keywords", () => {
    const notice = normalizeHereNotice(
      {
        code: "heightRestriction",
        text: "Restriction applies on part of this route.",
      },
      "section_notice",
    );

    expect(notice?.kind).toBe("clearance");
    expect(notice?.severity).toBe("critical");
  });

  test("escalates a violated turn restriction to critical", () => {
    const notice = normalizeHereNotice(
      {
        code: "violatedTurnRestriction",
        text: "Turn is restricted here.",
      },
      "section_notice",
    );

    expect(notice?.kind).toBe("access_restriction");
    expect(notice?.severity).toBe("critical");
  });

  test("falls back to the text heuristic for unmapped codes", () => {
    const notice = normalizeHereNotice(
      { code: "somethingUnmapped", text: "Gross weight limit posted." },
      null,
    );

    expect(notice?.kind).toBe("weight_restriction");
    expect(notice?.severity).toBe("critical");
  });

  test("drops notices with no code, title, or text", () => {
    expect(normalizeHereNotice({}, null)).toBeNull();
  });
});
