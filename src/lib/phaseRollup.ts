import type { StageStatus } from "@prisma/client";

export type RollupItem = {
  status: StageStatus;
  ownerName: string | null;
  targetDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type PhaseRollup = {
  total: number;
  done: number;
  // earliest start among items that have one
  startedAt: Date | null;
  // set only once every item is done: the latest completion date
  completedAt: Date | null;
  // the latest target among items: when the whole phase is due
  targetDate: Date | null;
  owners: string[];
  // done items that have no completion date recorded (should be filled in)
  doneWithoutDate: number;
  // earliest target among items that aren't done yet and are past `today`
  overdueSince: Date | null;
};

const min = (dates: Date[]) => (dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null);
const max = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null);
const present = (dates: (Date | null)[]): Date[] => dates.filter((d): d is Date => d !== null);

export function rollupPhase(items: RollupItem[], today: Date): PhaseRollup {
  const done = items.filter((i) => i.status === "DONE");
  const allDone = items.length > 0 && done.length === items.length;

  return {
    total: items.length,
    done: done.length,
    startedAt: min(present(items.map((i) => i.startedAt))),
    completedAt: allDone ? max(present(done.map((i) => i.completedAt))) : null,
    targetDate: max(present(items.map((i) => i.targetDate))),
    owners: [...new Set(items.map((i) => i.ownerName).filter((n): n is string => !!n))].sort(),
    doneWithoutDate: done.filter((i) => !i.completedAt).length,
    overdueSince: min(
      present(items.filter((i) => i.status !== "DONE" && i.targetDate && i.targetDate < today).map((i) => i.targetDate)),
    ),
  };
}
