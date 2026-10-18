import { describe, expect, it } from "vitest";
import {
  CHANGE_ORDER_LINK_TITLES,
  CHANGE_ORDER_INVOICE_STATUS,
  CHANGE_ORDER_STATUS,
  changeOrderDisplay,
  changeOrderDueDate,
  changeOrderInvoiceStatusTitle,
  changeOrderStatusTitle,
  changeOrderStatusFor,
  cleanChangeOrder,
  formatTerms,
  cleanMilestone,
  effectiveStatus,
  formatTotals,
  isCurrency,
  coverageNote,
  milestoneAmount,
  milestoneCoverage,
  milestoneDueDate,
  milestoneProgress,
  projectContract,
  totalsByCurrency,
  milestoneTotals,
  money,
  highlightLabel,
  SETTABLE_MILESTONE_STATUSES,
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
  it("shows Ready to invoice once the item that triggers the milestone is Done and no invoice is sent yet", () => {
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null, linkedStatus: "DONE" }, TODAY)).toBe("READY_TO_INVOICE");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null, linkedStatus: "IN_PROGRESS" }, TODAY)).toBe("NOT_DUE");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null, linkedStatus: "NOT_STARTED" }, TODAY)).toBe("NOT_DUE");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null, linkedStatus: null }, TODAY)).toBe("NOT_DUE"); // no trigger item: nothing to derive
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: null }, TODAY)).toBe("NOT_DUE");
  });
  it("shows Ready to invoice when it was set by hand, even if the trigger item is not done", () => {
    expect(effectiveStatus({ status: "READY_TO_INVOICE", dueDate: null, linkedStatus: "IN_PROGRESS" }, TODAY)).toBe("READY_TO_INVOICE");
    expect(effectiveStatus({ status: "READY_TO_INVOICE", dueDate: null, linkedStatus: null }, TODAY)).toBe("READY_TO_INVOICE");
    expect(effectiveStatus({ status: "READY_TO_INVOICE", dueDate: "2026-10-01" }, TODAY)).toBe("OVERDUE"); // a typed due date still passes
  });
  it("lets a person set Ready to invoice (and nothing invented) on a milestone", () => {
    expect(cleanMilestone({ label: "M1", status: "READY_TO_INVOICE", invoiceSentDate: "2026-10-01", paidDate: "2026-10-02" })).toMatchObject({ ok: true, value: { status: "READY_TO_INVOICE", invoiceSentDate: null, paidDate: null } });
    expect(cleanMilestone({ label: "M1", status: "OVERDUE" }).ok).toBe(false); // Overdue stays derived
    expect(SETTABLE_MILESTONE_STATUSES).toEqual(["NOT_DUE", "READY_TO_INVOICE", "INVOICE_SENT", "PAYMENT_RECEIVED"]);
  });
  it("lets Invoice sent, Overdue and Paid win over Ready to invoice", () => {
    expect(effectiveStatus({ status: "INVOICE_SENT", dueDate: null, invoiceSentDate: "2026-10-01", linkedStatus: "DONE" }, TODAY)).toBe("INVOICE_SENT");
    expect(effectiveStatus({ status: "INVOICE_SENT", dueDate: null, invoiceSentDate: "2026-08-01", linkedStatus: "DONE" }, TODAY)).toBe("OVERDUE");
    expect(effectiveStatus({ status: "NOT_DUE", dueDate: "2026-10-01", linkedStatus: "DONE" }, TODAY)).toBe("OVERDUE");
    expect(effectiveStatus({ status: "PAYMENT_RECEIVED", dueDate: null, linkedStatus: "DONE" }, TODAY)).toBe("PAYMENT_RECEIVED");
  });
  it("never shows a paid milestone as overdue", () => {
    expect(effectiveStatus({ status: "PAYMENT_RECEIVED", dueDate: "2025-01-01" }, TODAY)).toBe("PAYMENT_RECEIVED");
  });
});

