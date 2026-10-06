import type { StageStatus } from "@prisma/client";
import type { Choice } from "@/lib/projectProfile";

// Payment milestones and change orders: statuses (colored), amounts, the derived "Overdue", which milestone is
// "upcoming", the change-order rule, and validation of what the Payments editor sends.

const choice = (value: string, label: string, bg: string, text: string): Choice => ({ value, label, bg, text });

export type MilestoneStatus = "NOT_DUE" | "INVOICE_SENT" | "OVERDUE" | "PAYMENT_RECEIVED";

// OVERDUE is never stored: it is what a NOT_DUE or INVOICE_SENT milestone becomes once its due date has passed.
export const MILESTONE_STATUS: Record<MilestoneStatus, Choice> = {
  NOT_DUE: choice("NOT_DUE", "Not due yet", "#E4E6EC", "#4A4F5C"),
  INVOICE_SENT: choice("INVOICE_SENT", "Invoice sent", "#DCE8FB", "#1D4F9F"),
  OVERDUE: choice("OVERDUE", "Overdue", "#FCE0DD", "#8C1D18"),
  PAYMENT_RECEIVED: choice("PAYMENT_RECEIVED", "Payment received", "#D8F5E3", "#047857"),
};
// What a person can set by hand (Overdue happens by itself).
export const SETTABLE_MILESTONE_STATUSES: MilestoneStatus[] = ["NOT_DUE", "INVOICE_SENT", "PAYMENT_RECEIVED"];

export const CHANGE_ORDER_STATUS: Choice[] = [
  choice("SENT", "Sent", "#DCE8FB", "#1D4F9F"),
  choice("OVERDUE", "Overdue", "#FCE0DD", "#8C1D18"),
  choice("COMPLETE", "Complete", "#D8F5E3", "#047857"),
];
export const CHANGE_ORDER_INVOICE_STATUS: Choice[] = [
  choice("SENT", "Sent", "#DCE8FB", "#1D4F9F"),
  choice("OVERDUE", "Overdue", "#FCE0DD", "#8C1D18"),
  choice("PAID", "Paid", "#D8F5E3", "#047857"),
];

// Suggested names when adding milestones; a contract can have any of them, in any number.
export const MILESTONE_LABELS = ["NTP / NTD", "Milestone 1 (AP)", "Milestone 2", "Milestone 3", "Milestone 4", "Milestone 5"];
export const OPTIONAL_LABELS = ["NTP / NTD"];

