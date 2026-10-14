import { describe, expect, it } from "vitest";
import { changeOrdersRollup } from "./payments";

const TODAY = "2026-10-14";
const order = (over: Partial<{ status: string; invoiceStatus: string | null; invoicedDate: string | null; paymentTermsDays: number | null }> = {}) => ({
  status: "SENT",
  invoiceStatus: "SENT" as string | null,
  invoicedDate: null as string | null,
  paymentTermsDays: null as number | null,
  ...over,
});

describe("changeOrdersRollup (the Change order status column on the Payments tab)", () => {
  it("is empty for a project with no change orders", () => {
    expect(changeOrdersRollup([], TODAY)).toEqual({ status: null, open: 0, overdue: 0, total: 0 });
  });
  it("is Complete when every change order is complete", () => {
    expect(changeOrdersRollup([order({ status: "COMPLETE", invoiceStatus: "PAID" }), order({ status: "COMPLETE", invoiceStatus: "PAID" })], TODAY)).toEqual({ status: "COMPLETE", open: 0, overdue: 0, total: 2 });
  });
  it("is Sent while any is still open and none is overdue", () => {
    const r = changeOrdersRollup([order({ status: "COMPLETE", invoiceStatus: "PAID" }), order(), order({ invoicedDate: "2026-10-10", paymentTermsDays: 30 })], TODAY);
    expect(r).toEqual({ status: "SENT", open: 2, overdue: 0, total: 3 });
  });
  it("is Overdue when an invoiced change order is past its due date (invoice date + terms)", () => {
    const r = changeOrdersRollup([order({ invoicedDate: "2026-09-01", paymentTermsDays: 10 }), order()], TODAY);
    expect(r).toEqual({ status: "OVERDUE", open: 2, overdue: 1, total: 2 });
  });
  it("is Overdue when someone set it Overdue by hand, but never for a paid one", () => {
    expect(changeOrdersRollup([order({ status: "OVERDUE", invoiceStatus: "OVERDUE" })], TODAY).status).toBe("OVERDUE");
    expect(changeOrdersRollup([order({ status: "COMPLETE", invoiceStatus: "PAID", invoicedDate: "2020-01-01", paymentTermsDays: 5 })], TODAY).status).toBe("COMPLETE");
  });
  it("does not call one overdue without terms or without an invoice", () => {
    expect(changeOrdersRollup([order({ invoicedDate: "2020-01-01", paymentTermsDays: null })], TODAY).status).toBe("SENT");
    expect(changeOrdersRollup([order({ invoiceStatus: null, invoicedDate: "2020-01-01", paymentTermsDays: 5 })], TODAY).status).toBe("SENT");
  });
});
