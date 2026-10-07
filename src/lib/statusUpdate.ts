import type { PhaseName, StageStatus } from "@prisma/client";
import { PHASE_ORDER, phaseShortName } from "@/lib/phases";

export const MAX_STATUS_TEXT = 5000;

// Typed status text (a phase update or a manual project summary): trimmed, line endings normalised; empty means none.
export function cleanStatusText(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (value.length > MAX_STATUS_TEXT) return { ok: false, error: `Keep it under ${MAX_STATUS_TEXT} characters.` };
  return { ok: true, value: value === "" ? null : value };
}

export type PhaseProgress = { name: PhaseName; status: StageStatus; done: number; total: number };

const join = (names: string[]) => names.join(", ");

// The automatic project status summary, built only from the phases' statuses (and item counts). It is
// rebuilt whenever it is shown, so it never goes stale; a typed-over summary replaces it (see projectSummary).
export function generateSummary(phases: PhaseProgress[]): string {
  const ordered = [...phases].sort((a, b) => PHASE_ORDER.indexOf(a.name) - PHASE_ORDER.indexOf(b.name));
  if (ordered.length === 0) return "No phases yet.";

  const withStatus = (status: StageStatus) => ordered.filter((p) => p.status === status);
  const done = withStatus("DONE");
  const active = withStatus("IN_PROGRESS");
  const blocked = withStatus("BLOCKED");
  const notStarted = withStatus("NOT_STARTED");

  if (done.length === ordered.length) return "All phases are complete.";
  if (done.length === 0 && active.length === 0 && blocked.length === 0) return "Not started yet.";

  const parts: string[] = [];
  if (blocked.length > 0) parts.push(`Blocked: ${join(blocked.map((p) => phaseShortName(p.name)))}.`);
  if (active.length > 0) {
    parts.push(`In progress: ${join(active.map((p) => `${phaseShortName(p.name)} (${p.done} of ${p.total} items done)`))}.`);
  }
  if (done.length > 0) parts.push(`Done: ${join(done.map((p) => phaseShortName(p.name)))}.`);
  if (notStarted.length > 0) parts.push(`Not started: ${join(notStarted.map((p) => phaseShortName(p.name)))}.`);
  return parts.join(" ");
}

// What to show: the typed summary when there is one, otherwise the generated one.
export function projectSummary(override: string | null | undefined, phases: PhaseProgress[]): { text: string; manual: boolean } {
  const typed = (override ?? "").trim();
  return typed ? { text: typed, manual: true } : { text: generateSummary(phases), manual: false };
}
