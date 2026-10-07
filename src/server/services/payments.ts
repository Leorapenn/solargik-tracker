import type { StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { phaseLabel } from "@/lib/phases";
import { cleanChangeOrder, cleanMilestone, isCurrency, type ChangeOrderInput, type CleanChangeOrder, type CleanMilestone, type MilestoneInput } from "@/lib/payments";

export const MAX_MILESTONES = 12;
export const MAX_CHANGE_ORDERS = 50;

const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

export type MilestoneView = {
  id: string;
  label: string;
  optional: boolean;
  percent: number | null;
  amountOverride: number | null;
  linkedSubStageId: string | null;
  linkedName: string | null;
  linkedStatus: StageStatus | null;
  status: string;
  dueDate: string | null;
  invoiceSentDate: string | null;
  paidDate: string | null;
  invoiceLink: string | null;
  payslipLink: string | null;
  order: number;
};
export type ChangeOrderView = {
  id: string;
  reason: string;
  status: string;
  amount: number | null;
  dateSent: string | null;
  invoicedDate: string | null;
  invoiceStatus: string | null;
  paymentTermsDays: number | null;
  fileLink: string | null;
  invoiceLink: string | null;
  payslipLink: string | null;
};
export type LinkableItem = { id: string; name: string; phaseLabel: string; status: StageStatus };
export type PaymentData = {
  // The amount the milestone percentages apply to, in `currency`: the project's payment base if set,
  // otherwise the contract value imported from monday.com.
  contractValue: number | null;
  currency: string;
  paymentBase: number | null; // what was typed for this project (null = using the monday.com value)
  mondayValue: number | null;
  milestones: MilestoneView[];
  changeOrders: ChangeOrderView[];
  items: LinkableItem[];
};

export async function getPaymentData(projectId: string): Promise<PaymentData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      contractValue: true,
      paymentCurrency: true,
      paymentBase: true,
      milestones: { orderBy: { order: "asc" }, include: { linkedSubStage: { select: { name: true, status: true } } } },
      changeOrders: { orderBy: { createdAt: "asc" } },
      phases: { orderBy: { order: "asc" }, select: { name: true, subStages: { orderBy: { order: "asc" }, select: { id: true, name: true, status: true } } } },
    },
  });
  if (!project) return null;
  return {
    contractValue: num(project.paymentBase) ?? num(project.contractValue),
    currency: project.paymentCurrency,
    paymentBase: num(project.paymentBase),
    mondayValue: num(project.contractValue),
    milestones: project.milestones.map((m) => ({
      id: m.id,
      label: m.label,
      optional: m.optional,
      percent: num(m.percent),
      amountOverride: num(m.amountOverride),
      linkedSubStageId: m.linkedSubStageId,
      linkedName: m.linkedSubStage?.name ?? null,
      linkedStatus: m.linkedSubStage?.status ?? null,
      status: m.status,
      dueDate: iso(m.dueDate),
      invoiceSentDate: iso(m.invoiceSentDate),
      paidDate: iso(m.paidDate),
      invoiceLink: m.invoiceLink,
      payslipLink: m.payslipLink,
      order: m.order,
    })),
    changeOrders: project.changeOrders.map((c) => ({
      id: c.id,
      reason: c.reason,
      status: c.status,
      amount: num(c.amount),
      dateSent: iso(c.dateSent),
      invoicedDate: iso(c.invoicedDate),
      invoiceStatus: c.invoiceStatus,
      paymentTermsDays: c.paymentTermsDays,
      fileLink: c.fileLink,
      invoiceLink: c.invoiceLink,
      payslipLink: c.payslipLink,
    })),
    items: project.phases.flatMap((p) => p.subStages.map((s) => ({ id: s.id, name: s.name, phaseLabel: phaseLabel(p.name), status: s.status }))),
  };
}

