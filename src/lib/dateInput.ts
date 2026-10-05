import { parseDateInput, toDateInputValue } from "@/lib/dates";

// Typing a date as DD/MM/YYYY. The browser's own <input type="date"> was replaced because it
// commits a half-typed year (and picks a day by itself while you move through the calendar).

export type TypedDate = { ok: true; iso: string | null } | { ok: false };

// Day, month and year are limited to 2, 2 and 4 characters.
const PART_LENGTHS = [2, 2, 4];

// Keeps what has been typed in DD/MM/YYYY shape. While typing, a slash is added once the day or
// month is full ("0510" → "05/10/"); while deleting nothing is added, so Backspace never fights
// the mask. Typed separators (/ . -) are accepted and become "/". Anything else is dropped.
export function maskTypedDate(raw: string, previous = ""): string {
  const typing = raw.length >= previous.length;
  const cleaned = raw.replace(/[^\d./-]/g, "").replace(/[.-]/g, "/");

  let parts: string[];
  if (cleaned.includes("/")) {
    // keep a trailing "/" (an empty last part) but drop doubled ones
    const pieces = cleaned.split("/");
    const last = pieces.pop() ?? "";
    parts = [...pieces.filter((piece) => piece !== ""), last].slice(0, 3);
  } else {
    const digits = cleaned.slice(0, 8);
    parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter((part) => part !== "");
  }
  parts = parts.map((part, i) => part.slice(0, PART_LENGTHS[i]));

  let out = parts.join("/");
  const last = parts[parts.length - 1] ?? "";
  if (typing && parts.length < 3 && last !== "" && last.length === PART_LENGTHS[parts.length - 1]) out += "/";
  return out;
}

// Understands 05/10/2026, 5/10/2026, 05.10.2026, 05-10-2026, 05102026 and 2026-10-05, always with a
// four-digit year (a two-digit year may be one that is still being typed). Empty means "no date".
export function parseTypedDate(text: string): TypedDate {
  const value = text.trim();
  if (value === "") return { ok: true, iso: null };

  let day: string | undefined;
  let month: string | undefined;
  let year: string | undefined;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) [, year, month, day] = match;
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value))) [, day, month, year] = match;
  else if ((match = /^(\d{2})(\d{2})(\d{4})$/.exec(value))) [, day, month, year] = match;
  if (!day || !month || !year) return { ok: false };

  try {
    const date = parseDateInput(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    return { ok: true, iso: toDateInputValue(date) };
  } catch {
    return { ok: false };
  }
}

export function formatTyped(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type CalendarDay = { iso: string; day: number; inMonth: boolean };

// The weeks shown for a month. Weeks start on Sunday (the company's working week), and every week
// is complete, with days from the neighbouring months marked as outside the month.
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(Date.UTC(year, month, 1 - first.getUTCDay()));
  const weeks: CalendarDay[][] = [];

  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      week.push({ iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === month });
    }
    if (w > 0 && !week.some((day) => day.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}
