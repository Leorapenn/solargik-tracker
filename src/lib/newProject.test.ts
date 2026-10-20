import { describe, expect, it } from "vitest";
import { cleanIncoming, describePayload, SUGGESTION_KINDS } from "./suggestions";
import { fieldsToLockOnLink, findNativeProject, newProjectName, projectClash } from "./newProject";

describe("newProjectName", () => {
  it("names a project '<number>-<name>' and keeps just one number", () => {
    expect(newProjectName("370", "Blumberg")).toBe("370-Blumberg");
    expect(newProjectName(" 370 ", "370-Blumberg")).toBe("370-Blumberg");
    expect(newProjectName("370", "370 Blumberg 2")).toBe("370-Blumberg 2");
  });
});

describe("projectClash", () => {
  const existing = [{ name: "369-Something" }, { name: "236-Valenza" }];
  it("refuses a number or a name that already exists, and allows a new one", () => {
    expect(projectClash("370", "370-Blumberg", existing)).toBeNull();
    expect(projectClash("236", "236-Other", existing)).toMatch(/236-Valenza/);
    expect(projectClash("999", "236-valenza", existing)).toMatch(/already exists/);
  });
  it("does not mistake a longer number for the same one (23 vs 236)", () => {
    expect(projectClash("23", "23-New", existing)).toBeNull();
  });
});

describe("findNativeProject (a monday.com import meeting a project made in 360 first)", () => {
  const rows = [
    { id: "a", name: "370-Blumberg", customerId: "c1", mondayItemId: null },
    { id: "b", name: "369-Linked", customerId: "c1", mondayItemId: "m1" },
    { id: "c", name: "370-Blumberg", customerId: "c2", mondayItemId: null },
  ];
  it("matches by project number and customer, only a project with no monday.com link", () => {
    expect(findNativeProject(rows, "370-Blumberg (iAccess)", "c1")?.id).toBe("a");
    expect(findNativeProject(rows, "370-Blumberg", "c2")?.id).toBe("c");
    expect(findNativeProject(rows, "369-Linked", "c1")).toBeNull(); // already linked
    expect(findNativeProject(rows, "371-Nothing", "c1")).toBeNull();
    expect(findNativeProject(rows, "Blumberg", "c1")).toBeNull(); // no number
  });
  it("refuses when two native projects share the number and customer", () => {
    expect(findNativeProject([...rows, { id: "d", name: "370-Again", customerId: "c1", mondayItemId: null }], "370-Blumberg", "c1")).toBeNull();
  });
});

describe("fieldsToLockOnLink", () => {
  it("locks what is filled so an import only fills the empty fields", () => {
    expect(fieldsToLockOnLink({ name: "370-Blumberg", contractValue: null, capacityMw: "1.2", country: "Germany", lockedFields: ["lifecycle"] }).sort()).toEqual(["capacityMw", "country", "lifecycle", "name"]);
    expect(fieldsToLockOnLink({ name: "370-Blumberg", contractValue: null, capacityMw: null, country: "", lockedFields: [] })).toEqual(["name"]);
  });
});

