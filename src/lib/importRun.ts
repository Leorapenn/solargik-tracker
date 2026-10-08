import { APP_TIMEZONE } from "@/lib/dates";

// A finished run of the email-reading agent, as the agent reports it (record_import_run). The agent reports only
// how many emails it checked; proposals created and unmatched are counted by the tracker from the suggestions
// that arrived during the run, so they always agree with the Inbox.

export type CleanImportRun = { ranAt: Date; emailsChecked: number };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_COUNT = 1_000_000;
// a clock that is a little fast is fine; a time well in the future is a mistake
const FUTURE_SLACK_MS = 10 * 60 * 1000;

// `ranAt` is when the run finished: optional (default: now), an ISO date-time that has already happened.
export function cleanImportRun(raw: unknown, now: Date = new Date()): Result<CleanImportRun> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Send a JSON object." };
  const body = raw as Record<string, unknown>;

  let ranAt = now;
  if (body.ranAt !== undefined && body.ranAt !== null && body.ranAt !== "") {
    if (typeof body.ranAt !== "string") return { ok: false, error: `"ranAt" must be an ISO date-time like 2026-10-08T07:00:00Z.` };
    const d = new Date(body.ranAt);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2020) return { ok: false, error: `"ranAt" must be an ISO date-time like 2026-10-08T07:00:00Z.` };
    if (d.getTime() > now.getTime() + FUTURE_SLACK_MS) return { ok: false, error: `"ranAt" is in the future.` };
    ranAt = d;
  }

  const n = body.emailsChecked;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_COUNT) {
    return { ok: false, error: `"emailsChecked" must be a whole number from 0 to ${MAX_COUNT.toLocaleString("en-US")}.` };
  }

  return { ok: true, value: { ranAt, emailsChecked: n } };
}

// "08 Oct 2026, 07:00" in the company's timezone (Israel), for the Inbox.
export function formatRunTime(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}
