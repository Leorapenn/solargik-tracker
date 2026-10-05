import { Prisma } from "@prisma/client";
import type { StageStatus } from "@prisma/client";
import { todayInAppTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { derivePhaseStatus } from "@/lib/phaseStatus";
import { applyStatusToDates } from "@/lib/subStageDates";

// "N/A" means the date doesn't apply to this item (e.g. Contract Signing has no target date), as
// opposed to simply not being set yet. An N/A date stays empty and is never filled in automatically.
export const NOT_APPLICABLE = "NA" as const;
export type DatePatch = Date | null | typeof NOT_APPLICABLE;
export type DateField = "targetDate" | "startedAt" | "completedAt";

export type SubStagePatch = {
  status?: StageStatus;
  ownerId?: string | null;
  targetDate?: DatePatch;
  startedAt?: DatePatch;
  completedAt?: DatePatch;
};

export type PatchResult = {
  updated: number;
  // Items a completed date was not applied to because they are not Done.
  skippedCompletedDate: number;
  projectIds: string[];
};

const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

// Applies a change to any number of sub-stages inside the caller's transaction:
//  - records start/completed dates automatically when the status changes (see applyStatusToDates),
//    except for dates marked N/A,
//  - writes a StatusEvent per status change,
//  - re-derives each affected phase's status from its sub-stages.
// The affected phase rows are locked first (in a fixed order) so concurrent edits can't leave a phase stale.
export async function patchSubStages(
  tx: Prisma.TransactionClient,
  ids: string[],
  patch: SubStagePatch,
  source: string,
): Promise<PatchResult> {
  const empty: PatchResult = { updated: 0, skippedCompletedDate: 0, projectIds: [] };
  if (ids.length === 0) return empty;

  const located = await tx.subStage.findMany({ where: { id: { in: ids } }, select: { phaseId: true } });
  const phaseIds = [...new Set(located.map((s) => s.phaseId))].sort();
  if (phaseIds.length === 0) return empty;

  await tx.$queryRaw`SELECT id FROM "Phase" WHERE id IN (${Prisma.join(phaseIds)}) ORDER BY id FOR UPDATE`;

  if (patch.ownerId) {
    const owner = await tx.person.findUnique({ where: { id: patch.ownerId }, select: { active: true } });
    if (!owner || !owner.active) throw new UserError("That owner doesn't exist or is no longer active.");
  }

  const items = await tx.subStage.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      targetDate: true,
      startedAt: true,
      completedAt: true,
      naDates: true,
      phase: { select: { projectId: true } },
    },
  });

  const today = todayInAppTz();
  const groups = new Map<string, { data: Prisma.SubStageUncheckedUpdateManyInput; ids: string[] }>();
  const events: Prisma.StatusEventCreateManyInput[] = [];
  let skippedCompletedDate = 0;

  for (const item of items) {
    const data: Prisma.SubStageUncheckedUpdateManyInput = {};
    const dates: Record<DateField, Date | null> = {
      targetDate: item.targetDate,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
    };
    const na = new Set(item.naDates);
    let status = item.status;

    if (patch.status !== undefined && patch.status !== item.status) {
      status = patch.status;
      data.status = status;
      const auto = applyStatusToDates({ startedAt: dates.startedAt, completedAt: dates.completedAt }, status, today);
      dates.startedAt = na.has("startedAt") ? null : auto.startedAt;
      dates.completedAt = na.has("completedAt") ? null : auto.completedAt;
      events.push({ subStageId: item.id, fromStatus: item.status, toStatus: status, source });
    }

    for (const field of ["targetDate", "startedAt", "completedAt"] as const) {
      const value = patch[field];
      if (value === undefined) continue;
      // a completed date only makes sense for a Done item (clearing is always fine)
      if (field === "completedAt" && value !== null && status !== "DONE") {
        skippedCompletedDate += 1;
        continue;
      }
      if (value === NOT_APPLICABLE) {
        na.add(field);
        dates[field] = null;
      } else {
        na.delete(field);
        dates[field] = value;
      }
    }

    for (const field of ["targetDate", "startedAt", "completedAt"] as const) {
      if (!sameDay(dates[field], item[field])) data[field] = dates[field];
    }
    const naList = [...na];
    if (!sameSet(naList, item.naDates)) data.naDates = naList;
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;

    if (Object.keys(data).length === 0) continue;
    const signature = JSON.stringify(data);
    const group = groups.get(signature) ?? { data, ids: [] };
    group.ids.push(item.id);
    groups.set(signature, group);
  }

  for (const group of groups.values()) {
    await tx.subStage.updateMany({ where: { id: { in: group.ids } }, data: group.data });
  }
  if (events.length > 0) await tx.statusEvent.createMany({ data: events });

  const siblings = await tx.subStage.findMany({
    where: { phaseId: { in: phaseIds } },
    select: { phaseId: true, status: true },
  });
  const byStatus = new Map<StageStatus, string[]>();
  for (const phaseId of phaseIds) {
    const derived = derivePhaseStatus(siblings.filter((s) => s.phaseId === phaseId).map((s) => s.status));
    if (!derived) continue;
    byStatus.set(derived, [...(byStatus.get(derived) ?? []), phaseId]);
  }
  for (const [status, phaseIdsForStatus] of byStatus) {
    await tx.phase.updateMany({ where: { id: { in: phaseIdsForStatus } }, data: { status } });
  }

  return {
    updated: [...groups.values()].reduce((sum, g) => sum + g.ids.length, 0),
    skippedCompletedDate,
    projectIds: [...new Set(items.map((i) => i.phase.projectId))],
  };
}
