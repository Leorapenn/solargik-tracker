import type { CSSProperties } from "react";
import Link from "next/link";
import type { ProjectLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread } from "@/lib/phaseSpread";
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER, parseLifecycle } from "@/lib/lifecycle";
import { SpreadBar } from "@/components/SpreadBar";
import { StatCard } from "@/components/StatCard";
import { LifecycleBadge } from "@/components/LifecycleBadge";
import {
  BORDER,
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

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ lifecycle?: string }> }) {
  await requirePageAuth();
  const filter = parseLifecycle((await searchParams).lifecycle);

  const all = await prisma.project.findMany({ include: { customer: true, phases: true }, orderBy: { name: "asc" } });

  const counts = Object.fromEntries(LIFECYCLE_ORDER.map((l) => [l, 0])) as Record<ProjectLifecycle, number>;
  for (const project of all) counts[project.lifecycle] += 1;

  const projects = filter ? all.filter((p) => p.lifecycle === filter) : all;

  // Pre-NTP and cancelled projects are expected to lack contract data, so only flag the rest.
  const needsDataCount = all.filter(
    (p) =>
      ["ACTIVE", "ON_HOLD", "SUSPENDED"].includes(p.lifecycle) &&
      (p.contractValue === null || p.capacityMw === null || p.country === null),
  ).length;

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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Filter by project status">
        <FilterChip href="/projects" active={!filter} label={`All (${all.length})`} />
        {LIFECYCLE_ORDER.map((lifecycle) => (
          <FilterChip
            key={lifecycle}
            href={`/projects?lifecycle=${lifecycle}`}
            active={filter === lifecycle}
            label={`${LIFECYCLE_LABELS[lifecycle]} (${counts[lifecycle]})`}
          />
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 960 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                {["Project", "Status", "Customer", "Country", "Capacity (MW)", "Contract value", "Phase spread", ""].map(
                  (heading) => (
                    <th key={heading} style={headCell}>
                      {heading}
                    </th>
                  ),
                )}
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
                      <LifecycleBadge
                        lifecycle={project.lifecycle}
                        stage={project.mondayStage}
                        status={project.mondayStatus}
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
                      {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
                    </td>
                    <td style={{ ...bodyCell, width: 200 }}>
                      <SpreadBar segments={phaseSpread([project])} />
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
                  <td colSpan={8} style={{ ...bodyCell, color: TEXT_MUTED }}>
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

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${active ? NAVY : BORDER}`,
        background: active ? NAVY : "#fff",
        color: active ? "#fff" : NAVY,
      }}
    >
      {label}
    </Link>
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
