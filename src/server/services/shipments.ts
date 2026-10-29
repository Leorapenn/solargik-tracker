import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { DATE_KEYS, MAX_SHIPMENTS, cleanShipment, findShipment, sortShipments, type CleanShipment, type ShipmentInput } from "@/lib/shipments";

const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const todayIso = () => toDateInputValue(todayInAppTz());

export type ShipmentView = {
  id: string;
  projectId: string;
  reference: string;
  goods: string | null;
  forwarder: string | null;
  vessel: string | null;
  containers: string[];
  portOfLoading: string | null;
  portOfDischarge: string | null;
  status: string;
  customsStatus: string;
  etd: string | null;
  eta: string | null;
  arrivedAt: string | null;
  customsClearedAt: string | null;
  deliveryDate: string | null;
  deliveredAt: string | null;
  notes: string | null;
  sourceLink: string | null;
};

type Row = Awaited<ReturnType<typeof prisma.shipment.findMany>>[number];

const toView = (s: Row): ShipmentView => ({
  id: s.id,
  projectId: s.projectId,
  reference: s.reference,
  goods: s.goods,
  forwarder: s.forwarder,
  vessel: s.vessel,
  containers: s.containers,
  portOfLoading: s.portOfLoading,
  portOfDischarge: s.portOfDischarge,
  status: s.status,
  customsStatus: s.customsStatus,
  etd: iso(s.etd),
  eta: iso(s.eta),
  arrivedAt: iso(s.arrivedAt),
  customsClearedAt: iso(s.customsClearedAt),
  deliveryDate: iso(s.deliveryDate),
  deliveredAt: iso(s.deliveredAt),
  notes: s.notes,
  sourceLink: s.sourceLink,
});

// A project's shipments: the ones still on their way first (nearest first), delivered ones last.
export async function listShipments(projectId: string): Promise<ShipmentView[]> {
  if (!projectId) return [];
  const rows = await prisma.shipment.findMany({ where: { projectId } });
  return sortShipments(rows.map(toView));
}

const data = (v: CleanShipment) => ({
  reference: v.reference,
  goods: v.goods,
  forwarder: v.forwarder,
  vessel: v.vessel,
  containers: v.containers,
  portOfLoading: v.portOfLoading,
  portOfDischarge: v.portOfDischarge,
  status: v.status,
  customsStatus: v.customsStatus,
  etd: day(v.etd),
  eta: day(v.eta),
  arrivedAt: day(v.arrivedAt),
  customsClearedAt: day(v.customsClearedAt),
  deliveryDate: day(v.deliveryDate),
  deliveredAt: day(v.deliveredAt),
  notes: v.notes,
});

async function requireProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new UserError("That project no longer exists.");
}

// Adds a shipment (id empty) or edits one, from the form.
export async function saveShipment(projectId: string, id: string | null, input: Partial<Record<keyof ShipmentInput, unknown>>): Promise<string> {
  const cleaned = cleanShipment(input, todayIso());
  if (!cleaned.ok) throw new UserError(cleaned.error);
  await requireProject(projectId);
  if (id) {
    const found = await prisma.shipment.updateMany({ where: { id, projectId }, data: data(cleaned.value) });
    if (found.count === 0) throw new UserError("That shipment no longer exists.");
    return id;
  }
  if ((await prisma.shipment.count({ where: { projectId } })) >= MAX_SHIPMENTS) throw new UserError(`A project can have at most ${MAX_SHIPMENTS} shipments.`);
  return (await prisma.shipment.create({ data: { projectId, ...data(cleaned.value) }, select: { id: true } })).id;
}

export async function deleteShipment(projectId: string, id: string): Promise<void> {
  const gone = await prisma.shipment.deleteMany({ where: { id, projectId } });
  if (gone.count === 0) throw new UserError("That shipment no longer exists.");
}

// What an approved SHIPMENT_UPDATE proposal says: only the facts it states. They are laid over the matching shipment (the same
// reference, else the one sharing a container number) and checked together; none matching creates a new one; an unclear match is refused.
// Containers are added to the list (never dropped). Returns a note for the Inbox.
export type ShipmentProposal = Partial<Record<Exclude<keyof ShipmentInput, "containers">, string>> & { reference: string; containers?: string[] };

export async function applyShipmentProposal(projectId: string, proposal: ShipmentProposal, sourceLink: string | null): Promise<string> {
  await requireProject(projectId);
  const existing = (await prisma.shipment.findMany({ where: { projectId } })).map(toView);
  const incomingContainers = proposal.containers ?? [];
  const match = findShipment(existing, proposal.reference, incomingContainers);
  if (match === "many") throw new UserError(`Several shipments match "${proposal.reference}". Reject this and update the right one on the project page.`);

  const base: Partial<Record<keyof ShipmentInput, unknown>> = match
    ? { ...match, containers: [...new Set([...match.containers, ...incomingContainers])].join(", ") }
    : { reference: proposal.reference, containers: incomingContainers.join(", "), status: "BOOKED", customsStatus: "NOT_STARTED" };
  const merged: Partial<Record<keyof ShipmentInput, unknown>> = { ...base };
  for (const [key, value] of Object.entries(proposal)) {
    if (key === "containers" || key === "reference" || value === undefined || value === null || value === "") continue;
    merged[key as keyof ShipmentInput] = value;
  }
  // a name change only when the shipment was found by its containers: keep the existing name
  if (match) merged.reference = match.reference;
  const cleaned = cleanShipment(merged, todayIso());
  if (!cleaned.ok) throw new UserError(cleaned.error);

  if (match) {
    await prisma.shipment.update({ where: { id: match.id }, data: { ...data(cleaned.value), ...(sourceLink ? { sourceLink } : {}) } });
    return `Shipment "${match.reference}" updated.`;
  }
  if (existing.length >= MAX_SHIPMENTS) throw new UserError(`A project can have at most ${MAX_SHIPMENTS} shipments.`);
  await prisma.shipment.create({ data: { projectId, ...data(cleaned.value), sourceLink } });
  return `Shipment "${cleaned.value.reference}" added to the project.`;
}

export const SHIPMENT_DATE_KEYS = DATE_KEYS;
