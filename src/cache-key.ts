import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(",")}}`;
}

export function hashStable(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function bucketCoordinate(value: number) {
  return value.toFixed(3);
}

export function buildRouteCacheKey(args: {
  destination: { lat: number; lng: number };
  intermediateStops: Array<{ lat: number; lng: number }>;
  origin: { lat: number; lng: number };
  providerVersion: string;
  routePreference: unknown;
  truckProfileHash: string;
}) {
  const originBucket = `${bucketCoordinate(args.origin.lat)},${bucketCoordinate(args.origin.lng)}`;
  const destinationBucket = `${bucketCoordinate(args.destination.lat)},${bucketCoordinate(args.destination.lng)}`;
  const stopsHash = hashStable(
    args.intermediateStops.map((stop) => ({
      lat: bucketCoordinate(stop.lat),
      lng: bucketCoordinate(stop.lng),
    })),
  ).slice(0, 12);
  const preferenceHash = hashStable(args.routePreference).slice(0, 12);

  return [
    "route",
    "v1",
    args.providerVersion,
    originBucket,
    destinationBucket,
    args.truckProfileHash.slice(0, 16),
    preferenceHash,
    stopsHash,
  ].join(":");
}
