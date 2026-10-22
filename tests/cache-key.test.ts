import { describe, expect, test } from "vitest";

import { buildRouteCacheKey } from "../src/cache-key";

describe("buildRouteCacheKey", () => {
  test("stays stable inside the same coordinate bucket", () => {
    const first = buildRouteCacheKey({
      destination: { lat: 39.74121, lng: -104.99031 },
      intermediateStops: [],
      origin: { lat: 39.74081, lng: -104.98989 },
      providerVersion: "here-v8-truck-v1",
      routePreference: { mode: "fastest" },
      truckProfileHash: "abcdef1234567890",
    });
    const second = buildRouteCacheKey({
      destination: { lat: 39.74122, lng: -104.99032 },
      intermediateStops: [],
      origin: { lat: 39.74082, lng: -104.98988 },
      providerVersion: "here-v8-truck-v1",
      routePreference: { mode: "fastest" },
      truckProfileHash: "abcdef1234567890",
    });

    expect(first).toBe(second);
  });

  test("changes when route preferences change", () => {
    const fastest = buildRouteCacheKey({
      destination: { lat: 39.74121, lng: -104.99031 },
      intermediateStops: [],
      origin: { lat: 39.74081, lng: -104.98989 },
      providerVersion: "here-v8-truck-v1",
      routePreference: { mode: "fastest" },
      truckProfileHash: "abcdef1234567890",
    });
    const shortest = buildRouteCacheKey({
      destination: { lat: 39.74121, lng: -104.99031 },
      intermediateStops: [],
      origin: { lat: 39.74081, lng: -104.98989 },
      providerVersion: "here-v8-truck-v1",
      routePreference: { mode: "shortest" },
      truckProfileHash: "abcdef1234567890",
    });

    expect(fastest).not.toBe(shortest);
  });
});