// The currencies a project's payments can be in (set per project on the Payments page).
export const CURRENCIES = [
  { code: "USD", label: "US dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "ILS", label: "Israeli shekel (₪)" },
  { code: "GBP", label: "British pound (£)" },
  { code: "CHF", label: "Swiss franc (CHF)" },
  { code: "CAD", label: "Canadian dollar (CA$)" },
] as const;
export const DEFAULT_CURRENCY = "USD";
export const isCurrency = (code: unknown): code is string => CURRENCIES.some((c) => c.code === code);

// "€899,760", "$202,676.20" (cents only when there are some); "—" for no value.
export function money(value: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (value === null || value === undefined) return "—";
  const code = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

// ---- a project's contract amount and its currency ----

type DecimalLike = { toString(): string };
const toNumber = (v: DecimalLike | number | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));

// What to show as a project's contract value: the amount typed for payments if there is one, else the value
// imported from monday.com, always in the project's payments currency.
export function projectContract(p: { contractValue: DecimalLike | number | null; paymentBase: DecimalLike | number | null; paymentCurrency: string }): { amount: number | null; currency: string } {
  return { amount: toNumber(p.paymentBase) ?? toNumber(p.contractValue), currency: isCurrency(p.paymentCurrency) ? p.paymentCurrency : DEFAULT_CURRENCY };
}

// Amounts in different currencies can't be added together, so totals are kept per currency.
export function totalsByCurrency(list: { amount: number | null; currency: string }[]): { currency: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const { amount, currency } of list) if (amount !== null) sums.set(currency, (sums.get(currency) ?? 0) + amount);
  return [...sums.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}

// "€4,450,453.60 + $1,013,381", or "—" when there is nothing.
export const formatTotals = (totals: { currency: string; amount: number }[]) => (totals.length === 0 ? "—" : totals.map((t) => money(t.amount, t.currency)).join(" + "));

// ---- calculations ----

export type MilestoneCore = {
  percent: number | null;
  amountOverride: number | null;
  status: string;
  dueDate: string | null; // YYYY-MM-DD
};

// A typed amount wins; otherwise percent of the contract value (to the cent).
export function milestoneAmount(m: Pick<MilestoneCore, "percent" | "amountOverride">, contractValue: number | null): number | null {
  if (m.amountOverride !== null) return m.amountOverride;
  if (m.percent === null || contractValue === null) return null;
  return Math.round(((contractValue * m.percent) / 100) * 100) / 100;
}

export function effectiveStatus(m: Pick<MilestoneCore, "status" | "dueDate">, todayIso: string): MilestoneStatus {
  if (m.status === "PAYMENT_RECEIVED") return "PAYMENT_RECEIVED";
  const stored: MilestoneStatus = m.status === "INVOICE_SENT" ? "INVOICE_SENT" : "NOT_DUE";
  return m.dueDate && m.dueDate < todayIso ? "OVERDUE" : stored;
}

// The milestone to highlight: the first one (in order) that has not been paid and is "active", meaning it has
// no linked item or its linked item is Done (e.g. the products have shipped).
export function upcomingMilestoneId(
  milestones: { id: string; status: string; order: number; linkedStatus: StageStatus | null }[],
): string | null {
  const next = [...milestones]
    .sort((a, b) => a.order - b.order)
    .find((m) => m.status !== "PAYMENT_RECEIVED" && (m.linkedStatus === null || m.linkedStatus === "DONE"));
  return next?.id ?? null;
}

// Which milestone a project is "up to": the first one (in order) that has not been paid, with its status;
// "all-paid" once every milestone is paid, "none" when the project has no milestones.
export type MilestoneProgress =
  | { kind: "none"; sortKey: null }
  | { kind: "all-paid"; count: number; sortKey: number }
  | { kind: "current"; label: string; status: MilestoneStatus; dueDate: string | null; count: number; sortKey: number };

export function milestoneProgress(milestones: { label: string; order: number; status: string; dueDate: string | null }[], todayIso: string): MilestoneProgress {
  if (milestones.length === 0) return { kind: "none", sortKey: null };
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const current = ordered.find((m) => m.status !== "PAYMENT_RECEIVED");
  if (!current) return { kind: "all-paid", count: ordered.length, sortKey: 1000 };
  return { kind: "current", label: current.label, status: effectiveStatus(current, todayIso), dueDate: current.dueDate, count: ordered.length, sortKey: ordered.indexOf(current) + 1 };
}

export type Totals = { contract: number | null; invoiced: number; paid: number; percentTotal: number | null };

export function milestoneTotals(
  milestones: { percent: number | null; amountOverride: number | null; status: string }[],
  contractValue: number | null,
): Totals {
  let invoiced = 0;
  let paid = 0;
  let percent = 0;
  let anyPercent = false;
  for (const m of milestones) {
    const amount = milestoneAmount(m, contractValue) ?? 0;
    if (m.status === "INVOICE_SENT" || m.status === "PAYMENT_RECEIVED") invoiced += amount;
    if (m.status === "PAYMENT_RECEIVED") paid += amount;
    if (m.percent !== null) {
      percent += m.percent;
      anyPercent = true;
    }
  }
  return { contract: contractValue, invoiced, paid, percentTotal: anyPercent ? Math.round(percent * 1000) / 1000 : null };
}

// ---- change orders ----

// Once the invoice is paid the change order is complete.
export function changeOrderStatusFor(status: string, invoiceStatus: string | null): string {
  return invoiceStatus === "PAID" ? "COMPLETE" : status;
}

// ---- validation of what the editor sends ----

export type MilestoneInput = {
  id: string; // "" for a new one
  label: string;
  optional: boolean;
  percent: string;
  amountOverride: string;
  linkedSubStageId: string;
  dueDate: string;
  status: string;
  invoiceSentDate: string;
  paidDate: string;
};
export type ChangeOrderInput = {
  id: string; // "" for a new one
  reason: string;
  status: string;
  amount: string;
  dateSent: string;
  invoicedDate: string;
  invoiceStatus: string;
  fileLink: string;
};
export type CleanMilestone = {
  id: string | null;
  label: string;
  optional: boolean;
  percent: number | null;
  amountOverride: number | null;
  linkedSubStageId: string | null;
  dueDate: string | null;
  status: "NOT_DUE" | "INVOICE_SENT" | "PAYMENT_RECEIVED";
  invoiceSentDate: string | null;
  paidDate: string | null;
};
export type CleanChangeOrder = {
  id: string | null;
  reason: string;
  status: string;
  amount: number | null;
  dateSent: string | null;
  invoicedDate: string | null;
  invoiceStatus: string | null;
  fileLink: string | null;
};
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

function date(v: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = str(v).trim();
  if (!t) return { ok: true, value: null };
  return validDate(t) ? { ok: true, value: t } : { ok: false, error: `${label} isn't a valid date.` };
}
function number(v: unknown, label: string, max: number): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = str(v).trim().replace(/[$,\s]/g, "");
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${label} must be a positive number.` };
  if (n > max) return { ok: false, error: `${label} is too large.` };
  return { ok: true, value: n };
}
function link(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = str(v).trim();
  if (!t) return { ok: true, value: null };
  if (t.length > 1000) return { ok: false, error: "A link is too long." };
  try {
    const url = new URL(t);
    if (url.protocol === "https:" || url.protocol === "http:") return { ok: true, value: url.toString() };
  } catch {
    /* falls through */
  }
  return { ok: false, error: "A file link must be a web address starting with https://" };
}

export function cleanMilestone(input: Partial<Record<keyof MilestoneInput, unknown>>): Result<CleanMilestone> {
  const label = str(input.label).replace(/\s+/g, " ").trim();
  if (!label) return { ok: false, error: "Every milestone needs a name." };
  if (label.length > 60) return { ok: false, error: "A milestone name can be at most 60 characters." };
  const percent = number(input.percent, `Percent of "${label}"`, 100);
  if (!percent.ok) return percent;
  const override = number(input.amountOverride, `Amount of "${label}"`, 1e12);
  if (!override.ok) return override;
  const due = date(input.dueDate, `Due date of "${label}"`);
  if (!due.ok) return due;
  const sent = date(input.invoiceSentDate, `Invoice sent date of "${label}"`);
  if (!sent.ok) return sent;
  const paid = date(input.paidDate, `Paid date of "${label}"`);
  if (!paid.ok) return paid;
  const status = str(input.status) || "NOT_DUE";
  if (!SETTABLE_MILESTONE_STATUSES.includes(status as MilestoneStatus)) return { ok: false, error: `"${label}" has a status that doesn't exist.` };

  // The date boxes depend on the status: the invoice date only once invoiced, the paid date only once paid.
  const invoiced = status === "INVOICE_SENT" || status === "PAYMENT_RECEIVED";
  return {
    ok: true,
    value: {
      id: str(input.id) || null,
      label,
      optional: input.optional === true,
      percent: percent.value,
      amountOverride: override.value,
      linkedSubStageId: str(input.linkedSubStageId).trim() || null,
      dueDate: due.value,
      status: status as CleanMilestone["status"],
      invoiceSentDate: invoiced ? sent.value : null,
      paidDate: status === "PAYMENT_RECEIVED" ? paid.value : null,
    },
  };
}

