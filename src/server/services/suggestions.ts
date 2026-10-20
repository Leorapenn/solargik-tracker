import { Prisma, type PhaseName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { cleanWebLink } from "@/lib/links";
import { cleanChangeOrder, cleanMilestone, type MilestoneInput } from "@/lib/payments";
import { MAX_CHANGE_ORDERS } from "@/server/services/payments";
import { cleanStatusText } from "@/lib/statusUpdate";
import { ITEM_STATUS_LABELS, KIND_LABELS, MAX_PER_REQUEST, TASK_RESULT_PREFIX, cleanIncoming, describePayload, matchCustomer, matchProject, suggestionFingerprint, type Confidence, type Payload, type SuggestionKind } from "@/lib/suggestions";
import { setPhaseUpdate, setSubStageUpdate } from "@/server/services/statusUpdates";
import { patchSubStages } from "@/server/services/subStages";
import { createProject } from "@/server/services/createProject";
import { createTask } from "@/server/services/tasks";
import { cleanTask, taskFromActionItem, type TaskInput } from "@/lib/tasks";
import { NEW_PROJECT_EDIT_KEYS, NEW_PROJECT_PROFILE_KEYS, newProjectName, projectClash, type NewProjectEdits } from "@/lib/newProject";
import { saveProfile } from "@/server/services/projectProfile";

// ---- intake: what an outside reader sends ----

export type IntakeResult = { created: number; duplicates: number; rejected: { index: number; error: string }[] };

// Validates and stores suggestions (status PENDING). Nothing is applied here, and a suggestion whose own id was
// already received is skipped, so a retry never duplicates.
export async function createSuggestions(list: unknown[]): Promise<IntakeResult> {
  if (list.length > MAX_PER_REQUEST) throw new UserError(`Send at most ${MAX_PER_REQUEST} suggestions at a time.`);
  const projects = await prisma.project.findMany({ select: { id: true, name: true, customerId: true } });
  const customers = (await prisma.customer.findMany({ select: { id: true, name: true, aliases: { select: { alias: true } } } })).map((c) => ({ id: c.id, name: c.name, aliases: c.aliases.map((a) => a.alias) }));
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
    // the project when it is unambiguous; the customer from what the sender wrote, else from the project's customer
    const projectId = matchProject(c.projectRef, projects);
    const customerId = matchCustomer(c.customerRef, customers) ?? projects.find((p) => p.id === projectId)?.customerId ?? null;
    try {
      await prisma.suggestion.create({
        data: {
          kind: c.payload.kind,
          payload: c.payload as unknown as Prisma.InputJsonObject,
          projectId,
          customerId,
          projectRef: c.projectRef,
          summary: c.summary,
          evidence: c.evidence,
          sourceFrom: c.sourceFrom,
          sourceSubject: c.sourceSubject,
          sourceReceivedAt: c.sourceReceivedAt,
          sourceLink: c.sourceLink,
          sourceMessageId: c.sourceMessageId,
          conversationId: c.conversationId,
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
  customerId: string | null;
  customerName: string | null;
  sourceFrom: string | null;
  sourceSubject: string | null;
  sourceReceivedAt: string | null;
  sourceLink: string | null;
  sourceMessageId: string | null;
  conversationId: string | null;
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
    include: { project: { select: { name: true } }, customer: { select: { name: true } } },
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
      customerId: r.customerId,
      customerName: r.customer?.name ?? null,
      sourceFrom: r.sourceFrom,
      sourceSubject: r.sourceSubject,
      sourceReceivedAt: r.sourceReceivedAt ? r.sourceReceivedAt.toISOString() : null,
      sourceLink: r.sourceLink,
      sourceMessageId: r.sourceMessageId,
      conversationId: r.conversationId,
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

async function applyPayload(payload: Payload, projectId: string | null, sourceLink: string | null = null, customerName: string | null = null): Promise<string> {
  // these only record that a person looked at them; they change nothing
  // (= REVIEW_ONLY_KINDS) With a project they are listed on its page, with only a customer on the customer's page,
  // under "Correspondence and actions". (An action item is not one of them: approving it creates a task.)
  if (payload.kind === "ACTION_ITEM") throw new UserError("An action item becomes a task when its card is approved.");
  if (payload.kind === "NOTE" || payload.kind === "CORRESPONDENCE_NOTE") {
    if (projectId) return "Saved on the project page under Correspondence and actions.";
    if (customerName) return `Saved on ${customerName}'s page under Correspondence and actions.`;
    return "Noted. It has no project or customer, so no page shows it.";
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
      paymentTermsDays: payload.paymentTermsDays !== null ? String(payload.paymentTermsDays) : m.paymentTermsDays === null ? "" : String(m.paymentTermsDays),
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
        paymentTermsDays: cleaned.value.paymentTermsDays,
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

  // The signed contract: only the link (and, when empty, the signing date) is saved on the project profile. A contract
  // link that is already there is never replaced, so an amendment can't overwrite the main contract.
  if (payload.kind === "CONTRACT_DOCUMENT") {
    const cleanedLink = cleanWebLink(payload.fileLink);
    if (!cleanedLink.ok) throw new UserError(cleanedLink.error);
    if (!cleanedLink.value) throw new UserError("The contract link is empty.");
    const profile = await prisma.projectProfile.findUnique({ where: { projectId }, select: { contractLink: true, contractSigningDate: true } });
    if (profile?.contractLink) throw new UserError(`${project.name} already has a contract link. Reject this, or clear the link in the project profile first and approve again.`);
    const signing = payload.signedDate && !profile?.contractSigningDate ? day(payload.signedDate) : null;
    const data = { contractLink: cleanedLink.value, ...(signing ? { contractSigningDate: signing } : {}) };
    await prisma.projectProfile.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
    return `Contract link saved on the project profile${signing ? " and the signing date set" : ""}.`;
  }

  // a new project is created by approveSuggestion itself, never through here
  if (payload.kind === "NEW_PROJECT") throw new UserError("A new project is created when its card is approved.");

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

// A "New project" proposal creates the project in 360 itself (no monday.com item): the standard phases and items, each
// item's department default owner, in the customer the reviewer confirmed. Refuses a number or name that already exists.
async function createFromProposal(payload: Extract<Payload, { kind: "NEW_PROJECT" }>, customerId: string | null): Promise<{ id: string; note: string }> {
  if (!customerId) throw new UserError("Pick the customer this project is for first.");
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
  if (!customer) throw new UserError("That customer no longer exists.");
  const name = newProjectName(payload.number, payload.name);
  const clash = projectClash(payload.number, name, await prisma.project.findMany({ select: { name: true } }));
  if (clash) throw new UserError(clash);
  const kwp = payload.capacityKwp ? Number(payload.capacityKwp) : null;
  const amount = payload.contractAmount ? Number(payload.contractAmount) : null;
  // No currency stated means EUR (Solargik's contracts are normally in Euro). USD is the unit of the monday.com contract
  // value; any other currency is the payment currency with its own base.
  const currency = payload.currency ?? "EUR";
  const inUsd = currency === "USD";
  const created = await createProject({
    name,
    customerId: customer.id,
    country: payload.country,
    capacityKwp: kwp,
    capacityMw: kwp === null ? null : Math.round(kwp) / 1000,
    contractValue: inUsd ? amount : null,
    paymentCurrency: currency,
    ...(inUsd ? {} : { paymentBase: amount }),
  });
  // The contract details go into the (empty) profile through the normal profile validation. They were checked when the
  // proposal arrived, so this should not fail; if it ever does, the project still stands and the note says so.
  let detailsNote = "";
  const filled = Object.keys(payload.profile ?? {}).length;
  try {
    if (filled > 0) await saveProfile(created.id, payload.profile);
    if (payload.signedDate) {
      const data = { contractSigningDate: new Date(`${payload.signedDate}T00:00:00.000Z`) };
      await prisma.projectProfile.upsert({ where: { projectId: created.id }, create: { projectId: created.id, ...data }, update: data });
    }
    const n = filled + (payload.signedDate ? 1 : 0);
    if (n > 0) detailsNote = ` ${n} contract detail${n === 1 ? "" : "s"} filled in its profile.`;
  } catch (error) {
    detailsNote = ` The contract details could not be saved (${error instanceof Error ? error.message : "unknown error"}): add them on the project page.`;
  }
  return { id: created.id, note: `Project ${name} created for ${customer.name}, with the standard phases and items.${detailsNote}` };
}
// An approved ACTION_ITEM becomes a task (see taskFromActionItem): the person to do it is matched from "who" by full
// name only, and "by" becomes the follow-up date only when it is a real date. Returns the task's topic.
async function createTaskFromAction(
  row: { summary: string; sourceFrom: string | null; sourceSubject: string | null; sourceReceivedAt: Date | null; sourceLink: string | null },
  payload: Extract<Payload, { kind: "ACTION_ITEM" }>,
  customerId: string,
  projectId: string | null,
): Promise<string> {
  const people = await prisma.person.findMany({ where: { active: true }, select: { id: true, name: true } });
  const input = taskFromActionItem(
    { summary: row.summary, kindText: "Action item", sourceFrom: row.sourceFrom, sourceSubject: row.sourceSubject, sourceReceivedAt: row.sourceReceivedAt ? row.sourceReceivedAt.toISOString() : null, sourceLink: row.sourceLink, text: payload.text, who: payload.who, by: payload.by },
    customerId,
    projectId ?? "",
    people,
  );
  await createTask(input);
  return input.topic ?? row.summary;
}

// Approves a pending suggestion: applies it, and marks it approved. `overrides` lets the reviewer pick the project
// and reword the text first. If applying fails (an unknown item, say) it stays pending and the reason is returned.
// What the reviewer can correct on a change-order card before approving (empty text clears a value).
export const CHANGE_ORDER_EDIT_KEYS = ["reason", "amount", "dateSent", "invoicedDate", "invoiceStatus", "paymentTermsDays"] as const;
export type ChangeOrderEdits = Partial<Record<(typeof CHANGE_ORDER_EDIT_KEYS)[number], string>>;
// What a reviewer can correct on a card, as text: the fields of a change order, or of a new project.
export type CardEdits = ChangeOrderEdits & NewProjectEdits;

export async function approveSuggestion(id: string, overrides: { projectId?: string | null; customerId?: string | null; text?: string; fields?: CardEdits } = {}): Promise<string> {
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
  // corrections to a new project go through the same validation as an incoming proposal
  if (overrides.fields && payload.kind === "NEW_PROJECT") {
    const edits: Record<string, string> = {};
    for (const key of NEW_PROJECT_EDIT_KEYS) {
      const value = overrides.fields[key];
      if (typeof value === "string") edits[key] = value;
    }
    // the contract details: what the card shows replaces what was proposed (a cleared box clears it)
    const profile: Record<string, string> = { ...payload.profile };
    for (const key of NEW_PROJECT_PROFILE_KEYS) {
      const value = overrides.fields[key];
      if (typeof value === "string") profile[key] = value;
    }
    const merged = cleanIncoming({ ...payload, ...edits, profile, summary: row.summary });
    if (!merged.ok) throw new UserError(merged.error);
    payload = merged.value.payload;
  }
  const projectId = overrides.projectId === undefined ? row.projectId : overrides.projectId;
  // A new project is not about an existing one: claim the proposal FIRST (so a double click can't create it twice), then
  // create the project, and put the proposal back to pending if that fails.
  if (payload.kind === "NEW_PROJECT") {
    const forCustomer = overrides.customerId === undefined ? row.customerId : overrides.customerId;
    const first = await prisma.suggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date() } });
    if (first.count === 0) throw new UserError("That suggestion was already handled.");
    try {
      const made = await createFromProposal(payload, forCustomer);
      await prisma.suggestion.update({ where: { id }, data: { resultNote: made.note, projectId: made.id, customerId: forCustomer, payload: payload as unknown as Prisma.InputJsonObject } });
      return made.note;
    } catch (error) {
      await prisma.suggestion.updateMany({ where: { id, status: "APPROVED", resultNote: null }, data: { status: "PENDING", reviewedAt: null } });
      throw error;
    }
  }

  // The customer: that of the project when there is one; otherwise the one picked (or matched at intake). With no
  // project, a note or action item filed under a customer shows on that customer's page.
  let customerId: string | null;
  if (projectId) {
    customerId = (await prisma.project.findUnique({ where: { id: projectId }, select: { customerId: true } }))?.customerId ?? null;
  } else {
    customerId = overrides.customerId === undefined ? row.customerId : overrides.customerId;
  }
  const customer = customerId ? await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }) : null;
  if (customerId && !customer) throw new UserError("That customer no longer exists.");

  // An action item creates a TASK. Claim the proposal first (so a double click can't create it twice), then create the
  // task, and put the proposal back to pending if that fails. It needs a customer (that of the project, or the one picked).
  if (payload.kind === "ACTION_ITEM") {
    if (!customer) throw new UserError("Pick the customer (or a project) this task is for first.");
    const first = await prisma.suggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date() } });
    if (first.count === 0) throw new UserError("That suggestion was already handled.");
    try {
      const topic = await createTaskFromAction(row, payload, customer.id, projectId ?? null);
      const made = `${TASK_RESULT_PREFIX}: "${topic}". Open it on the Tasks tab.`;
      await prisma.suggestion.update({ where: { id }, data: { resultNote: made, projectId: projectId ?? null, customerId: customer.id, payload: payload as unknown as Prisma.InputJsonObject } });
      return made;
    } catch (error) {
      await prisma.suggestion.updateMany({ where: { id, status: "APPROVED", resultNote: null }, data: { status: "PENDING", reviewedAt: null } });
      throw error;
    }
  }

  const note = await applyPayload(payload, projectId, row.sourceLink, projectId ? null : (customer?.name ?? null));  // claim it only if it is still pending, so a double click can't apply it twice
  const claimed = await prisma.suggestion.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: new Date(), resultNote: note, projectId: projectId ?? null, customerId: customer?.id ?? null, payload: payload as unknown as Prisma.InputJsonObject },
  });
  if (claimed.count === 0) throw new UserError("That suggestion was already handled.");
  return note;
}

