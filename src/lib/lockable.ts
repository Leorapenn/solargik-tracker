// Fields that also come from monday.com. Editing one by hand locks it, so the next import won't
// overwrite it; "unlock" lets the importer take over again (the value refreshes on the next import).
export const PROJECT_LOCKABLE = ["name", "country", "capacityMw", "contractValue", "lifecycle"] as const;
export const CUSTOMER_LOCKABLE = ["name", "importance"] as const;

export function isLocked(lockedFields: readonly string[] | null | undefined, field: string): boolean {
  return (lockedFields ?? []).includes(field);
}