export function cleanChangeOrder(input: Partial<Record<keyof ChangeOrderInput, unknown>>): Result<CleanChangeOrder> {
  const reason = str(input.reason).replace(/\r\n/g, "\n").trim();
  if (!reason) return { ok: false, error: "Every change order needs a reason." };
  if (reason.length > 500) return { ok: false, error: "A change order's reason can be at most 500 characters." };
  const amount = number(input.amount, "A change order amount", 1e12);
  if (!amount.ok) return amount;
  const sent = date(input.dateSent, "Date sent");
  if (!sent.ok) return sent;
  const invoiced = date(input.invoicedDate, "Invoiced date");
  if (!invoiced.ok) return invoiced;
  const file = link(input.fileLink);
  if (!file.ok) return file;
  const status = str(input.status) || "SENT";
  if (!CHANGE_ORDER_STATUS.some((c) => c.value === status)) return { ok: false, error: "A change order has a status that doesn't exist." };
  const invoiceStatus = str(input.invoiceStatus);
  if (invoiceStatus && !CHANGE_ORDER_INVOICE_STATUS.some((c) => c.value === invoiceStatus)) return { ok: false, error: "A change order has an invoice status that doesn't exist." };

  return {
    ok: true,
    value: {
      id: str(input.id) || null,
      reason,
      status: changeOrderStatusFor(status, invoiceStatus || null),
      amount: amount.value,
      dateSent: sent.value,
      invoicedDate: invoiced.value,
      invoiceStatus: invoiceStatus || null,
      fileLink: file.value,
    },
  };
}
