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
import { uploadMode } from "@/server/uploads";
import { linkedValues } from "@/lib/projectProfile";
import { getContractSigningDate, getProfile } from "@/server/services/projectProfile";
import { getPaymentData } from "@/server/services/payments";
import { money, projectContract } from "@/lib/payments";
import { capacityKwp, formatKwp } from "@/lib/capacity";
import { parseFlagColors, parseFlagNotes } from "@/lib/flags";
import { groupContacts } from "@/lib/contacts";
import { CustomerManager } from "@/components/CustomerManager";
import { SharePointLink } from "@/components/SharePointLink";
import { WarrantyCard } from "@/components/WarrantyCard";
import { describeLeft, warrantyLines } from "@/lib/warranty";
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
import { hrefWith, parseSort, sortRows } from "@/lib/sort";
import { PROJECT_TABS, isProjectTab, type ProjectTab } from "@/lib/projectTabs";
import { projectSummary } from "@/lib/statusUpdate";
import { PhaseUpdate } from "@/components/PhaseUpdate";
import { ProjectSummary } from "@/components/ProjectSummary";
import { CorrespondenceCard } from "@/components/CorrespondenceCard";
import { listProjectCorrespondence } from "@/server/services/correspondence";
import { listOpenTasksForProject } from "@/server/services/tasks";
import { listShipments } from "@/server/services/shipments";
import { ShipmentsCard } from "@/components/ShipmentsCard";
import { DeliverySuggestions } from "@/components/DeliverySuggestions";
import { getDeliveryProposals } from "@/server/services/deliveryProposals";
import { TasksCard } from "@/components/TasksCard";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageTitleStyle, secondaryButton } from "@/lib/theme";

export const dynamic = "force-dynamic";
// Reading a contract with Claude (a Server Action used on this page) can take a while.
export const maxDuration = 60;