// Saves the whole payments list of a project in one go (the editor sends everything): milestones and change
// orders that are no longer in the list are removed, the rest are updated or created, in the order sent.
export async function savePayments(
  projectId: string,
  input: {
    milestones: Partial<Record<keyof MilestoneInput, unknown>>[];
    changeOrders: Partial<Record<keyof ChangeOrderInput, unknown>>[];
    currency: string;
    paymentBase: string; // "" = use the monday.com contract value
  },
): Promise<void> {
  if (!Array.isArray(input.milestones) || !Array.isArray(input.changeOrders)) throw new UserError("Nothing to save.");
  if (!isCurrency(input.currency)) throw new UserError("Choose one of the listed currencies.");
  const baseText = (typeof input.paymentBase === "string" ? input.paymentBase : "").trim().replace(/[$€₪£,\s]/g, "");
  const base = baseText === "" ? null : Number(baseText);
  if (base !== null && (!Number.isFinite(base) || base < 0 || base > 1e12)) throw new UserError("The contract amount must be a positive number.");
  if (input.milestones.length > MAX_MILESTONES) throw new UserError(`At most ${MAX_MILESTONES} milestones per project.`);
  if (input.changeOrders.length > MAX_CHANGE_ORDERS) throw new UserError(`At most ${MAX_CHANGE_ORDERS} change orders per project.`);

  const milestones: CleanMilestone[] = [];
  for (const raw of input.milestones) {
    const r = cleanMilestone(raw);
    if (!r.ok) throw new UserError(r.error);
    milestones.push(r.value);
  }
  const changeOrders: CleanChangeOrder[] = [];
  for (const raw of input.changeOrders) {
    const r = cleanChangeOrder(raw);
    if (!r.ok) throw new UserError(r.error);
    changeOrders.push(r.value);
  }

  await prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { milestones: { select: { id: true } }, changeOrders: { select: { id: true } }, phases: { select: { subStages: { select: { id: true } } } } },
      });
      if (!project) throw new UserError("That project no longer exists.");
      const ownMilestones = new Set(project.milestones.map((m) => m.id));
      const ownOrders = new Set(project.changeOrders.map((c) => c.id));
      const ownItems = new Set(project.phases.flatMap((p) => p.subStages.map((s) => s.id)));

      for (const m of milestones) {
        if (m.id && !ownMilestones.has(m.id)) throw new UserError("A milestone no longer exists. Reload the page and try again.");
        if (m.linkedSubStageId && !ownItems.has(m.linkedSubStageId)) throw new UserError(`"${m.label}" is linked to an item that isn't on this project.`);
      }
      for (const c of changeOrders) if (c.id && !ownOrders.has(c.id)) throw new UserError("A change order no longer exists. Reload the page and try again.");

      await tx.project.update({ where: { id: projectId }, data: { paymentCurrency: input.currency, paymentBase: base } });

      const keptMilestones = new Set(milestones.map((m) => m.id).filter((id): id is string => !!id));
      const keptOrders = new Set(changeOrders.map((c) => c.id).filter((id): id is string => !!id));
      await tx.milestone.deleteMany({ where: { projectId, id: { notIn: [...keptMilestones] } } });
      await tx.changeOrder.deleteMany({ where: { projectId, id: { notIn: [...keptOrders] } } });

      for (const [order, m] of milestones.entries()) {
        const data = {
          order,
          label: m.label,
          optional: m.optional,
          percent: m.percent,
          amountOverride: m.amountOverride,
          linkedSubStageId: m.linkedSubStageId,
          dueDate: day(m.dueDate),
          status: m.status,
          invoiceSentDate: day(m.invoiceSentDate),
          paidDate: day(m.paidDate),
          invoiceLink: m.invoiceLink,
          payslipLink: m.payslipLink,
        };
        if (m.id) await tx.milestone.update({ where: { id: m.id }, data });
        else await tx.milestone.create({ data: { projectId, ...data } });
      }
      for (const c of changeOrders) {
        const data = {
          reason: c.reason,
          status: c.status,
          amount: c.amount,
          dateSent: day(c.dateSent),
          invoicedDate: day(c.invoicedDate),
          invoiceStatus: c.invoiceStatus,
          paymentTermsDays: c.paymentTermsDays,
          fileLink: c.fileLink,
          invoiceLink: c.invoiceLink,
          payslipLink: c.payslipLink,
        };
        if (c.id) await tx.changeOrder.update({ where: { id: c.id }, data });
        else await tx.changeOrder.create({ data: { projectId, ...data } });
      }
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
