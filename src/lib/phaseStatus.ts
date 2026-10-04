import type { StageStatus } from "@prisma/client";

// A phase's status is derived from its sub-stages (the only thing people edit):
// all done → DONE; any blocked → BLOCKED; any started or done → IN_PROGRESS;
// otherwise NOT_STARTED. Returns null for a phase with no sub-stages, so its
// stored status is left alone.
export function derivePhaseStatus(subStageStatuses: StageStatus[]): StageStatus | null {
  if (subStageStatuses.length === 0) return null;
  if (subStageStatuses.every((s) => s === "DONE")) return "DONE";
  if (subStageStatuses.some((s) => s === "BLOCKED")) return "BLOCKED";
  if (subStageStatuses.some((s) => s === "IN_PROGRESS" || s === "DONE")) return "IN_PROGRESS";
  return "NOT_STARTED";
}
