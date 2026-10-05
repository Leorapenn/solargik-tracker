import type { StageStatus } from "@prisma/client";

// The project profile: dropdown options (all colored), what each field accepts, and the values that are
// shown from existing sub-stages instead of being stored again.

export type Choice = { value: string; label: string; bg: string; text: string };
const choice = (value: string, label: string, bg: string, text: string): Choice => ({ value, label, bg, text });

const GREEN = ["#D8F5E3", "#047857"] as const;
const AMBER = ["#FEF0D2", "#8A5A00"] as const;
const RED = ["#FCE0DD", "#8C1D18"] as const;
const BLUE = ["#DCE8FB", "#1D4F9F"] as const;
const PURPLE = ["#EBE0F8", "#5B2C97"] as const;
const GRAY = ["#E4E6EC", "#4A4F5C"] as const;
const ORANGE = ["#FDE3CF", "#9A4B00"] as const;

// A blank (null) is the default for every dropdown and shows as an empty box, never a word.
export const SOIL_TESTS: Choice[] = [choice("SPT", "SPT", ...BLUE), choice("GPT", "GPT", ...PURPLE)];
export const DESIGN_INFO: Choice[] = [choice("WORKING", "Working on it", ...AMBER), choice("ALL_RECEIVED", "All Received", ...GREEN)];
export const GEOTECH: Choice[] = [choice("DONE", "Done", ...GREEN), choice("WORKING", "Working on it", ...AMBER), choice("STUCK", "Stuck", ...RED)];
export const GENIO_CIVILE: Choice[] = [choice("SENT", "Sent", ...GREEN), choice("NA", "N/A", ...GRAY), choice("NEEDED", "Needed - Not Sent", ...RED)];
export const BOM_STATUS: Choice[] = [
  choice("IFI", "IFI", ...BLUE),
  choice("PRELIMINARY", "Preliminary BOM", ...AMBER),
  choice("WITHOUT_IC", "BOM w/o I&C", ...ORANGE),
  choice("COMPLETE_IFC", "Complete BOM (IFC)", ...GREEN),
];

export type ChoiceField = "soilTest" | "designInfoStatus" | "geotechStatus" | "genioCivileStatus" | "bomStatus";
export const CHOICES: Record<ChoiceField, Choice[]> = {
  soilTest: SOIL_TESTS,
  designInfoStatus: DESIGN_INFO,
  geotechStatus: GEOTECH,
  genioCivileStatus: GENIO_CIVILE,
  bomStatus: BOM_STATUS,
};

export const choiceFor = (field: ChoiceField, value: string | null | undefined): Choice | null =>
  CHOICES[field].find((c) => c.value === value) ?? null;

// ---- what the form sends and the server stores ----

export type DateText = string; // "YYYY-MM-DD" or "" for none
export type ProfileInput = {
  pileDrivingStart: DateText;
  deliveryExpectations: string;
  supplyTerms: string;
  supplyObligations: string;
  soilTest: string;
  intercoms: string;
  soma: string;
  ntpDate: DateText;
  projectType: string;
  contractLink: string;
  projectEngineerId: string;
  designNotes: string;
  designQuestionnaireReceived: DateText;
  designInfoStatus: string;
  geotechStatus: string;
  initialLayoutSent: DateText;
  genioCivileStatus: string;
  bomStatus: string;
};

export const EMPTY_PROFILE: ProfileInput = {
  pileDrivingStart: "",
  deliveryExpectations: "",
  supplyTerms: "",
  supplyObligations: "",
  soilTest: "",
  intercoms: "",
  soma: "",
  ntpDate: "",
  projectType: "",
  contractLink: "",
  projectEngineerId: "",
  designNotes: "",
  designQuestionnaireReceived: "",
  designInfoStatus: "",
  geotechStatus: "",
  initialLayoutSent: "",
  genioCivileStatus: "",
  bomStatus: "",
};

export const LONG_TEXT_MAX = 4000;
export const SHORT_TEXT_MAX = 200;

export type CleanProfile = {
  text: Record<"deliveryExpectations" | "supplyTerms" | "supplyObligations" | "intercoms" | "soma" | "projectType" | "designNotes", string | null>;
  dates: Record<"pileDrivingStart" | "ntpDate" | "designQuestionnaireReceived" | "initialLayoutSent", string | null>;
  choices: Record<ChoiceField, string | null>;
  contractLink: string | null;
  projectEngineerId: string | null;
};

