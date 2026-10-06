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
    soilTest: p.soilTest ?? "",
    intercoms: p.intercoms ?? "",
    soma: p.soma ?? "",
    ntpDate: iso(p.ntpDate),
    projectType: p.projectType ?? "",
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
    soilTest: choices.soilTest,
    intercoms: text.intercoms,
    soma: text.soma,
    ntpDate: day(dates.ntpDate),
    projectType: text.projectType,
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
