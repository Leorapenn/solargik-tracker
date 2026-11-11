import { describe, expect, it } from "vitest";
import { DELIVERY_ITEM_NAMES, classifyGoods } from "./shipmentCategory";

describe("classifyGoods: the lists of project 360", () => {
  it("drive units with their parts and the controls are Drive Units & I&C (the eye nuts do not make it structure)", () => {
    const c = classifyGoods("Drive Unit WLB 01A - Gen 1.5 Reinforced Gear DU-WLB-01-15E Rear mounting plate for DU DU-P-GER-0340 Double Chain Gen1.5 MW-A-000-0160 DIN582-M8 Eye Nut PCBA GPT-R2.0 MC-1 - Master Control 1 PDU-1000-01 LC-A-CSB-0126");
    expect(c.items).toEqual(["DRIVE_UNITS_IC"]);
    expect(c.fastenersOnly).toBe(false);
  });
  it("pylons (IPE) are the tracker structure", () => {
    expect(classifyGoods("IRON PYLONS FOR SOLAR TRACKER PI-P-120-0365 IPE-120 PYLON, L=4.5 M PI-P-160-0364 I-160 PYLON").items).toEqual(["TRACKER_STRUCTURE"]);
  });
  it("tubes, purlins, brackets and bearing systems are the tracker structure", () => {
    expect(classifyGoods("PREFABRICATED STRUCTURAL STEEL PART FOR SOLAR TRACKER SHS 90x90x3.5, L=6.84m Z 72x30x15x2 Steel Bracket BS-P-000-0148 Bearing system - 90 oval").items).toEqual(["TRACKER_STRUCTURE"]);
  });
  it("U-bolts with their nuts are the tracker structure", () => {
    expect(classifyGoods("COMMODITY: BOLTS & NUTS U-BOLT,TTg 0,C:92 WITH 2XM10-DIN6923 NUTS HDG UB-P-M10-0072").items).toEqual(["TRACKER_STRUCTURE"]);
  });
  it("a list of only screws, nuts and washers counts as the tracker structure, and says it was only hardware", () => {
    const c = classifyGoods("DIN125 M10 steel class 10.9 washer DIN933 M14 x 40 steel class 8.8 hex screw DIN934 M14 nut Fasteners for solar tracker project 360");
    expect(c.items).toEqual(["TRACKER_STRUCTURE"]);
    expect(c.fastenersOnly).toBe(true);
  });
});

describe("classifyGoods: other cases", () => {
  it("piles, and a mixed shipment with several sub-stages", () => {
    expect(classifyGoods("Foundation piles 120 pcs").items).toEqual(["PILES"]);
    expect(classifyGoods("PILES, PYLONS and one MC-1 master control").items).toEqual(["PILES", "TRACKER_STRUCTURE", "DRIVE_UNITS_IC"]);
  });
  it("pile driving is not a pile delivery", () => {
    expect(classifyGoods("pile driving machine rental").items).toEqual([]);
  });
  it("nothing recognisable, or no text, gives no sub-stage (a person decides)", () => {
    expect(classifyGoods("invoice for freight, ocean freight and delivery order").items).toEqual([]);
    expect(classifyGoods("").items).toEqual([]);
    expect(classifyGoods(null).items).toEqual([]);
  });
  it("knows the template names of the three sub-stages", () => {
    expect(DELIVERY_ITEM_NAMES).toEqual({ PILES: "Delivery – Piles", TRACKER_STRUCTURE: "Delivery – Tracker Structure", DRIVE_UNITS_IC: "Delivery – Drive Units & I&C" });
  });
});
