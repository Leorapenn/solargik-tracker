import type { StageStatus } from "@prisma/client";

// A phase's status is derived from its sub-stages (the only thing people edit):
// all done → DONE; any blocked → BLOCKED; any started or done → IN_PROGRESS;
// otherwise NOT_STARTED. Items marked N/A (NOT_APPLICABLE) are left out of all of
// that, as if they weren't there; a phase whose items are ALL N/A is NOT_APPLICABLE.
// Returns null for a phase with no sub-stages, so its stored status is left alone.
export function derivePhaseStatus(subStageStatuses: StageStatus[]): StageStatus | null {
  if (subStageStatuses.length === 0) return null;
  const counted = subStageStatuses.filter((s) => s !== "NOT_APPLICABLE");
  if (counted.length === 0) return "NOT_APPLICABLE";
  if (counted.every((s) => s === "DONE")) return "DONE";
  if (counted.some((s) => s === "BLOCKED")) return "BLOCKED";
  if (counted.some((s) => s === "IN_PROGRESS" || s === "DONE")) return "IN_PROGRESS";
  return "NOT_STARTED";
}
