/**
 * Demo: the decisions a truck route service makes between "provider returned
 * N candidates" and "here is the route the driver gets".
 *
 * 1. Normalize a route request (preset truck profile + overrides) and build
 *    its stable cache key.
 * 2. Turn raw HERE Routing v8 section signals into severity-ranked notices.
 * 3. Attach driver-reported hazards that sit on each candidate's geometry.
 * 4. Rank: any critical notice rejects; the rest sort by notice counts, then
 *    duration and distance.
 *
 * Provider HTTP is out of scope, so the candidates below are synthetic and
 * their geometry is encoded locally with a tiny flexible-polyline encoder.
 *
 * Run: pnpm demo
 */
import {
  PROVIDER_VERSION,
  attachHazardNotices,
  buildCandidateSummaries,
  buildRouteCacheKey,
  collectHereRouteNotices,
  computeRouteRequestSchema,
  evaluateRouteCandidates,
  hazardQueryBoxForCandidates,
  normalizeRouteRequest,
  type HazardIssue,
  type HereRouteSectionInput,
  type ProviderRouteCandidate,
} from "../src";

// ── Minimal HERE flexible-polyline encoder (2D, precision 5) ────────────────
const ENCODING_TABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeUnsigned(value: number): string {
  let encoded = "";
  let remaining = value;
  while (remaining > 0x1f) {
    encoded += ENCODING_TABLE[(remaining & 0x1f) | 0x20];
    remaining = Math.floor(remaining / 32);
  }
  return encoded + ENCODING_TABLE[remaining];
}

function encodeSigned(value: number): string {
  const shifted = value < 0 ? ~(value << 1) : value << 1;
  return encodeUnsigned(shifted);
}

function encodeFlexiblePolyline(points: Array<[number, number]>): string {
  const precision = 5;
  const multiplier = 10 ** precision;
  let encoded = encodeUnsigned(1) + encodeUnsigned(precision);
  let previousLat = 0;
  let previousLng = 0;
  for (const [lat, lng] of points) {
    const scaledLat = Math.round(lat * multiplier);
    const scaledLng = Math.round(lng * multiplier);
    encoded += encodeSigned(scaledLat - previousLat);
    encoded += encodeSigned(scaledLng - previousLng);
    previousLat = scaledLat;
    previousLng = scaledLng;
  }
  return encoded;
}

// ── 1. Request normalization + cache key ────────────────────────────────────
const request = computeRouteRequestSchema.parse({
  driverId: "driver-demo",
  orgId: "org-demo",
  tripId: "trip-demo",
  origin: { label: "Synthetic yard", lat: 35.4676, lng: -97.5164 },
  destination: { label: "Synthetic DC", lat: 35.6528, lng: -97.4781 },
  truckProfile: { heightMeters: 4.2 }, // override the preset height only
});
const normalized = normalizeRouteRequest(request);
const cacheKey = buildRouteCacheKey({
  destination: normalized.destination,
  intermediateStops: normalized.intermediateStops,
  origin: normalized.origin,
  providerVersion: PROVIDER_VERSION,
  routePreference: normalized.routePreference,
  truckProfileHash: normalized.truckProfileHash,
});
console.log("Truck profile:", normalized.truckProfile);
console.log("Cache key:", cacheKey, "\n");

// ── 2. Three synthetic candidates with raw HERE section signals ─────────────
type CandidateSpec = {
  id: string;
  points: Array<[number, number]>;
  durationSeconds: number;
  distanceMeters: number;
  hereSections: HereRouteSectionInput[];
};

const specs: CandidateSpec[] = [
  {
    id: "fastest-under-low-bridge",
    points: [[35.4676, -97.5164], [35.56, -97.5], [35.6528, -97.4781]],
    durationSeconds: 1500,
    distanceMeters: 23_000,
    hereSections: [
      {
        id: "s1",
        notices: [{ code: "violatedVehicleRestriction", title: "Vehicle height restriction" }],
      },
    ],
  },
  {
    id: "middle-with-reported-hazard",
    points: [[35.4676, -97.5164], [35.55, -97.56], [35.6528, -97.4781]],
    durationSeconds: 1700,
    distanceMeters: 25_000,
    hereSections: [{ id: "s1", notices: [] }],
  },
  {
    id: "longest-clean",
    points: [[35.4676, -97.5164], [35.55, -97.43], [35.6528, -97.4781]],
    durationSeconds: 1900,
    distanceMeters: 27_500,
    hereSections: [{ id: "s1", truckRoadTypes: ["NA"] }],
  },
];

const candidates: ProviderRouteCandidate[] = specs.map((spec, index) => {
  const polyline = encodeFlexiblePolyline(spec.points);
  return {
    candidateId: spec.id,
    geometry: {
      polyline,
      sections: [
        {
          baseDurationSeconds: spec.durationSeconds,
          distanceMeters: spec.distanceMeters,
          durationSeconds: spec.durationSeconds,
          id: "s1",
          notices: [],
          polyline,
        },
      ],
    },
    providerMetadata: { routeCount: specs.length, routeId: `route-${index}`, source: "here-routing-v8" },
    routeNotices: collectHereRouteNotices(spec.hereSections),
    summary: {
      baseDurationSeconds: spec.durationSeconds,
      distanceMeters: spec.distanceMeters,
      durationSeconds: spec.durationSeconds,
      tollEstimate: null,
    },
    warnings: [],
  };
});

// ── 3. Driver-reported hazards inside the padded query box ──────────────────
const queryBox = hazardQueryBoxForCandidates(candidates);
console.log("Hazard query box:", queryBox, "\n");

const reportedIssues: HazardIssue[] = [
  {
    id: "issue-1",
    issueType: "no_truck_road",
    lat: 35.55,
    lng: -97.56, // sits on the middle candidate's turn point
    snippet: "No-truck road posted at the overpass",
  },
];
const enriched = attachHazardNotices(candidates, reportedIssues);

// ── 4. Rank ──────────────────────────────────────────────────────────────────
const summaries = buildCandidateSummaries(evaluateRouteCandidates(enriched));
for (const summary of summaries) {
  const counts = summary.noticeCounts;
  console.log(
    `#${summary.rank} ${summary.candidateId.padEnd(28)} ${summary.status.padEnd(8)} ` +
      `critical=${counts.critical} warning=${counts.warning} advisory=${counts.advisory} ` +
      `duration=${summary.summary.durationSeconds}s` +
      (summary.rejectionReason ? ` (${summary.rejectionReason})` : ""),
  );
}

const chosen = enriched.find((candidate) => candidate.candidateId === summaries[0]?.candidateId);
console.log(
  "\nSection durations to feed hos-engine's projectHosAlongRoute:",
  chosen?.geometry.sections.map((section) => section.durationSeconds),
);
