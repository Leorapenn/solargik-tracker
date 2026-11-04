import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { approveSuggestion, createSuggestions } from "./suggestions";
import { getProfile, saveProfile } from "./projectProfile";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("site information proposals", () => {
  let customerId: string;
  let projectId: string;
  const suggestionIds: string[] = [];

  const propose = async (n: number, extra: Record<string, unknown>) => {
    await createSuggestions([{ id: `${RUN}-${n}`, kind: "SITE_INFO", project: `Test Project ${RUN}`, summary: `Site ${n}`, source: { from: "site@example.com", subject: "Delivery to site", link: `https://outlook.office365.com/owa/?ItemID=${RUN}-${n}` }, ...extra }]);
    const row = await prisma.suggestion.findUnique({ where: { externalId: `${RUN}-${n}` } });
    if (row) suggestionIds.push(row.id);
    return row!;
  };

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (suggestionIds.length) await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } }); // its profile goes with it
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("fills the site details into a project with no profile, then lays new ones over the old and keeps the rest", async () => {
    const first = await propose(1, { contactName: "Mr. Seiffert", contactPhone: "+49 30 1234567", hours: "Mon-Fri 7:00-16:00", coordinates: "52.52 13.405" });
    expect(await approveSuggestion(first.id)).toMatch(/^Site information saved \(site contact name, site contact phone, working hours, GPS coordinates\)\.$/);
    expect(await getProfile(projectId)).toMatchObject({ siteContactName: "Mr. Seiffert", siteContactPhone: "+49 30 1234567", siteHours: "Mon-Fri 7:00-16:00", siteCoordinates: "52.52, 13.405", siteAccess: "" });

    // something typed elsewhere in the profile is kept
    await saveProfile(projectId, { ...(await getProfile(projectId)), soma: "SOMA 2" });
    const second = await propose(2, { hours: "Mon-Thu 6:00-15:00", access: "Crane on site", contactName: "Mr. Seiffert" });
    const note = await approveSuggestion(second.id);
    expect(note).toContain("Site information saved (working hours, unloading and access).");
    expect(note).toContain('working hours was "Mon-Fri 7:00-16:00"');
    expect(note).not.toContain("contact name"); // already the same
    expect(await getProfile(projectId)).toMatchObject({ siteHours: "Mon-Thu 6:00-15:00", siteAccess: "Crane on site", soma: "SOMA 2", siteContactPhone: "+49 30 1234567" });

    // saying the same again changes nothing
    const third = await propose(3, { hours: "Mon-Thu 6:00-15:00" });
    expect(await approveSuggestion(third.id)).toBe("The project's Site information already had all of this.");
  });
});
