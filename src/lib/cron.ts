import { timingSafeEqual } from "node:crypto";
import { APP_TIMEZONE } from "@/lib/dates";

// Vercel calls a cron route with "Authorization: Bearer <CRON_SECRET>". Fails closed when no secret is set.
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// Vercel cron schedules are in UTC, and Israel's clock changes twice a year, so the job is scheduled for both
// 04:00 and 05:00 UTC on Sundays and only the one that lands on 07:xx Israel time sends.
export function isSundayMorningSlot(now: Date = new Date(), hour = 7): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return weekday === "Sun" && h === hour;
}
