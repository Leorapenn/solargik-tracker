import { describe, expect, it } from "vitest";
import { buildTimeline } from "./taskTimeline";

const LINK = "https://outlook.office365.com/owa/?ItemID=first";
const upd = (id: string, date: string, text: string, extra: { sourceLink?: string; sourceSubject?: string } = {}) => ({ id, date, text, sourceLink: extra.sourceLink ?? null, sourceSubject: extra.sourceSubject ?? null });

describe("buildTimeline", () => {
  it("puts the log entries and the chain's emails in one list, newest first", () => {
    const items = buildTimeline(
      [upd("2", "2026-10-29", "Solargik answered", { sourceLink: "https://x/reply", sourceSubject: "Re: Initial layout" }), upd("1", "2026-10-27", "Task created")],
      [
        { key: "a", day: "2026-10-27", subject: "Initial layout", link: LINK },
        { key: "b", day: "2026-10-28", subject: "Re: Initial layout", link: "https://x/mid" },
        { key: "c", day: "2026-10-29", subject: "Re: Initial layout", link: "https://x/reply" },
      ],
      LINK,
    );
    expect(items.map((i) => [i.date, i.kind, i.text])).toEqual([
      ["2026-10-29", "update", "Solargik answered"],
      ["2026-10-28", "email", "Email"],
      ["2026-10-27", "update", "Task created"],
    ]);
    // the answer shows its email's subject and link; the email that is already shown by an entry is not listed twice
    expect(items[0]).toMatchObject({ subject: "Re: Initial layout", link: "https://x/reply" });
    expect(items[1]).toMatchObject({ subject: "Re: Initial layout", link: "https://x/mid" });
  });

  it("shows the email a task was created from on its 'Task created' entry, even for tasks made before the entry stored a link", () => {
    const [created] = buildTimeline([upd("1", "2026-10-27", "Task created")], [{ key: "a", day: "2026-10-27", subject: "Initial layout", link: LINK }], LINK);
    expect(created).toMatchObject({ kind: "update", link: LINK, subject: "Initial layout" });
    // a task typed by hand has no email on its first entry
    expect(buildTimeline([upd("1", "2026-10-27", "Task created")], [], null)[0]).toMatchObject({ link: null, subject: null });
  });

  it("keeps log entries above emails of the same day, and lists a chain email with no log entry on its own", () => {
    const items = buildTimeline([upd("1", "2026-10-28", "Contacted the customer")], [{ key: "x", day: "2026-10-28", subject: "Reminder", link: "https://x/1" }], null);
    expect(items.map((i) => i.kind)).toEqual(["update", "email"]);
    expect(buildTimeline([], [], null)).toEqual([]);
  });

  it("lists an email with no link once, by its key", () => {
    const items = buildTimeline([], [{ key: "origin", day: "2026-10-27", subject: "The email the task was created from", link: null }], null);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBeNull();
  });
});
