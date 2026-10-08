import { describe, expect, it } from "vitest";
import { emailDomain, folderNameFromLink, projectNamePart, projectNumber, shapeCustomer, shapeProject } from "./intakeDirectory";

describe("emailDomain / projectNumber / projectNamePart", () => {
  it("reads the domain of an address, lower-cased", () => {
    expect(emailDomain("Dan@Revalue.COM")).toBe("revalue.com");
    expect(emailDomain("dan@mail.revalue.it")).toBe("mail.revalue.it");
    for (const bad of [null, "", "no-at-sign", "a@b", "a b@c.com"]) expect(emailDomain(bad)).toBeNull();
  });

  it("reads the project number the same way the Inbox matches it", () => {
    expect(projectNumber("259-Rignano Flaminio 1")).toBe("259");
    expect(projectNumber("257-PRJ (Revalue, Barge 2)")).toBe("257");
    expect(projectNumber("Barge 2")).toBeNull();
    expect(projectNumber("12345-x")).toBeNull();
  });

  it("strips the number from the name", () => {
    expect(projectNamePart("259-Rignano Flaminio 1")).toBe("Rignano Flaminio 1");
    expect(projectNamePart("259 Rignano Flaminio 1")).toBe("Rignano Flaminio 1");
    expect(projectNamePart("Barge 2")).toBe("Barge 2");
  });

  it("takes only the folder's NAME from a SharePoint link", () => {
    const link = "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/259%20(Revalue,%20Rignano%20Flaminio%201,%20Italy)";
    expect(folderNameFromLink(link)).toBe("259 (Revalue, Rignano Flaminio 1, Italy)");
    expect(folderNameFromLink(null)).toBeNull();
    expect(folderNameFromLink("not a link")).toBeNull();
  });
});

describe("shapeCustomer", () => {
  const source = {
    id: "c1",
    name: "Revalue",
    aliases: [{ alias: "Revalue Italia" }, { alias: "ReValue S.p.A." }],
    contacts: [
      { id: "1", name: "Dan Rossi", email: "Dan@revalue.com", role: "PM" },
      { id: "2", name: "Dan Rossi", email: "dan@revalue.com", role: null }, // the same person on another project
      { id: "3", name: "Lea", email: "lea@gmail.com", role: "Engineer" },
      { id: "4", name: "Marta", email: "marta@revalue.it", role: null },
      { id: "5", name: "No Email", email: null, role: null },
    ],
  };

  it("gives the name, name variants, business email domains and each person once", () => {
    const v = shapeCustomer(source);
    expect(v.name).toBe("Revalue");
    expect(v.aliases).toEqual(["Revalue Italia", "ReValue S.p.A."]); // alphabetical, ignoring case
    expect(v.emailDomains).toEqual(["revalue.com", "revalue.it"]); // gmail.com says nothing about the customer
    expect(v.contacts.map((c) => c.name).sort()).toEqual(["Dan Rossi", "Lea", "Marta", "No Email"]);
  });

  it("contains exactly the agreed fields (no phone numbers or anything else)", () => {
    const v = shapeCustomer(source);
    expect(Object.keys(v).sort()).toEqual(["aliases", "contacts", "emailDomains", "id", "name"]);
    for (const c of v.contacts) expect(Object.keys(c).sort()).toEqual(["email", "name", "role"]);
  });
});

describe("shapeProject", () => {
  const source = {
    id: "p1",
    name: "259-Rignano Flaminio 1",
    lifecycle: "ACTIVE",
    mondayStage: "3 Construction",
    mondayStatus: "Working on it",
    sharepointLink: "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/259%20(Revalue,%20Rignano%20Flaminio%201,%20Italy)",
    customer: { id: "c1", name: "Revalue" },
    phases: [
      { name: "DESIGN", status: "DONE", order: 2 },
      { name: "INITIATION", status: "DONE", order: 1 },
      { name: "SUPPLY", status: "IN_PROGRESS", order: 3 },
    ],
  };

  it("gives number, name, other names, customer, stage, statuses and the phases in order", () => {
    const v = shapeProject(source);
    expect(v).toMatchObject({ number: "259", name: "259-Rignano Flaminio 1", customer: { id: "c1", name: "Revalue" }, lifecycle: "ACTIVE", stage: "3 Construction", status: "Working on it" });
    expect(v.aliases).toEqual(["259", "Rignano Flaminio 1", "259 (Revalue, Rignano Flaminio 1, Italy)"]);
    expect(v.phases).toEqual([
      { phase: "INITIATION", status: "DONE" },
      { phase: "DESIGN", status: "DONE" },
      { phase: "SUPPLY", status: "IN_PROGRESS" },
    ]);
  });

  it("contains exactly the agreed fields and never the SharePoint link", () => {
    const v = shapeProject(source);
    expect(Object.keys(v).sort()).toEqual(["aliases", "customer", "id", "lifecycle", "name", "number", "phases", "stage", "status"]);
    expect(JSON.stringify(v)).not.toMatch(/https?:|sharepoint\.com/i);
  });

  it("copes with a project that has no number, link or stage", () => {
    const v = shapeProject({ ...source, name: "Barge 2", sharepointLink: null, mondayStage: null, mondayStatus: null });
    expect(v).toMatchObject({ number: null, aliases: [], stage: null, status: null });
  });
});
