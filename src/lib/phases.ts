import type { PhaseName } from "@prisma/client";

// Fixed order the six phases are created in for every project.
export const PHASE_ORDER: PhaseName[] = [
  "INITIATION",
  "DESIGN",
  "SUPPLY",
  "CONSTRUCTION",
  "COMMISSIONING",
  "OM",
];

const PHASE_NAMES: Record<PhaseName, string> = {
  INITIATION: "Initiation",
  DESIGN: "Design",
  SUPPLY: "Supply",
  CONSTRUCTION: "Construction",
  COMMISSIONING: "Commissioning",
  OM: "O&M",
};

export function phaseLabel(name: PhaseName): string {
  const index = PHASE_ORDER.indexOf(name);
  return `${String(index).padStart(2, "0")} ${PHASE_NAMES[name]}`;
}
