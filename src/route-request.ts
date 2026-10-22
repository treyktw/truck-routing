import { z } from "zod";

import {
  hashTruckProfile,
  truckProfileSchema,
  type NormalizedTruckProfile,
} from "./truck-profile";
import { hashStable } from "./cache-key";
import {
  resolveRoutingPolicyTruckProfile,
  routingPolicyPresetSchema,
} from "./routing-policy-preset";

export const coordinateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const routePreferenceSchema = z.object({
  alternativeCount: z.coerce.number().int().min(0).max(4).default(0),
  avoidFerries: z.boolean().default(false),
  avoidHighways: z.boolean().default(false),
  avoidRestrictedBridges: z.boolean().default(true),
  avoidRestrictedRoads: z.boolean().default(true),
  avoidTolls: z.boolean().default(false),
  departureTime: z.string().trim().min(1).default("any"),
  mode: z.enum(["fastest", "shortest"]).default("fastest"),
});

export const rerouteModeSchema = z.enum([
  "dispatcher_override",
  "driver_deviation",
  "initial_plan",
]);

export const cacheModeSchema = z.enum(["default", "bypass"]);
export const persistModeSchema = z.enum(["default", "skip"]);

export const computeRouteRequestSchema = z.object({
  cacheMode: cacheModeSchema.default("default"),
  destination: coordinateSchema,
  driverId: z.string().trim().min(1),
  includeNavigationAdapter: z.boolean().default(false),
  intermediateStops: z.array(coordinateSchema).default([]),
  orgId: z.string().trim().min(1),
  origin: coordinateSchema,
  persistMode: persistModeSchema.default("default"),
  requestMetadata: z.record(z.string(), z.unknown()).default({}),
  rerouteMode: rerouteModeSchema.default("initial_plan"),
  routingPolicyPreset: routingPolicyPresetSchema.default("standard_semi_default"),
  routePreference: routePreferenceSchema.default({
    alternativeCount: 0,
    avoidFerries: false,
    avoidHighways: false,
    avoidRestrictedBridges: true,
    avoidRestrictedRoads: true,
    avoidTolls: false,
    departureTime: "any",
    mode: "fastest",
  }),
  tripId: z.string().trim().min(1),
  truckId: z.string().trim().min(1).optional(),
  truckProfile: truckProfileSchema.default({
    hazmatClasses: [],
  }),
});

export const revalidateRouteRequestSchema = computeRouteRequestSchema.extend({
  deviationMeters: z.coerce.number().nonnegative().optional(),
  previousApprovedRouteId: z.string().trim().min(1).optional(),
  rerouteMode: rerouteModeSchema.default("driver_deviation"),
});

export type ComputeRouteRequest = z.infer<typeof computeRouteRequestSchema>;
export type RevalidateRouteRequest = z.infer<typeof revalidateRouteRequestSchema>;

export type NormalizedRouteRequest = Omit<ComputeRouteRequest, "truckProfile"> & {
  requestHash: string;
  truckProfile: NormalizedTruckProfile;
  truckProfileHash: string;
};

export function normalizeRouteRequest(
  input: ComputeRouteRequest | RevalidateRouteRequest,
): NormalizedRouteRequest {
  const truckProfile = resolveRoutingPolicyTruckProfile({
    overrides: input.truckProfile,
    preset: input.routingPolicyPreset,
  });
  const truckProfileHash = hashTruckProfile(truckProfile);
  const requestHash = hashStable({
    destination: input.destination,
    intermediateStops: input.intermediateStops,
    origin: input.origin,
    rerouteMode: input.rerouteMode,
    routePreference: input.routePreference,
    tripId: input.tripId,
    truckId: input.truckId ?? null,
    truckProfile,
  });

  return {
    ...input,
    truckProfile,
    truckProfileHash,
    requestHash,
  };
}
