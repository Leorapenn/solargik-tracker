import type { StageStatus } from "@prisma/client";

export type RecordedDates = { startedAt: Date | null; completedAt: Date | null };

// What gets recorded automatically when an item's status changes. The history log
// (StatusEvent) keeps every change, so clearing a date here never loses the record.
//   Not started → both cleared
//   In progress → started set (kept if already set), completed cleared
//   Blocked     → completed cleared; started left as it was (an item can be blocked before it starts)
//   Done        → started set if missing, completed = today
export function applyStatusToDates(previous: RecordedDates, next: StageStatus, today: Date): RecordedDates {
  switch (next) {
    case "NOT_STARTED":
      return { startedAt: null, completedAt: null };
    case "IN_PROGRESS":
      return { startedAt: previous.startedAt ?? today, completedAt: null };
    case "BLOCKED":
      return { startedAt: previous.startedAt, completedAt: null };
    case "DONE":
      return { startedAt: previous.startedAt ?? today, completedAt: today };
  }
}
