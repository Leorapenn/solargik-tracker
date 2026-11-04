import type { Prisma, ProjectLifecycle, StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phaseLabel } from "@/lib/phases";
import { toDateInputValue } from "@/lib/dates";
import { projectSummary } from "@/lib/statusUpdate";
import { STATUS_LABELS } from "@/lib/statusColors";
import type { DateRange, ExportRow } from "@/lib/weeklyUpdates";
import { AGENDA_KINDS, shapeEmailEntry, sortEmailEntries, stageOf, type EmailEntry } from "@/lib/agenda";

export type UpdateEntry = {
  level: "Phase" | "Item";
  phase: string; // "01 Design"
  item: string | null;
  status: StageStatus;
  owner: string | null;
  text: string;
  date: string; // YYYY-MM-DD
};

export type ProjectUpdates = {
  id: string;
  name: string;
  customer: string;
  lifecycle: ProjectLifecycle;
  stage: string; // the project's monday.com status (Logistics, Design...), for grouping the agenda
  summary: { text: string; manual: boolean };
  entries: UpdateEntry[]; // phase and item updates typed on the project
  emails: EmailEntry[]; // proposals from emails that a person approved, by the day of the email
};

// The email proposals approved for the range: by the day of the email, else (no date on it) the day it was approved.
// The end day is included (the next midnight is the limit).
function emailWhere(range: DateRange): Prisma.SuggestionWhereInput {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(new Date(`${range.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
  return {
    status: "APPROVED",
    kind: { in: AGENDA_KINDS },
    OR: [{ sourceReceivedAt: { gte: start, lt: end } }, { sourceReceivedAt: null, reviewedAt: { gte: start, lt: end } }],
  };
}

const EMAIL_SELECT = { id: true, kind: true, summary: true, sourceSubject: true, sourceLink: true, sourceReceivedAt: true, reviewedAt: true, createdAt: true } as const;

// Approved proposals about a customer in general (no project) for the range: shown after the stages.
export async function getGeneralEmailUpdates(range: DateRange): Promise<{ customer: string; emails: EmailEntry[] }[]> {
  const rows = await prisma.suggestion.findMany({ where: { ...emailWhere(range), projectId: null, customerId: { not: null } }, select: { ...EMAIL_SELECT, customer: { select: { name: true } } } });
  const byCustomer = new Map<string, EmailEntry[]>();
  for (const r of rows) {
    const entry = shapeEmailEntry(r);
    if (entry && r.customer) byCustomer.set(r.customer.name, [...(byCustomer.get(r.customer.name) ?? []), entry]);
  }
  return [...byCustomer.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([customer, emails]) => ({ customer, emails: sortEmailEntries(emails) }));
}

// Every project with a phase or sub-phase update dated inside the range (inclusive), or an approved email proposal, with those
// updates. Only the latest text of each phase/item is kept, so an update that was changed again later shows its newest
// text and date. Newest first within a project.
export async function getUpdatesInRange(range: DateRange): Promise<ProjectUpdates[]> {
  const between = { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) };
  const emailRows = await prisma.suggestion.findMany({ where: { ...emailWhere(range), projectId: { not: null } }, select: { ...EMAIL_SELECT, projectId: true } });
  const emailsByProject = new Map<string, EmailEntry[]>();
  for (const r of emailRows) {
    const entry = shapeEmailEntry(r);
    if (entry && r.projectId) emailsByProject.set(r.projectId, [...(emailsByProject.get(r.projectId) ?? []), entry]);
  }
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { phases: { some: { statusUpdateAt: between } } },
        { phases: { some: { subStages: { some: { statusUpdateAt: between } } } } },
        { id: { in: [...emailsByProject.keys()] } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      lifecycle: true,
      mondayStatus: true,
      statusSummaryOverride: true,
      customer: { select: { name: true } },
      phases: {
        orderBy: { order: "asc" },
        select: {
          name: true,
          status: true,
          statusUpdate: true,
          statusUpdateAt: true,
          subStages: {
            orderBy: { order: "asc" },
            select: { name: true, status: true, statusUpdate: true, statusUpdateAt: true, owner: { select: { name: true } } },
          },
        },
      },
    },
  });

  const inRange = (d: Date | null) => d !== null && d >= between.gte && d <= between.lte;

  return projects.map((p) => {
    const entries: UpdateEntry[] = [];
    for (const phase of p.phases) {
      const label = phaseLabel(phase.name);
      if (phase.statusUpdate && inRange(phase.statusUpdateAt)) {
        entries.push({ level: "Phase", phase: label, item: null, status: phase.status, owner: null, text: phase.statusUpdate, date: toDateInputValue(phase.statusUpdateAt) });
      }
      for (const s of phase.subStages) {
        if (s.statusUpdate && inRange(s.statusUpdateAt)) {
          entries.push({ level: "Item", phase: label, item: s.name, status: s.status, owner: s.owner?.name ?? null, text: s.statusUpdate, date: toDateInputValue(s.statusUpdateAt) });
        }
      }
    }
    // newest first; the sort is stable, so phase / item order is kept within a day
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return {
      id: p.id,
      name: p.name,
      customer: p.customer.name,
      lifecycle: p.lifecycle,
      stage: stageOf(p.mondayStatus),
      emails: sortEmailEntries(emailsByProject.get(p.id) ?? []),
      summary: projectSummary(
        p.statusSummaryOverride,
        p.phases.map((ph) => ({ name: ph.name, status: ph.status, done: ph.subStages.filter((s) => s.status === "DONE").length, total: ph.subStages.filter((s) => s.status !== "NOT_APPLICABLE").length })),
      ),
      entries,
    };
  });
}

export function toExportRows(projects: ProjectUpdates[]): ExportRow[] {
  return projects.flatMap((p) => [
    ...p.entries.map((e) => ({
      project: p.name,
      customer: p.customer,
      level: e.level,
      phase: e.phase,
      item: e.item ?? "",
      status: STATUS_LABELS[e.status],
      owner: e.owner ?? "",
      update: e.text,
      date: e.date,
    })),
    // an email proposal: the kind goes in "Item", the headline is the update
    ...p.emails.map((e) => ({ project: p.name, customer: p.customer, level: "Email" as const, phase: p.stage, item: e.label, status: "", owner: "", update: e.summary, date: e.date })),
  ]);
}
