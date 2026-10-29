import { deadlineParts, deadlineStatus, formatDeadline } from "@/lib/deadline";
import { formatDate, parseDateInput } from "@/lib/dates";
import { daysBetween, taskPriorityChoice } from "@/lib/tasks";

// The two emails to the owners of tasks: every morning what is due that day, and every week what is coming up. Built from the
// open tasks only, per recipient. A task with no owner, or whose owner has no email address in People, goes to the fallback
// address (Leora), so nothing is missed and nothing is lost. Pure: the server loads the tasks and sends the result.

export type DigestKind = "daily" | "weekly";

export type DigestTask = {
  id: string;
  topic: string;
  customerName: string;
  projectName: string | null;
  status: string;
  priority: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerActive: boolean;
  deadline: Date | null;
  nextFollowUp: string | null; // YYYY-MM-DD
};

export type DigestItem = { task: DigestTask; what: "deadline" | "followup"; when: string; detail: string };
export type DigestSection = { key: "overdue" | "deadlines" | "followups"; title: string; items: DigestItem[] };
export type Digest = { to: string; sections: DigestSection[]; notes: string[]; itemCount: number };

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (iso: string) => formatDate(parseDateInput(iso));

// The last day of the week the digest covers: the coming Saturday (the weekly one goes out on Sunday morning, so 6 days ahead).
export function weekEnd(todayIso: string): string {
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  return addDays(todayIso, 6 - weekday);
}

