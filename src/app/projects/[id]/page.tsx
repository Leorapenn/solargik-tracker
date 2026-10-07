import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { PhaseCard } from "@/components/PhaseCard";
import { ProjectStatusSelect } from "@/components/ProjectStatusSelect";
import { ProjectEditor } from "@/components/ProjectEditor";
import { FlagsEditor } from "@/components/FlagsEditor";
import { matchesFilters, parseRowFilters } from "@/lib/rowFilters";
import { ProjectProfileCard } from "@/components/ProjectProfileCard";
import { linkedValues } from "@/lib/projectProfile";
import { getContractSigningDate, getProfile } from "@/server/services/projectProfile";
import { getPaymentData } from "@/server/services/payments";
import { money, projectContract } from "@/lib/payments";
import { capacityKwp, formatKwp } from "@/lib/capacity";
import { PaymentsCard } from "@/components/PaymentsCard";
import { derivePhaseStatus } from "@/lib/phaseStatus";
import type { Department } from "@prisma/client";
import { knownFlags } from "@/server/services/flags";
import { SubStageTable, type SubStageRow } from "@/components/SubStageTable";
import { phaseLabel } from "@/lib/phases";
import { departmentLabel } from "@/lib/departments";
import { LIFECYCLE_NOTES, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { rollupPhase } from "@/lib/phaseRollup";
import { formatDate, toDateInputValue, todayInAppTz } from "@/lib/dates";
import { parseSort, sortRows } from "@/lib/sort";
import { projectSummary } from "@/lib/statusUpdate";
import { PhaseUpdate } from "@/components/PhaseUpdate";
import { ProjectSummary } from "@/components/ProjectSummary";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";
// Reading a contract with Claude (a Server Action used on this page) can take a while.
export const maxDuration = 60;

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

  const [project, people, flagSuggestions, profile, payments, contractSigned] = await Promise.all([
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
    getProfile(id),
    getPaymentData(id),
    getContractSigningDate(id),
  ]);

  if (!project) notFound();

  const today = todayInAppTz();
  const todayIso = toDateInputValue(today);
  // The summary always looks at every item, whatever filter the table below has on.
  const summary = projectSummary(
    project.statusSummaryOverride,
    project.phases.map((phase) => ({
      name: phase.name,
      status: phase.status,
      done: phase.subStages.filter((s) => s.status === "DONE").length,
      total: phase.subStages.length,
    })),
  );
  const filters = parseRowFilters(query);
  // The phase cards follow the department filter only; the other column filters narrow the table below.
  const departments = filters.dept;
  const shown = (s: { department: Department }) => departments.length === 0 || departments.includes(s.department);

  const allRows: SubStageRow[] = project.phases.flatMap((phase) =>
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
      statusUpdate: s.statusUpdate,
      statusUpdateAt: s.statusUpdateAt ? toDateInputValue(s.statusUpdateAt) : null,
      order: s.order,
    })),
  );

  const rows = allRows.filter((r) => matchesFilters(r, filters, todayIso));

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
        <ProjectStatusSelect
          projectId={project.id}
          projectName={project.name}
          value={project.lifecycle}
          lockedFields={project.lockedFields}
          mondayStage={project.mondayStage}
          mondayStatus={project.mondayStatus}
        />
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
        {capacityKwp(project) === null ? "—" : `${formatKwp(capacityKwp(project))} kWp`} ·{" "}
        {(() => {
          const contract = projectContract(project);
          return contract.amount ? money(contract.amount, contract.currency) : "—";
        })()}
      </p>

      <ProjectEditor
        project={{
          id: project.id,
          name: project.name,
          country: project.country ?? "",
          capacityKwp: capacityKwp(project)?.toString() ?? "",
          contractValue: project.contractValue ? String(Number(project.contractValue)) : "",
          lifecycle: project.lifecycle,
          lockedFields: project.lockedFields,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: -4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Flags</span>
        <FlagsEditor compact kind="project" id={project.id} name={project.name} flags={project.flags} suggestions={flagSuggestions} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {project.phases.map((phase) => {
          const items = phase.subStages.filter(shown);
          // With a department filter, a phase with none of that department's items has nothing to show.
          if (items.length === 0 && departments.length > 0) return null;
          return (
            <PhaseCard
              key={phase.id}
              name={phase.name}
              status={departments.length > 0 ? (derivePhaseStatus(items.map((s) => s.status)) ?? phase.status) : phase.status}
              rollup={rollupPhase(
                items.map((s) => ({
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
          );
        })}
      </div>
      <details open style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Status update</summary>
        <div style={{ ...cardStyle, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 6 }}>
              Project summary
            </div>
            <ProjectSummary projectId={project.id} text={summary.text} manual={summary.manual} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {project.phases.map((phase) => (
              <div
                key={phase.id}
                style={{ display: "grid", gridTemplateColumns: "minmax(130px, 170px) 1fr", gap: 16, padding: "12px 0", borderTop: `1px solid ${ROW_DIVIDER}` }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{phaseLabel(phase.name)}</div>
                <PhaseUpdate
                  phaseId={phase.id}
                  text={phase.statusUpdate}
                  updatedOn={phase.statusUpdateAt ? formatDate(phase.statusUpdateAt) : null}
                  editable
                  label={`${phaseLabel(phase.name)} status update for ${project.name}`}
                />
              </div>
            ))}
          </div>
        </div>
      </details>
      <details open style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Project profile</summary>
        <ProjectProfileCard
          projectId={project.id}
          initial={profile}
          people={people}
          contractReading={Boolean(process.env.ANTHROPIC_API_KEY)}
          contractSigned={contractSigned}
          linked={linkedValues(
            project.phases.flatMap((phase) =>
              phase.subStages.map((s) => ({
                phaseName: phase.name,
                name: s.name,
                status: s.status,
                completedAt: s.completedAt ? toDateInputValue(s.completedAt) : null,
              })),
            ),
          )}
        />
      </details>

      {payments && <PaymentsCard projectId={project.id} data={payments} todayIso={todayIso} />}

      <details style={{ color: TEXT_MUTED, fontSize: "0.85rem", marginTop: -6 }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 600 }}>
          How phases and dates work
          {departments.length > 0 && ` (cards show only the ${departments.map(departmentLabel).join(" / ")} items)`}
        </summary>
        <p style={{ margin: "6px 0 0", maxWidth: 820 }}>
          Phase status, dates and owners update automatically from the items below: a phase is Done when all its items
          are, Blocked if any is blocked, In progress once any has started. Start and completed dates are recorded
          automatically when an item&apos;s status changes, and every change is kept in a history log. Phases
          don&apos;t wait for each other.
        </p>
      </details>

      <SubStageTable
        rows={sortedRows}
        people={people}
        sort={sort}
        basePath={`/projects/${project.id}`}
        params={query}
        todayIso={todayIso}
        totalCount={allRows.length}
      />
    </main>
  );
}
