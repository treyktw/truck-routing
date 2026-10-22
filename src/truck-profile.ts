import { z } from "zod";

import { hashStable } from "./cache-key";

export const hazmatClassSchema = z.enum([
  "combustible",
  "corrosive",
  "explosive",
  "flammable",
  "gas",
  "harmfulToWater",
  "organic",
  "poison",
  "poisonInhalationHazard",
  "radioactive",
]);

export const truckProfileSchema = z.object({
  axleCount: z.coerce.number().int().positive().optional(),
  axleWeightKg: z.coerce.number().positive().optional(),
  grossWeightKg: z.coerce.number().positive().optional(),
  hazmatClasses: z.array(hazmatClassSchema).default([]),
  heightMeters: z.coerce.number().positive().optional(),
  lengthMeters: z.coerce.number().positive().optional(),
  trailerCount: z.coerce.number().int().nonnegative().optional(),
  trailerType: z
    .enum(["dry_van", "flatbed", "intermodal", "lowboy", "other", "reefer", "tanker"])
    .optional(),
  widthMeters: z.coerce.number().positive().optional(),
});

export type TruckProfileInput = z.input<typeof truckProfileSchema>;
export type NormalizedTruckProfile = z.output<typeof truckProfileSchema>;

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function normalizeTruckProfile(input: TruckProfileInput): NormalizedTruckProfile {
  const parsed = truckProfileSchema.parse(input);

  return {
    axleCount: parsed.axleCount,
    axleWeightKg:
      parsed.axleWeightKg != null ? roundTo(parsed.axleWeightKg, 100) : undefined,
    grossWeightKg:
      parsed.grossWeightKg != null ? roundTo(parsed.grossWeightKg, 250) : undefined,
    hazmatClasses: [...parsed.hazmatClasses].sort(),
    heightMeters:
      parsed.heightMeters != null ? roundTo(parsed.heightMeters, 0.05) : undefined,
    lengthMeters:
      parsed.lengthMeters != null ? roundTo(parsed.lengthMeters, 0.05) : undefined,
    trailerCount: parsed.trailerCount,
    trailerType: parsed.trailerType,
    widthMeters:
      parsed.widthMeters != null ? roundTo(parsed.widthMeters, 0.05) : undefined,
  };
}

export function hashTruckProfile(profile: NormalizedTruckProfile) {
  return hashStable(profile);
}
