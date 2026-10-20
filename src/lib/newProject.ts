import { projectNamePart, projectNumber } from "@/lib/intakeDirectory";
import { CHOICES, EMPTY_PROFILE, LONG_TEXT_MAX, SHORT_TEXT_MAX, cleanProfile, type ChoiceField, type ProfileInput } from "@/lib/projectProfile";

// Projects created in 360 itself (an approved "New project" proposal from the Inbox), not imported from monday.com.
// Their project number comes from the project's SharePoint folder (it is made before the project reaches 360).

// What the reviewer can correct on the card before approving (text, as typed).
export const NEW_PROJECT_EDIT_KEYS = ["number", "name", "country", "capacityKwp", "contractAmount", "currency", "signedDate"] as const;

// The contract details a New project proposal may carry into the project's profile. Only what the signed document
// states; the project is new, so the profile is empty and each one fills a blank (a typed value is never replaced).
// "Timeline" = pile driving start, NTP date and the delivery schedule; "delivery terms" = the Incoterms, the supply
// terms (payment and delivery conditions) and the delivery / shipping address.
export const NEW_PROJECT_PROFILE_FIELDS = [
  { key: "incoterms", label: "Incoterms", type: "short" },
  { key: "supplyTerms", label: "Supply terms (payment and delivery conditions)", type: "long" },
  { key: "deliveryExpectations", label: "Delivery schedule and expectations", type: "long" },
  { key: "pileDrivingStart", label: "Pile driving start", type: "date" },
  { key: "ntpDate", label: "NTP date", type: "date" },
  { key: "supplyObligations", label: "Supply obligations (what, by when, warranties, penalties)", type: "long" },
  { key: "contractType", label: "Contract type", type: "choice" },
  { key: "soilTest", label: "SPT or GPT (Self- / Grid-Powered Tracker)", type: "choice" },
  { key: "soma", label: "SOMA", type: "short" },
  { key: "projectType", label: "Type of project / system", type: "short" },
  { key: "deliveryAddress", label: "Delivery address (site)", type: "long" },
  { key: "shippingAddress", label: "Shipping address", type: "long" },
] as const;
export type NewProjectProfileKey = (typeof NEW_PROJECT_PROFILE_FIELDS)[number]["key"];
export const NEW_PROJECT_PROFILE_KEYS = NEW_PROJECT_PROFILE_FIELDS.map((f) => f.key) as readonly NewProjectProfileKey[];
export type NewProjectProfile = Partial<Record<NewProjectProfileKey, string>>;
export type NewProjectEdits = Partial<Record<(typeof NEW_PROJECT_EDIT_KEYS)[number] | NewProjectProfileKey, string>>;
export const MAX_SOURCE_QUOTE = 300;

// "Tracker supply", "TRACKER_SUPPLY" and "tracker-supply" all mean TRACKER_SUPPLY; anything that is not one of the
// dropdown's options is left out (never guessed).
function choiceValue(field: ChoiceField, v: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  return CHOICES[field].find((c) => norm(c.value) === norm(v) || norm(c.label) === norm(v))?.value ?? "";
}

// Cleans the contract details of an incoming proposal. The result is only what passes the project profile's own
// validation, so approving can never fail on it later. Over-long text is cut, not refused.
export function cleanNewProjectProfile(rawProfile: unknown, rawSources: unknown): { ok: true; profile: NewProjectProfile; sources: Partial<Record<NewProjectProfileKey | "signedDate", string>> } | { ok: false; error: string } {
  const raw = typeof rawProfile === "object" && rawProfile !== null && !Array.isArray(rawProfile) ? (rawProfile as Record<string, unknown>) : {};
  const input: ProfileInput = { ...EMPTY_PROFILE };
  const profile: NewProjectProfile = {};
  for (const f of NEW_PROJECT_PROFILE_FIELDS) {
    const v = raw[f.key];
    let s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
    if (f.type === "choice") s = s ? choiceValue(f.key as ChoiceField, s) : "";
    if (f.type === "long") s = s.slice(0, LONG_TEXT_MAX);
    if (f.type === "short") s = s.replace(/\s+/g, " ").slice(0, SHORT_TEXT_MAX);
    if (!s) continue;
    input[f.key] = s;
    profile[f.key] = s;
  }
  const checked = cleanProfile(input);
  if (!checked.ok) return { ok: false, error: `"profile": ${checked.error}` };
  const src = typeof rawSources === "object" && rawSources !== null && !Array.isArray(rawSources) ? (rawSources as Record<string, unknown>) : {};
  const sources: Partial<Record<NewProjectProfileKey | "signedDate", string>> = {};
  for (const key of [...NEW_PROJECT_PROFILE_KEYS, "signedDate"] as const) {
    const q = src[key];
    if (typeof q === "string" && q.trim()) sources[key] = q.replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_QUOTE);
  }
  return { ok: true, profile, sources };
}

export const PROJECT_NUMBER_RE = /^\d{2,4}$/;

// "370", "Blumberg" -> "370-Blumberg" (the way every project in 360 is named). A name typed with its number already in
// front ("370-Blumberg", "370 Blumberg") keeps just one number.
export function newProjectName(number: string, name: string): string {
  return `${number.trim()}-${projectNamePart(name) || name.trim()}`;
}

// Why a new project must not be created, or null when it is fine: the number is taken, or the same name exists.
export function projectClash(number: string, fullName: string, existing: { name: string }[]): string | null {
  const sameNumber = existing.find((p) => projectNumber(p.name) === number);
  if (sameNumber) return `Project number ${number} already exists ("${sameNumber.name}"). Correct the number, or reject this if the project is already in 360.`;
  const sameName = existing.find((p) => p.name.trim().toLowerCase() === fullName.trim().toLowerCase());
  if (sameName) return `A project called "${sameName.name}" already exists.`;
  return null;
}

type Native = { id: string; name: string; customerId: string; mondayItemId: string | null };

// When monday.com is imported later: the project in 360 that this monday.com item is, if one was created here first.
// It must have no monday.com link yet, the same project number and the same customer, and be the only such project.
export function findNativeProject(candidates: Native[], incomingName: string, customerId: string): Native | null {
  const number = projectNumber(incomingName);
  if (!number) return null;
  const hits = candidates.filter((p) => p.mondayItemId === null && p.customerId === customerId && projectNumber(p.name) === number);
  return hits.length === 1 ? hits[0] : null;
}

// Linking must never overwrite what 360 already holds: every monday.com-sourced field that already has a value is
// locked, so the import only fills the empty ones (the same "your edit wins" lock a hand edit uses).
export function fieldsToLockOnLink(p: { name: string; contractValue: unknown; capacityMw: unknown; country: string | null; lockedFields: string[] }): string[] {
  const filled: string[] = [];
  if (p.name.trim()) filled.push("name");
  if (p.contractValue !== null && p.contractValue !== undefined) filled.push("contractValue");
  if (p.capacityMw !== null && p.capacityMw !== undefined) filled.push("capacityMw");
  if (p.country && p.country.trim()) filled.push("country");
  return [...new Set([...p.lockedFields, ...filled])];
}
