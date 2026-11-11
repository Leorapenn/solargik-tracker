// The sections of a project page. The address carries the one that is open (?tab=profile|phases|updates|payments|shipments|warranty);
// with none, the page opens on the profile.
export const PROJECT_TABS = [
  { key: "profile", label: "Profile" },
  { key: "phases", label: "Phases and items" },
  { key: "updates", label: "Updates and tasks" },
  { key: "payments", label: "Payments" },
  { key: "shipments", label: "Shipments" },
  { key: "warranty", label: "Warranty" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["key"];

export const isProjectTab = (value: unknown): value is ProjectTab => PROJECT_TABS.some((t) => t.key === value);
