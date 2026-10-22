import { describe, expect, test } from "vitest";

import { hashTruckProfile, normalizeTruckProfile } from "../src/truck-profile";

describe("normalizeTruckProfile", () => {
  test("rounds truck dimensions and weights into stable cache buckets", () => {
    const profile = normalizeTruckProfile({
      axleWeightKg: 10123,
      grossWeightKg: 36210,
      heightMeters: 3.984,
      lengthMeters: 22.019,
      widthMeters: 2.589,
    });

    expect(profile).toEqual({
      axleCount: undefined,
      axleWeightKg: 10100,
      grossWeightKg: 36250,
      hazmatClasses: [],
      heightMeters: 4,
      lengthMeters: 22,
      trailerCount: undefined,
      trailerType: undefined,
      widthMeters: 2.6,
    });
  });

  test("produces a stable hash for semantically identical profiles", () => {
    const left = hashTruckProfile(
      normalizeTruckProfile({
        grossWeightKg: 36001,
        hazmatClasses: ["flammable", "gas"],
        heightMeters: 4.01,
      }),
    );
    const right = hashTruckProfile(
      normalizeTruckProfile({
        grossWeightKg: 36099,
        hazmatClasses: ["gas", "flammable"],
        heightMeters: 4.02,
      }),
    );

    expect(left).toBe(right);
  });
});