// Confirming the task form of an action item: the task is created from what the person typed (topic, details, owner,
// follow-up date, project...), through the same validation as any new task, and the proposal is marked approved in the
// same step. The proposal is claimed first so a double click can't make two tasks, and goes back to pending if the task
// can't be created (a missing customer, a project of another customer...).
export async function approveSuggestionAsTask(id: string, input: Partial<Record<keyof TaskInput, unknown>>): Promise<string> {
  const row = await prisma.suggestion.findUnique({ where: { id }, select: { status: true, kind: true } });
  if (!row) throw new UserError("That suggestion no longer exists.");
  if (row.status !== "PENDING") throw new UserError("That suggestion was already handled.");
  if (row.kind !== "ACTION_ITEM") throw new UserError("Only an action item is turned into a task this way.");
  const cleaned = cleanTask(input);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const first = await prisma.suggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date() } });
  if (first.count === 0) throw new UserError("That suggestion was already handled.");
  try {
    await createTask(input);
    const made = `${TASK_RESULT_PREFIX}: "${cleaned.value.topic}". Open it on the Tasks tab.`;
    await prisma.suggestion.update({ where: { id }, data: { resultNote: made, projectId: cleaned.value.projectId, customerId: cleaned.value.customerId } });
    return made;
  } catch (error) {
    await prisma.suggestion.updateMany({ where: { id, status: "APPROVED", resultNote: null }, data: { status: "PENDING", reviewedAt: null } });
    throw error;
  }
}

export async function rejectSuggestion(id: string): Promise<void> {
  const claimed = await prisma.suggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", reviewedAt: new Date() } });
  if (claimed.count === 0) throw new UserError("That suggestion was already handled or no longer exists.");
}
