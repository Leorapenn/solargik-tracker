import type { CSSProperties } from "react";
import Link from "next/link";
import type { StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { STATUS_COLORS, STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import {
  BORDER,
  NAVY,
  ROW_DIVIDER,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

const STATUS_ORDER: StageStatus[] = ["DONE", "IN_PROGRESS", "BLOCKED", "NOT_STARTED"];

export default async function PhasesPage() {
  await requirePageAuth();

  const projects = await prisma.project.findMany({
    include: { customer: { select: { name: true } }, phases: { select: { name: true, status: true } } },
  });
  projects.sort((a, b) => a.customer.name.localeCompare(b.customer.name) || a.name.localeCompare(b.name));

  const statusOf = (project: (typeof projects)[number], phase: (typeof PHASE_ORDER)[number]): StageStatus =>
    project.phases.find((p) => p.name === phase)?.status ?? "NOT_STARTED";

  const summaries = PHASE_ORDER.map((phase) => {
    const counts = { DONE: 0, IN_PROGRESS: 0, BLOCKED: 0, NOT_STARTED: 0 } as Record<StageStatus, number>;
    for (const project of projects) counts[statusOf(project, phase)] += 1;
    return { phase, counts };
  });

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Phases</h1>
        <div style={pageSubtitleStyle}>
          Where every project stands across the six delivery phases. Open a project to update statuses.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        {summaries.map(({ phase, counts }) => {
          const total = projects.length;
          return (
            <div key={phase} style={{ ...cardStyle, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_MUTED }}>
                {phaseLabel(phase)}
              </div>
              <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: NAVY }}>
                {counts.DONE}
                <span style={{ fontSize: 15, fontWeight: 600, color: TEXT_MUTED }}> / {total} done</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#EEF0F5", margin: "10px 0" }}>
                {STATUS_ORDER.filter((s) => s !== "NOT_STARTED").map((status) => (
                  <div
                    key={status}
                    title={`${STATUS_LABELS[status]}: ${counts[status]}`}
                    style={{ width: total ? `${(counts[status] / total) * 100}%` : 0, background: STATUS_COLORS[status] }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED }}>
                {counts.IN_PROGRESS} in progress ·{" "}
                <span style={{ color: counts.BLOCKED > 0 ? "#B3261E" : undefined, fontWeight: counts.BLOCKED > 0 ? 700 : 400 }}>
                  {counts.BLOCKED} blocked
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <th style={headCell}>Project</th>
                <th style={headCell}>Customer</th>
                {PHASE_ORDER.map((phase) => (
                  <th key={phase} style={headCell}>
                    {phaseLabel(phase)}
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
                  <td style={{ ...bodyCell, color: TEXT_MUTED }}>{project.customer.name}</td>
                  {PHASE_ORDER.map((phase) => {
                    const status = statusOf(project, phase);
                    const { bg, text } = STATUS_PILL_STYLES[status];
                    return (
                      <td key={phase} style={bodyCell}>
                        <span
                          style={{
                            display: "inline-block",
                            background: bg,
                            color: text,
                            borderRadius: 999,
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...bodyCell, color: TEXT_MUTED }}>
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED, borderTop: `1px solid ${BORDER}` }}>
          {projects.length} projects
        </div>
      </div>
    </main>
  );
}

const headCell: CSSProperties = {
  padding: "15px 16px",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const bodyCell: CSSProperties = { padding: "12px 16px", fontSize: 14, verticalAlign: "middle" };
