"use server";

import { requireActionAuth } from "@/lib/auth";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { digestFallbackTo, sendTaskDigests, taskDigestConfigured } from "@/server/services/taskDigest";

// A test send: only the email that goes to the fallback address (Leora's own tasks plus the ones nobody can be emailed about),
// right now, whatever the time. It never sends to anyone else; the owners only get theirs from the morning job.
export async function emailMyTaskDigest(kind: string): Promise<ActionResult<{ message: string }>> {
  await requireActionAuth();
  return run(async () => {
    if (kind !== "daily" && kind !== "weekly") throw new UserError("Choose today's or this week's email.");
    if (!taskDigestConfigured()) throw new UserError("Email isn't set up yet.");
    const to = digestFallbackTo();
    if (!to) throw new UserError("No address is set for these emails (TASK_DIGEST_FALLBACK_TO or WEEKLY_UPDATES_TO).");
    const result = await sendTaskDigests(kind, { only: to });
    if (result.failed.length > 0) throw new UserError(result.failed[0].error);
    return { message: result.sent > 0 ? "Email sent." : "Nothing is due for you, so no email was sent." };
  });
}
