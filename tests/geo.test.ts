import { describe, expect, test } from "vitest";

import {
  boundingBoxForPoints,
  distanceToSegmentMeters,
  minDistanceToPolylineMeters,
} from "../src/geo";
import type { RoutePoint } from "../src/polyline";

const polyline: RoutePoint[] = [
  { latitude: 35.46, longitude: -97.51 },
  { latitude: 35.48, longitude: -97.51 },
];

describe("geo", () => {
  test("distanceToSegmentMeters is ~0 on the segment", () => {
    const onSegment = { latitude: 35.47, longitude: -97.51 };
    expect(
      distanceToSegmentMeters(onSegment, polyline[0]!, polyline[1]!),
    ).toBeLessThan(1);
  });

  test("minDistanceToPolylineMeters approximates a perpendicular offset", () => {
    // ~0.001 deg lng at this latitude ≈ 90m east of the line.
    const offset = { latitude: 35.47, longitude: -97.509 };
    const distance = minDistanceToPolylineMeters(offset, polyline);
    expect(distance).toBeGreaterThan(70);
    expect(distance).toBeLessThan(110);
  });

  test("boundingBoxForPoints pads on every side", () => {
    const box = boundingBoxForPoints(polyline, 200);
    expect(box).not.toBeNull();
    expect(box!.minLat).toBeLessThan(35.46);
    expect(box!.maxLat).toBeGreaterThan(35.48);
    expect(box!.minLng).toBeLessThan(-97.51);
    expect(box!.maxLng).toBeGreaterThan(-97.51);
  });

  test("boundingBoxForPoints returns null for no points", () => {
    expect(boundingBoxForPoints([], 100)).toBeNull();
  });
});