describe("the NEW_PROJECT proposal", () => {
  const base = { kind: "NEW_PROJECT", summary: "iAccess signed the Blumberg order", number: "370", name: "Blumberg", customer: "iAccess" };
  it("is one of the kinds", () => {
    expect(SUGGESTION_KINDS).toContain("NEW_PROJECT");
  });
  it("accepts a number and a name, with the details optional", () => {
    const r = cleanIncoming(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload).toEqual({ kind: "NEW_PROJECT", number: "370", name: "Blumberg", country: null, capacityKwp: null, contractAmount: null, currency: null, signedDate: null, profile: {}, sources: {} });
      expect(r.value.customerRef).toBe("iAccess");
    }
  });
  it("strips a number typed in front of the name, and accepts the stated details", () => {
    const r = cleanIncoming({ ...base, name: "370-Blumberg", country: "Germany", capacityKwp: "996.84", contractAmount: 275000, currency: "eur" });
    expect(r.ok && r.value.payload).toEqual({ kind: "NEW_PROJECT", number: "370", name: "Blumberg", country: "Germany", capacityKwp: "996.84", contractAmount: "275000", currency: "EUR", signedDate: null, profile: {}, sources: {} });
  });
  it("refuses a missing or bad number, a missing name and a guessed amount format", () => {
    expect(cleanIncoming({ ...base, number: "" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, number: "37x" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, number: "12345" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, name: "" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, contractAmount: "275.000,00", currency: "EUR" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, currency: "XYZ" }).ok).toBe(false);
    expect(cleanIncoming({ ...base, capacityKwp: "big" }).ok).toBe(false);
  });
  it("takes an amount with no currency as EUR (Solargik's contracts are normally in Euro)", () => {
    const r = cleanIncoming({ ...base, contractAmount: "275000" });
    expect(r.ok).toBe(true);
    expect(r.ok && describePayload(r.value.payload)).toBe("Create project 370-Blumberg in 360 with the standard phases and items (275000 EUR)");
  });
  it("is described for the Inbox", () => {
    const r = cleanIncoming({ ...base, country: "Germany", contractAmount: "275000", currency: "EUR" });
    expect(r.ok && describePayload(r.value.payload)).toBe("Create project 370-Blumberg in 360 with the standard phases and items (Germany, 275000 EUR)");
  });
});

describe("the contract details of a NEW_PROJECT proposal", () => {
  const base = { kind: "NEW_PROJECT", summary: "iAccess signed the Blumberg order", number: "370", name: "Blumberg" };
  it("carries the timeline, delivery terms and other profile details, with the sentence each came from", () => {
    const r = cleanIncoming({
      ...base,
      signedDate: "2026-10-20",
      profile: { supplyTerms: " DAP Germany, Incoterms 2020 ", deliveryExpectations: "Delivery in two shipments, first by 2027-02-01", pileDrivingStart: "2027-01-15", ntpDate: "2026-11-01", contractType: "Tracker supply", soilTest: "spt", soma: "Included" },
      sources: { supplyTerms: "Delivery DAP site", deliveryExpectations: "Shipment 1 by 1 Feb 2027", notAField: "ignored" },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.payload.kind === "NEW_PROJECT") {
      expect(r.value.payload.signedDate).toBe("2026-10-20");
      expect(r.value.payload.profile).toEqual({ supplyTerms: "DAP Germany, Incoterms 2020", deliveryExpectations: "Delivery in two shipments, first by 2027-02-01", pileDrivingStart: "2027-01-15", ntpDate: "2026-11-01", contractType: "TRACKER_SUPPLY", soilTest: "SPT", soma: "Included" });
      expect(r.value.payload.sources).toEqual({ supplyTerms: "Delivery DAP site", deliveryExpectations: "Shipment 1 by 1 Feb 2027" });
      expect(describePayload(r.value.payload)).toBe("Create project 370-Blumberg in 360 with the standard phases and items, and fill 8 contract details in its profile");
    }
  });
  it("leaves out empty values and options that are not in the dropdown (never guessed), and refuses an invalid date", () => {
    const r = cleanIncoming({ ...base, profile: { contractType: "Turnkey", soilTest: "", intercoms: "  ", supplyTerms: "" } });
    expect(r.ok && r.value.payload.kind === "NEW_PROJECT" && r.value.payload.profile).toEqual({});
    expect(cleanIncoming({ ...base, profile: { ntpDate: "1 November" } }).ok).toBe(false);
    expect(cleanIncoming({ ...base, signedDate: "2026-13-40" }).ok).toBe(false);
  });
  it("cuts over-long text instead of refusing the whole proposal", () => {
    const r = cleanIncoming({ ...base, profile: { supplyTerms: "x".repeat(5000), intercoms: "y".repeat(500) } });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.payload.kind === "NEW_PROJECT") {
      expect(r.value.payload.profile.supplyTerms).toHaveLength(4000);
      expect(r.value.payload.profile.intercoms).toHaveLength(200);
    }
  });
});