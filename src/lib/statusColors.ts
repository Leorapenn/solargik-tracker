import type { StageStatus } from "@prisma/client";

// Solid dots (used in compact phase-spread summaries).
export const STATUS_COLORS: Record<StageStatus, string> = {
  NOT_STARTED: "#c4c4c4",
  IN_PROGRESS: "#579bfc",
  BLOCKED: "#df2f4a",
  DONE: "#00c875",
  NOT_APPLICABLE: "#e9eaee",
};

// Pastel pill styling (used for the editable status badges).
export const STATUS_PILL_STYLES: Record<StageStatus, { bg: string; text: string }> = {
  NOT_STARTED: { bg: "#E4E6EC", text: "#4B5563" },
  IN_PROGRESS: { bg: "#DCE8FD", text: "#1D4ED8" },
  BLOCKED: { bg: "#FBDCE0", text: "#B91C3C" },
  DONE: { bg: "#D8F5E3", text: "#047857" },
  NOT_APPLICABLE: { bg: "#F1F2F5", text: "#8A8F9C" },
};

export const STATUS_LABELS: Record<StageStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  NOT_APPLICABLE: "N/A",
};

// What a person can pick for an item (the dropdowns, the bulk bar and the filters), in this order.
export const ITEM_STATUS_CHOICES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE", "NOT_APPLICABLE"];