// What is in each owner's email.
//  daily : overdue deadlines, deadlines due today, follow-ups due today or overdue
//  weekly: overdue deadlines, deadlines from now to Saturday, follow-ups due or overdue up to Saturday
// Returns the digests (only recipients with something to act on) and the tasks nobody could be emailed about.
export function buildDigests(tasks: DigestTask[], kind: DigestKind, now: Date, fallbackTo: string | null): { digests: Digest[]; unreachable: number } {
  const today = deadlineParts(now).date;
  const end = kind === "weekly" ? weekEnd(today) : today;
  const fallback = fallbackTo && VALID_EMAIL.test(fallbackTo) ? fallbackTo.trim() : null;

  type Entry = { to: string | null; item: DigestItem; section: DigestSection["key"]; sort: string; note: string | null };
  const entries: Entry[] = [];

  for (const task of tasks) {
    if (task.status === "RESOLVED") continue;
    const ownerReachable = Boolean(task.ownerName && task.ownerActive && task.ownerEmail && VALID_EMAIL.test(task.ownerEmail));
    const to = ownerReachable ? task.ownerEmail!.trim() : fallback;
    const note = !ownerReachable && task.ownerName ? `${task.ownerName} has no usable email address in People (or is inactive), so the tasks below are sent to you.` : null;

    if (task.deadline) {
      const s = deadlineStatus(task.deadline, now);
      const day = deadlineParts(task.deadline).date;
      if (s.overdue) {
        entries.push({ to, note, section: "overdue", sort: task.deadline.toISOString(), item: { task, what: "deadline", when: formatDeadline(task.deadline), detail: s.text } });
      } else if (day <= end) {
        entries.push({ to, note, section: "deadlines", sort: task.deadline.toISOString(), item: { task, what: "deadline", when: formatDeadline(task.deadline), detail: s.text } });
      }
    }
    if (task.nextFollowUp && task.nextFollowUp <= end) {
      const gap = daysBetween(task.nextFollowUp, today);
      const detail = gap > 0 ? `${gap} day${gap === 1 ? "" : "s"} overdue` : gap === 0 ? "due today" : `in ${-gap} day${gap === -1 ? "" : "s"}`;
      entries.push({ to, note, section: "followups", sort: task.nextFollowUp, item: { task, what: "followup", when: fmt(task.nextFollowUp), detail } });
    }
  }

  const titles: Record<DigestSection["key"], string> = {
    overdue: "Overdue deadlines",
    deadlines: kind === "daily" ? "Deadlines due today" : "Deadlines this week",
    followups: kind === "daily" ? "Follow-ups due" : "Follow-ups this week",
  };
  const order: DigestSection["key"][] = ["overdue", "deadlines", "followups"];

  const byRecipient = new Map<string, { to: string; entries: Entry[] }>();
  let unreachable = 0;
  for (const e of entries) {
    if (!e.to) {
      unreachable += 1;
      continue;
    }
    const key = e.to.toLowerCase();
    const bucket = byRecipient.get(key) ?? { to: e.to, entries: [] };
    bucket.entries.push(e);
    byRecipient.set(key, bucket);
  }

  const digests: Digest[] = [...byRecipient.values()].map(({ to, entries: list }) => ({
    to,
    notes: [...new Set(list.map((e) => e.note).filter((n): n is string => Boolean(n)))],
    itemCount: list.length,
    sections: order
      .map((key) => ({ key, title: titles[key], items: list.filter((e) => e.section === key).sort((a, b) => a.sort.localeCompare(b.sort) || a.item.task.topic.localeCompare(b.item.task.topic)).map((e) => e.item) }))
      .filter((s) => s.items.length > 0),
  }));
  return { digests: digests.sort((a, b) => a.to.localeCompare(b.to)), unreachable };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The email itself: a subject and an HTML body, with a link from each task to the tracker. Nothing but the task's own topic,
// customer, project, priority and dates goes in: no details, notes or email text.
export function buildDigestEmail(digest: Digest, kind: DigestKind, now: Date, baseUrl: string): { subject: string; html: string } {
  const base = baseUrl.replace(/\/$/, "");
  const today = deadlineParts(now).date;
  const deadlines = digest.sections.filter((s) => s.key !== "followups").reduce((n, s) => n + s.items.length, 0);
  const followups = digest.sections.filter((s) => s.key === "followups").reduce((n, s) => n + s.items.length, 0);
  const counts = [deadlines ? `${deadlines} deadline${deadlines === 1 ? "" : "s"}` : null, followups ? `${followups} follow-up${followups === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
  const subject = kind === "daily" ? `Solargik tasks for today (${fmt(today)}): ${counts}` : `Solargik tasks: your week (${fmt(today)} – ${fmt(weekEnd(today))}): ${counts}`;

  const tint = (key: DigestSection["key"]) => (key === "overdue" ? "#8C1D18" : "#142A5C");
  const sections = digest.sections
    .map((section) => {
      const rows = section.items
        .map((i) => {
          const where = `${escapeHtml(i.task.customerName)}${i.task.projectName ? ` · ${escapeHtml(i.task.projectName)}` : ""}`;
          const owner = i.task.ownerName ? ` · owner ${escapeHtml(i.task.ownerName)}` : " · no owner";
          return (
            `<tr>` +
            `<td style="padding:6px 12px 6px 0;vertical-align:top"><a href="${escapeHtml(`${base}/tasks#${i.task.id}`)}" style="color:#142A5C;font-weight:600;text-decoration:none">${escapeHtml(i.task.topic)}</a><br><span style="color:#5A6172;font-size:12px">${where}${owner} · ${escapeHtml(taskPriorityChoice(i.task.priority).label)} priority</span></td>` +
            `<td style="padding:6px 0;vertical-align:top;white-space:nowrap">${escapeHtml(i.when)}<br><span style="color:${section.key === "overdue" || i.detail.includes("overdue") ? "#8C1D18" : "#5A6172"};font-size:12px">${escapeHtml(i.detail)}</span></td>` +
            `</tr>`
          );
        })
        .join("");
      return `<h3 style="margin:20px 0 4px;color:${tint(section.key)}">${escapeHtml(section.title)} (${section.items.length})</h3><table style="border-collapse:collapse;font-size:14px">${rows}</table>`;
    })
    .join("");

  const notes = digest.notes.map((n) => `<p style="color:#9A4B00;font-size:13px">${escapeHtml(n)}</p>`).join("");
  const html =
    `<div style="font-family:Segoe UI,Arial,sans-serif;color:#333;max-width:760px">` +
    `<h2 style="color:#142A5C;margin:0 0 4px">${kind === "daily" ? "Tasks due today" : "Tasks coming up this week"}</h2>` +
    `<div style="color:#5A6172">${escapeHtml(counts)}</div>` +
    notes +
    sections +
    `<p style="margin-top:24px"><a href="${escapeHtml(`${base}/tasks`)}">Open Tasks in the tracker</a></p>` +
    `</div>`;
  return { subject, html };
}
