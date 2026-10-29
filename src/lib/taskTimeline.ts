// The whole history of a task in one list: its dated log entries and the emails of the chain it belongs to. Only links and
// subjects of emails are ever kept (never their text). Pure: the server loads the entries and the emails, this orders them.

export type TimelineUpdate = { id: string; date: string; text: string; sourceLink: string | null; sourceSubject: string | null };
export type TimelineEmail = { key: string; day: string; subject: string; link: string | null };
export type TimelineItem = {
  key: string;
  date: string; // YYYY-MM-DD ("" when not known)
  kind: "update" | "email";
  text: string; // the log text; for an email that is only in the chain, "Email"
  subject: string | null; // the subject of the email behind the entry, when there is one
  link: string | null;
};

const CREATED = "Task created";

// Newest first. A log entry that came from an email shows that email's subject and link. The "Task created" entry of a task
// made from an email shows the link too (older tasks did not store it on the entry: it is taken from the task). An email of
// the chain that no entry already shows is listed on its own day, so the correspondence reads as part of the history.
export function buildTimeline(updates: TimelineUpdate[], emails: TimelineEmail[], taskSourceLink: string | null): TimelineItem[] {
  const subjectByLink = new Map<string, string>();
  for (const e of emails) if (e.link && !subjectByLink.has(e.link)) subjectByLink.set(e.link, e.subject);

  const shownLinks = new Set<string>();
  const items: TimelineItem[] = updates.map((u) => {
    const link = u.sourceLink ?? (u.text === CREATED && taskSourceLink ? taskSourceLink : null);
    if (link) shownLinks.add(link);
    return { key: `u:${u.id}`, date: u.date, kind: "update", text: u.text, subject: u.sourceSubject ?? (link ? (subjectByLink.get(link) ?? null) : null), link };
  });
  for (const e of emails) {
    if (e.link && shownLinks.has(e.link)) continue;
    if (e.link) shownLinks.add(e.link);
    items.push({ key: `e:${e.key}`, date: e.day, kind: "email", text: "Email", subject: e.subject, link: e.link });
  }
  // stable: on the same day the log entries stay above the emails
  return items.map((item, i) => ({ item, i })).sort((a, b) => (a.item.date === b.item.date ? a.i - b.i : a.item.date < b.item.date ? 1 : -1)).map((x) => x.item);
}