type Params = Record<string, string | string[] | undefined>;
const STATUS_RANK = { NOT_STARTED: 0, IN_PROGRESS: 1, BLOCKED: 2, DONE: 3, NOT_APPLICABLE: 4 } as const;

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

  const [project, people, flagSuggestions, profile, payments, contractSigned, correspondence, openTasks, shipments, deliveryProposals] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        phases: {
          orderBy: { order: "asc" },
          include: {
            owner: { select: { id: true, name: true } },
            subStages: { orderBy: { order: "asc" }, include: { owner: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    knownFlags(),
    getProfile(id),
    getPaymentData(id),
    getContractSigningDate(id),
    listProjectCorrespondence(id),
    listOpenTasksForProject(id).catch(() => []),
    listShipments(id).catch(() => []), // the shipments never break the page
    getDeliveryProposals(id).catch(() => []), // neither do the suggested Delivery sub-stages
  ]);

  if (!project) notFound();

  // the customer's projects, for the project box of the task form on the Tasks card
  const customerProjects = await prisma.project.findMany({ where: { customerId: project.customerId }, orderBy: { name: "asc" }, select: { id: true, name: true, customerId: true } });

  // the customer's people, for picking the customer-side project manager
  const customerPeople = groupContacts(
    (await prisma.contact.findMany({ where: { customerId: project.customerId } })).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      englishLevel: c.englishLevel,
      source: c.source,
      projectId: null,
      projectName: null,
    })),
  ).map((p) => ({ name: p.name, email: p.email ?? "", phone: p.phone ?? "" }));

  const today = todayInAppTz();
  const todayIso = toDateInputValue(today);
  // The summary always looks at every item, whatever filter the table below has on.
  const summary = projectSummary(
    project.statusSummaryOverride,
    project.phases.map((phase) => ({
      name: phase.name,
      status: phase.status,
      done: phase.subStages.filter((s) => s.status === "DONE").length,
      total: phase.subStages.filter((s) => s.status !== "NOT_APPLICABLE").length, // N/A items don't count
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

  // The page is split into tabs (the address says which: ?tab=). It opens on the profile. A sort or filter of the items table in the
  // address, without a tab, means the table's tab (a saved view carries no tab).
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: ProjectTab = isProjectTab(rawTab) ? rawTab : Object.keys(query).some((k) => k !== "tab") ? "phases" : "profile";
  const base = `/projects/${project.id}`;
  const badges: Partial<Record<ProjectTab, number>> = { updates: openTasks.length, shipments: deliveryProposals.length };

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
        <FlagsEditor compact kind="project" id={project.id} name={project.name} flags={project.flags} colors={parseFlagColors(project.flagColors)} notes={parseFlagNotes(project.flagNotes)} suggestions={flagSuggestions} />
      </div>

      <nav aria-label="Project sections" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${ROW_DIVIDER}` }}>
        {PROJECT_TABS.map((t) => {
          const active = t.key === tab;
          const badge = badges[t.key] ?? 0;
          return (
            <Link
              key={t.key}
              href={hrefWith(base, query, { tab: t.key })}
              aria-current={active ? "page" : undefined}
              style={{
                padding: "10px 16px",
                fontSize: 14.5,
                fontWeight: active ? 700 : 600,
                color: active ? NAVY : TEXT_MUTED,
                textDecoration: "none",
                borderBottom: `3px solid ${active ? NAVY : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              {badge > 0 && (
                <span style={{ marginLeft: 8, background: "#F59E0B", color: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "1px 7px" }}>{badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {tab === "profile" && (
        <>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <SharePointLink projectId={project.id} link={project.sharepointLink} />
            <CustomerManager
              projectId={project.id}
              current={{ name: project.customerManagerName ?? "", email: project.customerManagerEmail ?? "", phone: project.customerManagerPhone ?? "" }}
              contacts={customerPeople}
            />
          </div>
          <ProjectProfileCard
            projectId={project.id}
            initial={profile}
            people={people}
            contractReading={Boolean(process.env.ANTHROPIC_API_KEY)}
            uploadMode={uploadMode()}
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
          <div>
            <Link href={hrefWith(base, {}, { tab: "phases" })} style={{ ...secondaryButton, textDecoration: "none", display: "inline-block" }}>
              Go to phases and items →
            </Link>
          </div>
        </>
      )}

      {tab === "phases" && (
        <>
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
              owner={{ phaseId: phase.id, ownerId: phase.ownerId, ownerName: phase.owner?.name ?? null, people }}
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

      <SubStageTable
        rows={sortedRows}
        people={people}
        sort={sort}
        basePath={`/projects/${project.id}`}
        params={query}
        todayIso={todayIso}
        totalCount={allRows.length}
      />
        </>
      )}

      {tab === "updates" && (
        <>
      {/* the status update card is narrower now; the approved notes and action items from emails sit beside it */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", marginTop: 4 }}>
      <details open style={{ flex: "3 1 440px", minWidth: 0 }}>
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
      <details open style={{ flex: "2 1 340px", minWidth: 0 }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
          Correspondence and actions{correspondence.length > 0 ? ` (${correspondence.length})` : ""}
        </summary>
        <CorrespondenceCard items={correspondence} />
      </details>
      <details open style={{ flex: "1 1 280px", minWidth: 0 }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
          Tasks{openTasks.length > 0 ? ` (${openTasks.length} open)` : ""}
        </summary>
        <TasksCard
          tasks={openTasks}
          todayIso={todayIso}
          empty={`No open tasks for this project.`}
          moreHref={`/tasks?customer=${project.customerId}`}
          showProject={false}
          heading={false}
          customerId={project.customerId}
          customerName={project.customer.name}
          projectId={project.id}
          customers={[{ id: project.customerId, name: project.customer.name }]}
          projects={customerProjects}
          people={people}
        />
      </details>
      </div>
        </>
      )}

      {tab === "shipments" && (
        <>
          {/* A manager's decision: it only appears when the shipments say a Delivery item is complete (the tab carries a badge then). */}
          <DeliverySuggestions projectId={project.id} proposals={deliveryProposals} />
          <h2 style={{ margin: "4px 0 0", fontSize: 17, color: NAVY }}>Shipments{shipments.length > 0 ? ` (${shipments.length})` : ""}</h2>
          <ShipmentsCard projectId={project.id} shipments={shipments} />
        </>
      )}

      {tab === "payments" &&
        (payments ? (
          <PaymentsCard projectId={project.id} data={payments} todayIso={todayIso} />
        ) : (
          <div style={{ ...cardStyle, padding: 20, color: TEXT_MUTED }}>
            No payment information for this project yet.{" "}
            <Link href={`/payments/${project.id}`} style={{ color: NAVY, fontWeight: 700 }}>
              Open in Payments
            </Link>
          </div>
        ))}

      {tab === "warranty" && (
      <WarrantyCard
        projectId={project.id}
        structuralYears={project.warrantyStructuralYears}
        driveYears={project.warrantyDriveYears}
        rows={warrantyLines(
          {
            items: project.phases.flatMap((phase) => phase.subStages.map((s) => ({ name: s.name, status: s.status, completedAt: s.completedAt ? toDateInputValue(s.completedAt) : null }))),
            structuralYears: project.warrantyStructuralYears,
            driveYears: project.warrantyDriveYears,
          },
          todayIso,
        ).map((l) => ({ ...l, leftText: l.daysLeft === null || !l.expiresOn ? null : describeLeft(l.daysLeft, todayIso, l.expiresOn) }))}
      />
      )}
    </main>
  );
}
