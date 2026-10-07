// (a type-only import, so there is no import cycle with projectProfile.ts)
import type { Choice } from "@/lib/projectProfile";

// What kind of customer it is. The same options as the "Customer Type" column of the monday.com Control Table.
const choice = (value: string, label: string, bg: string, text: string): Choice => ({ value, label, bg, text });

export const CUSTOMER_TYPES: Choice[] = [
  choice("EPC", "EPC", "#DCE8FB", "#1D4F9F"),
  choice("DEVELOPER", "Developer", "#D8F5E3", "#047857"),
  choice("DEVELOPER_EPC", "Developer / EPC", "#E3F2F1", "#0F6A63"),
  choice("INVESTOR", "Investor", "#EBE0F8", "#5B2C97"),
  choice("END_USER", "End user / behind the meter", "#FDE3CF", "#9A4B00"),
];

export const customerTypeChoice = (value: string | null | undefined): Choice | null => CUSTOMER_TYPES.find((c) => c.value === value) ?? null;
export const isCustomerType = (value: unknown): value is string => CUSTOMER_TYPES.some((c) => c.value === value);

// monday.com's label text -> our value ("End User / Behind the Meter" -> END_USER); null for blank or unknown labels.
export function customerTypeFromMonday(label: string | null | undefined): string | null {
  const t = (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (t === "epc") return "EPC";
  if (t === "developer") return "DEVELOPER";
  if (t === "developer/epc" || t === "developer / epc") return "DEVELOPER_EPC";
  if (t === "investor") return "INVESTOR";
  if (t.startsWith("end user")) return "END_USER";
  return null;
}
