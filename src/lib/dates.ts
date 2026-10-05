// Dates in this app are plain calendar dates (no time), stored as UTC midnight (Postgres DATE).
// "Today" is the calendar date in the company's timezone, so a change made late in the evening
// in Israel isn't recorded as the next/previous day when the server runs in UTC.
export const APP_TIMEZONE = "Asia/Jerusalem";

export function todayInAppTz(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

// Accepts "YYYY-MM-DD" (an <input type="date"> value). Empty means "no date"; anything else invalid throws.
export function parseDateInput(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid date: ${value}`);
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  const valid =
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
  if (!valid || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
