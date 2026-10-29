import { describe, expect, it } from "vitest";
import { cleanContainerNumber, cleanShipment, findShipment, parseContainers, sortShipments } from "./shipments";

const TODAY = "2026-10-29";
const base = { reference: "PO 26000253" };

describe("container numbers", () => {
  it("normalises spaces, dashes and case, and refuses anything that is not four letters and seven digits", () => {
    expect(cleanContainerNumber("tcnu 536825-9")).toBe("TCNU5368259");
    expect(cleanContainerNumber("BHCU3190171")).toBe("BHCU3190171");
    for (const bad of ["", "TCNU53682", "12345678901", "TCN5368259", "TCNU53682599"]) expect(cleanContainerNumber(bad)).toBeNull();
  });
  it("reads a list (comma, semicolon or one per line) or an array, drops duplicates and refuses a bad one", () => {
    expect(parseContainers("TCNU5368259, bhcu3190171;\nTCNU5368259")).toEqual({ ok: true, value: ["TCNU5368259", "BHCU3190171"] });
    expect(parseContainers(["tcnu5368259"])).toEqual({ ok: true, value: ["TCNU5368259"] });
    expect(parseContainers("")).toEqual({ ok: true, value: [] });
    expect(parseContainers("TCNU5368259, nonsense")).toMatchObject({ ok: false });
  });
});

describe("cleanShipment", () => {
  it("keeps what was typed, tidies it, and defaults to Booked with customs not started", () => {
    const r = cleanShipment({ ...base, goods: "  Pylons ", forwarder: "Viamar", containers: "TCNU5368259 , BHCU3190171", portOfLoading: "Xingang", portOfDischarge: "Genoa", eta: "2026-11-09" }, TODAY);
    expect(r).toEqual({
      ok: true,
      value: {
        reference: "PO 26000253", goods: "Pylons", forwarder: "Viamar", vessel: null, containers: ["TCNU5368259", "BHCU3190171"], portOfLoading: "Xingang", portOfDischarge: "Genoa",
        status: "BOOKED", customsStatus: "NOT_STARTED", etd: null, eta: "2026-11-09", arrivedAt: null, customsClearedAt: null, deliveryDate: null, deliveredAt: null, notes: null,
      },
    });
  });
  it("needs a name, known statuses and real dates; arrival, customs and delivery days can't be in the future, expected ones can", () => {
    expect(cleanShipment({}, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, status: "LOST" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, customsStatus: "MAYBE" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, eta: "2026-02-31" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, eta: "2026-12-01", deliveryDate: "2026-12-10" }, TODAY).ok).toBe(true);
    expect(cleanShipment({ ...base, arrivedAt: "2026-11-01" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, customsClearedAt: "2026-11-01" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, deliveredAt: "2026-11-01", status: "DELIVERED" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, containers: "nope" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, notes: "x".repeat(1001) }, TODAY).ok).toBe(false);
  });
  it("a delivered shipment needs the day it was delivered", () => {
    expect(cleanShipment({ ...base, status: "DELIVERED" }, TODAY).ok).toBe(false);
    expect(cleanShipment({ ...base, status: "DELIVERED", deliveredAt: "2026-10-20" }, TODAY)).toMatchObject({ ok: true, value: { status: "DELIVERED", deliveredAt: "2026-10-20" } });
  });
});

describe("findShipment", () => {
  const list = [
    { id: "a", reference: "PO 26000253", containers: ["TCNU5368259", "BHCU3190171"] },
    { id: "b", reference: "Shipment #02", containers: ["MSKU1111111"] },
  ];
  it("matches the same reference (case and spaces ignored), else the one that shares a container", () => {
    expect(findShipment(list, "  po  26000253", [])).toBe(list[0]);
    expect(findShipment(list, "Something else", ["BHCU3190171"])).toBe(list[0]);
    expect(findShipment(list, "New one", ["ZZZU0000000"])).toBeNull();
    expect(findShipment(list, "New one", [])).toBeNull();
  });
  it("leaves it to a person when it is not clear", () => {
    expect(findShipment([...list, { id: "c", reference: "PO 26000253", containers: [] }], "PO 26000253", [])).toBe("many");
    expect(findShipment([{ id: "x", reference: "A", containers: ["TCNU5368259"] }, { id: "y", reference: "B", containers: ["TCNU5368259"] }], "C", ["TCNU5368259"])).toBe("many");
  });
});

describe("sortShipments", () => {
  it("puts the ones on their way first (nearest first) and delivered ones last", () => {
    const s = (reference: string, status: string, eta: string | null, deliveryDate: string | null = null) => ({ reference, status, eta, deliveryDate });
    const order = sortShipments([s("done", "DELIVERED", "2026-09-01"), s("late", "IN_TRANSIT", "2026-12-01"), s("soon", "AT_PORT", "2026-11-02"), s("none", "BOOKED", null), s("planned", "DELIVERY_PLANNED", "2026-10-01", "2026-11-15")]);
    expect(order.map((x) => x.reference)).toEqual(["soon", "planned", "late", "none", "done"]);
  });
});
