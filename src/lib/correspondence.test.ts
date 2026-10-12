import { describe, expect, it } from "vitest";
import { shapeAndSort, shapeCorrespondence, type CorrespondenceRow } from "./correspondence";

const row = (over: Partial<CorrespondenceRow> = {}): CorrespondenceRow => ({
  id: "a",
  kind: "CORRESPONDENCE_NOTE",
  summary: "Customer confirmed the site access dates",
  payload: { kind: "CORRESPONDENCE_NOTE", text: "Customer confirmed the site access dates for November" },
  sourceFrom: "dan@revalue-energies.com",
  sourceSubject: "Site access",
  sourceLink: "https://outlook.office.com/mail/1",
  sourceReceivedAt: new Date("2026-10-09T08:00:00Z"),
  reviewedAt: new Date("2026-10-11T12:00:00Z"),
  createdAt: new Date("2026-10-11T11:00:00Z"),
  ...over,
});

describe("shapeCorrespondence", () => {
  it("shows a note with its text and the day the email arrived", () => {
    expect(shapeCorrespondence(row())).toMatchObject({ kind: "CORRESPONDENCE_NOTE", kindLabel: "Note", date: "2026-10-09", from: "dan@revalue-energies.com", who: null, by: null, text: "Customer confirmed the site access dates for November" });
  });

  it("shows an action item with who and by when", () => {
    const item = shapeCorrespondence(row({ kind: "ACTION_ITEM", summary: "Revalue asks for the schedule", payload: { kind: "ACTION_ITEM", text: "Revalue asks Solargik to send the delivery schedule", who: "Solargik", by: "end of next week" } }));
    expect(item).toMatchObject({ kindLabel: "Action", who: "Solargik", by: "end of next week" });
  });

  it("leaves out a text that only repeats the summary", () => {
    expect(shapeCorrespondence(row({ payload: { text: "Customer confirmed the site access dates" } }))?.text).toBeNull();
  });

  it("falls back to the approval day, then the creation day, when the email has no date", () => {
    expect(shapeCorrespondence(row({ sourceReceivedAt: null }))?.date).toBe("2026-10-11");
    expect(shapeCorrespondence(row({ sourceReceivedAt: null, reviewedAt: null }))?.date).toBe("2026-10-11");
  });

  it("ignores kinds that are not notes or actions, and copes with a broken payload", () => {
    expect(shapeCorrespondence(row({ kind: "STATUS_CHANGE" }))).toBeNull();
    expect(shapeCorrespondence(row({ kind: "PHASE_UPDATE" }))).toBeNull();
    expect(shapeCorrespondence(row({ payload: null }))).toMatchObject({ text: null, who: null });
    expect(shapeCorrespondence(row({ payload: "nope" }))).toMatchObject({ text: null });
  });

  it("shows an action item as done once ticked, with the day; a note is never done", () => {
    const action = row({ kind: "ACTION_ITEM", payload: { text: "x" }, doneAt: new Date("2026-10-12T09:00:00Z") });
    expect(shapeCorrespondence(action)).toMatchObject({ done: true, doneOn: "2026-10-12" });
    expect(shapeCorrespondence(row({ kind: "ACTION_ITEM", payload: { text: "x" } }))).toMatchObject({ done: false, doneOn: null });
    expect(shapeCorrespondence(row({ doneAt: new Date("2026-10-12T09:00:00Z") }))).toMatchObject({ done: false, doneOn: null });
  });

  it("an action item's who and by never show on a note", () => {
    expect(shapeCorrespondence(row({ payload: { text: "x", who: "Dan", by: "Friday" } }))).toMatchObject({ who: null, by: null });
  });
});

describe("a note's file link", () => {
  const file = "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/259/Contracts%20%2B%20Legal/Amendment.pdf";
  it("shows on notes only", () => {
    expect(shapeCorrespondence(row({ payload: { text: "Amendment signed", fileLink: file } }))?.fileLink).toBe(file);
    expect(shapeCorrespondence(row({ payload: { text: "Amendment signed" } }))?.fileLink).toBeNull();
    expect(shapeCorrespondence(row({ kind: "ACTION_ITEM", payload: { text: "x", fileLink: file } }))?.fileLink).toBeNull();
  });
});

describe("shapeAndSort", () => {
  it("puts the newest email first and drops other kinds", () => {
    const rows = [
      row({ id: "old", sourceReceivedAt: new Date("2026-10-01T00:00:00Z") }),
      row({ id: "new", sourceReceivedAt: new Date("2026-10-10T00:00:00Z") }),
      row({ id: "skip", kind: "STATUS_CHANGE" }),
    ];
    expect(shapeAndSort(rows).map((i) => i.id)).toEqual(["new", "old"]);
  });
});
