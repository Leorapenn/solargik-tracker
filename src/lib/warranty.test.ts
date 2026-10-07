import { describe, expect, it } from "vitest";
import { addYears, cleanWarrantyYears, daysBetween, describeLeft, warrantyLines } from "./warranty";

const TODAY = "2026-10-07";
const done = (name: string, completedAt: string | null) => ({ name, status: "DONE", completedAt });

describe("addYears", () => {
  it("adds calendar years", () => {
    expect(addYears("2026-03-15", 10)).toBe("2036-03-15");
    expect(addYears("2026-03-15", 5)).toBe("2031-03-15");
  });
  it("moves 29 Feb to 28 Feb when the target year has no leap day", () => {
    expect(addYears("2024-02-29", 5)).toBe("2029-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });
});

describe("warrantyLines", () => {
  it("uses 10 years for the structural groups and 5 for the drive unit, from each delivery item's date", () => {
    const lines = warrantyLines(
      { items: [done("Delivery – Piles", "2026-01-10"), done("Delivery – Tracker Structure", "2026-03-20"), done("Delivery – Drive Units & I&C", "2026-06-30")], structuralYears: null, driveYears: null },
      TODAY,
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.piles).toMatchObject({ years: 10, deliveredOn: "2026-01-10", expiresOn: "2036-01-10", status: "ACTIVE" });
    expect(by.structure).toMatchObject({ years: 10, expiresOn: "2036-03-20" });
    expect(by.motion).toMatchObject({ years: 10, expiresOn: "2036-06-30" });
    expect(by.drive).toMatchObject({ years: 5, expiresOn: "2031-06-30" });
    expect(by.drive.daysLeft).toBe(daysBetween(TODAY, "2031-06-30"));
  });

  it("is not delivered until the item is done, and asks for a date when a done item has none", () => {
    const lines = warrantyLines(
      { items: [{ name: "Delivery – Piles", status: "IN_PROGRESS", completedAt: null }, done("Delivery – Tracker Structure", null)], structuralYears: null, driveYears: null },
      TODAY,
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l.status]));
    expect(by).toEqual({ piles: "NOT_DELIVERED", structure: "NEEDS_DATE", motion: "NOT_DELIVERED", drive: "NOT_DELIVERED" });
  });

  it("flags warranties that end within six months, and expired ones", () => {
    const lines = warrantyLines(
      { items: [done("Delivery – Piles", "2016-12-01"), done("Delivery – Drive Units & I&C", "2021-01-15")], structuralYears: null, driveYears: null },
      TODAY,
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.piles.status).toBe("EXPIRING"); // ends 2026-12-01
    expect(by.drive.status).toBe("EXPIRED"); // ended 2026-01-15
    expect(by.drive.daysLeft!).toBeLessThan(0);
  });

  it("honours a per-project override of the periods", () => {
    const lines = warrantyLines({ items: [done("Delivery – Piles", "2026-01-10"), done("Delivery – Drive Units & I&C", "2026-01-10")], structuralYears: 12, driveYears: 7 }, TODAY);
    const by = Object.fromEntries(lines.map((l) => [l.key, l.expiresOn]));
    expect(by.piles).toBe("2038-01-10");
    expect(by.drive).toBe("2033-01-10");
  });
});

describe("describeLeft", () => {
  it("says it in years and months, or days when it is close", () => {
    expect(describeLeft(daysBetween(TODAY, "2036-01-10"), TODAY, "2036-01-10")).toBe("9 years 3 months left");
    expect(describeLeft(daysBetween(TODAY, "2026-12-07"), TODAY, "2026-12-07")).toBe("2 months left");
    expect(describeLeft(12, TODAY, "2026-10-19")).toBe("12 days left");
    expect(describeLeft(0, TODAY, TODAY)).toBe("expires today");
    expect(describeLeft(daysBetween(TODAY, "2026-08-07"), TODAY, "2026-08-07")).toBe("expired 2 months ago");
  });
});

describe("cleanWarrantyYears", () => {
  it("accepts whole years 1-30 and empty", () => {
    expect(cleanWarrantyYears("10")).toEqual({ ok: true, value: 10 });
    expect(cleanWarrantyYears(" ")).toEqual({ ok: true, value: null });
    expect(cleanWarrantyYears(5)).toEqual({ ok: true, value: 5 });
  });
  it("rejects anything else", () => {
    expect(cleanWarrantyYears("0").ok).toBe(false);
    expect(cleanWarrantyYears("31").ok).toBe(false);
    expect(cleanWarrantyYears("2.5").ok).toBe(false);
    expect(cleanWarrantyYears("ten").ok).toBe(false);
  });
});