// Validates untrusted form input. Returns the cleaned values or the first problem as a plain message.
export function cleanProfile(input: Partial<Record<keyof ProfileInput, unknown>>): { ok: true; value: CleanProfile } | { ok: false; error: string } {
  const str = (key: keyof ProfileInput) => (typeof input[key] === "string" ? (input[key] as string) : "");
  const text = (key: keyof ProfileInput, label: string, max: number): string | null | Error => {
    const v = str(key).replace(/\r\n/g, "\n").trim();
    if (!v) return null;
    return v.length > max ? new Error(`${label} is too long (at most ${max} characters).`) : v;
  };
  const date = (key: keyof ProfileInput, label: string): string | null | Error => {
    const v = str(key).trim();
    if (!v) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
    return ok ? v : new Error(`${label} isn't a valid date.`);
  };

  const result: CleanProfile = {
    text: { deliveryExpectations: null, supplyTerms: null, supplyObligations: null, intercoms: null, soma: null, projectType: null, designNotes: null },
    dates: { pileDrivingStart: null, ntpDate: null, designQuestionnaireReceived: null, initialLayoutSent: null },
    choices: { soilTest: null, designInfoStatus: null, geotechStatus: null, genioCivileStatus: null, bomStatus: null },
    contractLink: null,
    projectEngineerId: null,
  };

  const longText = { deliveryExpectations: "Delivery expectations", supplyTerms: "Supply terms", supplyObligations: "Supply obligations", designNotes: "Design notes" } as const;
  const shortText = { intercoms: "Intercoms", soma: "SOMA", projectType: "Type" } as const;
  for (const [key, label] of Object.entries(longText)) {
    const v = text(key as keyof ProfileInput, label, LONG_TEXT_MAX);
    if (v instanceof Error) return { ok: false, error: v.message };
    result.text[key as keyof typeof longText] = v;
  }
  for (const [key, label] of Object.entries(shortText)) {
    const v = text(key as keyof ProfileInput, label, SHORT_TEXT_MAX);
    if (v instanceof Error) return { ok: false, error: v.message };
    result.text[key as keyof typeof shortText] = v;
  }

  const dateLabels = {
    pileDrivingStart: "Customer ideal pile driving start",
    ntpDate: "NTP date",
    designQuestionnaireReceived: "Design questionnaire received",
    initialLayoutSent: "Initial layout sent",
  } as const;
  for (const [key, label] of Object.entries(dateLabels)) {
    const v = date(key as keyof ProfileInput, label);
    if (v instanceof Error) return { ok: false, error: v.message };
    result.dates[key as keyof typeof dateLabels] = v;
  }

  for (const field of Object.keys(CHOICES) as ChoiceField[]) {
    const v = str(field).trim();
    if (v && !CHOICES[field].some((c) => c.value === v)) return { ok: false, error: "One of the dropdowns has an option that doesn't exist." };
    result.choices[field] = v || null;
  }

  const link = str("contractLink").trim();
  if (link) {
    if (link.length > 1000) return { ok: false, error: "The contract link is too long." };
    let url: URL | null = null;
    try {
      url = new URL(link);
    } catch {
      /* handled below */
    }
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return { ok: false, error: "The contract link must be a web address starting with https://" };
    result.contractLink = url.toString();
  }

  result.projectEngineerId = str("projectEngineerId").trim() || null;
  return { ok: true, value: result };
}

// ---- values shown from the project's own sub-stages (read-only on the profile) ----

export type LinkedItem = { phaseName: string; name: string; status: StageStatus; completedAt: string | null };

export const LINKED_ITEMS = {
  contractSigning: { phase: "INITIATION", name: "Contract Signing & Project Opening" },
  internalKickoff: { phase: "INITIATION", name: "Internal Kickoff" },
  clientKickoff: { phase: "INITIATION", name: "Customer Kickoff" },
  initialLayoutApproval: { phase: "DESIGN", name: "Initial Layout Approval" },
  bomRelease: { phase: "DESIGN", name: "Mechanical BOM Release" },
  designPackage: { phase: "DESIGN", name: "Design Package Release to Customer" },
} as const;
export type LinkedKey = keyof typeof LINKED_ITEMS;

export type LinkedValue = { found: boolean; status: StageStatus | null; date: string | null };

export function linkedValues(items: LinkedItem[]): Record<LinkedKey, LinkedValue> {
  const out = {} as Record<LinkedKey, LinkedValue>;
  for (const [key, ref] of Object.entries(LINKED_ITEMS) as [LinkedKey, (typeof LINKED_ITEMS)[LinkedKey]][]) {
    const item = items.find((i) => i.phaseName === ref.phase && i.name === ref.name);
    out[key] = item ? { found: true, status: item.status, date: item.status === "DONE" ? item.completedAt : null } : { found: false, status: null, date: null };
  }
  return out;
}
