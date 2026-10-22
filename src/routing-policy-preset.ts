import { z } from "zod";

import {
  normalizeTruckProfile,
  type NormalizedTruckProfile,
  type TruckProfileInput,
} from "./truck-profile";

export const routingPolicyPresetSchema = z.enum(["standard_semi_default"]);

export type RoutingPolicyPreset = z.infer<typeof routingPolicyPresetSchema>;

const STANDARD_SEMI_DEFAULT_PROFILE: TruckProfileInput = {
  axleCount: 5,
  grossWeightKg: 36_287,
  heightMeters: 4.11,
  lengthMeters: 21.95,
  trailerCount: 1,
  widthMeters: 2.59,
};

export function resolveRoutingPolicyTruckProfile(args: {
  overrides: TruckProfileInput;
  preset: RoutingPolicyPreset;
}): NormalizedTruckProfile {
  const baseProfile = getRoutingPolicyPresetProfile(args.preset);

  return normalizeTruckProfile({
    ...baseProfile,
    ...args.overrides,
    hazmatClasses: args.overrides.hazmatClasses ?? [],
  });
}

function getRoutingPolicyPresetProfile(
  preset: RoutingPolicyPreset,
): TruckProfileInput {
  switch (preset) {
    case "standard_semi_default":
      return STANDARD_SEMI_DEFAULT_PROFILE;
    default:
      return STANDARD_SEMI_DEFAULT_PROFILE;
  }
}