describe("milestoneCoverage (do the milestones add up to the contract?)", () => {
  const pct = (p: number, optional = false) => ({ percent: p, amountOverride: null as number | null, optional });
  const amt = (a: number, optional = false) => ({ percent: null as number | null, amountOverride: a, optional });
  it("is complete when the percentages add up to 100", () => {
    const c = milestoneCoverage([pct(30), pct(40), pct(15), pct(10), pct(5)], 796500);
    expect(c).toMatchObject({ state: "complete", planned: 796500, difference: 0, percent: 100 });
    expect(coverageNote(c, "EUR")).toBe("");
  });
  it("works with typed amounts too, such as 20% + 5,000 and a completion-to-30% top-up", () => {
    const base = 395399.16;
    const m1 = Math.round((0.2 * base + 5000) * 100) / 100;
    const m2 = Math.round((0.3 * base - m1) * 100) / 100;
    expect(milestoneCoverage([amt(m1), amt(m2), pct(50), pct(20)], base).state).toBe("complete");
  });
  it("leaves out optional milestones (a notice-to-design payment is deducted from the advance payment)", () => {
    expect(milestoneCoverage([amt(10000, true), pct(30), pct(40), pct(15), pct(10), pct(5)], 142000).state).toBe("complete");
  });
  it("says how much is not covered, or how much is over", () => {
    const short = milestoneCoverage([pct(30), pct(40), pct(15)], 100000);
    expect(short).toMatchObject({ state: "short", planned: 85000, difference: 15000, percent: 85 });
    expect(coverageNote(short, "EUR")).toBe("Milestones add up to 85% of the contract: €15,000 is not covered by any milestone.");
    const over = milestoneCoverage([pct(60), pct(50)], 100000);
    expect(over).toMatchObject({ state: "over", difference: -10000, percent: 110 });
    expect(coverageNote(over, "EUR")).toBe("Milestones add up to 110% of the contract: €10,000 more than the contract.");
  });
  it("tolerates rounding of up to one currency unit", () => {
    expect(milestoneCoverage([pct(33.333), pct(33.333), pct(33.334)], 1000).state).toBe("complete");
    expect(milestoneCoverage([pct(99.9)], 10000).state).toBe("short"); // 10 short
  });
  it("has nothing to say without milestones or without a contract amount", () => {
    expect(milestoneCoverage([], 1000).state).toBe("none");
    expect(milestoneCoverage([amt(10000, true)], 1000).state).toBe("none"); // only optional ones
    expect(milestoneCoverage([pct(100)], null).state).toBe("unknown");
    expect(milestoneCoverage([pct(100)], 0).state).toBe("unknown");
    expect(coverageNote(milestoneCoverage([pct(50)], null), "EUR")).toBe("");
  });
});

describe("milestone due date from the invoice date and payment terms", () => {
  const sent = (invoiceSentDate: string, paymentTermsDays: number | null = null, extra: Record<string, unknown> = {}) => ({ status: "INVOICE_SENT", dueDate: null as string | null, invoiceSentDate, paymentTermsDays, ...extra });
  it("is Net 30 by default: the invoice date plus 30 days", () => {
    expect(milestoneDueDate(sent("2026-09-01"))).toBe("2026-10-01");
    expect(milestoneDueDate(sent("2026-12-15"))).toBe("2027-01-14"); // across the year end
  });
  it("uses the terms the invoice states, 0 meaning immediate", () => {
    expect(milestoneDueDate(sent("2026-10-01", 10))).toBe("2026-10-11");
    expect(milestoneDueDate(sent("2026-10-01", 0))).toBe("2026-10-01");
  });
  it("only exists once the invoice is sent and not paid; a typed due date wins", () => {
    expect(milestoneDueDate({ status: "NOT_DUE", dueDate: null, invoiceSentDate: "2026-09-01", paymentTermsDays: null })).toBeNull();
    expect(milestoneDueDate({ status: "PAYMENT_RECEIVED", dueDate: null, invoiceSentDate: "2026-09-01", paymentTermsDays: null })).toBeNull();
    expect(milestoneDueDate({ status: "INVOICE_SENT", dueDate: null, invoiceSentDate: null, paymentTermsDays: null })).toBeNull();
    expect(milestoneDueDate(sent("2026-09-01", 30, { dueDate: "2026-11-15" }))).toBe("2026-11-15");
  });
  it("makes an unpaid invoiced milestone Overdue by itself once that date has passed", () => {
    expect(effectiveStatus(sent("2026-08-30"), TODAY)).toBe("OVERDUE"); // due 29 Sep
    expect(effectiveStatus(sent("2026-09-05"), TODAY)).toBe("INVOICE_SENT"); // due 5 Oct = today, not overdue
    expect(effectiveStatus(sent("2026-09-20"), TODAY)).toBe("INVOICE_SENT");
    expect(effectiveStatus(sent("2026-09-20", 10), TODAY)).toBe("OVERDUE"); // Net 10: due 30 Sep
    expect(effectiveStatus({ ...sent("2026-01-01"), status: "PAYMENT_RECEIVED" }, TODAY)).toBe("PAYMENT_RECEIVED");
  });
  it("shows the calculated due date on the project's milestone progress", () => {
    const p = milestoneProgress([{ label: "Milestone 1", order: 1, status: "INVOICE_SENT", dueDate: null, invoiceSentDate: "2026-09-20", paymentTermsDays: 10 }], TODAY);
    expect(p).toMatchObject({ kind: "current", status: "OVERDUE", dueDate: "2026-09-30" });
  });
  it("accepts the terms the editor sends: whole days from 0 to 365, empty = default", () => {
    const base = { label: "M1", status: "INVOICE_SENT", invoiceSentDate: "2026-10-01" };
    expect(cleanMilestone({ ...base, paymentTermsDays: "" })).toMatchObject({ ok: true, value: { paymentTermsDays: null } });
    expect(cleanMilestone({ ...base, paymentTermsDays: "10" })).toMatchObject({ ok: true, value: { paymentTermsDays: 10 } });
    expect(cleanMilestone({ ...base, paymentTermsDays: "0" })).toMatchObject({ ok: true, value: { paymentTermsDays: 0 } });
    expect(cleanMilestone({ ...base, paymentTermsDays: "1.5" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, paymentTermsDays: "400" }).ok).toBe(false);
    expect(cleanMilestone({ ...base, paymentTermsDays: "-5" }).ok).toBe(false);
  });
});

