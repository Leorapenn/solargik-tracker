import { describe, expect, it } from "vitest";
import {
  changeOrderStatusFor,
  cleanChangeOrder,
  cleanMilestone,
  effectiveStatus,
  formatTotals,
  isCurrency,
  milestoneAmount,
  milestoneProgress,
  projectContract,
  totalsByCurrency,
  milestoneTotals,
  money,
  upcomingMilestoneId,
} from "./payments";

const TODAY = "2026-10-05";

describe("milestoneAmount", () => {
  it("is the percent of the contract value, unless an amount was typed", () => {
    expect(milestoneAmount({ percent: 20, amountOverride: null }, 1_013_381)).toBe(202676.2);
    expect(milestoneAmount({ percent: 5, amountOverride: null }, 4_450_453.6)).toBe(222522.68);
    expect(milestoneAmount({ percent: 30, amountOverride: null }, 899_760)).toBe(269928);
    expect(milestoneAmount({ percent: 20, amountOverride: 5000 }, 1_013_381)).toBe(5000);
    expect(milestoneAmount({ percent: 20, amountOverride: null }, null)).toBeNull();
    expect(milestoneAmount({ percent: null, amountOverride: null }, 100)).toBeNull();
  });
  it("formats money in the project's currency", () => {
    expect(money(202676.2)).toBe("$202,676.20");
    expect(money(899760, "EUR")).toBe("€899,760");
    expect(money(44988, "EUR")).toBe("€44,988");
    expect(money(222522.68, "EUR")).toBe("€222,522.68");
    expect(money(1500, "ILS")).toBe("ILS 1,500".replace("ILS ", "₪"));
    expect(money(null, "EUR")).toBe("—");
    expect(money(10, "XXX")).toBe("$10"); // unknown code falls back to dollars
  });
  it("only accepts the listed currencies", () => {
    expect(["USD", "EUR", "ILS", "GBP"].every(isCurrency)).toBe(true);
    expect(isCurrency("BTC")).toBe(false);
  });
});

describe("project contract amount and totals", () => {
  const dec = (s: string) => ({ toString: () => s }); // like a Prisma Decimal
  it("prefers the payment base and uses the project's currency", () => {
    expect(projectContract({ contractValue: dec("1013381"), paymentBase: dec("899760"), paymentCurrency: "EUR" })).toEqual({ amount: 899760, currency: "EUR" });
    expect(projectContract({ contractValue: dec("733704"), paymentBase: null, paymentCurrency: "USD" })).toEqual({ amount: 733704, currency: "USD" });
    expect(projectContract({ contractValue: null, paymentBase: null, paymentCurrency: "USD" })).toEqual({ amount: null, currency: "USD" });
    expect(projectContract({ contractValue: 5, paymentBase: null, paymentCurrency: "???" }).currency).toBe("USD");
  });
  it("totals per currency, never mixing them", () => {
    const totals = totalsByCurrency([
      { amount: 899760, currency: "EUR" },
      { amount: 689020.8, currency: "EUR" },
      { amount: 500000, currency: "USD" },
      { amount: null, currency: "EUR" },
    ]);
    expect(totals).toEqual([
      { currency: "EUR", amount: 1588780.8 },
      { currency: "USD", amount: 500000 },
    ]);
    expect(formatTotals(totals)).toBe("€1,588,780.80 + $500,000");
    expect(formatTotals([])).toBe("—");
  });
});

describe("effectiveStatus", () => {
  it("turns an unpaid milestone Overdue once its due date has passed", () => {
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: "2026-10-01" }, TODAY)).toBe("OVERDUE");
    expect(effectiveStatus({ status: "INVOICE_SENT", dueDate: "2026-10-01" }, TODAY)).toBe("OVERDUE");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: "2026-10-05" }, TODAY)).toBe("NOT_DUE"); // due today is not overdue
    expect(effectiveStatus({ status: "INVOICE_SENT", dueDate: "2026-12-01" }, TODAY)).toBe("INVOICE_SENT");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null }, TODAY)).toBe("NOT_DUE");
  });
  it("never shows a paid milestone as overdue", () => {
    expect(effectiveStatus({ status: "PAYMENT_RECEIVED", dueDate: "2025-01-01" }, TODAY)).toBe("PAYMENT_RECEIVED");
  });
});

describe("upcomingMilestoneId", () => {
  it("picks the first unpaid milestone whose linked item is done (or that has no link)", () => {
    const list = [
      { id: "a", order: 1, status: "PAYMENT_RECEIVED", linkedStatus: null },
      { id: "b", order: 2, status: "NOT_DUE", linkedStatus: "IN_PROGRESS" as const },
      { id: "c", order: 3, status: "NOT_DUE", linkedStatus: "DONE" as const },
      { id: "d", order: 4, status: "NOT_DUE", linkedStatus: null },
    ];
    expect(upcomingMilestoneId(list)).toBe("c");
    expect(upcomingMilestoneId(list.slice(0, 2))).toBeNull();
    expect(upcomingMilestoneId([{ id: "z", order: 1, status: "INVOICE_SENT", linkedStatus: null }])).toBe("z");
    expect(upcomingMilestoneId([])).toBeNull();
  });
});

