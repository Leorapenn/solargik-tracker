import { describe, expect, it } from "vitest";
import { cleanShipment } from "./shipments";
import { itemProjectNumber, parseFiles, parseTimeline, shipmentFromMonday, trackedProjectNumber, type MondayShipmentItem } from "./shipmentFromMonday";

const TODAY = "2026-11-04";
const item = (extra: Partial<MondayShipmentItem["values"]> = {}, name = "356-PRJ / Shipment #1-ISR", group = "356 - PRJ (FreeIngengeria, Energis1, italy)"): MondayShipmentItem => ({
  id: "12104309270",
  name,
  group: { id: "g", title: group },
  values: { status: "Arrive to the site", timeline: "2026-06-10 - 2026-06-19", arrival: "2026-07-01", containers: "ZCSU7209081", port: "Salerno", shipper: "Solargik (Salerno)", method: "20' HC", files: "", ...extra },
});

describe("project numbers", () => {
  it("takes the number from the item's name, else from its group unless the group is a range", () => {
    expect(itemProjectNumber(item())).toBe(356);
    expect(itemProjectNumber(item({}, "082-PRJ/ Shipment #01-ITA"))).toBe(82);
    expect(itemProjectNumber(item({}, "Defective bearings for manufacturer evaluation", "259 (Revalue, Rignano Flaminio 1, Italy)"))).toBe(259);
    expect(itemProjectNumber(item({}, "Defective bearings", "115-127 - (Cogefeed)"))).toBeNull();
    expect(itemProjectNumber(item({}, "Defective bearings", "088 -SWI (Wiedenmann )"))).toBe(88);
    expect(itemProjectNumber(item({}, "Something", "Italy warehouse"))).toBeNull();
    expect(itemProjectNumber(item({}, "115-PRJ / Shipment 3", "115-127 - (Cogefeed)"))).toBe(115);
  });
  it("reads the number of a tracked project", () => {
    expect(trackedProjectNumber("356-Energis1")).toBe(356);
    expect(trackedProjectNumber("082-GEN 1.5 Upgrade")).toBe(82);
    expect(trackedProjectNumber("Hufingen")).toBeNull();
  });
});

describe("files and dates", () => {
  it("lists the files as links with their names, only monday.com's own, no duplicates", () => {
    const text =
      "https://solargikcrm.monday.com/protected_static/6995427/resources/1/356-PRJ%20Shipment%20%231.pdf, https://solargikcrm.monday.com/protected_static/6995427/resources/2/Packing%20list.xlsx, https://evil.example.com/x.pdf, https://solargikcrm.monday.com/protected_static/6995427/resources/2/Packing%20list.xlsx, http://solargikcrm.monday.com/insecure.pdf";
    expect(parseFiles(text)).toEqual([
      { name: "356-PRJ Shipment #1.pdf", url: "https://solargikcrm.monday.com/protected_static/6995427/resources/1/356-PRJ%20Shipment%20%231.pdf" },
      { name: "Packing list.xlsx", url: "https://solargikcrm.monday.com/protected_static/6995427/resources/2/Packing%20list.xlsx" },
    ]);
    expect(parseFiles(null)).toEqual([]);
    expect(parseFiles("no files")).toEqual([]);
  });
  it("reads the timeline", () => {
    expect(parseTimeline("2026-06-10 - 2026-06-19")).toEqual({ start: "2026-06-10", end: "2026-06-19" });
    expect(parseTimeline("2026-06-10")).toEqual({ start: "2026-06-10", end: "2026-06-10" });
    expect(parseTimeline("")).toEqual({ start: null, end: null });
  });
});

