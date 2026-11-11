// Which Supply "Delivery" sub-stage a shipment's goods belong to, from the text of its packing list or invoice: Solargik's own part numbers
// (DU-..., PI-P-..., BS-..., MC-1...) and the words on the list. Deterministic: no AI. It only suggests; a person confirms.

export const DELIVERY_ITEMS = ["PILES", "TRACKER_STRUCTURE", "DRIVE_UNITS_IC"] as const;
export type DeliveryItem = (typeof DELIVERY_ITEMS)[number];

// The names of the sub-stages in the project template (SUPPLY phase), as in src/lib/projectProfile.ts and the warranty.
export const DELIVERY_ITEM_NAMES: Record<DeliveryItem, string> = {
  PILES: "Delivery – Piles",
  TRACKER_STRUCTURE: "Delivery – Tracker Structure",
  DRIVE_UNITS_IC: "Delivery – Drive Units & I&C",
};

// Part-number prefixes and words, per sub-stage. Matched on the upper-cased text.
const RULES: Record<DeliveryItem, RegExp[]> = {
  // foundation piles
  PILES: [/\bPILES?\b(?!\s*DRIV)/, /\bFOUNDATION PILES?\b/],
  // pylons, torque tubes, beams, purlins, brackets, bearings, U-bolts: the mechanical structure
  TRACKER_STRUCTURE: [/\bPI-P-\d/, /\bPYLONS?\b/, /\bTORQUE TUBES?\b/, /\bSHS\s?\d/, /\bZ-?PURLINS?\b|\bPURLINS?\b/, /\bBRACKETS?\b/, /\b(BS|TB|PS)-[AP]-\d/, /\bBEARING (SYSTEM|ADAPTER)/, /\bUB-P-/, /\bU-BOLTS?\b/, /\bIPE[ -]?\d/, /\bBEAMS?\b/, /\bTRACKER STRUCTURE\b/],
  // drive units, controls, power distribution, motors, cables: drive units and I&C
  DRIVE_UNITS_IC: [/\bDU-[A-Z0-9]/, /\bDRIVE UNITS?\b/, /\b(MC|LC)-[A-Z0-9]/, /\bPDU\b|\bPDU-\d/, /\bPCBA\b/, /\bMASTER CONTROL\b|\bCONTROL (STATION|BOX|UNIT)S?\b/, /\bMOTORS?\b/, /\bGEAR ?BOX\b|\bACTUATORS?\b/, /\bMW-A-\d/, /\bCABLES?\b/, /\bETH-\d/, /\bMSC\.\d/],
};

// Generic hardware (screws, nuts, washers) belongs with whatever it ships with: it decides the sub-stage only when nothing else is on the list.
const FASTENERS = /\bDIN ?\d{3,4}|\bISO ?\d{3,5}|\b(HEX )?(SCREWS?|NUTS?|WASHERS?|BOLTS?)\b|\bFASTENERS?\b/;

export type Classification = {
  items: DeliveryItem[]; // the sub-stages the goods belong to, in this order of DELIVERY_ITEMS
  hits: Record<DeliveryItem, string[]>; // what matched, for showing why
  fastenersOnly: boolean; // true when only generic hardware was found (counted as the tracker structure)
};

export function classifyGoods(text: string | null | undefined): Classification {
  const upper = (text ?? "").toUpperCase().replace(/\s+/g, " ");
  const hits: Record<DeliveryItem, string[]> = { PILES: [], TRACKER_STRUCTURE: [], DRIVE_UNITS_IC: [] };
  for (const item of DELIVERY_ITEMS) {
    for (const re of RULES[item]) {
      const m = re.exec(upper);
      if (m && !hits[item].includes(m[0])) hits[item].push(m[0]);
    }
  }
  let items = DELIVERY_ITEMS.filter((i) => hits[i].length > 0);
  let fastenersOnly = false;
  if (items.length === 0 && FASTENERS.test(upper)) {
    items = ["TRACKER_STRUCTURE"];
    hits.TRACKER_STRUCTURE.push(FASTENERS.exec(upper)![0]);
    fastenersOnly = true;
  }
  return { items, hits, fastenersOnly };
}
