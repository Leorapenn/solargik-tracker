import { isAuthorizedBearer, isSundayMorningSlot } from "@/lib/cron";
import { MailError } from "@/lib/graphMail";
import { sendWeeklyUpdatesEmail, weeklyEmailConfigured } from "@/server/services/weeklyEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by Vercel Cron (see vercel.json) on Sundays. The proxy lets /api/cron/* through without a login
// session, so this handler checks the CRON_SECRET itself and refuses everything else.
export async function GET(request: Request) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSundayMorningSlot()) return Response.json({ sent: false, reason: "Not 07:00 on a Sunday in Israel." });
  if (!weeklyEmailConfigured()) return Response.json({ sent: false, reason: "Email isn't set up yet." });

  try {
    return Response.json(await sendWeeklyUpdatesEmail());
  } catch (error) {
    if (error instanceof MailError) return Response.json({ sent: false, reason: error.message }, { status: 502 });
    throw error;
  }
}
