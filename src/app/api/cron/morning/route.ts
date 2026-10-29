import { israelWeekdayAndHour, isAuthorizedBearer, isWorkingMorningSlot } from "@/lib/cron";
import { MailError } from "@/lib/graphMail";
import { sendWeeklyUpdatesEmail, weeklyEmailConfigured } from "@/server/services/weeklyEmail";
import { sendTaskDigests, taskDigestConfigured } from "@/server/services/taskDigest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The one morning job (see vercel.json: 04:00 and 05:00 UTC, Sunday to Thursday; only the run that lands on 07:xx Israel time
// does anything). Every working day it emails each task owner what is due that day; on Sundays it also sends the weekly
// preview of the coming week and, as before, last week's project updates. The proxy lets /api/cron/* through without a login
// session, so this handler checks the CRON_SECRET itself and refuses everything else. Nothing is sent until the Microsoft
// mail setup is in place.
export async function GET(request: Request) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  if (!isWorkingMorningSlot(now)) return Response.json({ sent: false, reason: "Not 07:00 on a working day (Sunday to Thursday) in Israel." });

  const out: Record<string, unknown> = {};
  const sunday = israelWeekdayAndHour(now).weekday === "Sun";
  try {
    if (taskDigestConfigured()) {
      out.daily = await sendTaskDigests("daily", { now });
      if (sunday) out.weekly = await sendTaskDigests("weekly", { now });
    } else {
      out.tasks = { sent: false, reason: "Email isn't set up yet." };
    }
    if (sunday) out.updates = weeklyEmailConfigured() ? await sendWeeklyUpdatesEmail() : { sent: false, reason: "Email isn't set up yet." };
  } catch (error) {
    if (error instanceof MailError) return Response.json({ ...out, sent: false, reason: error.message }, { status: 502 });
    throw error;
  }
  return Response.json(out);
}