describe("milestoneProgress", () => {
  const m = (order: number, status: string, dueDate: string | null = null) => ({ label: `Milestone ${order + 1}`, order, status, dueDate });

  it("is the first unpaid milestone with its status", () => {
    const p = milestoneProgress([m(0, "PAYMENT_RECEIVED"), m(1, "PAYMENT_RECEIVED"), m(2, "INVOICE_SENT"), m(3, "NOT_DUE"), m(4, "NOT_DUE")], TODAY);
    expect(p).toMatchObject({ kind: "current", label: "Milestone 3", status: "INVOICE_SENT", sortKey: 3, count: 5 });
  });
  it("does not depend on the order the list arrives in", () => {
    expect(milestoneProgress([m(2, "NOT_DUE"), m(0, "PAYMENT_RECEIVED"), m(1, "NOT_DUE")], TODAY)).toMatchObject({ label: "Milestone 2", sortKey: 2 });
  });
  it("shows Overdue when the due date has passed", () => {
    expect(milestoneProgress([m(0, "NOT_DUE", "2026-09-01")], TODAY)).toMatchObject({ kind: "current", status: "OVERDUE" });
  });
  it("says all paid, or none when there are no milestones", () => {
    expect(milestoneProgress([m(0, "PAYMENT_RECEIVED"), m(1, "PAYMENT_RECEIVED")], TODAY)).toEqual({ kind: "all-paid", count: 2, sortKey: 1000 });
    expect(milestoneProgress([], TODAY)).toEqual({ kind: "none", sortKey: null });
  });
});

describe("milestoneTotals", () => {
  it("adds up invoiced, paid and the share of the contract covered", () => {
    const t = milestoneTotals(
      [
        { percent: 20, amountOverride: null, status: "PAYMENT_RECEIVED" },
        { percent: 30, amountOverride: null, status: "INVOICE_SENT" },
        { percent: 50, amountOverride: null, status: "NOT_DUE" },
      ],
      1000,
    );
    expect(t).toEqual({ contract: 1000, invoiced: 500, paid: 200, percentTotal: 100 });
  });
});

describe("cleanMilestone", () => {
  const base = { id: "", label: "Milestone 1 (AP)", optional: false, percent: "20", amountOverride: "", linkedSubStageId: "", dueDate: "2026-11-01", status: "NOT_DUE", invoiceSentDate: "", paidDate: "" };

  it("accepts a normal milestone", () => {
    const r = cleanMilestone(base);
    expect(r.ok && r.value).toMatchObject({ id: null, label: "Milestone 1 (AP)", percent: 20, amountOverride: null, status: "NOT_DUE", dueDate: "2026-11-01" });
  });

  it("only keeps the dates that fit the status", () => {
    const dates = { invoiceSentDate: "2026-10-01", paidDate: "2026-10-04" };
    const notDue = cleanMilestone({ ...base, ...dates });
    expect(notDue.ok && [notDue.value.invoiceSentDate, notDue.value.paidDate]).toEqual([null, null]);
    const sent = cleanMilestone({ ...base, ...dates, status: "INVOICE_SENT" });
    expect(sent.ok && [sent.value.invoiceSentDate, sent.value.paidDate]).toEqual(["2026-10-01", null]);
    const paid = cleanMilestone({ ...base, ...dates, status: "PAYMENT_RECEIVED" });
    expect(paid.ok && [paid.value.invoiceSentDate, paid.value.paidDate]).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("rejects bad input, and does not allow Overdue to be stored", () => {
    expect(cleanMilestone({ ...base, label: " " }).ok).toBe(false);
    expect(cleanMilestone({ ...base, percent: "120" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, percent: "abc" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, dueDate: "2026-02-31" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, status: "OVERDUE" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, amountOverride: "$1,250.50" }).ok).toBe(true);
  });
});

describe("change orders", () => {
  const base = { id: "", reason: "Extra piles", status: "SENT", amount: "$12,000", dateSent: "2026-09-01", invoicedDate: "", invoiceStatus: "", fileLink: "" };

  it("completes the change order when its invoice is paid", () => {
    expect(changeOrderStatusFor("SENT", "PAID")).toBe("COMPLETE");
    expect(changeOrderStatusFor("SENT", "SENT")).toBe("SENT");
    const r = cleanChangeOrder({ ...base, invoiceStatus: "PAID" });
    expect(r.ok && r.value.status).toBe("COMPLETE");
    expect(r.ok && r.value.amount).toBe(12000);
  });

  it("validates reason, status values and the file link", () => {
    expect(cleanChangeOrder({ ...base, reason: "" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, status: "DONE" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, invoiceStatus: "MAYBE" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, fileLink: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, fileLink: "https://solargik.sharepoint.com/co1.pdf" }).ok).toBe(true);
  });
});
