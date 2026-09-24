import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updatePhaseStatus, updateSubStageStatus } from "@/server/actions/updateStatus";
import { StatusSelect } from "@/components/StatusSelect";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      customer: true,
      phases: {
        orderBy: { order: "asc" },
        include: { subStages: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!project) notFound();

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <Link href="/projects">← Projects</Link>
      <h1 style={{ marginBottom: 0 }}>{project.name}</h1>
      <p style={{ color: "#555", marginTop: "0.25rem" }}>
        {project.customer.name} · {project.country ?? "—"} ·{" "}
        {project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"} MW ·{" "}
        {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
      </p>

      {project.phases.map((phase) => (
        <section key={phase.id} style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{phase.name.replace("_", " ")}</h2>
            <StatusSelect value={phase.status} onChange={updatePhaseStatus.bind(null, phase.id)} />
          </div>

          {phase.subStages.length === 0 ? (
            <p style={{ color: "#888" }}>No sub-stages.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {phase.subStages.map((subStage) => (
                <li key={subStage.id} style={subStageRowStyle}>
                  <span>
                    {subStage.name} <span style={{ color: "#888" }}>({subStage.department})</span>
                  </span>
                  <StatusSelect value={subStage.status} onChange={updateSubStageStatus.bind(null, subStage.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}

const sectionStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "1rem",
  marginTop: "1rem",
};

const subStageRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.4rem 0",
  borderTop: "1px solid #eee",
};
