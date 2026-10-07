import { todayInAppTz } from "@/lib/dates";
import { graphConfigFromEnv, recipientsFromEnv, sendMail } from "@/lib/graphMail";
import { buildWeeklyEmail } from "@/lib/weeklyEmail";
import { presetRange, type DateRange } from "@/lib/weeklyUpdates";
import { getUpdatesInRange, toExportRows } from "@/server/services/weeklyUpdates";

// True once the five Microsoft values and a recipient are set in the environment.
export function weeklyEmailConfigured(): boolean {
  return graphConfigFromEnv() !== null && recipientsFromEnv().length > 0;
}

export function baseUrl(): string {
  return process.env.APP_BASE_URL?.trim() || "https://solargik-tracker.vercel.app";
}

// Builds and sends the updates of a period to the configured recipients (default: last week).
export async function sendWeeklyUpdatesEmail(range: DateRange = presetRange("last-week", todayInAppTz())): Promise<{ sent: boolean; reason?: string; projects?: number }> {
  const config = graphConfigFromEnv();
  const to = recipientsFromEnv();
  if (!config || to.length === 0) return { sent: false, reason: "Email isn't set up yet." };

  const projects = await getUpdatesInRange(range);
  const mail = buildWeeklyEmail(range, projects, toExportRows(projects), baseUrl());
  await sendMail(config, { to, subject: mail.subject, html: mail.html, attachments: [mail.attachment] });
  return { sent: true, projects: projects.length };
}
