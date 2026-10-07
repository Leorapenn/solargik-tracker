"use server";

import { requireActionAuth } from "@/lib/auth";
import { todayInAppTz } from "@/lib/dates";
import { MailError } from "@/lib/graphMail";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { parseRange } from "@/lib/weeklyUpdates";
import { sendWeeklyUpdatesEmail } from "@/server/services/weeklyEmail";

// "Email me this period": sends the shown period to the configured recipients right away.
export async function emailUpdates(from: string, to: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const range = parseRange({ from, to }, todayInAppTz());
    try {
      const result = await sendWeeklyUpdatesEmail(range);
      if (!result.sent) throw new UserError(result.reason ?? "The email wasn't sent.");
    } catch (error) {
      if (error instanceof MailError) throw new UserError(error.message);
      throw error;
    }
    return {};
  });
}
