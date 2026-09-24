import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PHASE_ORDER } from "@/server/services/createProject";
import { PhaseSpreadBar } from "@/components/PhaseSpreadBar";
import { StatCard } from "@/components/StatCard";
import { BORDER, GRAY_LIGHT, NAVY, PAGE_BG, TEXT_MUTED } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, customerCount, reviewCount, blockedPhaseCount] = await Promise.all([
    prisma.project.findMany({ include: { customer: true, phases: true }, orderBy: { name: "asc" } }),
    prisma.customer.count(),
    prisma.importReviewItem.count(),
    prisma.phase.count({ where: { status: "BLOCKED" } }),
  ]);

  const missingDataCount = projects.filter(
    (p) => p.contractValue === null || p.capacityMw === null || p.country === null,
  ).length;

  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto", background: PAGE_BG, flex: 1 }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: NAVY }}>Projects</h1>
      <p style={{ color: TEXT_MUTED, marginTop: "0.25rem" }}>
        All projects imported from monday.com, with phase and sub-stage tracking.
      </p>

      {missingDataCount > 0 && (
        <div
          style={{
            marginTop: "1.25rem",
            background: "#FEF6E6",
            border: "1px solid #F3DFA8",
            borderRadius: 8,
            padding: "0.85rem 1.1rem",
            color: "#7A5B00",
            fontSize: "0.9rem",
          }}
        >
          <strong>{missingDataCount}</strong> of <strong>{projects.length}</strong> projects are missing
          capacity, country, or contract value — usually because the Control Table doesn&apos;t have a
          matching row yet.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginTop: "1.25rem",
        }}
      >
        <StatCard label="Customers" value={customerCount} />
        <StatCard label="Projects" value={projects.length} />
        <StatCard label="In review" value={reviewCount} accent={reviewCount > 0 ? "#B91C3C" : undefined} />
        <StatCard label="Blocked phases" value={blockedPhaseCount} accent={blockedPhaseCount > 0 ? "#B91C3C" : undefined} />
      </div>

      {projects.length === 0 ? (
        <p style={{ marginTop: "1.5rem" }}>No projects yet — run the monday.com importer to bring some in.</p>
      ) : (
        <div
          style={{
            marginTop: "1.5rem",
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ backgroundColor: NAVY }}>
                  <th style={headerCellStyle}>Name</th>
                  <th style={headerCellStyle}>Customer</th>
                  <th style={headerCellStyle}>Country</th>
                  <th style={headerCellStyle}>Capacity (MW)</th>
                  <th style={headerCellStyle}>Contract value</th>
                  <th style={headerCellStyle}>Phase spread</th>
                  <th style={headerCellStyle} />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={cellStyle}>
                      <Link href={`/projects/${project.id}`} style={{ color: NAVY, fontWeight: 600 }}>
                        {project.name}
                      </Link>
                    </td>
                    <td style={cellStyle}>{project.customer.name}</td>
                    <td style={cellStyle}>{project.country ?? "—"}</td>
                    <td style={cellStyle}>{project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"}</td>
                    <td style={cellStyle}>
                      {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
                    </td>
                    <td style={cellStyle}>
                      <PhaseSpreadBar
                        statuses={PHASE_ORDER.map((phaseName) => ({
                          label: phaseName,
                          status: project.phases.find((p) => p.name === phaseName)?.status ?? "NOT_STARTED",
                        }))}
                      />
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right", color: TEXT_MUTED }}>
                      <Link href={`/projects/${project.id}`}>›</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "0.6rem 1rem", fontSize: "0.8rem", color: TEXT_MUTED, background: GRAY_LIGHT }}>
            Showing {projects.length} of {projects.length} projects
          </div>
        </div>
      )}
    </main>
  );
}

const headerCellStyle: CSSProperties = {
  padding: "0.65rem 1rem",
  textAlign: "left",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#fff",
};

const cellStyle: CSSProperties = {
  padding: "0.65rem 1rem",
  textAlign: "left",
  verticalAlign: "middle",
  fontSize: "0.9rem",
};
