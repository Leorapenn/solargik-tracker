import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ProjectLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread, progressScore } from "@/lib/phaseSpread";
import { LIFECYCLE_ORDER, parseLifecycle } from "@/lib/lifecycle";
import { groupContacts } from "@/lib/contacts";
import { parseSort, sortRows } from "@/lib/sort";
import { SpreadBar } from "@/components/SpreadBar";
import { ProjectStatusSelect } from "@/components/ProjectStatusSelect";
import { LifecycleFilterBar } from "@/components/LifecycleFilterBar";
import { SortSummary } from "@/components/SortSummary";
import { SortTh } from "@/components/SortTh";
import { ContactsCard } from "@/components/ContactsCard";
import { CustomerEditor } from "@/components/CustomerEditor";
import { FlagsEditor } from "@/components/FlagsEditor";
import { FlagChip } from "@/components/FlagChip";
import { colorOf, parseFlagColors } from "@/lib/flags";
import { formatTotals, milestoneProgress, money, projectContract, totalsByCurrency } from "@/lib/payments";
import { MilestoneCell } from "@/components/MilestoneCell";
import { capacityKwp, formatKwp } from "@/lib/capacity";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { knownFlags } from "@/server/services/flags";
import {
  NAVY,
  ORANGE,
  ROW_DIVIDER,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const IMPORTANCE_LABELS = { NORMAL: "Normal", SEMI_STRATEGIC: "Semi-Strategic", STRATEGIC: "Strategic" } as const;

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requirePageAuth();
  const { id } = await params;
  const query = await searchParams;
  const filter = parseLifecycle(typeof query.lifecycle === "string" ? query.lifecycle : undefined);

  const [customer, flagSuggestions] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        aliases: { orderBy: { alias: "asc" } },
        projects: {
          orderBy: { name: "asc" },
          include: {
            phases: { select: { name: true, status: true } },
            milestones: { orderBy: { order: "asc" }, select: { label: true, order: true, status: true, dueDate: true } },
          },
        },
        contacts: { include: { project: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    knownFlags(),
  ]);
  if (!customer) notFound();

  const all = customer.projects;
  const counts = Object.fromEntries(LIFECYCLE_ORDER.map((l) => [l, 0])) as Record<ProjectLifecycle, number>;
  for (const project of all) counts[project.lifecycle] += 1;

  type Project = (typeof all)[number];
  // which milestone each project is up to, with its status
  const todayIso = toDateInputValue(todayInAppTz());
  const progressOf = (p: Project) =>
    milestoneProgress(
      p.milestones.map((m) => ({ label: m.label, order: m.order, status: m.status, dueDate: m.dueDate ? toDateInputValue(m.dueDate) : null })),
      todayIso,
    );
  const accessors = {
    name: (p: Project) => p.name,
    status: (p: Project) => LIFECYCLE_ORDER.indexOf(p.lifecycle),
    spread: (p: Project) => progressScore([p]),
    capacity: (p: Project) => capacityKwp(p),
    contract: (p: Project) => projectContract(p).amount,
    milestone: (p: Project) => progressOf(p).sortKey,
  };
  const sort = parseSort(query, Object.keys(accessors), { key: "name", dir: "asc" });
  const projects = sortRows(filter ? all.filter((p) => p.lifecycle === filter) : all, accessors, sort);

  const people = groupContacts(
    customer.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      englishLevel: c.englishLevel,
      source: c.source,
      projectId: c.project?.id ?? null,
      projectName: c.project?.name ?? null,
    })),
  );

  // each project's contract amount is in its own currency, so the total is shown per currency
  const contractTotals = totalsByCurrency(all.map((p) => projectContract(p)).filter((c) => (c.amount ?? 0) > 0));
  const totalCapacity = all.reduce((sum, p) => sum + (capacityKwp(p) ?? 0), 0);
  const withoutContract = all.filter((p) => projectContract(p).amount === null).length;
  const strategic = customer.importance === "STRATEGIC";
  const basePath = `/customers/${customer.id}`;
  const th = { current: sort, basePath, params: query, style: headCell };

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/customers" style={{ color: NAVY, fontWeight: 600 }}>
          Customers
        </Link>{" "}
        › {customer.name}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={pageTitleStyle}>{customer.name}</h1>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              padding: "5px 12px",
              color: strategic ? "#fff" : NAVY,
              background: strategic ? NAVY : "#E4E6EC",
            }}
          >
            {IMPORTANCE_LABELS[customer.importance]}
          </span>
        </div>
        <div style={pageSubtitleStyle}>
          {all.length} project{all.length === 1 ? "" : "s"} · {people.length} contact{people.length === 1 ? "" : "s"}
        </div>
      </div>

      <CustomerEditor
        customer={{
          id: customer.id,
          name: customer.name,
          importance: customer.importance,
          lockedFields: customer.lockedFields,
        }}
      />

      <FlagsEditor
        kind="customer"
        id={customer.id}
        flags={customer.flags}
        colors={parseFlagColors(customer.flagColors)}
        suggestions={flagSuggestions}
      />

      <LifecycleFilterBar basePath={basePath} params={query} filter={filter} counts={counts} total={all.length} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <SortSummary
            basePath={basePath}
            params={query}
            current={sort}
            labels={{ name: "Project", status: "Status", spread: "Phase spread", capacity: "Capacity", contract: "Contract value", milestone: "Milestone" }}
          />
          {/* A fixed-height box: scrolls down for long lists and sideways on narrow screens; the header stays put. */}
          <div style={{ overflow: "auto", maxHeight: 400 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
              <thead>
                <tr style={{ background: NAVY, color: "#fff" }}>
                  <SortTh label="Project" sortKey="name" {...th} />
                  <SortTh label="Status" sortKey="status" {...th} />
                  <SortTh label="Phase spread" sortKey="spread" {...th} />
                  <SortTh label="Capacity (kWp)" sortKey="capacity" {...th} />
                  <SortTh label="Contract value" sortKey="contract" {...th} />
                  <SortTh label="Milestone" sortKey="milestone" {...th} />
                  <SortTh style={headCell} />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, opacity: project.lifecycle === "CANCELLED" ? 0.6 : 1 }}
                  >
                    <td style={{ ...bodyCell, fontWeight: 700 }}>
                      <Link
                        href={`/projects/${project.id}`}
                        style={{ color: NAVY, textDecoration: project.lifecycle === "CANCELLED" ? "line-through" : "none" }}
                      >
                        {project.name}
                      </Link>
                      {project.flags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {project.flags.map((flag) => (
                            <FlagChip key={flag} label={flag} color={colorOf(parseFlagColors(project.flagColors), flag)} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={bodyCell}>
                      <ProjectStatusSelect
                        projectId={project.id}
                        projectName={project.name}
                        value={project.lifecycle}
                        lockedFields={project.lockedFields}
                        mondayStage={project.mondayStage}
                        mondayStatus={project.mondayStatus}
                      />
                    </td>
                    <td style={{ ...bodyCell, width: 220 }}>
                      <SpreadBar segments={phaseSpread([project])} />
                    </td>
                    <td style={bodyCell}>{formatKwp(capacityKwp(project))}</td>
                    <td style={bodyCell}>
                      {(() => {
                        const contract = projectContract(project);
                        return contract.amount ? money(contract.amount, contract.currency) : "—";
                      })()}
                    </td>
                    <td style={bodyCell}>
                      <MilestoneCell progress={progressOf(project)} />
                    </td>
                    <td style={{ ...bodyCell, textAlign: "right" }}>
                      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`} style={{ color: TEXT_MUTED }}>
                        ›
                      </Link>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...bodyCell, color: TEXT_MUTED }}>
                      {filter ? "No projects with this status." : "No projects imported for this customer yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED }}>
            Showing {projects.length} of {all.length} projects
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ContactsCard customerId={customer.id} people={people} />

          <SideCard title="Commercial">
            <Row label="Contract value" value={formatTotals(contractTotals)} />
            <Row label="Capacity" value={totalCapacity > 0 ? `${formatKwp(totalCapacity)} kWp` : "—"} />
            <Row
              label="Pre-contract projects"
              value={String(withoutContract)}
              hint="No contract value in the Control Table yet"
            />
          </SideCard>

          <SideCard title="Name variants">
            {customer.aliases.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No alternate spellings recorded.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {customer.aliases.map((alias) => (
                  <li key={alias.id} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />
                    {alias.alias}
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
        </div>
      </div>
    </main>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
        {title}
      </div>
      <div style={{ width: 28, height: 3, borderRadius: 2, background: ORANGE, margin: "8px 0 14px" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontWeight: 700, color: NAVY }}>{value}</span>
    </div>
  );
}

const headCell: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: NAVY,
  padding: "15px 20px",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const bodyCell: CSSProperties = { padding: "14px 20px", fontSize: 15, verticalAlign: "middle" };
