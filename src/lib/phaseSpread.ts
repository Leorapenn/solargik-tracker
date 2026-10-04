import type { PhaseName, StageStatus } from "@prisma/client";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { GRAY_LIGHT, NAVY, NAVY_MID, ORANGE } from "@/lib/theme";

export type SpreadSegment = { phase: PhaseName; color: string; title: string };

type ProjectWithPhases = { phases: { name: PhaseName; status: StageStatus }[] };

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
