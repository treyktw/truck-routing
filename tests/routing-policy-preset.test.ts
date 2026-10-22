import { describe, expect, test } from "vitest";

import { resolveRoutingPolicyTruckProfile } from "../src/routing-policy-preset";

describe("resolveRoutingPolicyTruckProfile", () => {
  test("applies the conservative standard semi defaults when no overrides are provided", () => {
    const profile = resolveRoutingPolicyTruckProfile({
      overrides: {
        hazmatClasses: [],
      },
      preset: "standard_semi_default",
    });

    expect(profile.axleCount).toBe(5);
    expect(profile.axleWeightKg).toBeUndefined();
    expect(profile.grossWeightKg).toBe(36_250);
    expect(profile.hazmatClasses).toEqual([]);
    expect(profile.heightMeters).toBeCloseTo(4.1);
    expect(profile.lengthMeters).toBeCloseTo(21.95);
    expect(profile.trailerCount).toBe(1);
    expect(profile.trailerType).toBeUndefined();
    expect(profile.widthMeters).toBeCloseTo(2.6);
  });

  test("keeps explicit truck overrides on top of the routing policy defaults", () => {
    const profile = resolveRoutingPolicyTruckProfile({
      overrides: {
        axleCount: 6,
        hazmatClasses: [],
        heightMeters: 3.96,
      },
      preset: "standard_semi_default",
    });

    expect(profile.axleCount).toBe(6);
    expect(profile.heightMeters).toBe(3.95);
    expect(profile.grossWeightKg).toBe(36_250);
    expect(profile.widthMeters).toBe(2.6);
  });
});
