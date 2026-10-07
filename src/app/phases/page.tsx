import type { PhaseName, StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/statusColors";
import { rollupPhase } from "@/lib/phaseRollup";
import { derivePhaseStatus } from "@/lib/phaseStatus";
import { parseDepartments } from "@/lib/departmentFilter";
import { DepartmentFilterBar } from "@/components/DepartmentFilterBar";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { parseSort, sortRows } from "@/lib/sort";
import { PhasesMatrix, type MatrixCell, type MatrixRow } from "@/components/PhasesMatrix";
import {
  NAVY,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const STATUS_ORDER: StageStatus[] = ["DONE", "IN_PROGRESS", "BLOCKED", "NOT_STARTED"];
// For sorting a phase column: further along sorts higher.
const PROGRESS_RANK: Record<StageStatus, number> = { NOT_STARTED: 0, BLOCKED: 1, IN_PROGRESS: 2, DONE: 3 };

export default async function PhasesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const today = todayInAppTz();
  const departments = parseDepartments(params);

  const [projects, people] = await Promise.all([
    prisma.project.findMany({
      include: {
        customer: { select: { name: true } },
        phases: {
          select: {
            id: true,
            name: true,
            status: true,
            statusUpdate: true,
            statusUpdateAt: true,
            ownerId: true,
            owner: { select: { name: true } },
            subStages: {
              // With a department filter, only those departments' items count towards each phase.
              where: departments.length > 0 ? { department: { in: departments } } : undefined,
              select: {
                status: true,
                targetDate: true,
                startedAt: true,
                completedAt: true,
                naDates: true,
                owner: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);

  const rows: (MatrixRow & { sortDates: Partial<Record<PhaseName, number>> })[] = projects.map((project) => {
    const cells = {} as Record<PhaseName, MatrixCell | null>;
    const sortDates: Partial<Record<PhaseName, number>> = {};
    for (const name of PHASE_ORDER) {
      const phase = project.phases.find((p) => p.name === name);
      if (!phase || (departments.length > 0 && phase.subStages.length === 0)) {
        cells[name] = null;
        continue;
      }
      const status = departments.length > 0 ? (derivePhaseStatus(phase.subStages.map((s) => s.status)) ?? phase.status) : phase.status;
      const rollup = rollupPhase(
        phase.subStages.map((s) => ({
          status: s.status,
          ownerName: s.owner?.name ?? null,
          targetDate: s.targetDate,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          naDates: s.naDates,
        })),
        today,
      );
      cells[name] = {
        phaseId: phase.id,
        status,
        done: rollup.done,
        total: rollup.total,
        startedAt: iso(rollup.startedAt),
        completedAt: iso(rollup.completedAt),
        targetDate: iso(rollup.targetDate),
        owners: rollup.owners,
        doneWithoutDate: rollup.doneWithoutDate,
        overdue: rollup.overdueSince !== null,
        statusUpdate: phase.statusUpdate,
        statusUpdateAt: iso(phase.statusUpdateAt),
        ownerId: phase.ownerId,
        ownerName: phase.owner?.name ?? null,
      };
      const date = rollup.completedAt ?? rollup.startedAt ?? rollup.targetDate;
      sortDates[name] = date ? date.getTime() : 0;
    }
    return {
      projectId: project.id,
      projectName: project.name,
      customerName: project.customer.name,
      lifecycle: project.lifecycle,
      cells,
      sortDates,
    };
  });

  type Row = (typeof rows)[number];
  const accessors: Record<string, (r: Row) => string | number | null> = {
    project: (r) => r.projectName,
    customer: (r) => r.customerName,
  };
  for (const phase of PHASE_ORDER) {
    // status first (further along = higher), then the date shown in the cell
    accessors[phase] = (r) => {
      const cell = r.cells[phase];
      return cell ? PROGRESS_RANK[cell.status] * 1e14 + (r.sortDates[phase] ?? 0) : null;
    };
  }
  const sort = parseSort(params, Object.keys(accessors), { key: "project", dir: "asc" });
  const sorted = sortRows(rows, accessors, sort).map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    customerName: row.customerName,
    lifecycle: row.lifecycle,
    cells: row.cells,
  }));

  const summaries = PHASE_ORDER.map((phase) => {
    const counts = { DONE: 0, IN_PROGRESS: 0, BLOCKED: 0, NOT_STARTED: 0 } as Record<StageStatus, number>;
    let total = 0;
    for (const row of rows) {
      const cell = row.cells[phase];
      // with a filter on, projects with none of those items don't count
      if (!cell && departments.length > 0) continue;
      total += 1;
      counts[cell?.status ?? "NOT_STARTED"] += 1;
    }
    return { phase, counts, total };
  });

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Phases</h1>
        <div style={pageSubtitleStyle}>
          Where every project stands across the six delivery phases (hover a phase for its owner and dates). Tick phases to update them
          in bulk, or open a project to edit its items one by one.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        {summaries.map(({ phase, counts, total }) => {
          return (
            <div key={phase} style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_MUTED }}>
                {phaseLabel(phase)}
              </div>
              <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: NAVY }}>
                {counts.DONE}
                <span style={{ fontSize: 15, fontWeight: 600, color: TEXT_MUTED }}> / {total} done</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#EEF0F5", margin: "10px 0" }}>
                {STATUS_ORDER.filter((s) => s !== "NOT_STARTED").map((status) => (
                  <div
                    key={status}
                    title={`${STATUS_LABELS[status]}: ${counts[status]}`}
                    style={{ width: total ? `${(counts[status] / total) * 100}%` : 0, background: STATUS_COLORS[status] }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED }}>
                {counts.IN_PROGRESS} in progress ·{" "}
                <span style={{ color: counts.BLOCKED > 0 ? "#B3261E" : undefined, fontWeight: counts.BLOCKED > 0 ? 700 : 400 }}>
                  {counts.BLOCKED} blocked
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <DepartmentFilterBar basePath="/phases" params={params} selected={departments} />

      <PhasesMatrix rows={sorted} people={people} sort={sort} params={params} departments={departments} />
    </main>
  );
}
