import type { PhaseName, StageStatus } from "@prisma/client";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { GRAY_LIGHT, NAVY, NAVY_MID, ORANGE } from "@/lib/theme";

export type SpreadSegment = { phase: PhaseName; color: string; title: string };

type ProjectWithPhases = { phases: { name: PhaseName; status: StageStatus }[] };

// A single number for sorting by "how far along": per phase, 2 if every project has finished it,
// 1 if anything has started (or is blocked), otherwise 0.
export function progressScore(projects: ProjectWithPhases[]): number {
  let score = 0;
  for (const phase of PHASE_ORDER) {
    const statuses = projects.map((p) => p.phases.find((x) => x.name === phase)?.status ?? "NOT_STARTED");
    if (statuses.length > 0 && statuses.every((s) => s === "DONE")) score += 2;
    else if (statuses.some((s) => s !== "NOT_STARTED")) score += 1;
  }
  return score;
}

export type PhaseBreakdown = Record<PhaseName, { id: string; name: string; status: StageStatus }[]>;

// For each phase, every project with that phase's status, so a click on the spread bar can say which projects
// are where. Projects without the phase count as not started. Sorted by name.
export function phaseBreakdown(projects: { id: string; name: string; phases: { name: PhaseName; status: StageStatus }[] }[]): PhaseBreakdown {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return Object.fromEntries(
    PHASE_ORDER.map((phase) => [
      phase,
      sorted.map((p) => ({ id: p.id, name: p.name, status: p.phases.find((x) => x.name === phase)?.status ?? ("NOT_STARTED" as StageStatus) })),
    ]),
  ) as PhaseBreakdown;
}

// One segment per phase, summarising every project: any blocked → orange,
// all done → navy, some started/done → blue, nothing started → grey.
export function phaseSpread(projects: ProjectWithPhases[]): SpreadSegment[] {
  return PHASE_ORDER.map((phase) => {
    const counts = { DONE: 0, IN_PROGRESS: 0, BLOCKED: 0, NOT_STARTED: 0 } as Record<StageStatus, number>;
    for (const project of projects) {
      counts[project.phases.find((p) => p.name === phase)?.status ?? "NOT_STARTED"] += 1;
    }

    let color = GRAY_LIGHT;
    if (counts.BLOCKED > 0) color = ORANGE;
    else if (projects.length > 0 && counts.DONE === projects.length) color = NAVY;
    else if (counts.DONE > 0 || counts.IN_PROGRESS > 0) color = NAVY_MID;

    return {
      phase,
      color,
      title: `${phaseLabel(phase)}: ${counts.DONE} done · ${counts.IN_PROGRESS} in progress · ${counts.BLOCKED} blocked · ${counts.NOT_STARTED} not started`,
    };
  });
}
