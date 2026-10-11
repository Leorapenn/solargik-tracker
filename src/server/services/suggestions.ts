import { Prisma, type PhaseName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { cleanChangeOrder, cleanMilestone, type MilestoneInput } from "@/lib/payments";
import { MAX_CHANGE_ORDERS } from "@/server/services/payments";
import { cleanStatusText } from "@/lib/statusUpdate";
import { ITEM_STATUS_LABELS, KIND_LABELS, MAX_PER_REQUEST, cleanIncoming, describePayload, matchProject, suggestionFingerprint, type Confidence, type Payload, type SuggestionKind } from "@/lib/suggestions";
import { setPhaseUpdate, setSubStageUpdate } from "@/server/services/statusUpdates";
import { patchSubStages } from "@/server/services/subStages";

// ---- intake: what an outside reader sends ----

export type IntakeResult = { created: number; duplicates: number; rejected: { index: number; error: string }[] };

// Validates and stores suggestions (status PENDING). Nothing is applied here, and a suggestion whose own id was
// already received is skipped, so a retry never duplicates.
export async function createSuggestions(list: unknown[]): Promise<IntakeResult> {
  if (list.length > MAX_PER_REQUEST) throw new UserError(`Send at most ${MAX_PER_REQUEST} suggestions at a time.`);
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  const result: IntakeResult = { created: 0, duplicates: 0, rejected: [] };

  for (const [index, raw] of list.entries()) {
    const cleaned = cleanIncoming(raw);
    if (!cleaned.ok) {
      result.rejected.push({ index, error: cleaned.error });
      continue;
    }
    const c = cleaned.value;
    // the sender's own id, or (when it sent none) a fingerprint of the proposal and its email
    const externalId = c.externalId ?? suggestionFingerprint(c);
    if (await prisma.suggestion.findUnique({ where: { externalId }, select: { id: true } })) {
      result.duplicates += 1;
      continue;
    }
    try {
      await prisma.suggestion.create({
        data: {
          kind: c.payload.kind,
          payload: c.payload as unknown as Prisma.InputJsonObject,
          projectId: matchProject(c.projectRef, projects),
          projectRef: c.projectRef,
          summary: c.summary,
          evidence: c.evidence,
          sourceFrom: c.sourceFrom,
          sourceSubject: c.sourceSubject,
          sourceReceivedAt: c.sourceReceivedAt,
          sourceLink: c.sourceLink,
          sourceMessageId: c.sourceMessageId,
          confidence: c.confidence,
          externalId,
        },
      });
      result.created += 1;
    } catch (error) {
      // two requests with the same id at once: the unique index catches the second one
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") result.duplicates += 1;
      else throw error;
    }
  }
  return result;
}

// ---- the Inbox ----

export type SuggestionView = {
  id: string;
  kind: SuggestionKind;
  kindText: string;
  payload: Payload;
  description: string;
  summary: string;
  evidence: string | null;
  projectId: string | null;
  projectName: string | null;
  projectRef: string | null;
  sourceFrom: string | null;
  sourceSubject: string | null;
  sourceReceivedAt: string | null;
  sourceLink: string | null;
  sourceMessageId: string | null;
  confidence: Confidence | null;
  status: string;
  resultNote: string | null;
  createdAt: string;
};

export async function listSuggestions(status: "PENDING" | "APPROVED" | "REJECTED", limit = 100): Promise<SuggestionView[]> {
  const rows = await prisma.suggestion.findMany({
    where: { status },
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" },
    take: limit,
    include: { project: { select: { name: true } } },
  });
  return rows.map((r) => {
    const payload = r.payload as unknown as Payload;
    return {
      id: r.id,
      kind: r.kind as SuggestionKind,
      kindText: KIND_LABELS[r.kind as SuggestionKind] ?? r.kind,
      payload,
      description: describePayload(payload),
      summary: r.summary,
      evidence: r.evidence,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      projectRef: r.projectRef,
      sourceFrom: r.sourceFrom,
      sourceSubject: r.sourceSubject,
      sourceReceivedAt: r.sourceReceivedAt ? r.sourceReceivedAt.toISOString() : null,
      sourceLink: r.sourceLink,
      sourceMessageId: r.sourceMessageId,
      confidence: (r.confidence as Confidence | null) ?? null,
      status: r.status,
      resultNote: r.resultNote,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function pendingCount(): Promise<number> {
  return prisma.suggestion.count({ where: { status: "PENDING" } });
}

// ---- approving: the only place a suggestion changes real data ----

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The one item of the project the email means: an exact name first, else a name that contains it. Refuses when none
// or several match, so a person fixes it on the project page instead of the wrong item changing.
async function findItem(projectId: string, projectName: string, name: string, phase: PhaseName | null): Promise<{ id: string; name: string; status: string }> {
  const items = await prisma.subStage.findMany({
    where: { phase: { projectId, ...(phase ? { name: phase } : {}) } },
    select: { id: true, name: true, status: true },
  });
  const exact = items.filter((i) => same(i.name, name));
  const found = exact.length > 0 ? exact : items.filter((i) => i.name.toLowerCase().includes(name.toLowerCase()));
  if (found.length === 0) throw new UserError(`${projectName} has no item called "${name}".`);
  if (found.length > 1) throw new UserError(`Several items match "${name}". Reject this and make the change on the project page.`);
  return found[0];
}

const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

async function applyPayload(payload: Payload, projectId: string | null, sourceLink: string | null = null): Promise<string> {
  // these only record that a person looked at them; they change nothing
  // (= REVIEW_ONLY_KINDS) With a project they are listed on its page under "Correspondence and actions".
  if (payload.kind === "NOTE" || payload.kind === "ACTION_ITEM" || payload.kind === "CORRESPONDENCE_NOTE") {
    return projectId ? "Saved on the project page under Correspondence and actions." : "Noted. It has no project, so no project page shows it.";
  }
  if (!projectId) throw new UserError("Choose which project this belongs to first.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, customerId: true, paymentCurrency: true } });
  if (!project) throw new UserError("That project no longer exists.");

  if (payload.kind === "PHASE_UPDATE") {
    const phase = await prisma.phase.findUnique({ where: { projectId_name: { projectId, name: payload.phase } }, select: { id: true } });
    if (!phase) throw new UserError(`${project.name} has no ${payload.phase} phase.`);
    await setPhaseUpdate(phase.id, payload.text);
    return "Phase update saved.";
  }

  if (payload.kind === "ITEM_UPDATE") {
    const item = await findItem(projectId, project.name, payload.item, payload.phase);
    await setSubStageUpdate(item.id, payload.text);
    return `Update saved on "${item.name}".`;
  }

  if (payload.kind === "STATUS_CHANGE") {
    const item = await findItem(projectId, project.name, payload.item, payload.phase);
    const label = ITEM_STATUS_LABELS[payload.status];
    if (item.status === payload.status) return `"${item.name}" was already ${label}.`;
    // the same path as changing the status by hand: dates are stamped, the history is written, the phase is re-derived
    await prisma.$transaction((tx) => patchSubStages(tx, [item.id], { status: payload.status }, "inbox"), { timeout: 20000 });
    return `"${item.name}" set to ${label}.`;
  }

  if (payload.kind === "MILESTONE_UPDATE") {
    const milestones = await prisma.milestone.findMany({ where: { projectId } });
    const exact = milestones.filter((m) => same(m.label, payload.milestone));
    const found = exact.length > 0 ? exact : milestones.filter((m) => m.label.toLowerCase().includes(payload.milestone.toLowerCase()));
    if (found.length !== 1) throw new UserError(found.length === 0 ? `${project.name} has no milestone called "${payload.milestone}".` : `Several milestones match "${payload.milestone}".`);
    const m = found[0];
    const input: MilestoneInput = {
      id: m.id,
      label: m.label,
      optional: m.optional,
      percent: m.percent === null ? "" : m.percent.toString(),
      amountOverride: m.amountOverride === null ? "" : m.amountOverride.toString(),
      linkedSubStageId: m.linkedSubStageId ?? "",
      dueDate: m.dueDate ? toDateInputValue(m.dueDate) : "",
      status: payload.status ?? m.status,
      invoiceSentDate: payload.invoiceSentDate ?? (m.invoiceSentDate ? toDateInputValue(m.invoiceSentDate) : ""),
      paidDate: payload.paidDate ?? (m.paidDate ? toDateInputValue(m.paidDate) : ""),
      invoiceLink: payload.invoiceLink ?? m.invoiceLink ?? "",
      payslipLink: payload.payslipLink ?? m.payslipLink ?? "",
    };
    const cleaned = cleanMilestone(input);
    if (!cleaned.ok) throw new UserError(cleaned.error);
    await prisma.milestone.update({
      where: { id: m.id },
      data: {
        status: cleaned.value.status,
        invoiceSentDate: day(cleaned.value.invoiceSentDate),
        paidDate: day(cleaned.value.paidDate),
        invoiceLink: cleaned.value.invoiceLink,
        payslipLink: cleaned.value.payslipLink,
      },
    });
    return `"${m.label}" updated.`;
  }

  // A change order is created exactly as the Payments page would save it (same validation). Files are never copied:
  // fileLink / invoiceLink are links, usually to the email that carries the document.
  if (payload.kind === "CHANGE_ORDER") {
    if (payload.currency && payload.currency !== project.paymentCurrency) {
      throw new UserError(`The email gives the amount in ${payload.currency}, but ${project.name}'s payments are in ${project.paymentCurrency}. Check the amount, or change the currency on the Payments page first, then approve again.`);
    }
    const existing = await prisma.changeOrder.findMany({ where: { projectId }, select: { reason: true } });
    if (existing.length >= MAX_CHANGE_ORDERS) throw new UserError(`${project.name} already has ${MAX_CHANGE_ORDERS} change orders.`);
    if (existing.some((c) => same(c.reason, payload.reason))) throw new UserError(`${project.name} already has a change order called "${payload.reason}". Update it on the Payments page, or reject this.`);
    const cleaned = cleanChangeOrder({
      id: "",
      reason: payload.reason,
      status: "SENT",
      amount: payload.amount ?? "",
      dateSent: payload.dateSent ?? "",
      invoicedDate: payload.invoicedDate ?? "",
      invoiceStatus: payload.invoiceStatus ?? (payload.invoicedDate ? "SENT" : ""),
      paymentTermsDays: payload.paymentTermsDays === null ? "" : String(payload.paymentTermsDays),
      fileLink: payload.fileLink ?? sourceLink ?? "",
      invoiceLink: payload.invoiceLink ?? "",
      payslipLink: "",
    });
    if (!cleaned.ok) throw new UserError(cleaned.error);
    const c = cleaned.value;
    await prisma.changeOrder.create({
      data: { projectId, reason: c.reason, status: c.status, amount: c.amount, dateSent: day(c.dateSent), invoicedDate: day(c.invoicedDate), invoiceStatus: c.invoiceStatus, paymentTermsDays: c.paymentTermsDays, fileLink: c.fileLink, invoiceLink: c.invoiceLink, payslipLink: c.payslipLink },
    });
    return `Change order "${c.reason}" created on the Payments page${c.fileLink ? ", with its file link" : ""}.`;
  }

  if (payload.kind === "CHANGE_ORDER_UPDATE") {
    const orders = await prisma.changeOrder.findMany({ where: { projectId } });
    const exact = orders.filter((c) => same(c.reason, payload.changeOrder));
    const found = exact.length > 0 ? exact : orders.filter((c) => c.reason.toLowerCase().includes(payload.changeOrder.toLowerCase()));
    if (found.length !== 1) throw new UserError(found.length === 0 ? `${project.name} has no change order called "${payload.changeOrder}".` : `Several change orders match "${payload.changeOrder}". Reject this and update the right one on the Payments page.`);
    const c = found[0];
    const cleaned = cleanChangeOrder({
      id: c.id,
      reason: c.reason,
      status: c.status,
      amount: c.amount === null ? "" : c.amount.toString(),
      dateSent: c.dateSent ? toDateInputValue(c.dateSent) : "",
      invoicedDate: payload.invoicedDate ?? (c.invoicedDate ? toDateInputValue(c.invoicedDate) : ""),
      invoiceStatus: payload.invoiceStatus ?? c.invoiceStatus ?? (payload.invoicedDate ? "SENT" : ""),
      paymentTermsDays: payload.paymentTermsDays !== null ? String(payload.paymentTermsDays) : c.paymentTermsDays === null ? "" : String(c.paymentTermsDays),
      fileLink: payload.fileLink ?? c.fileLink ?? "",
      invoiceLink: payload.invoiceLink ?? c.invoiceLink ?? "",
      payslipLink: payload.payslipLink ?? c.payslipLink ?? "",
    });
    if (!cleaned.ok) throw new UserError(cleaned.error);
    const n = cleaned.value;
    await prisma.changeOrder.update({
      where: { id: c.id },
      data: { status: n.status, invoicedDate: day(n.invoicedDate), invoiceStatus: n.invoiceStatus, paymentTermsDays: n.paymentTermsDays, fileLink: n.fileLink, invoiceLink: n.invoiceLink, payslipLink: n.payslipLink },
    });
    return `Change order "${c.reason}" updated.`;
  }

  // CONTACT
  const email = payload.email?.toLowerCase() ?? null;
  if (email && (await prisma.contact.count({ where: { customerId: project.customerId, email: { equals: email, mode: "insensitive" } } })) > 0) {
    throw new UserError("A contact with that email already exists for this customer.");
  }
  await prisma.contact.create({
    data: { customerId: project.customerId, projectId: null, name: payload.name, email: payload.email, phone: payload.phone, role: payload.role, source: "MANUAL", locked: true },
  });
  return `Contact ${payload.name} added.`;
}

// Approves a pending suggestion: applies it, and marks it approved. `overrides` lets the reviewer pick the project
// and reword the text first. If applying fails (an unknown item, say) it stays pending and the reason is returned.
// What the reviewer can correct on a change-order card before approving (empty text clears a value).
export const CHANGE_ORDER_EDIT_KEYS = ["reason", "amount", "dateSent", "invoicedDate", "invoiceStatus", "paymentTermsDays"] as const;
export type ChangeOrderEdits = Partial<Record<(typeof CHANGE_ORDER_EDIT_KEYS)[number], string>>;

export async function approveSuggestion(id: string, overrides: { projectId?: string | null; text?: string; fields?: ChangeOrderEdits } = {}): Promise<string> {
  const row = await prisma.suggestion.findUnique({ where: { id } });
  if (!row) throw new UserError("That suggestion no longer exists.");
  if (row.status !== "PENDING") throw new UserError("That suggestion was already handled.");

  let payload = row.payload as unknown as Payload;
  if (overrides.text !== undefined && (payload.kind === "PHASE_UPDATE" || payload.kind === "ITEM_UPDATE" || payload.kind === "NOTE" || payload.kind === "ACTION_ITEM" || payload.kind === "CORRESPONDENCE_NOTE")) {
    const cleaned = cleanStatusText(overrides.text);
    if (!cleaned.ok) throw new UserError(cleaned.error);
    if (!cleaned.value) throw new UserError("The text can't be empty. Reject the suggestion instead.");
    payload = { ...payload, text: cleaned.value };
  }
  // corrections to a change order go through the same validation as an incoming proposal
  if (overrides.fields && (payload.kind === "CHANGE_ORDER" || payload.kind === "CHANGE_ORDER_UPDATE")) {
    const edits: Record<string, string> = {};
    for (const key of CHANGE_ORDER_EDIT_KEYS) {
      const value = overrides.fields[key];
      if (typeof value === "string" && !(key === "reason" && payload.kind === "CHANGE_ORDER_UPDATE")) edits[key] = value;
    }
    const merged = cleanIncoming({ ...payload, ...edits, summary: row.summary });
    if (!merged.ok) throw new UserError(merged.error);
    payload = merged.value.payload;
  }
  const projectId = overrides.projectId === undefined ? row.projectId : overrides.projectId;

  const note = await applyPayload(payload, projectId, row.sourceLink);
  // claim it only if it is still pending, so a double click can't apply it twice
  const claimed = await prisma.suggestion.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: new Date(), resultNote: note, projectId: projectId ?? null, payload: payload as unknown as Prisma.InputJsonObject },
  });
  if (claimed.count === 0) throw new UserError("That suggestion was already handled.");
  return note;
}

export async function rejectSuggestion(id: string): Promise<void> {
  const claimed = await prisma.suggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", reviewedAt: new Date() } });
  if (claimed.count === 0) throw new UserError("That suggestion was already handled or no longer exists.");
}
