import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { PhaseCard } from "@/components/PhaseCard";
import { LifecycleBadge } from "@/components/LifecycleBadge";
import { ProjectEditor } from "@/components/ProjectEditor";
import { FlagsEditor } from "@/components/FlagsEditor";
import { knownFlags } from "@/server/services/flags";
import { SubStageTable, type SubStageRow } from "@/components/SubStageTable";
import { phaseLabel } from "@/lib/phases";
import { departmentLabel } from "@/lib/departments";
import { LIFECYCLE_NOTES, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { rollupPhase } from "@/lib/phaseRollup";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { parseSort, sortRows } from "@/lib/sort";
import { NAVY, TEXT_MUTED, pageStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const STATUS_RANK = { NOT_STARTED: 0, IN_PROGRESS: 1, BLOCKED: 2, DONE: 3 } as const;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requirePageAuth();
  const { id } = await params;
  const query = await searchParams;

  const [project, people, flagSuggestions] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        phases: {
          orderBy: { order: "asc" },
          include: { subStages: { orderBy: { order: "asc" }, include: { owner: { select: { id: true, name: true } } } } },
        },
      },
    }),
    prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    knownFlags(),
  ]);

  if (!project) notFound();

  const today = todayInAppTz();

  const rows: SubStageRow[] = project.phases.flatMap((phase) =>
    phase.subStages.map((s) => ({
      id: s.id,
      phaseName: phase.name,
      phaseLabel: phaseLabel(phase.name),
      name: s.name,
      department: s.department,
      departmentLabel: departmentLabel(s.department),
      status: s.status,
      ownerId: s.ownerId,
      ownerName: s.owner?.name ?? null,
      targetDate: s.targetDate ? toDateInputValue(s.targetDate) : null,
      startedAt: s.startedAt ? toDateInputValue(s.startedAt) : null,
      completedAt: s.completedAt ? toDateInputValue(s.completedAt) : null,
      naDates: s.naDates,
      order: s.order,
    })),
  );

  const accessors = {
    phase: (r: SubStageRow) => r.order,
    name: (r: SubStageRow) => r.name,
    department: (r: SubStageRow) => r.departmentLabel,
    owner: (r: SubStageRow) => r.ownerName,
    target: (r: SubStageRow) => r.targetDate,
    started: (r: SubStageRow) => r.startedAt,
    completed: (r: SubStageRow) => r.completedAt,
    status: (r: SubStageRow) => STATUS_RANK[r.status],
  };
  const sort = parseSort(query, Object.keys(accessors), { key: "phase", dir: "asc" });
  const sortedRows = sortRows(rows, accessors, sort);

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/projects" style={{ color: NAVY, fontWeight: 600 }}>
          Projects
        </Link>{" "}
        › {project.name}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: -8 }}>
        <h1
          style={{
            ...pageTitleStyle,
            textDecoration: project.lifecycle === "CANCELLED" ? "line-through" : "none",
          }}
        >
          {project.name}
        </h1>
        <LifecycleBadge lifecycle={project.lifecycle} stage={project.mondayStage} status={project.mondayStatus} />
      </div>

      {LIFECYCLE_NOTES[project.lifecycle] && (
        <div
          style={{
            background: LIFECYCLE_STYLES[project.lifecycle].bg,
            color: LIFECYCLE_STYLES[project.lifecycle].text,
            borderRadius: 10,
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 600,
            marginTop: -4,
          }}
        >
          {LIFECYCLE_NOTES[project.lifecycle]}
          {(project.mondayStage || project.mondayStatus) && (
            <span style={{ fontWeight: 400 }}>
              {" "}
              (monday.com — {[project.mondayStage && `Stage: ${project.mondayStage}`, project.mondayStatus && `Status: ${project.mondayStatus}`]
                .filter(Boolean)
                .join(" · ")}
              )
            </span>
          )}
        </div>
      )}

      <p style={{ color: TEXT_MUTED, marginTop: -12 }}>
        Customer{" "}
        <Link href={`/customers/${project.customer.id}`} style={{ color: NAVY, fontWeight: 700 }}>
          {project.customer.name}
        </Link>{" "}
        · {project.country ?? "—"} ·{" "}
        {project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"} MW ·{" "}
        {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
      </p>

      <ProjectEditor
        project={{
          id: project.id,
          name: project.name,
          country: project.country ?? "",
          capacityMw: project.capacityMw ? String(Number(project.capacityMw)) : "",
          contractValue: project.contractValue ? String(Number(project.contractValue)) : "",
          lifecycle: project.lifecycle,
          lockedFields: project.lockedFields,
        }}
      />

      <FlagsEditor kind="project" id={project.id} flags={project.flags} suggestions={flagSuggestions} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {project.phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            name={phase.name}
            status={phase.status}
            rollup={rollupPhase(
              phase.subStages.map((s) => ({
                status: s.status,
                ownerName: s.owner?.name ?? null,
                targetDate: s.targetDate,
                startedAt: s.startedAt,
                completedAt: s.completedAt,
                naDates: s.naDates,
              })),
              today,
            )}
          />
        ))}
      </div>
      <p style={{ color: TEXT_MUTED, fontSize: "0.85rem", marginTop: -8 }}>
        Phase status, dates and owners update automatically from the items below: a phase is Done when all its items
        are, Blocked if any is blocked, In progress once any has started. Start and completed dates are recorded
        automatically when an item&apos;s status changes, and every change is kept in a history log. Phases
        don&apos;t wait for each other.
      </p>

      <SubStageTable
        rows={sortedRows}
        people={people}
        sort={sort}
        basePath={`/projects/${project.id}`}
        params={query}
        todayIso={toDateInputValue(today)}
      />
    </main>
  );
}
