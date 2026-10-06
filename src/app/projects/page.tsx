import type { CSSProperties } from "react";
import Link from "next/link";
import type { ProjectLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread, progressScore } from "@/lib/phaseSpread";
import { LIFECYCLE_ORDER, parseLifecycle } from "@/lib/lifecycle";
import { parseSort, sortRows } from "@/lib/sort";
import { SpreadBar } from "@/components/SpreadBar";
import { StatCard } from "@/components/StatCard";
import { ProjectStatusSelect } from "@/components/ProjectStatusSelect";
import { LifecycleFilterBar } from "@/components/LifecycleFilterBar";
import { SortSummary } from "@/components/SortSummary";
import { FlagsEditor } from "@/components/FlagsEditor";
import { money, projectContract } from "@/lib/payments";
import { knownFlags } from "@/server/services/flags";
import { SortTh } from "@/components/SortTh";
import {
  GRAY_LIGHT,
  NAVY,
  ROW_DIVIDER,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const SORT_LABELS = {
  name: "Project",
  status: "Status",
  customer: "Customer",
  country: "Country",
  capacity: "Capacity",
  contract: "Contract value",
  spread: "Phase spread",
  flags: "Flags",
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const filter = parseLifecycle(typeof params.lifecycle === "string" ? params.lifecycle : undefined);

  const [all, flagSuggestions] = await Promise.all([
    prisma.project.findMany({ include: { customer: true, phases: true }, orderBy: { name: "asc" } }),
    knownFlags(),
  ]);

  const counts = Object.fromEntries(LIFECYCLE_ORDER.map((l) => [l, 0])) as Record<ProjectLifecycle, number>;
  for (const project of all) counts[project.lifecycle] += 1;

  const accessors = {
    name: (p: (typeof all)[number]) => p.name,
    status: (p: (typeof all)[number]) => LIFECYCLE_ORDER.indexOf(p.lifecycle),
    customer: (p: (typeof all)[number]) => p.customer.name,
    country: (p: (typeof all)[number]) => p.country,
    capacity: (p: (typeof all)[number]) => (p.capacityMw ? Number(p.capacityMw) : null),
    contract: (p: (typeof all)[number]) => projectContract(p).amount,
    spread: (p: (typeof all)[number]) => progressScore([p]),
    flags: (p: (typeof all)[number]) => p.flags.length,
  };
  const sort = parseSort(params, Object.keys(accessors), { key: "name", dir: "asc" });
  const projects = sortRows(filter ? all.filter((p) => p.lifecycle === filter) : all, accessors, sort);

  // Pre-NTP and cancelled projects are expected to lack contract data, so only flag the rest.
  const needsDataCount = all.filter(
    (p) =>
      ["ACTIVE", "ON_HOLD", "SUSPENDED"].includes(p.lifecycle) &&
      (projectContract(p).amount === null || p.capacityMw === null || p.country === null),
  ).length;

  const th = { current: sort, basePath: "/projects", params, style: headCell };

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Projects</h1>
        <div style={pageSubtitleStyle}>All projects imported from monday.com, with phase and sub-stage tracking</div>
      </div>

      {needsDataCount > 0 && (
        <div style={{ background: GRAY_LIGHT, borderRadius: 10, padding: "14px 20px", color: TEXT_MUTED, fontSize: 14 }}>
          <strong style={{ color: NAVY }}>{needsDataCount}</strong> in-flight project{needsDataCount === 1 ? " is" : "s are"}{" "}
          missing capacity, country, or contract value — check the Control Table. (Pre-NTP and cancelled projects
          aren&apos;t counted; they&apos;re expected to lack it.)
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <StatCard label="Active" value={counts.ACTIVE} href="/projects?lifecycle=ACTIVE" />
        <StatCard label="Pre-NTP" value={counts.PRE_NTP} href="/projects?lifecycle=PRE_NTP" />
        <StatCard
          label="On hold / suspended"
          value={counts.ON_HOLD + counts.SUSPENDED}
          accent={counts.ON_HOLD + counts.SUSPENDED > 0 ? "#9A4B00" : undefined}
        />
        <StatCard
          label="Cancelled"
          value={counts.CANCELLED}
          accent={counts.CANCELLED > 0 ? "#B3261E" : undefined}
          href="/projects?lifecycle=CANCELLED"
        />
      </div>

      <LifecycleFilterBar basePath="/projects" params={params} filter={filter} counts={counts} total={all.length} />

      <div style={cardStyle}>
        <SortSummary basePath="/projects" params={params} current={sort} labels={SORT_LABELS} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 960 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <SortTh label="Project" sortKey="name" {...th} />
                <SortTh label="Status" sortKey="status" {...th} />
                <SortTh label="Customer" sortKey="customer" {...th} />
                <SortTh label="Country" sortKey="country" {...th} />
                <SortTh label="Capacity (MW)" sortKey="capacity" {...th} />
                <SortTh label="Contract value" sortKey="contract" {...th} />
                <SortTh label="Phase spread" sortKey="spread" {...th} />
                <SortTh label="Flags" sortKey="flags" {...th} />
                <SortTh style={headCell} />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const cancelled = project.lifecycle === "CANCELLED";
                return (
                  <tr
                    key={project.id}
                    style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, opacity: cancelled ? 0.6 : 1 }}
                  >
                    <td style={{ ...bodyCell, fontWeight: 700 }}>
                      <Link
                        href={`/projects/${project.id}`}
                        style={{ color: NAVY, textDecoration: cancelled ? "line-through" : "none" }}
                      >
                        {project.name}
                      </Link>
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
                    <td style={bodyCell}>
                      <Link href={`/customers/${project.customer.id}`} style={{ color: NAVY }}>
                        {project.customer.name}
                      </Link>
                    </td>
                    <td style={bodyCell}>{project.country ?? "—"}</td>
                    <td style={bodyCell}>{project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"}</td>
                    <td style={bodyCell}>
                      {(() => {
                        const contract = projectContract(project);
                        return contract.amount ? money(contract.amount, contract.currency) : "—";
                      })()}
                    </td>
                    <td style={{ ...bodyCell, width: 200 }}>
                      <SpreadBar segments={phaseSpread([project])} />
                    </td>
                    <td style={bodyCell}>
                      <FlagsEditor
                        compact
                        kind="project"
                        id={project.id}
                        name={project.name}
                        flags={project.flags}
                        suggestions={flagSuggestions}
                      />
                    </td>
                    <td style={{ ...bodyCell, textAlign: "right" }}>
                      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`} style={{ color: TEXT_MUTED }}>
                        ›
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...bodyCell, color: TEXT_MUTED }}>
                    {filter ? "No projects with this status." : "No projects yet — run the monday.com importer to bring some in."}
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
    </main>
  );
}

const headCell: CSSProperties = {
  padding: "15px 20px",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const bodyCell: CSSProperties = { padding: "14px 20px", fontSize: 15, verticalAlign: "middle" };
