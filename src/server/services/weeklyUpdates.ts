import type { ProjectLifecycle, StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phaseLabel } from "@/lib/phases";
import { toDateInputValue } from "@/lib/dates";
import { projectSummary } from "@/lib/statusUpdate";
import { STATUS_LABELS } from "@/lib/statusColors";
import type { DateRange, ExportRow } from "@/lib/weeklyUpdates";

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
  summary: { text: string; manual: boolean };
  entries: UpdateEntry[];
};

// Every project with a phase or sub-phase update dated inside the range (inclusive), with those updates.
// Only the latest text of each phase/item is kept, so an update that was changed again later shows its newest
// text and date. Newest first within a project.
export async function getUpdatesInRange(range: DateRange): Promise<ProjectUpdates[]> {
  const between = { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) };
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ phases: { some: { statusUpdateAt: between } } }, { phases: { some: { subStages: { some: { statusUpdateAt: between } } } } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      lifecycle: true,
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
      summary: projectSummary(
        p.statusSummaryOverride,
        p.phases.map((ph) => ({ name: ph.name, status: ph.status, done: ph.subStages.filter((s) => s.status === "DONE").length, total: ph.subStages.length })),
      ),
      entries,
    };
  });
}

export function toExportRows(projects: ProjectUpdates[]): ExportRow[] {
  return projects.flatMap((p) =>
    p.entries.map((e) => ({
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
  );
}
