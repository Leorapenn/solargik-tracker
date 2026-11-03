import { describe, expect, it } from "vitest";
import { checkSiteEmail, mapLink, parseCoordinates } from "@/lib/siteInfo";
import { EMPTY_PROFILE, cleanProfile } from "@/lib/projectProfile";

describe("parseCoordinates", () => {
  it("accepts decimal degrees in the usual spellings and normalises them", () => {
    for (const raw of ["45.4642, 9.1900", "45.4642,9.19", "45.4642 9.19", "45.4642; 9.19", "  45.4642 ,  9.1900 "]) {
      expect(parseCoordinates(raw)).toEqual({ ok: true, value: { lat: 45.4642, lon: 9.19 } });
    }
    expect(parseCoordinates("-33.8688, 151.2093")).toEqual({ ok: true, value: { lat: -33.8688, lon: 151.2093 } });
  });
  it("treats blank as none", () => {
    expect(parseCoordinates("")).toEqual({ ok: true, value: null });
    expect(parseCoordinates(undefined)).toEqual({ ok: true, value: null });
  });
  it("refuses out-of-range, one number, degrees-minutes-seconds and words", () => {
    for (const raw of ["91, 10", "-91, 10", "10, 181", "10, -181", "45.46", "45.46, 9.19, 3", `45°27'51"N 9°11'24"E`, "Milan", "NaN, 1"]) {
      expect(parseCoordinates(raw).ok).toBe(false);
    }
  });
});

describe("mapLink", () => {
  it("links valid coordinates and nothing else", () => {
    expect(mapLink("45.4642, 9.19")).toBe("https://www.google.com/maps?q=45.4642,9.19");
    expect(mapLink("")).toBeNull();
    expect(mapLink("nowhere")).toBeNull();
  });
});

describe("checkSiteEmail", () => {
  it("accepts one address, blank is none, rejects the rest", () => {
    expect(checkSiteEmail(" a.b@site.de ")).toEqual({ ok: true, value: "a.b@site.de" });
    expect(checkSiteEmail("")).toEqual({ ok: true, value: null });
    for (const bad of ["no-at.com", "a@b", "a b@c.de", "a@b.de, c@d.de"]) expect(checkSiteEmail(bad).ok).toBe(false);
  });
});

describe("cleanProfile site information", () => {
  it("cleans the new fields, normalising coordinates", () => {
    const r = cleanProfile({
      ...EMPTY_PROFILE,
      siteContactName: "  Mr. Seiffert ",
      siteContactPhone: "+49 30 1234567",
      siteContactEmail: "seiffert@site.de",
      siteHours: "Mon-Fri 7:00-16:00",
      siteAccess: "Truck up to 40 t, forklift on site",
      siteCoordinates: "52.52 13.405",
      deliveryAddress: "Berlin",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text.siteContactName).toBe("Mr. Seiffert");
    expect(r.value.text.siteContactPhone).toBe("+49 30 1234567");
    expect(r.value.text.siteCoordinates).toBe("52.52, 13.405");
    expect(r.value.text.deliveryAddress).toBe("Berlin");
  });
  it("leaves them empty when blank", () => {
    const r = cleanProfile({ ...EMPTY_PROFILE });
    expect(r.ok && r.value.text.siteCoordinates).toBeNull();
    expect(r.ok && r.value.text.siteContactEmail).toBeNull();
  });
  it("refuses a bad phone, email or coordinates with a message", () => {
    expect(cleanProfile({ ...EMPTY_PROFILE, siteContactPhone: "call me" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, siteContactEmail: "nope" }).ok).toBe(false);
    expect(cleanProfile({ ...EMPTY_PROFILE, siteCoordinates: "200, 1" }).ok).toBe(false);
  });
});
