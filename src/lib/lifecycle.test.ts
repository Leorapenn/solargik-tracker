import { describe, expect, it } from "vitest";
import { deriveLifecycle, parseLifecycle } from "./lifecycle";

describe("deriveLifecycle", () => {
  it("marks 315-Barge 1 (STAGE '0 Pre NTP & Pre AP', Status 'Cancelled') as CANCELLED, not Pre-NTP", () => {
    expect(deriveLifecycle("0 Pre NTP & Pre AP", "Cancelled")).toBe("CANCELLED");
  });

  it("marks Status 'Stuck/On Hold' as ON_HOLD", () => {
    expect(deriveLifecycle("4 Construction", "Stuck/On Hold")).toBe("ON_HOLD");
  });

  it("marks STAGE '7 Hold' as ON_HOLD", () => {
    expect(deriveLifecycle("7 Hold", "Construction")).toBe("ON_HOLD");
  });

  it("marks STAGE 'Suspended' as SUSPENDED", () => {
    expect(deriveLifecycle("Suspended", "Construction")).toBe("SUSPENDED");
  });

  it("marks STAGE '0 Pre NTP & Pre AP' as PRE_NTP even when Status says Logistics/Design", () => {
    expect(deriveLifecycle("0 Pre NTP & Pre AP", "Logistics")).toBe("PRE_NTP");
    expect(deriveLifecycle("0 Pre NTP & Pre AP", "Pre NTP")).toBe("PRE_NTP");
  });

  it("gives cancelled precedence over hold and suspended", () => {
    expect(deriveLifecycle("Suspended", "Cancelled")).toBe("CANCELLED");
    expect(deriveLifecycle("7 Hold", "Cancelled")).toBe("CANCELLED");
  });

  it("gives on hold precedence over suspended and pre-NTP", () => {
    expect(deriveLifecycle("Suspended", "Stuck/On Hold")).toBe("ON_HOLD");
    expect(deriveLifecycle("0 Pre NTP & Pre AP", "Stuck/On Hold")).toBe("ON_HOLD");
  });

  it("is case/whitespace tolerant", () => {
    expect(deriveLifecycle("  suspended ", null)).toBe("SUSPENDED");
    expect(deriveLifecycle(null, " CANCELLED")).toBe("CANCELLED");
  });

  it("treats everything else, including no Control Table row, as ACTIVE", () => {
    expect(deriveLifecycle("4 Construction", "Construction")).toBe("ACTIVE");
    expect(deriveLifecycle("3 Logistics", "Logistics")).toBe("ACTIVE");
    expect(deriveLifecycle(null, null)).toBe("ACTIVE");
    expect(deriveLifecycle(undefined, undefined)).toBe("ACTIVE");
  });
});

describe("parseLifecycle", () => {
  it("accepts only known values", () => {
    expect(parseLifecycle("PRE_NTP")).toBe("PRE_NTP");
    expect(parseLifecycle("nonsense")).toBeNull();
    expect(parseLifecycle(undefined)).toBeNull();
  });
});
