import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { EMPTY_PROFILE, cleanProfile, type ProfileInput } from "@/lib/projectProfile";

const iso = (d: Date | null | undefined) => (d ? toDateInputValue(d) : "");
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

// The saved profile as the form's text values (blank where nothing is saved yet).
export async function getProfile(projectId: string): Promise<ProfileInput> {
  const p = await prisma.projectProfile.findUnique({ where: { projectId } });
  if (!p) return { ...EMPTY_PROFILE };
  return {
    pileDrivingStart: iso(p.pileDrivingStart),
    deliveryExpectations: p.deliveryExpectations ?? "",
    supplyTerms: p.supplyTerms ?? "",
    supplyObligations: p.supplyObligations ?? "",
    contractType: p.contractType ?? "",
    customerType: p.customerType ?? "",
    soilTest: p.soilTest ?? "",
    incoterms: p.incoterms ?? "",
    soma: p.soma ?? "",
    ntpDate: iso(p.ntpDate),
    projectType: p.projectType ?? "",
    shippingAddress: p.shippingAddress ?? "",
    deliveryAddress: p.deliveryAddress ?? "",
    siteContactName: p.siteContactName ?? "",
    siteContactPhone: p.siteContactPhone ?? "",
    siteContactEmail: p.siteContactEmail ?? "",
    siteHours: p.siteHours ?? "",
    siteAccess: p.siteAccess ?? "",
    siteCoordinates: p.siteCoordinates ?? "",
    contractLink: p.contractLink ?? "",
    projectEngineerId: p.projectEngineerId ?? "",
    designNotes: p.designNotes ?? "",
    designQuestionnaireReceived: iso(p.designQuestionnaireReceived),
    designInfoStatus: p.designInfoStatus ?? "",
    geotechStatus: p.geotechStatus ?? "",
    initialLayoutSent: iso(p.initialLayoutSent),
    genioCivileStatus: p.genioCivileStatus ?? "",
    bomStatus: p.bomStatus ?? "",
  };
}

// The signing date taken from the contract itself (set from the contract, not typed in the profile form). When
// present it is shown as the project's contract signing date instead of the Contract Signing item's date, which
// is often just the day the item was ticked.
export async function getContractSigningDate(projectId: string): Promise<string | null> {
  const p = await prisma.projectProfile.findUnique({ where: { projectId }, select: { contractSigningDate: true } });
  return p?.contractSigningDate ? toDateInputValue(p.contractSigningDate) : null;
}

// What an approved SITE_INFO proposal says: the stated site details are laid over the profile (the rest of it is kept as it is) and
// saved through the normal validation. A value that is replaced is named in the note with its old text, so nothing is lost silently.
export async function applySiteInfo(projectId: string, facts: Partial<Record<keyof ProfileInput, string>>, labels: Partial<Record<keyof ProfileInput, string>>): Promise<string> {
  const current = await getProfile(projectId);
  const changed: string[] = [];
  const replaced: string[] = [];
  const next: ProfileInput = { ...current };
  for (const [key, value] of Object.entries(facts) as [keyof ProfileInput, string][]) {
    if (!value || current[key] === value) continue;
    if (current[key]) replaced.push(`${labels[key] ?? key} was "${current[key].replace(/\s+/g, " ").slice(0, 120)}"`);
    next[key] = value;
    changed.push(labels[key] ?? key);
  }
  if (changed.length === 0) return "The project's Site information already had all of this.";
  await saveProfile(projectId, next);
  return `Site information saved (${changed.join(", ")}).${replaced.length ? ` Replaced: ${replaced.join("; ")}.` : ""}`;
}

export async function saveProfile(projectId: string, input: Partial<Record<keyof ProfileInput, unknown>>): Promise<void> {
  const cleaned = cleanProfile(input);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const { text, dates, choices, contractLink, projectEngineerId } = cleaned.value;

  if (!(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) throw new UserError("That project no longer exists.");
  if (projectEngineerId && !(await prisma.person.findUnique({ where: { id: projectEngineerId }, select: { id: true } }))) {
    throw new UserError("That project engineer isn't in the People list.");
  }

  const data = {
    pileDrivingStart: day(dates.pileDrivingStart),
    deliveryExpectations: text.deliveryExpectations,
    supplyTerms: text.supplyTerms,
    supplyObligations: text.supplyObligations,
    contractType: choices.contractType,
    customerType: choices.customerType,
    soilTest: choices.soilTest,
    incoterms: text.incoterms,
    soma: text.soma,
    ntpDate: day(dates.ntpDate),
    projectType: text.projectType,
    shippingAddress: text.shippingAddress,
    deliveryAddress: text.deliveryAddress,
    siteContactName: text.siteContactName,
    siteContactPhone: text.siteContactPhone,
    siteContactEmail: text.siteContactEmail,
    siteHours: text.siteHours,
    siteAccess: text.siteAccess,
    siteCoordinates: text.siteCoordinates,
    contractLink,
    projectEngineerId,
    designNotes: text.designNotes,
    designQuestionnaireReceived: day(dates.designQuestionnaireReceived),
    designInfoStatus: choices.designInfoStatus,
    geotechStatus: choices.geotechStatus,
    initialLayoutSent: day(dates.initialLayoutSent),
    genioCivileStatus: choices.genioCivileStatus,
    bomStatus: choices.bomStatus,
  };
  await prisma.projectProfile.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
}
