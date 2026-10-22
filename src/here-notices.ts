import { classifyHereNoticeCode } from "./here-notice-codes";
import type { ApprovedRouteResponse } from "./route-response";

/**
 * Pure normalization of HERE Routing v8 section signals (notices, span
 * notices, no-through restrictions, routing zones, truck road types) into our
 * route notice shape. Extracted from the provider client so the classification
 * and severity rules can be tested without HTTP; the client itself (request
 * building, auth, fetch, error mapping) is not part of this package.
 */
export type HereRouteNoticeInput = {
  code?: string;
  text?: string;
  title?: string;
};

export type HereRouteSectionInput = {
  id?: string;
  noThroughRestrictions?: Array<unknown>;
  notices?: HereRouteNoticeInput[];
  routingZones?: Array<unknown>;
  spans?: Array<{
    notices?: HereRouteNoticeInput[];
  }>;
  truckRoadTypes?: Array<unknown>;
};

type HereRouteSection = HereRouteSectionInput;
type HereRouteNotice = HereRouteNoticeInput;
type HereRouteSpan = NonNullable<HereRouteSection["spans"]>[number];

/**
 * All notices for a HERE route: every section's signals, deduped and sorted
 * most-severe first. This is the list a candidate carries into ranking.
 */
export function collectHereRouteNotices(
  sections: HereRouteSection[],
): ApprovedRouteResponse["routeNotices"] {
  return sortRouteNotices(
    dedupeRouteNotices(
      sections.flatMap((section) => collectSectionRouteNotices(section)),
    ),
  );
}

export function normalizeHereNotice(
  notice: HereRouteNotice,
  sectionId: string | null,
) {
  const code = notice.code?.trim() || null;
  const title = notice.title?.trim() || null;
  const text = notice.text?.trim() || null;
  const message = text ?? title ?? code;

  if (!message) {
    return null;
  }

  const classification = classifyHereNoticeCode(code);
  const kind = classification?.kind ?? inferRouteNoticeKind(code, title, text);

  return {
    code,
    kind,
    message,
    sectionId,
    severity: inferRouteNoticeSeverity(
      kind,
      code,
      title,
      text,
      classification?.isViolation ?? false,
    ),
    title: title ?? buildRouteNoticeTitle(code, text),
  };
}

export function collectSectionRouteNotices(
  section: HereRouteSection,
): ApprovedRouteResponse["routeNotices"] {
  const sectionId = section.id ?? null;

  return [
    ...(section.notices ?? []).flatMap((notice) => {
      const normalized = normalizeHereNotice(notice, sectionId);
      return normalized ? [normalized] : [];
    }),
    ...(section.spans ?? []).flatMap((span) =>
      collectSpanRouteNotices(span, sectionId),
    ),
    ...(section.noThroughRestrictions ?? []).flatMap((signal) => {
      const normalized = normalizeNoThroughRestriction(signal, sectionId);
      return normalized ? [normalized] : [];
    }),
    ...(section.routingZones ?? []).flatMap((signal) => {
      const normalized = normalizeRoutingZone(signal, sectionId);
      return normalized ? [normalized] : [];
    }),
    ...(section.truckRoadTypes ?? []).flatMap((signal) => {
      const normalized = normalizeTruckRoadType(signal, sectionId);
      return normalized ? [normalized] : [];
    }),
  ];
}

function collectSpanRouteNotices(
  span: HereRouteSpan,
  sectionId: string | null,
): ApprovedRouteResponse["routeNotices"] {
  return (span.notices ?? []).flatMap((notice) => {
    const normalized = normalizeHereNotice(notice, sectionId);
    return normalized ? [normalized] : [];
  });
}

function normalizeNoThroughRestriction(
  signal: unknown,
  sectionId: string | null,
) {
  const record = asRecord(signal);
  if (!record) {
    return null;
  }

  const rawType = firstString(record.type, record.category, record.kind);
  const restrictionType = rawType ? humanizeToken(rawType) : "restriction";
  const isUnconditional = record.unconditional === true;

  return {
    code: rawType ? `no_through:${rawType}` : "no_through",
    kind: "access_restriction" as const,
    message: isUnconditional
      ? `No-through ${restrictionType} applies on part of this route.`
      : `Conditional no-through ${restrictionType} applies on part of this route.`,
    sectionId,
    severity: "warning" as const,
    title: isUnconditional
      ? "No-through restriction"
      : "Conditional no-through restriction",
  };
}

