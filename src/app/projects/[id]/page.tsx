import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { updateSubStageStatus } from "@/server/actions/updateStatus";
import { StatusSelect } from "@/components/StatusSelect";
import { PhaseCard } from "@/components/PhaseCard";
import { phaseLabel } from "@/lib/phases";
import { LIFECYCLE_NOTES, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { LifecycleBadge } from "@/components/LifecycleBadge";
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
        <LifecycleBadge lifecycle={project.lifecycle} stage={project.mondayStage} status={project.mondayStatus} />
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
            done={phase.subStages.filter((s) => s.status === "DONE").length}
            total={phase.subStages.length}
          />
        ))}
      </div>
      <p style={{ color: TEXT_MUTED, fontSize: "0.85rem", marginTop: "0.6rem" }}>
        Phase status updates automatically from its sub-stages: Done when all are done, Blocked if any is blocked,
        In progress once any has started. Phases don&apos;t wait for each other, so a later phase can be running
        while an earlier one is still open.
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
