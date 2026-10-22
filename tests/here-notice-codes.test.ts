import { describe, expect, test } from "vitest";

import {
  classifyHereNoticeCode,
  normalizeNoticeCode,
} from "../src/here-notice-codes";

describe("classifyHereNoticeCode", () => {
  test("maps known restriction codes to kinds", () => {
    expect(classifyHereNoticeCode("heightRestriction")).toEqual({
      kind: "clearance",
      isViolation: false,
    });
    expect(classifyHereNoticeCode("grossWeightRestriction")).toEqual({
      kind: "weight_restriction",
      isViolation: false,
    });
    expect(classifyHereNoticeCode("dangerousGoodsRestriction")).toEqual({
      kind: "hazmat",
      isViolation: false,
    });
    expect(classifyHereNoticeCode("restrictedTurn")).toEqual({
      kind: "access_restriction",
      isViolation: false,
    });
    expect(classifyHereNoticeCode("seasonalClosure")).toEqual({
      kind: "time_restriction",
      isViolation: false,
    });
    expect(classifyHereNoticeCode("tollRoad")).toEqual({
      kind: "toll",
      isViolation: false,
    });
  });

  test("strips the violated prefix and flags the violation", () => {
    expect(classifyHereNoticeCode("violatedVehicleRestriction")).toEqual({
      kind: "truck_restriction",
      isViolation: true,
    });
    expect(classifyHereNoticeCode("violatedTimeDependentRestriction")).toEqual({
      kind: "time_restriction",
      isViolation: true,
    });
  });

  test("is tolerant of punctuation and casing in codes", () => {
    expect(normalizeNoticeCode("violated.Vehicle_Restriction")).toBe(
      "violatedvehiclerestriction",
    );
    expect(classifyHereNoticeCode("VEHICLE_RESTRICTION")).toEqual({
      kind: "truck_restriction",
      isViolation: false,
    });
  });

  test("returns null for unknown or empty codes so callers fall back", () => {
    expect(classifyHereNoticeCode(null)).toBeNull();
    expect(classifyHereNoticeCode("")).toBeNull();
    expect(classifyHereNoticeCode("somethingUnmapped")).toBeNull();
  });
});