function normalizeRoutingZone(signal: unknown, sectionId: string | null) {
  const record = asRecord(signal);
  if (!record) {
    return null;
  }

  const rawType = firstString(record.type, record.category, record.name);
  const zoneLabel = rawType ? humanizeToken(rawType) : "routing zone";

  return {
    code: rawType ? `routing_zone:${rawType}` : "routing_zone",
    kind: "access_restriction" as const,
    message: `Route enters a ${zoneLabel}.`,
    sectionId,
    severity: "warning" as const,
    title: "Routing zone",
  };
}

function normalizeTruckRoadType(signal: unknown, sectionId: string | null) {
  const record = asRecord(signal);
  const rawType =
    typeof signal === "string"
      ? signal
      : firstString(record?.type, record?.category, record?.name);

  if (!rawType) {
    return null;
  }

  return {
    code: `truck_road_type:${rawType}`,
    kind: "info" as const,
    message: `Route uses truck-designated road type: ${humanizeToken(rawType)}.`,
    sectionId,
    severity: "advisory" as const,
    title: "Truck route class",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function humanizeToken(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function inferRouteNoticeKind(
  code: string | null,
  title: string | null,
  text: string | null,
): ApprovedRouteResponse["routeNotices"][number]["kind"] {
  const haystack = `${code ?? ""} ${title ?? ""} ${text ?? ""}`.toLowerCase();

  if (
    haystack.includes("height") ||
    haystack.includes("clearance") ||
    haystack.includes("low bridge")
  ) {
    return "clearance";
  }

  if (
    haystack.includes("hazmat") ||
    haystack.includes("hazard") ||
    haystack.includes("dangerous goods")
  ) {
    return "hazmat";
  }

  if (
    haystack.includes("weight") ||
    haystack.includes("gross weight") ||
    haystack.includes("axle")
  ) {
    return "weight_restriction";
  }

  if (
    haystack.includes("truck") ||
    haystack.includes("commercial vehicle") ||
    haystack.includes("vehicle restriction")
  ) {
    return "truck_restriction";
  }

  if (
    haystack.includes("time") ||
    haystack.includes("hours") ||
    haystack.includes("temporal")
  ) {
    return "time_restriction";
  }

  if (
    haystack.includes("no through") ||
    haystack.includes("access") ||
    haystack.includes("restricted zone") ||
    haystack.includes("permit")
  ) {
    return "access_restriction";
  }

  if (haystack.includes("toll")) {
    return "toll";
  }

  if (title || text) {
    return "info";
  }

  return "unknown";
}

function inferRouteNoticeSeverity(
  kind: ApprovedRouteResponse["routeNotices"][number]["kind"],
  code: string | null,
  title: string | null,
  text: string | null,
  codeIsViolation = false,
): ApprovedRouteResponse["routeNotices"][number]["severity"] {
  const haystack = `${code ?? ""} ${title ?? ""} ${text ?? ""}`.toLowerCase();
  const isViolation =
    codeIsViolation ||
    haystack.includes("violat") ||
    haystack.includes("prohibit") ||
    haystack.includes("not allowed") ||
    haystack.includes("forbidden");

  switch (kind) {
    case "clearance":
    case "hazmat":
    case "weight_restriction":
      return "critical";
    // A violation means the route actually breaks the restriction — that is an
    // illegal route for a truck, so escalate any restriction kind to critical.
    case "truck_restriction":
    case "access_restriction":
    case "time_restriction":
      return isViolation ? "critical" : "warning";
    // case "toll":
    // case "info":
    // case "unknown":
    default:
      return "advisory";
  }
}

function buildRouteNoticeTitle(code: string | null, text: string | null) {
  if (code) {
    return code;
  }

  if (text) {
    const shortened = text.split(/[.:]/, 1)[0]?.trim();
    if (shortened && shortened.length > 0) {
      return shortened;
    }
  }

  return "Route notice";
}

function dedupeRouteNotices(
  notices: ApprovedRouteResponse["routeNotices"],
): ApprovedRouteResponse["routeNotices"] {
  const seen = new Set<string>();

  return notices.filter((notice) => {
    const key = `${notice.code ?? ""}:${notice.sectionId ?? ""}:${notice.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function routeNoticeSeverityRank(
  severity: ApprovedRouteResponse["routeNotices"][number]["severity"],
) {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    // case "advisory":
    default:
      return 1;
  }
}

export function sortRouteNotices(
  notices: ApprovedRouteResponse["routeNotices"],
): ApprovedRouteResponse["routeNotices"] {
  return [...notices].sort((left, right) => {
    const severityDiff =
      routeNoticeSeverityRank(right.severity) -
      routeNoticeSeverityRank(left.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return left.title.localeCompare(right.title);
  });
}
