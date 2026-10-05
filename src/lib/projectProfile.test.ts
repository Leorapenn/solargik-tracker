import { describe, expect, it } from "vitest";
import { BOM_STATUS, CHOICES, EMPTY_PROFILE, LONG_TEXT_MAX, choiceFor, cleanProfile, linkedValues } from "./projectProfile";

describe("dropdown options", () => {
  it("colors every option of every dropdown", () => {
    for (const options of Object.values(CHOICES)) {
      for (const o of options) {
        expect(o.bg).toMatch(/^#[0-9A-F]{6}$/i);
        expect(o.text).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
    expect(BOM_STATUS.map((o) => o.label)).toEqual(["IFI", "Preliminary BOM", "BOM w/o I&C", "Complete BOM (IFC)"]);
    expect(choiceFor("geotechStatus", "STUCK")?.label).toBe("Stuck");
    expect(choiceFor("geotechStatus", "")).toBeNull(); // blank by default
  });
});

describe("cleanProfile", () => {
  it("accepts the empty form: everything blank", () => {
    const r = cleanProfile(EMPTY_PROFILE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.values(r.value.text).every((v) => v === null)).toBe(true);
      expect(Object.values(r.value.dates).every((v) => v === null)).toBe(true);
      expect(Object.values(r.value.choices).every((v) => v === null)).toBe(true);
      expect(r.value.contractLink).toBeNull();
    }
  });

  it("trims text, validates dates, dropdown values and the link", () => {
    const r = cleanProfile({ ...EMPTY_PROFILE, designNotes: "  needs review \r\n", ntpDate: "2026-10-05", bomStatus: "IFI", contractLink: "https://solargik.sharepoint.com/x" });
    expect(r.ok && r.value.text.designNotes).toBe("needs review");
    expect(r.ok && r.value.dates.ntpDate).toBe("2026-10-05");
    expect(r.ok && r.value.choices.bomStatus).toBe("IFI");
    expect(r.ok && r.value.contractLink).toBe("https://solargik.sharepoint.com/x");
  });

  it("rejects bad input with a plain message", () => {
    expect(cleanProfile({ ...EMPTY_PROFILE, ntpDate: "2026-02-31" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, ntpDate: "05/10/2026" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, bomStatus: "NOPE" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, geotechStatus: "IFI" }).ok).toBe(false); // wrong dropdown's value
    expect(cleanProfile({ ...EMPTY_PROFILE, contractLink: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, contractLink: "not a link" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, designNotes: "x".repeat(LONG_TEXT_MAX + 1) }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, soma: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("linkedValues", () => {
  it("takes dates and statuses from the matching sub-stages", () => {
    const v = linkedValues([
      { phaseName: "INITIATION", name: "Internal Kickoff", status: "DONE", completedAt: "2026-01-10" },
      { phaseName: "INITIATION", name: "Customer Kickoff", status: "IN_PROGRESS", completedAt: null },
      { phaseName: "DESIGN", name: "Design Package Release to Customer", status: "BLOCKED", completedAt: null },
    ]);
    expect(v.internalKickoff).toEqual({ found: true, status: "DONE", date: "2026-01-10" });
    expect(v.clientKickoff).toEqual({ found: true, status: "IN_PROGRESS", date: null });
    expect(v.designPackage.status).toBe("BLOCKED");
    expect(v.bomRelease).toEqual({ found: false, status: null, date: null });
  });

  it("shows no date for an item that has been reopened", () => {
    const v = linkedValues([{ phaseName: "DESIGN", name: "Initial Layout Approval", status: "IN_PROGRESS", completedAt: "2026-01-10" }]);
    expect(v.initialLayoutApproval.date).toBeNull();
  });
});