describe("shipmentFromMonday", () => {
  it("arrive to the site = delivered, on the arrival day, with the facts monday has", () => {
    const s = shipmentFromMonday(item({ what: "Pylons\nand beams", files: "https://solargikcrm.monday.com/protected_static/1/2/POD.pdf" }), TODAY);
    expect(s.input).toMatchObject({ reference: "356-PRJ / Shipment #1-ISR", status: "DELIVERED", deliveredAt: "2026-07-01", etd: "2026-06-10", eta: "2026-06-19", portOfDischarge: "Salerno", containers: "ZCSU7209081", goods: "Pylons and beams" });
    expect(s).toMatchObject({ mondayItemId: "12104309270", shipper: "Solargik (Salerno)", shippingMethod: "20' HC", customsStatus: null, issues: [] });
    expect(s.mondayUrl).toBe("https://solargikcrm.monday.com/boards/6652155567/pulses/12104309270");
    expect(s.files).toEqual([{ name: "POD.pdf", url: "https://solargikcrm.monday.com/protected_static/1/2/POD.pdf" }]);
    // the result passes the same checks as a shipment typed by hand
    expect(cleanShipment(s.input, TODAY).ok).toBe(true);
  });

  it("a shipment at a warehouse whose arrival day has passed is Delivered on that day (the label is left stale on monday.com)", () => {
    for (const label of ["Arrive to the WH", "Arrived-Warehouse", "In WH-Clients area", "In inventory"]) {
      const s = shipmentFromMonday(item({ status: label }), TODAY);
      expect(s.input).toMatchObject({ status: "DELIVERED", deliveredAt: "2026-07-01" });
      expect(s.input.arrivedAt).toBeUndefined();
      expect(s.issues).toEqual([]);
      expect(cleanShipment(s.input, TODAY).ok).toBe(true);
    }
    // the day itself counts; tomorrow does not
    expect(shipmentFromMonday(item({ status: "Arrive to the WH", arrival: TODAY }), TODAY).input.status).toBe("DELIVERED");
  });

  it("at a warehouse with no arrival day, or one still ahead, it stays At the warehouse", () => {
    for (const arrival of ["", "2026-12-01"]) {
      const s = shipmentFromMonday(item({ status: "Arrive to the WH", arrival }), TODAY);
      expect(s.input.status).toBe("AT_WAREHOUSE");
      expect(s.input.arrivedAt).toBeUndefined();
      expect(s.input.deliveredAt).toBeUndefined();
      expect(cleanShipment(s.input, TODAY).ok).toBe(true);
    }
  });

  it("maps the stages on the way, and customs in progress", () => {
    expect(shipmentFromMonday(item({ status: "On the Way (Sea)", arrival: "2026-12-01" }), TODAY).input).toMatchObject({ status: "IN_TRANSIT", eta: "2026-06-19" });
    expect(shipmentFromMonday(item({ status: "On the Way (Sea)", timeline: "2026-10-20", arrival: "2026-12-01" }), TODAY).input.eta).toBe("2026-10-20");
    expect(shipmentFromMonday(item({ status: "On the Way (Air)", timeline: "", arrival: "2026-12-01" }), TODAY).input).toMatchObject({ status: "IN_TRANSIT", eta: "2026-12-01" });
    const customs = shipmentFromMonday(item({ status: "Customs (Italy)", arrival: "2026-11-02" }), TODAY);
    expect(customs.input).toMatchObject({ status: "CUSTOMS", arrivedAt: "2026-11-02" });
    expect(customs.customsStatus).toBe("IN_PROGRESS");
    expect(shipmentFromMonday(item({ status: "Arrived to Destination port", arrival: "2026-11-01" }), TODAY).input).toMatchObject({ status: "AT_PORT", arrivedAt: "2026-11-01" });
    expect(shipmentFromMonday(item({ status: "Delivery date confirmed", arrival: "2026-11-20" }), TODAY).input).toMatchObject({ status: "DELIVERY_PLANNED", deliveryDate: "2026-11-20" });
    expect(shipmentFromMonday(item({ status: "Production / Packaging", arrival: "" }), TODAY).input.status).toBe("BOOKED");
  });

  it("never invents an arrival: a future arrival day is not a fact", () => {
    const s = shipmentFromMonday(item({ status: "Customs (Italy)", arrival: "2026-12-01" }), TODAY);
    expect(s.input.arrivedAt).toBeUndefined();
    expect(cleanShipment(s.input, TODAY).ok).toBe(true);
  });

  it("has its own stages for stuck, waiting for the proof of delivery and pending coordination", () => {
    expect(shipmentFromMonday(item({ status: "Stuck", arrival: "" }), TODAY).input).toMatchObject({ status: "STUCK" });
    const pod = shipmentFromMonday(item({ status: "Arrive waiting for POD", arrival: "2026-10-30" }), TODAY);
    expect(pod.input).toMatchObject({ status: "AWAITING_POD", arrivedAt: "2026-10-30" });
    expect(pod.input.deliveredAt).toBeUndefined();
    expect(pod.input.notes).toBeUndefined();
    expect(shipmentFromMonday(item({ status: "Pending Coordination", arrival: "" }), TODAY).input).toMatchObject({ status: "PENDING_COORDINATION" });
    for (const label of ["Stuck", "Arrive waiting for POD", "Pending Coordination"]) {
      const s = shipmentFromMonday(item({ status: label }), TODAY);
      expect(s.issues).toEqual([]);
      expect(cleanShipment(s.input, TODAY).ok).toBe(true);
    }
  });

  it("imports a label it does not understand as Booked, says so in the note and the report, and never guesses", () => {
    for (const label of ["Something new", ""]) {
      const s = shipmentFromMonday(item({ status: label }), TODAY);
      expect(s.input.status).toBe("BOOKED");
      expect(s.input.notes).toMatch(/monday\.com/);
      expect(s.issues.join(" ")).toMatch(/imported as Booked|no status/);
    }
  });

  it("delivered without a usable date is imported as Booked with the reason", () => {
    const s = shipmentFromMonday(item({ status: "Arrive to the site", arrival: "", timeline: "" }), TODAY);
    expect(s.input.status).toBe("BOOKED");
    expect(s.issues[0]).toMatch(/no arrival date/);
    expect(cleanShipment(s.input, TODAY).ok).toBe(true);
    // a future arrival is no delivery either
    expect(shipmentFromMonday(item({ status: "Arrive to the site", arrival: "2027-01-01", timeline: "" }), TODAY).input.status).toBe("BOOKED");
  });

  it("picks the container numbers out of the column in any layout, and ignores a dash as a port", () => {
    const s = shipmentFromMonday(item({ containers: "zcsu 7209081 / ABC123, TEMU7897694\nBSIU8381106 SEGU5412345", port: "-" }), TODAY);
    expect(s.input.containers).toBe("ZCSU7209081, TEMU7897694, BSIU8381106, SEGU5412345");
    expect(s.input.portOfDischarge).toBeUndefined();
    expect(s.issues).toEqual([]);
    expect(cleanShipment(s.input, TODAY).ok).toBe(true);
  });

  it("ignores a courier tracking number quietly and reports a column that is neither", () => {
    for (const text of ["DHL 91 0862 0054", "FedEx 7786 6443 3327", "DDT910453 DDT910454", "Plate EN341XH", "885314724517", "-"]) {
      const s = shipmentFromMonday(item({ containers: text }), TODAY);
      expect(s.input.containers).toBeUndefined();
      expect(s.issues).toEqual([]);
    }
    const typo = shipmentFromMonday(item({ containers: "CAAU939044" }), TODAY);
    expect(typo.input.containers).toBeUndefined();
    expect(typo.issues[0]).toMatch(/CAAU939044.*no container number/);
  });
});
