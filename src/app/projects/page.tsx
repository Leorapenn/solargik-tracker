import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PHASE_ORDER } from "@/server/services/createProject";
import { PhaseStatusDot } from "@/components/PhaseStatusDot";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: { customer: true, phases: true },
    orderBy: { name: "asc" },
  });

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      <h1>Projects</h1>

      {projects.length === 0 ? (
        <p>No projects yet — run the monday.com importer to bring some in.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "1rem" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Customer</th>
              <th style={cellStyle}>Country</th>
              <th style={cellStyle}>Capacity (MW)</th>
              <th style={cellStyle}>Contract value</th>
              <th style={cellStyle}>Phases</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td style={cellStyle}>
                  <Link href={`/projects/${project.id}`}>{project.name}</Link>
                </td>
                <td style={cellStyle}>{project.customer.name}</td>
                <td style={cellStyle}>{project.country ?? "—"}</td>
                <td style={cellStyle}>{project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"}</td>
                <td style={cellStyle}>
                  {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
                </td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {PHASE_ORDER.map((phaseName) => {
                      const phase = project.phases.find((p) => p.name === phaseName);
                      return <PhaseStatusDot key={phaseName} label={phaseName} status={phase?.status ?? "NOT_STARTED"} />;
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}

const cellStyle: CSSProperties = {
  border: "1px solid #ddd",
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  verticalAlign: "top",
};
