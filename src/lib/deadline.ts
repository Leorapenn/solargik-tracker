import { APP_TIMEZONE } from "@/lib/dates";

// A task's DEADLINE: a day AND a time (Israel time), separate from the follow-up date (the reminder to chase). It is stored as
// one instant (UTC) and always entered, shown and counted in APP_TIMEZONE, so a change of the clocks never moves it.

const parts = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hourCycle: "h23", ...options }).formatToParts(date);
const part = (list: Intl.DateTimeFormatPart[], type: string) => list.find((p) => p.type === type)?.value ?? "";

// "YYYY-MM-DD" and "HH:mm" of an instant, as the wall clock in Israel shows it.
export function deadlineParts(instant: Date): { date: string; time: string } {
  const p = parts(instant, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return { date: `${part(p, "year")}-${part(p, "month")}-${part(p, "day")}`, time: `${part(p, "hour")}:${part(p, "minute")}` };
}

// The "YYYY-MM-DDTHH:mm" form used by the task form ("" when none).
export const deadlineLocal = (instant: Date | null): string => {
  if (!instant) return "";
  const { date, time } = deadlineParts(instant);
  return `${date}T${time}`;
};

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// Israel wall-clock "YYYY-MM-DDTHH:mm" -> the instant. null when it isn't a real date and time. Handles the clock change by
// checking the offset at the result (a wall time that does not exist, in the spring gap, moves to the next valid minute).
export function parseDeadlineLocal(value: string): Date | null {
  const m = LOCAL_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const offsetAt = (instant: number) => {
    const p = parts(new Date(instant), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const asUtc = Date.UTC(Number(part(p, "year")), Number(part(p, "month")) - 1, Number(part(p, "day")), Number(part(p, "hour")), Number(part(p, "minute")), Number(part(p, "second")));
    return asUtc - Math.floor(instant / 1000) * 1000;
  };
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant); // the offset at the first guess may differ across a clock change
  return new Date(instant);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Thu 30 Oct 2026, 17:00" (Israel time).
export function formatDeadline(instant: Date): string {
  const { date, time } = deadlineParts(instant);
  const [y, mo, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${weekday} ${String(d).padStart(2, "0")} ${MONTHS[mo - 1]} ${y}, ${time}`;
}

export type DeadlineLevel = "overdue" | "today" | "soon" | "later";
export type DeadlineStatus = { overdue: boolean; days: number; hours: number; level: DeadlineLevel; text: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// How long is left (or how late it is), in whole days and hours: "2 days 5 hours left", "Overdue by 3 hours", "Overdue by 1 day
// 2 hours". Less than an hour reads "less than 1 hour". level: overdue; today (still ahead, but today in Israel); soon (within
// 3 calendar days); later.
export function deadlineStatus(deadline: Date, now: Date = new Date()): DeadlineStatus {
  const diff = deadline.getTime() - now.getTime();
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const amount = days > 0 ? `${plural(days, "day")}${hours > 0 ? ` ${plural(hours, "hour")}` : ""}` : hours > 0 ? plural(hours, "hour") : "less than 1 hour";
  const sameDay = deadlineParts(deadline).date === deadlineParts(now).date;
  const dayGap = Math.round((Date.parse(`${deadlineParts(deadline).date}T00:00:00Z`) - Date.parse(`${deadlineParts(now).date}T00:00:00Z`)) / 86_400_000);
  const level: DeadlineLevel = overdue ? "overdue" : sameDay ? "today" : dayGap <= 3 ? "soon" : "later";
  return { overdue, days, hours, level, text: overdue ? `Overdue by ${amount}` : `${amount} left` };
}

// What the deadline form sends, checked: "" = no deadline; a date alone is not accepted by the service (the form adds a time).
export function cleanDeadline(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return { ok: true, value: null };
  const instant = parseDeadlineLocal(t);
  if (!instant) return { ok: false, error: "The deadline isn't a valid day and time." };
  return { ok: true, value: deadlineLocal(instant) };
}
