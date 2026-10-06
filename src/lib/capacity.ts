// Project size is shown in kWp, the unit the contracts use. The exact contract figure (`capacityKwp`) wins;
// otherwise it is derived from the monday.com import, which keeps megawatts (rounded to 1 kWp).

type CapacityFields = { capacityKwp?: unknown; capacityMw?: unknown };

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function capacityKwp(p: CapacityFields): number | null {
  const exact = toNumber(p.capacityKwp);
  if (exact !== null && exact > 0) return round2(exact);
  const mw = toNumber(p.capacityMw);
  return mw !== null && mw > 0 ? round2(mw * 1000) : null;
}

// "9,408", "6,899.2", "996.84"; a dash when unknown.
export function formatKwp(kwp: number | null): string {
  return kwp === null ? "—" : kwp.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
