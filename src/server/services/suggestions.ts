import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { cleanMilestone, type MilestoneInput } from "@/lib/payments";
import { cleanStatusText } from "@/lib/statusUpdate";
import { KIND_LABELS, MAX_PER_REQUEST, cleanIncoming, describePayload, matchProject, suggestionFingerprint, type Payload, type SuggestionKind } from "@/lib/suggestions";
import { setPhaseUpdate, setSubStageUpdate } from "@/server/services/statusUpdates";

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

async function applyPayload(payload: Payload, projectId: string | null): Promise<string> {
  if (payload.kind === "NOTE") return "Noted.";
  if (!projectId) throw new UserError("Choose which project this belongs to first.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, customerId: true } });
  if (!project) throw new UserError("That project no longer exists.");

  if (payload.kind === "PHASE_UPDATE") {
    const phase = await prisma.phase.findUnique({ where: { projectId_name: { projectId, name: payload.phase } }, select: { id: true } });
    if (!phase) throw new UserError(`${project.name} has no ${payload.phase} phase.`);
    await setPhaseUpdate(phase.id, payload.text);
    return "Phase update saved.";
  }

  if (payload.kind === "ITEM_UPDATE") {
    const items = await prisma.subStage.findMany({
      where: { phase: { projectId, ...(payload.phase ? { name: payload.phase } : {}) } },
      select: { id: true, name: true },
    });
    const exact = items.filter((i) => same(i.name, payload.item));
    const found = exact.length > 0 ? exact : items.filter((i) => i.name.toLowerCase().includes(payload.item.toLowerCase()));
    if (found.length === 0) throw new UserError(`${project.name} has no item called "${payload.item}".`);
    if (found.length > 1) throw new UserError(`Several items match "${payload.item}". Reject this and add the update on the project page.`);
    await setSubStageUpdate(found[0].id, payload.text);
    return `Update saved on "${found[0].name}".`;
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
    const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
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
export async function approveSuggestion(id: string, overrides: { projectId?: string | null; text?: string } = {}): Promise<string> {
  const row = await prisma.suggestion.findUnique({ where: { id } });
  if (!row) throw new UserError("That suggestion no longer exists.");
  if (row.status !== "PENDING") throw new UserError("That suggestion was already handled.");

  let payload = row.payload as unknown as Payload;
  if (overrides.text !== undefined && (payload.kind === "PHASE_UPDATE" || payload.kind === "ITEM_UPDATE" || payload.kind === "NOTE")) {
    const cleaned = cleanStatusText(overrides.text);
    if (!cleaned.ok) throw new UserError(cleaned.error);
    if (!cleaned.value) throw new UserError("The text can't be empty. Reject the suggestion instead.");
    payload = { ...payload, text: cleaned.value };
  }
  const projectId = overrides.projectId === undefined ? row.projectId : overrides.projectId;

  const note = await applyPayload(payload, projectId);
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
