import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { todayInAppTz } from "@/lib/dates";
import { cleanStatusText } from "@/lib/statusUpdate";

function clean(raw: string | null | undefined): string | null {
  const result = cleanStatusText(raw);
  if (!result.ok) throw new UserError(result.error);
  return result.value;
}

// The phase's typed update. The date is stamped automatically (today in the company timezone) whenever the text
// actually changes; saving the same text again keeps the old date, and clearing the text clears the date.
export async function setPhaseUpdate(phaseId: string, raw: string): Promise<{ projectId: string }> {
  const text = clean(raw);
  const phase = await prisma.phase.findUnique({ where: { id: phaseId }, select: { projectId: true, statusUpdate: true } });
  if (!phase) throw new UserError("That phase no longer exists.");
  if ((phase.statusUpdate ?? null) !== text) {
    await prisma.phase.update({
      where: { id: phaseId },
      data: { statusUpdate: text, statusUpdateAt: text === null ? null : todayInAppTz() },
    });
  }
  return { projectId: phase.projectId };
}

// The same for a sub-phase (an item of a phase): typed text, date stamped automatically when the text changes.
export async function setSubStageUpdate(subStageId: string, raw: string): Promise<void> {
  const text = clean(raw);
  const item = await prisma.subStage.findUnique({ where: { id: subStageId }, select: { statusUpdate: true } });
  if (!item) throw new UserError("That item no longer exists.");
  if ((item.statusUpdate ?? null) !== text) {
    await prisma.subStage.update({
      where: { id: subStageId },
      data: { statusUpdate: text, statusUpdateAt: text === null ? null : todayInAppTz() },
    });
  }
}

// A typed project summary replaces the automatic one; an empty one (null) goes back to automatic.
export async function setProjectSummary(projectId: string, raw: string | null): Promise<void> {
  const text = clean(raw);
  const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!exists) throw new UserError("That project no longer exists.");
  await prisma.project.update({ where: { id: projectId }, data: { statusSummaryOverride: text } });
}
