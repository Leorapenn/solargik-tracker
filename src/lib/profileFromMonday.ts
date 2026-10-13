import { customerTypeFromMonday } from "@/lib/customerType";
import type { ProfileInput } from "@/lib/projectProfile";

// Filling a project's profile from monday.com (read-only). The profile was modelled on these columns of the Supply
// Projects board, so most fields have a source; the few that don't (intercoms, shipping and delivery address) are left
// alone. Only EMPTY profile fields are ever filled: a value somebody typed is never replaced.

// Supply Projects board (6272830165) column ids.
export const SUPPLY_COLUMNS = {
  pileDrivingStart: "customer_expectation0__1", // Customer Ideal Pile Driving Start
  deliveryExpectations: "text9", // Delivery Expectation - Notes
  supplyTerms: "text_mkm7ccbj", // Contractual Supply Terms
  supplyObligations: "text_mkmsh6eb", // Contractual Supply Obligation Notes
  soilTest: "lookup_mkqq2n9w", // SPT/GPT (mirror)
  soma: "mirror1__1", // SOMA (mirror)
  ntpDate: "date_mknqyt1w", // NTP Date
  projectType: "mirror_1_mkm0pvhs", // Type (mirror)
  customerType: "label__1", // Customer Type 1
  projectEngineer: "people__1", // P Eng
  designNotes: "text_mkngqf3a", // Design Notes
  designQuestionnaireReceived: "date_mkpbe7cv", // DQ Received
  designInfoStatus: "color_mkngnbx5", // Design Info Received
  geotechStatus: "color_mkr2zmqj", // POT/Geotech Analysis
  designOneDate: "date_1", // Design 1 (initial)
  designOneStatus: "status_16", // D1 Status
  genioCivileStatus: "color_mkqeygcm", // Genio Civile Status
  bomStatus: "status_14", // BOM status
} as const;

// Control Table board (5738893445) column ids.
export const CONTROL_COLUMNS = {
  contractType: "contract", // Contract Type
  contractLink: "link__1", // Contract (Link)
  // the Supply board's mirrors of these are not readable through the API, the Control Table's own columns are
  soilTest: "dropdown83__1", // SPT / GPT
  soma: "soma", // Contractual SOMA
  projectType: "type", // Installation Type
  customerType: "end_customer_type", // Customer Type (used when the Supply board's "Customer Type 1" is blank)
} as const;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const labelMap = (map: Record<string, string>, label: string | null | undefined): string | null => map[norm(label)] ?? null;

export const DESIGN_INFO_LABELS = { "all received": "ALL_RECEIVED", "working on it": "WORKING" };
export const GEOTECH_LABELS = { done: "DONE", "working on it": "WORKING", stuck: "STUCK" };
export const GENIO_CIVILE_LABELS = { sent: "SENT", "not needed": "NA", "needed & unsent": "NEEDED" };
export const BOM_LABELS = { "preliminary bom": "PRELIMINARY", "complete bom (ifc)": "COMPLETE_IFC", "bom w/o i&c": "WITHOUT_IC", ifi: "IFI" };
export const CONTRACT_TYPE_LABELS = { epc: "EPC", "tracker supply": "TRACKER_SUPPLY", pilot: "PILOT" };

// monday.com date columns come as "YYYY-MM-DD"; anything else is left out.
export function dateFromMonday(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}

// "SPT" or "GPT" when the mirrored text names exactly one of them.
export function soilTestFromMonday(text: string | null | undefined): string | null {
  const found = new Set((text ?? "").toUpperCase().match(/\b(SPT|GPT)\b/g) ?? []);
  return found.size === 1 ? [...found][0] : null;
}

