import type { StageStatus } from "@prisma/client";

export const STATUS_COLORS: Record<StageStatus, string> = {
  NOT_STARTED: "#c4c4c4",
  IN_PROGRESS: "#579bfc",
  BLOCKED: "#df2f4a",
  DONE: "#00c875",
};

export const STATUS_LABELS: Record<StageStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};
