import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { MAX_SHIPMENTS, cleanShipment, findShipment, type CleanShipment, type ShipmentInput } from "@/lib/shipments";
import { itemProjectNumber, shipmentFromMonday, trackedProjectNumber, type MondayShipmentItem, type ShipmentImport } from "@/lib/shipmentFromMonday";
import { mergeFiles } from "@/lib/shipmentFiles";
import { listShipments, shipmentData, type ShipmentView } from "@/server/services/shipments";

// Bringing the monday.com shipping board (read-only) into the projects' Shipments: for the project numbers asked for, every item of
// the board becomes a shipment (created, or linked to the one already there that shares its container numbers), with its Files column
// as links. Re-running is safe: an item that was imported is found by its monday.com id and only gets its links refreshed and its
// EMPTY fields filled; nothing typed, proposed from an email or edited by hand is overwritten.

export type ImportAction =
  | { kind: "create"; item: MondayShipmentItem; imp: ShipmentImport; clean: CleanShipment }
  | { kind: "link" | "refresh"; item: MondayShipmentItem; imp: ShipmentImport; shipmentId: string; filled: string[]; clean: CleanShipment | null }
  | { kind: "skip"; item: MondayShipmentItem; imp: ShipmentImport; reason: string };

export type ProjectImportPlan = { projectId: string; projectName: string; number: number; actions: ImportAction[] };
export type ImportPlan = {
  projects: ProjectImportPlan[];
  noProject: number[]; // numbers asked for that have no project in 360
  ambiguous: number[]; // numbers that match several projects (nothing is imported for them)
  unmatchedItems: number; // items of the board whose project number could not be told (a range group without a number in the name...)
};

const FILL_KEYS: (keyof ShipmentInput)[] = ["goods", "vessel", "portOfLoading", "portOfDischarge", "etd", "eta", "arrivedAt", "customsClearedAt", "deliveryDate", "deliveredAt", "notes"];

const toInput = (s: ShipmentView): Record<keyof ShipmentInput, string> => ({
  reference: s.reference, goods: s.goods ?? "", forwarder: s.forwarder ?? "", vessel: s.vessel ?? "", containers: s.containers.join(", "),
  portOfLoading: s.portOfLoading ?? "", portOfDischarge: s.portOfDischarge ?? "", status: s.status, customsStatus: s.customsStatus,
  etd: s.etd ?? "", eta: s.eta ?? "", arrivedAt: s.arrivedAt ?? "", customsClearedAt: s.customsClearedAt ?? "", deliveryDate: s.deliveryDate ?? "", deliveredAt: s.deliveredAt ?? "", notes: s.notes ?? "",
});

// What monday.com adds to a shipment that already exists: only the fields that are still EMPTY (containers are added, never dropped).
function fillEmpty(existing: ShipmentView, imp: ShipmentImport): { merged: Record<keyof ShipmentInput, string>; filled: string[] } {
  const merged = toInput(existing);
  const filled: string[] = [];
  for (const key of FILL_KEYS) {
    const v = imp.input[key];
    // a delivery day goes only on a shipment that is Delivered (one planned or at the port keeps its own status and dates)
    if (key === "deliveredAt" && existing.status !== "DELIVERED") continue;
    if (v && !merged[key]) {
      merged[key] = v as string;
      filled.push(key);
    }
  }
  const have = new Set(existing.containers);
  const added = (imp.input.containers ?? "").split(",").map((c) => c.trim()).filter((c) => c && !have.has(c));
  if (added.length) {
    merged.containers = [...existing.containers, ...added].join(", ");
    filled.push("containers");
  }
  if (!existing.shipper && imp.shipper) filled.push("shipper");
  if (!existing.shippingMethod && imp.shippingMethod) filled.push("shipping method");
  return { merged, filled };
}

