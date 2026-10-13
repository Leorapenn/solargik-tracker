import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, cleanProfile } from "./projectProfile";
import {
  SUPPLY_COLUMNS,
  dateFromMonday,
  engineerFromMonday,
  incomingFromMonday,
  linkFromMonday,
  planFill,
  soilTestFromMonday,
  unknownLabels,
  type SupplyValues,
} from "./profileFromMonday";

const blankSupply = (): SupplyValues => Object.fromEntries(Object.keys(SUPPLY_COLUMNS).map((k) => [k, null])) as SupplyValues;
const noControl = { contractType: null, contractLinkRaw: null, soilTest: null, soma: null, projectType: null, customerType: null };
const people = [
  { id: "p1", name: "Dana Cohen" },
  { id: "p2", name: "Yoni Levi" },
];

describe("single value readers", () => {
  it("reads only real YYYY-MM-DD dates", () => {
    expect(dateFromMonday("2026-03-05")).toBe("2026-03-05");
    for (const bad of ["", null, "05/03/2026", "2026-13-40", "2026-02-31", "March"]) expect(dateFromMonday(bad as string | null)).toBeNull();
  });
  it("reads SPT or GPT only when exactly one is named", () => {
    expect(soilTestFromMonday("SPT")).toBe("SPT");
    expect(soilTestFromMonday("gpt")).toBe("GPT");
    expect(soilTestFromMonday("SPT, GPT")).toBeNull();
    expect(soilTestFromMonday("")).toBeNull();
    expect(soilTestFromMonday("Not sure")).toBeNull();
  });
  it("reads a link column's address, web addresses only", () => {
    expect(linkFromMonday('{"url":"https://solargik.sharepoint.com/c.pdf","text":"Contract"}')).toBe("https://solargik.sharepoint.com/c.pdf");
    expect(linkFromMonday('{"url":"javascript:alert(1)"}')).toBeNull();
    expect(linkFromMonday('{"url":"not a url"}')).toBeNull();
    expect(linkFromMonday("not json")).toBeNull();
    expect(linkFromMonday(null)).toBeNull();
  });
  it("matches the engineer only when exactly one listed person is in People", () => {
    expect(engineerFromMonday("Dana Cohen", people)).toBe("p1");
    expect(engineerFromMonday("dana  cohen", people)).toBe("p1");
    expect(engineerFromMonday("Dana Cohen, Yoni Levi", people)).toBeNull();
    expect(engineerFromMonday("Someone Else", people)).toBeNull();
    expect(engineerFromMonday("", people)).toBeNull();
  });
});

describe("incomingFromMonday", () => {
  it("maps monday's values to profile values that the profile validation accepts", () => {
    const supply: SupplyValues = {
      ...blankSupply(),
      pileDrivingStart: "2026-11-01",
      deliveryExpectations: "Deliver in two batches",
      supplyTerms: "DAP",
      supplyObligations: "Obligation notes",
      soilTest: "SPT",
      soma: "SOMA",
      ntpDate: "2026-02-10",
      projectType: "GM (Ground-Mount)",
      customerType: "Developer/EPC",
      projectEngineer: "Dana Cohen",
      designNotes: "Notes",
      designQuestionnaireReceived: "2026-01-05",
      designInfoStatus: "All Received",
      geotechStatus: "Working on it",
      genioCivileStatus: "Not Needed",
      bomStatus: "Complete BOM (IFC)",
      designOneStatus: "Sent",
      designOneDate: "2026-04-01",
    };
    const incoming = incomingFromMonday(supply, { ...noControl, contractType: "Tracker Supply", contractLinkRaw: '{"url":"https://x.com/c.pdf"}' }, people);
    expect(incoming).toMatchObject({
      pileDrivingStart: "2026-11-01",
      soilTest: "SPT",
      customerType: "DEVELOPER_EPC",
      projectEngineerId: "p1",
      designInfoStatus: "ALL_RECEIVED",
      geotechStatus: "WORKING",
      genioCivileStatus: "NA",
      bomStatus: "COMPLETE_IFC",
      initialLayoutSent: "2026-04-01",
      contractType: "TRACKER_SUPPLY",
      contractLink: "https://x.com/c.pdf",
    });
    const checked = cleanProfile({ ...EMPTY_PROFILE, ...incoming });
    expect(checked.ok).toBe(true);
  });
  it("leaves out blanks, unknown labels and the layout date unless D1 status is Sent", () => {
    const supply: SupplyValues = { ...blankSupply(), bomStatus: "Mystery", designInfoStatus: "", designOneStatus: "Working on it", designOneDate: "2026-04-01", soilTest: "SPT, GPT" };
    expect(incomingFromMonday(supply, null, people)).toEqual({});
    expect(unknownLabels(supply, null)).toEqual(['BOM status: "Mystery"', 'SPT/GPT: "SPT, GPT"']);
  });
  it("takes SPT/GPT, SOMA, type and customer type from the Control Table when the Supply board's mirrors are empty", () => {
    const control = { ...noControl, soilTest: "GPT", soma: "AGRI SOMA", projectType: "GM (Ground-Mount)", customerType: "End User / Behind the Meter" };
    expect(incomingFromMonday(blankSupply(), control, people)).toEqual({ soilTest: "GPT", soma: "AGRI SOMA", projectType: "GM (Ground-Mount)", customerType: "END_USER" });
    // the Supply board's own value wins when it has one
    expect(incomingFromMonday({ ...blankSupply(), customerType: "Investor" }, control, people).customerType).toBe("INVESTOR");
  });
  it("never produces a field monday has no column for", () => {
    const supply = Object.fromEntries(Object.keys(SUPPLY_COLUMNS).map((k) => [k, "x"])) as SupplyValues;
    const keys = Object.keys(incomingFromMonday(supply, { ...noControl, contractType: "EPC", contractLinkRaw: "{}" }, people));
    for (const none of ["intercoms", "shippingAddress", "deliveryAddress"]) expect(keys).not.toContain(none);
  });
  it("leaves out text that is longer than the profile allows", () => {
    const supply: SupplyValues = { ...blankSupply(), soma: "x".repeat(201), supplyTerms: "y".repeat(4001) };
    expect(incomingFromMonday(supply, null, people)).toEqual({});
  });
});

describe("planFill", () => {
  it("fills only empty fields and keeps what a person typed", () => {
    const current = { ...EMPTY_PROFILE, supplyTerms: "Typed by hand", bomStatus: "IFI", customerType: "  " };
    const { fill, kept } = planFill(current, { supplyTerms: "From monday", bomStatus: "PRELIMINARY", customerType: "EPC", soma: "SOMA" });
    expect(fill).toEqual({ customerType: "EPC", soma: "SOMA" });
    expect(kept).toEqual(["supplyTerms", "bomStatus"]);
  });
  it("changes nothing when monday has nothing", () => {
    expect(planFill(EMPTY_PROFILE, {})).toEqual({ fill: {}, kept: [] });
  });
});
