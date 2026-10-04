import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread } from "@/lib/phaseSpread";
import { SpreadBar } from "@/components/SpreadBar";
import { StatCard } from "@/components/StatCard";
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

export default async function ProjectsPage() {
  await requirePageAuth();
  const [projects, customerCount, blockedPhaseCount] = await Promise.all([
    prisma.project.findMany({ include: { customer: true, phases: true }, orderBy: { name: "asc" } }),
    prisma.customer.count(),
    prisma.phase.count({ where: { status: "BLOCKED" } }),
  ]);

  const missingDataCount = projects.filter(
    (p) => p.contractValue === null || p.capacityMw === null || p.country === null,
  ).length;

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Projects</h1>
        <div style={pageSubtitleStyle}>All projects imported from monday.com, with phase and sub-stage tracking</div>
      </div>

      {missingDataCount > 0 && (
        <div style={{ background: GRAY_LIGHT, borderRadius: 10, padding: "14px 20px", color: TEXT_MUTED, fontSize: 14 }}>
          <strong style={{ color: NAVY }}>{missingDataCount}</strong> of{" "}
          <strong style={{ color: NAVY }}>{projects.length}</strong> projects don&apos;t have capacity, country, or
          contract value yet — expected for projects still at the pre-contract stage, since that data isn&apos;t set in
          the Control Table until contract signing.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <StatCard label="Projects" value={projects.length} />
        <StatCard label="Customers" value={customerCount} />
        <StatCard label="Pre-contract" value={missingDataCount} />
        <StatCard label="Blocked phases" value={blockedPhaseCount} accent={blockedPhaseCount > 0 ? "#B3261E" : undefined} />
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                {["Project", "Customer", "Country", "Capacity (MW)", "Contract value", "Phase spread", ""].map((heading) => (
                  <th key={heading} style={headCell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                  <td style={{ ...bodyCell, fontWeight: 700 }}>
                    <Link href={`/projects/${project.id}`} style={{ color: NAVY }}>
                      {project.name}
                    </Link>
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
                  <td style={{ ...bodyCell, width: 220 }}>
                    <SpreadBar segments={phaseSpread([project])} />
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
                    No projects yet — run the monday.com importer to bring some in.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED }}>
          Showing {projects.length} of {projects.length} projects
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
