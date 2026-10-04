import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { updatePhaseStatus, updateSubStageStatus } from "@/server/actions/updateStatus";
import { StatusSelect } from "@/components/StatusSelect";
import { PhaseCard } from "@/components/PhaseCard";
import { phaseLabel } from "@/lib/phases";
import { BORDER, NAVY, TEXT_MUTED, pageStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAuth();
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

  const rows = project.phases.flatMap((phase) =>
    phase.subStages.map((subStage) => ({ phase, subStage })),
  );

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/customers" style={{ color: NAVY, fontWeight: 600 }}>
          Customers
        </Link>{" "}
        ›{" "}
        <Link href={`/customers/${project.customer.id}`} style={{ color: NAVY, fontWeight: 600 }}>
          {project.customer.name}
        </Link>{" "}
        › {project.name}
      </div>

      <h1 style={{ ...pageTitleStyle, marginTop: -8 }}>{project.name}</h1>
      <p style={{ color: TEXT_MUTED, marginTop: -12 }}>
        Customer <strong style={{ color: NAVY }}>{project.customer.name}</strong> · {project.country ?? "—"} ·{" "}
        {project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"} MW ·{" "}
        {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
          marginTop: "1.5rem",
        }}
      >
        {project.phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            name={phase.name}
            status={phase.status}
            onChange={updatePhaseStatus.bind(null, phase.id)}
          />
        ))}
      </div>
      <p style={{ color: TEXT_MUTED, fontSize: "0.85rem", marginTop: "0.6rem" }}>
        Each phase tracks its own status independently — a later phase can be in progress while an earlier
        one is still open or blocked.
      </p>

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
                <th style={headerCellStyle}>Phase</th>
                <th style={headerCellStyle}>Sub-stage</th>
                <th style={headerCellStyle}>Department</th>
                <th style={headerCellStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ phase, subStage }) => (
                <tr key={subStage.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ ...cellStyle, color: TEXT_MUTED, whiteSpace: "nowrap" }}>
                    {phaseLabel(phase.name)}
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 600, color: NAVY }}>{subStage.name}</td>
                  <td style={cellStyle}>{subStage.department}</td>
                  <td style={cellStyle}>
                    <StatusSelect value={subStage.status} onChange={updateSubStageStatus.bind(null, subStage.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
  padding: "0.6rem 1rem",
  textAlign: "left",
  verticalAlign: "middle",
  fontSize: "0.9rem",
};