describe("upcomingMilestoneId", () => {
  it("picks the first unpaid milestone in order, whether or not its linked item is done", () => {
    const list = [
      { id: "a", order: 1, status: "PAYMENT_RECEIVED" },
      { id: "b", order: 2, status: "NOT_DUE", linkedStatus: "IN_PROGRESS" as const },
      { id: "c", order: 3, status: "NOT_DUE", linkedStatus: "DONE" as const },
      { id: "d", order: 4, status: "NOT_DUE" },
    ];
    expect(upcomingMilestoneId(list)).toBe("b");
    expect(upcomingMilestoneId(list.slice(0, 1))).toBeNull();
    expect(upcomingMilestoneId([{ id: "z", order: 1, status: "INVOICE_SENT" }])).toBe("z");
    expect(upcomingMilestoneId([{ id: "y", order: 2, status: "NOT_DUE" }, { id: "x", order: 1, status: "NOT_DUE" }])).toBe("x");
    expect(upcomingMilestoneId([])).toBeNull();
  });
});

describe("highlightLabel", () => {
  it("says Upcoming, then Ready to invoice once its item is done, then Open once invoiced or overdue", () => {
    expect(highlightLabel("NOT_DUE")).toBe("Upcoming");
    expect(highlightLabel("READY_TO_INVOICE")).toBe("Ready to invoice");
    expect(highlightLabel("INVOICE_SENT")).toBe("Open");
    expect(highlightLabel("OVERDUE")).toBe("Open");
  });
  it("shows the Ready to invoice state in a project's milestone progress", () => {
    const p = milestoneProgress([{ label: "Pylon", order: 1, status: "NOT_DUE", dueDate: null, linkedStatus: "DONE" }], TODAY);
    expect(p).toMatchObject({ kind: "current", status: "READY_TO_INVOICE" });
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

  it("keeps the invoice and payslip links of a milestone and validates them", () => {
    const ok = cleanMilestone({ ...base, invoiceLink: "https://x.sharepoint.com/inv.pdf", payslipLink: "" });
    expect(ok.ok && [ok.value.invoiceLink, ok.value.payslipLink]).toEqual(["https://x.sharepoint.com/inv.pdf", null]);
    expect(cleanMilestone({ ...base, payslipLink: "ftp://x/y" }).ok).toBe(false);
    // an uploaded file is our own link; any other path on this site is not a file link
    const uploaded = cleanMilestone({ ...base, invoiceLink: "/api/files/Invoice-1-abc.pdf" });
    expect(uploaded.ok && uploaded.value.invoiceLink).toBe("/api/files/Invoice-1-abc.pdf");
    expect(cleanMilestone({ ...base, invoiceLink: "/api/intake/projects" }).ok).toBe(false);
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

describe("hover text on a change order's labels", () => {
  it("only names which status it is, so the two pills can't be confused", () => {
    expect(changeOrderStatusTitle("COMPLETE")).toBe("Change Order Status");
    expect(changeOrderInvoiceStatusTitle("PAID")).toBe("Invoice status");
  });
  it("says the same for every status that exists, with no explanation added", () => {
    for (const s of CHANGE_ORDER_STATUS) expect(changeOrderStatusTitle(s.value)).toBe("Change Order Status");
    for (const s of CHANGE_ORDER_INVOICE_STATUS) expect(changeOrderInvoiceStatusTitle(s.value)).toBe("Invoice status");
  });
  it("gives nothing for an empty or unknown status", () => {
    expect(changeOrderStatusTitle(null)).toBeUndefined();
    expect(changeOrderInvoiceStatusTitle("NOPE")).toBeUndefined();
  });
  it("gives the three file links short plain names", () => {
    expect(CHANGE_ORDER_LINK_TITLES).toEqual({ file: "Change order file", invoice: "Invoice", payslip: "Payslip (proof of payment)" });
  });
});

describe("change orders", () => {
  const base = { id: "", reason: "Extra piles", status: "SENT", amount: "$12,000", dateSent: "2026-09-01", invoicedDate: "", invoiceStatus: "", paymentTermsDays: "", fileLink: "" };

  it("completes the change order when its invoice is paid", () => {
    expect(changeOrderStatusFor("SENT", "PAID")).toBe("COMPLETE");
    expect(changeOrderStatusFor("SENT", "SENT")).toBe("SENT");
    const r = cleanChangeOrder({ ...base, invoiceStatus: "PAID" });
    expect(r.ok && r.value.status).toBe("COMPLETE");
    expect(r.ok && r.value.amount).toBe(12000);
  });

  it("calculates the due date from the invoiced date and the payment terms", () => {
    expect(changeOrderDueDate("2026-10-07", 10)).toBe("2026-10-17");
    expect(changeOrderDueDate("2026-10-25", 10)).toBe("2026-11-04");
    expect(changeOrderDueDate("2026-12-25", 30)).toBe("2027-01-24");
    expect(changeOrderDueDate("2026-10-07", 0)).toBe("2026-10-07");
    expect(changeOrderDueDate(null, 10)).toBeNull();
    expect(changeOrderDueDate("2026-10-07", null)).toBeNull();
    expect(formatTerms(10)).toBe("Net+10");
    expect(formatTerms(0)).toBe("Due on invoice");
    expect(formatTerms(null)).toBeNull();
  });

  it("shows an unpaid invoice as Overdue once its calculated due date has passed", () => {
    const base = { status: "SENT", invoiceStatus: "SENT", invoicedDate: "2026-10-07", paymentTermsDays: 10 };
    expect(changeOrderDisplay(base, "2026-10-17")).toMatchObject({ status: "SENT", invoiceStatus: "SENT", dueDate: "2026-10-17", overdue: false }); // due today is not overdue
    expect(changeOrderDisplay(base, "2026-10-18")).toMatchObject({ status: "OVERDUE", invoiceStatus: "OVERDUE", overdue: true });
    expect(changeOrderDisplay({ ...base, invoiceStatus: "PAID", status: "COMPLETE" }, "2027-01-01")).toMatchObject({ status: "COMPLETE", invoiceStatus: "PAID", overdue: false });
    expect(changeOrderDisplay({ ...base, paymentTermsDays: null }, "2027-01-01")).toMatchObject({ status: "SENT", dueDate: null, overdue: false });
    // set to Overdue by hand: stays overdue even with no terms
    expect(changeOrderDisplay({ ...base, paymentTermsDays: null, invoiceStatus: "OVERDUE" }, TODAY).overdue).toBe(true);
  });

  it("keeps invoice and payslip links, and rejects ones that aren't web addresses", () => {
    const ok = cleanChangeOrder({ ...base, invoiceLink: "https://solargik.sharepoint.com/inv.pdf", payslipLink: "https://solargik.sharepoint.com/slip.pdf" });
    expect(ok.ok && [ok.value.invoiceLink, ok.value.payslipLink]).toEqual(["https://solargik.sharepoint.com/inv.pdf", "https://solargik.sharepoint.com/slip.pdf"]);
    expect(cleanChangeOrder({ ...base, invoiceLink: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, payslipLink: "not a link" }).ok).toBe(false);
    const none = cleanChangeOrder(base);
    expect(none.ok && [none.value.invoiceLink, none.value.payslipLink]).toEqual([null, null]);
  });

  it("validates the payment terms", () => {
    const ok = cleanChangeOrder({ ...base, paymentTermsDays: "10" });
    expect(ok.ok && ok.value.paymentTermsDays).toBe(10);
    expect(cleanChangeOrder({ ...base, paymentTermsDays: "" }).ok && true).toBe(true);
    expect(cleanChangeOrder({ ...base, paymentTermsDays: "2.5" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, paymentTermsDays: "-3" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, paymentTermsDays: "400" }).ok).toBe(false);
  });

  it("validates reason, status values and the file link", () => {
    expect(cleanChangeOrder({ ...base, reason: "" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, status: "DONE" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, invoiceStatus: "MAYBE" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, fileLink: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanChangeOrder({ ...base, fileLink: "https://solargik.sharepoint.com/co1.pdf" }).ok).toBe(true);
    const uploaded = cleanChangeOrder({ ...base, fileLink: "/api/files/CO-1-abc.pdf", invoiceLink: "/api/files/Inv-1-abc.pdf", payslipLink: "/api/files/Slip-1-abc.png" });
    expect(uploaded.ok && [uploaded.value.fileLink, uploaded.value.invoiceLink, uploaded.value.payslipLink]).toEqual(["/api/files/CO-1-abc.pdf", "/api/files/Inv-1-abc.pdf", "/api/files/Slip-1-abc.png"]);
    expect(cleanChangeOrder({ ...base, fileLink: "/api/files/../x" }).ok).toBe(false);
  });
});
