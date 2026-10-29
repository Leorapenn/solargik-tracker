import { timingSafeEqual } from "node:crypto";
import { APP_TIMEZONE } from "@/lib/dates";

// A request is authorised when it carries "Authorization: Bearer <secret>" (Vercel Cron sends CRON_SECRET this way;
// the Inbox intake uses INTAKE_TOKEN). Fails closed when no (or a short) secret is set; compares in constant time.
export function isAuthorizedBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// Vercel cron schedules are in UTC, and Israel's clock changes twice a year, so the job is scheduled for both
// 04:00 and 05:00 UTC on Sundays and only the one that lands on 07:xx Israel time sends.
// The weekday ("Sun".."Sat") and hour (0-23) it is in Israel right now.
export function israelWeekdayAndHour(now: Date = new Date()): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return { weekday: parts.find((p) => p.type === "weekday")?.value ?? "", hour: Number(parts.find((p) => p.type === "hour")?.value) };
}

// The morning job (the task emails, and on Sundays the weekly updates): 07:xx in Israel on a working day (Sunday to Thursday).
// Scheduled for both 04:00 and 05:00 UTC, so only the run that lands on 07:xx sends, summer and winter.
export const WORKING_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu"] as const;
export function isWorkingMorningSlot(now: Date = new Date(), hour = 7): boolean {
  const t = israelWeekdayAndHour(now);
  return (WORKING_DAYS as readonly string[]).includes(t.weekday) && t.hour === hour;
}

export function isSundayMorningSlot(now: Date = new Date(), hour = 7): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return weekday === "Sun" && h === hour;
}