// The URL of a monday.com link column (its raw value is {"url": "...", "text": "..."}); web addresses only.
export function linkFromMonday(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  try {
    const url = (JSON.parse(rawValue) as { url?: string }).url?.trim();
    if (!url) return null;
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// A person's id from monday's "P Eng" names, when exactly ONE listed person is in People (by exact name, any case).
export function engineerFromMonday(namesText: string | null | undefined, people: { id: string; name: string }[]): string | null {
  const names = (namesText ?? "").split(",").map(norm).filter(Boolean);
  const ids = new Set<string>();
  for (const name of names) for (const p of people) if (norm(p.name) === name) ids.add(p.id);
  return ids.size === 1 ? [...ids][0] : null;
}

const text = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").replace(/\r\n/g, "\n").trim();
  return t && t.length <= max ? t : null;
};

export type SupplyValues = Record<keyof typeof SUPPLY_COLUMNS, string | null>;
export type ControlValues = { contractType: string | null; contractLinkRaw: string | null; soilTest: string | null; soma: string | null; projectType: string | null; customerType: string | null };

// Everything monday.com can tell about one project, as profile form values. A key is present only when monday has a
// usable value (blank, unknown labels and over-long text are left out and reported by the caller).
export function incomingFromMonday(supply: SupplyValues, control: ControlValues | null, people: { id: string; name: string }[]): Partial<ProfileInput> {
  const out: Partial<ProfileInput> = {};
  const set = <K extends keyof ProfileInput>(key: K, value: string | null) => {
    if (value) out[key] = value as ProfileInput[K];
  };
  set("pileDrivingStart", dateFromMonday(supply.pileDrivingStart));
  set("deliveryExpectations", text(supply.deliveryExpectations, 4000));
  set("supplyTerms", text(supply.supplyTerms, 4000));
  set("supplyObligations", text(supply.supplyObligations, 4000));
  set("soilTest", soilTestFromMonday(supply.soilTest) ?? soilTestFromMonday(control?.soilTest));
  set("soma", text(supply.soma, 200) ?? text(control?.soma, 200));
  set("ntpDate", dateFromMonday(supply.ntpDate));
  set("projectType", text(supply.projectType, 200) ?? text(control?.projectType, 200));
  set("customerType", customerTypeFromMonday(supply.customerType) ?? customerTypeFromMonday(control?.customerType));
  set("projectEngineerId", engineerFromMonday(supply.projectEngineer, people));
  set("designNotes", text(supply.designNotes, 4000));
  set("designQuestionnaireReceived", dateFromMonday(supply.designQuestionnaireReceived));
  set("designInfoStatus", labelMap(DESIGN_INFO_LABELS, supply.designInfoStatus));
  set("geotechStatus", labelMap(GEOTECH_LABELS, supply.geotechStatus));
  set("genioCivileStatus", labelMap(GENIO_CIVILE_LABELS, supply.genioCivileStatus));
  set("bomStatus", labelMap(BOM_LABELS, supply.bomStatus));
  // the layout date only counts as "sent" when monday's D1 status says Sent
  if (norm(supply.designOneStatus) === "sent") set("initialLayoutSent", dateFromMonday(supply.designOneDate));
  if (control) {
    set("contractType", labelMap(CONTRACT_TYPE_LABELS, control.contractType));
    set("contractLink", linkFromMonday(control.contractLinkRaw));
  }
  return out;
}

// What would change: only the fields that are EMPTY in the saved profile get a value; the rest are kept as they are.
export function planFill(current: ProfileInput, incoming: Partial<ProfileInput>): { fill: Partial<ProfileInput>; kept: (keyof ProfileInput)[] } {
  const fill: Partial<ProfileInput> = {};
  const kept: (keyof ProfileInput)[] = [];
  for (const key of Object.keys(incoming) as (keyof ProfileInput)[]) {
    if ((current[key] ?? "").trim() === "") fill[key] = incoming[key];
    else kept.push(key);
  }
  return { fill, kept };
}

// The labels monday sent that we don't know, so they can be reported instead of silently dropped.
export function unknownLabels(supply: SupplyValues, control: ControlValues | null): string[] {
  const problems: string[] = [];
  const check = (name: string, label: string | null, known: Record<string, string>) => {
    if (norm(label) && !(norm(label) in known)) problems.push(`${name}: "${label}"`);
  };
  check("Design Info Received", supply.designInfoStatus, DESIGN_INFO_LABELS);
  check("Geotech", supply.geotechStatus, GEOTECH_LABELS);
  check("Genio Civile", supply.genioCivileStatus, GENIO_CIVILE_LABELS);
  check("BOM status", supply.bomStatus, BOM_LABELS);
  if (control) check("Contract Type", control.contractType, CONTRACT_TYPE_LABELS);
  if (norm(supply.customerType) && !customerTypeFromMonday(supply.customerType)) problems.push(`Customer Type: "${supply.customerType}"`);
  for (const soil of [supply.soilTest, control?.soilTest]) if (norm(soil) && !soilTestFromMonday(soil)) problems.push(`SPT/GPT: "${soil}"`);
  return problems;
}