export async function planShipmentImport(items: MondayShipmentItem[], projectNumbers: number[]): Promise<ImportPlan> {
  const wanted = new Set(projectNumbers);
  const projects = (await prisma.project.findMany({ select: { id: true, name: true } })).filter((p) => {
    const n = trackedProjectNumber(p.name);
    return n !== null && wanted.has(n);
  });
  const byNumber = new Map<number, { id: string; name: string }[]>();
  for (const p of projects) byNumber.set(trackedProjectNumber(p.name)!, [...(byNumber.get(trackedProjectNumber(p.name)!) ?? []), p]);
  const plan: ImportPlan = { projects: [], noProject: [...wanted].filter((n) => !byNumber.has(n)).sort((a, b) => a - b), ambiguous: [...byNumber.entries()].filter(([, v]) => v.length > 1).map(([n]) => n), unmatchedItems: 0 };

  const today = toDateInputValue(todayInAppTz());
  const itemsByNumber = new Map<number, MondayShipmentItem[]>();
  for (const item of items) {
    const n = itemProjectNumber(item);
    if (n === null) plan.unmatchedItems++;
    else if (wanted.has(n)) itemsByNumber.set(n, [...(itemsByNumber.get(n) ?? []), item]);
  }

  for (const [number, list] of [...byNumber.entries()].sort(([a], [b]) => a - b)) {
    if (list.length > 1) continue;
    const project = list[0];
    const existing = await listShipments(project.id);
    const linked = new Map<string, string>(); // monday id -> shipment id
    for (const row of await prisma.shipment.findMany({ where: { projectId: project.id, mondayItemId: { not: null } }, select: { id: true, mondayItemId: true } })) if (row.mondayItemId) linked.set(row.mondayItemId, row.id);
    const unlinked = existing.filter((s) => ![...linked.values()].includes(s.id));
    const claimed = new Set<string>(); // an existing shipment is linked to at most one item
    const actions: ImportAction[] = [];
    let count = existing.length;

    for (const item of (itemsByNumber.get(number) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const imp = shipmentFromMonday(item, today);
      const known = linked.get(item.id);
      const target = known ? existing.find((s) => s.id === known) : null;
      let match: ShipmentView | null = target ?? null;
      let kind: "create" | "link" | "refresh" = known ? "refresh" : "create";
      if (!known) {
        const found = findShipment(
          unlinked.filter((s) => !claimed.has(s.id)),
          imp.input.reference ?? "",
          (imp.input.containers ?? "").split(",").map((c) => c.trim()).filter(Boolean),
        );
        if (found === "many") {
          actions.push({ kind: "skip", item, imp, reason: "several shipments already there could be this one: not imported" });
          continue;
        }
        if (found) {
          match = found;
          kind = "link";
          claimed.add(found.id);
        }
      }
      if (match) {
        const { merged, filled } = fillEmpty(match, imp);
        const cleaned = cleanShipment(merged, today);
        // the links already on the shipment stay (a file moved to SharePoint is not turned back into a monday.com link); only new files are added
        actions.push({ kind: kind === "link" ? "link" : "refresh", item, imp: { ...imp, files: mergeFiles(match.files, imp.files) }, shipmentId: match.id, filled, clean: cleaned.ok ? cleaned.value : null });
        continue;
      }
      if (count >= MAX_SHIPMENTS) {
        actions.push({ kind: "skip", item, imp, reason: `the project already has ${MAX_SHIPMENTS} shipments` });
        continue;
      }
      const cleaned = cleanShipment({ ...imp.input, customsStatus: imp.customsStatus ?? "NOT_STARTED" }, today);
      if (!cleaned.ok) {
        actions.push({ kind: "skip", item, imp, reason: cleaned.error });
        continue;
      }
      count++;
      actions.push({ kind: "create", item, imp, clean: cleaned.value });
    }
    plan.projects.push({ projectId: project.id, projectName: project.name, number, actions });
  }
  return plan;
}

const mondayFields = (imp: ShipmentImport) => ({ mondayUrl: imp.mondayUrl, shipper: imp.shipper, shippingMethod: imp.shippingMethod, files: imp.files as unknown as Prisma.InputJsonValue });

// Writes the plan. Each project is one transaction, so a failure leaves a project as it was.
export async function applyShipmentImport(plan: ImportPlan): Promise<{ created: number; linked: number; refreshed: number; skipped: number }> {
  const result = { created: 0, linked: 0, refreshed: 0, skipped: 0 };
  for (const p of plan.projects) {
    await prisma.$transaction(
      async (tx) => {
        for (const a of p.actions) {
          if (a.kind === "skip") {
            result.skipped++;
          } else if (a.kind === "create") {
            await tx.shipment.create({ data: { projectId: p.projectId, ...shipmentData(a.clean), mondayItemId: a.imp.mondayItemId, ...mondayFields(a.imp) } });
            result.created++;
          } else {
            // an existing shipment: its empty fields are filled, its links refreshed; what is typed or proposed is kept
            await tx.shipment.update({
              where: { id: a.shipmentId },
              data: {
                ...(a.clean ? shipmentData(a.clean) : {}),
                ...(a.kind === "link" ? { mondayItemId: a.imp.mondayItemId } : {}),
                mondayUrl: a.imp.mondayUrl,
                shipper: a.imp.shipper ?? undefined,
                shippingMethod: a.imp.shippingMethod ?? undefined,
                files: a.imp.files as unknown as Prisma.InputJsonValue,
              },
            });
            if (a.kind === "link") result.linked++;
            else result.refreshed++;
          }
        }
      },
      { timeout: 60000 },
    );
  }
  return result;
}
