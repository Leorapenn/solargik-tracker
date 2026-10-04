import type { ProjectLifecycle } from "@prisma/client";

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

// Maps the Control Table's STAGE and Status labels to a lifecycle. First match wins.
// A project with no Control Table row (null/null) is treated as ACTIVE.
export function deriveLifecycle(stage: string | null | undefined, status: string | null | undefined): ProjectLifecycle {
  const s = norm(stage);
  const st = norm(status);

  if (st === "cancelled") return "CANCELLED";
  // A Suspended stage wins over Status "Stuck/On Hold" (the two usually appear together).
  if (s === "suspended") return "SUSPENDED";
  if (st === "stuck/on hold" || s === "7 hold") return "ON_HOLD";
  if (s === "0 pre ntp & pre ap") return "PRE_NTP";
  return "ACTIVE";
}

export const LIFECYCLE_ORDER: ProjectLifecycle[] = ["ACTIVE", "PRE_NTP", "ON_HOLD", "SUSPENDED", "CANCELLED"];

export const LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = {
  ACTIVE: "Active",
  PRE_NTP: "Pre-NTP",
  ON_HOLD: "On hold",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

export const LIFECYCLE_STYLES: Record<ProjectLifecycle, { bg: string; text: string }> = {
  ACTIVE: { bg: "#D8F5E3", text: "#047857" },
  PRE_NTP: { bg: "#E4E6EC", text: "#142A5C" },
  ON_HOLD: { bg: "#FEF6E7", text: "#7A4E00" },
  SUSPENDED: { bg: "#FDE6D2", text: "#9A4B00" },
  CANCELLED: { bg: "#FCE9E7", text: "#8C1D18" },
};

export const LIFECYCLE_NOTES: Record<ProjectLifecycle, string | null> = {
  ACTIVE: null,
  PRE_NTP: "Pre-NTP: this project hasn't actually started yet.",
  ON_HOLD: "This project is stuck / on hold in monday.com.",
  SUSPENDED: "This project is suspended in monday.com.",
  CANCELLED: "This project is cancelled in monday.com.",
};

export function parseLifecycle(value: string | undefined): ProjectLifecycle | null {
  return LIFECYCLE_ORDER.find((l) => l === value) ?? null;
}
