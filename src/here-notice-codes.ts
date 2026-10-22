import type { ApprovedRouteResponse } from "./route-response";

type RouteNoticeKind = ApprovedRouteResponse["routeNotices"][number]["kind"];

/**
 * Structured mapping from HERE Routing v8 notice codes to our notice kinds.
 *
 * HERE returns a stable `code` on each notice (e.g. `heightRestriction`,
 * `violatedVehicleRestriction`). Classifying off the code is far more reliable
 * than scanning the free-text title/message, which can omit the keywords the
 * old heuristic depended on (a low-bridge notice whose text never says
 * "height" would previously fall through to `unknown`/advisory and could let a
 * critical truck route pass). The heuristic remains only as a fallback for
 * codes we have not mapped or notices that arrive without a code.
 *
 * Keys are normalized (lowercased, alphanumerics only) via `normalizeNoticeCode`
 * and stored WITHOUT any `violated` prefix — HERE emits both the restriction
 * form (`vehicleRestriction`) and the violation form
 * (`violatedVehicleRestriction`); `classifyHereNoticeCode` strips the prefix and
 * lets the severity logic decide on escalation.
 */
const HERE_NOTICE_CODE_KIND: Record<string, RouteNoticeKind> = {
  // Clearance / height
  heightrestriction: "clearance",
  clearancerestriction: "clearance",
  lowbridge: "clearance",
  bridgeheightrestriction: "clearance",
  underpassrestriction: "clearance",

  // Weight
  weightrestriction: "weight_restriction",
  grossweightrestriction: "weight_restriction",
  axleweightrestriction: "weight_restriction",
  weightperaxlerestriction: "weight_restriction",
  tandemaxleweightrestriction: "weight_restriction",

  // Truck profile / dimensions
  vehiclerestriction: "truck_restriction",
  truckrestriction: "truck_restriction",
  widthrestriction: "truck_restriction",
  lengthrestriction: "truck_restriction",
  trailerrestriction: "truck_restriction",
  trailercountrestriction: "truck_restriction",
  kingpintorearaxlerestriction: "truck_restriction",
  dimensionrestriction: "truck_restriction",
  unsupportedtruckprofile: "truck_restriction",

  // Hazmat / tunnel categories
  dangerousgoodsrestriction: "hazmat",
  hazardousgoodsrestriction: "hazmat",
  hazmatrestriction: "hazmat",
  tunnelcategory: "hazmat",
  tunnelrestriction: "hazmat",

  // Access / zones / turns
  blockedroad: "access_restriction",
  restrictedturn: "access_restriction",
  turnrestriction: "access_restriction",
  pedestrianzone: "access_restriction",
  carpool: "access_restriction",
  controlledaccesshighwaynotallowed: "access_restriction",
  zonerestriction: "access_restriction",
  restrictedtrafficzone: "access_restriction",
  lowemissionzone: "access_restriction",
  environmentalzone: "access_restriction",
  congestionzone: "access_restriction",
  urbanvehicleaccessregulation: "access_restriction",
  permitrequired: "access_restriction",
  noentry: "access_restriction",
  accessrestriction: "access_restriction",

  // Time / seasonal
  seasonalclosure: "time_restriction",
  timedependentrestriction: "time_restriction",
  timerestriction: "time_restriction",
  temporalrestriction: "time_restriction",

  // Toll
  tollroad: "toll",
  tollroadused: "toll",
  tolltransponderrequired: "toll",
  tollcostsunavailable: "toll",
  toll: "toll",
};

const VIOLATION_PREFIX = "violated";

export function normalizeNoticeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type HereNoticeClassification = {
  kind: RouteNoticeKind;
  isViolation: boolean;
};

/**
 * Classify a HERE notice code into a route notice kind. Returns null when the
 * code is unknown so callers fall back to the text heuristic. `isViolation`
 * reflects HERE's `violated*` code form, which the severity logic escalates.
 */
export function classifyHereNoticeCode(
  code: string | null,
): HereNoticeClassification | null {
  if (!code) {
    return null;
  }

  const normalized = normalizeNoticeCode(code);
  if (normalized.length === 0) {
    return null;
  }

  const isViolation = normalized.startsWith(VIOLATION_PREFIX);
  const base = isViolation
    ? normalized.slice(VIOLATION_PREFIX.length)
    : normalized;

  const kind = HERE_NOTICE_CODE_KIND[normalized] ?? HERE_NOTICE_CODE_KIND[base];
  if (!kind) {
    return null;
  }

  return { kind, isViolation };
}
