import { prisma } from "@/lib/prisma";
import { graphConfigFromEnv, recipientsFromEnv, sendMail, MailError } from "@/lib/graphMail";
import { buildDigestEmail, buildDigests, type Digest, type DigestKind, type DigestTask } from "@/lib/taskDigest";
import { baseUrl } from "@/server/services/weeklyEmail";

// The emails to the owners of tasks (see src/lib/taskDigest.ts). They go out through the same Microsoft Graph mailbox as the
// weekly updates email and stay OFF until it is set up. The fallback address (tasks nobody can be emailed about) is
// TASK_DIGEST_FALLBACK_TO, else the first address of WEEKLY_UPDATES_TO: both are set in Vercel, never in the code.

export function taskDigestConfigured(): boolean {
  return graphConfigFromEnv() !== null;
}

export function digestFallbackTo(env: Record<string, string | undefined> = process.env): string | null {
  const own = recipientsFromEnv({ WEEKLY_UPDATES_TO: env.TASK_DIGEST_FALLBACK_TO });
  return own[0] ?? recipientsFromEnv(env)[0] ?? null;
}

// Only OPEN tasks, with the owner's name and email (from People). Nothing else of a task is loaded.
export async function loadDigestTasks(): Promise<DigestTask[]> {
  const rows = await prisma.task.findMany({
    where: { NOT: { status: "RESOLVED" } },
    select: {
      id: true,
      topic: true,
      status: true,
      priority: true,
      deadline: true,
      nextFollowUp: true,
      customer: { select: { name: true } },
      project: { select: { name: true } },
      owner: { select: { name: true, email: true, active: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    customerName: r.customer.name,
    projectName: r.project?.name ?? null,
    status: r.status,
    priority: r.priority,
    ownerName: r.owner?.name ?? null,
    ownerEmail: r.owner?.email ?? null,
    ownerActive: r.owner?.active ?? false,
    deadline: r.deadline,
    nextFollowUp: r.nextFollowUp ? r.nextFollowUp.toISOString().slice(0, 10) : null,
  }));
}

export type DigestPreview = { digest: Digest; subject: string; html: string };

// What would be sent now, to whom, without sending anything.
export async function previewDigests(kind: DigestKind, now: Date = new Date()): Promise<{ previews: DigestPreview[]; unreachable: number }> {
  const { digests, unreachable } = buildDigests(await loadDigestTasks(), kind, now, digestFallbackTo());
  return { previews: digests.map((digest) => ({ digest, ...buildDigestEmail(digest, kind, now, baseUrl()) })), unreachable };
}

export type DigestSendResult = { sent: number; failed: { to: string; error: string }[]; unreachable: number; recipients: string[] };

// Sends each recipient their own email. One failing does not stop the others. `only` limits it to one address (the test send).
export async function sendTaskDigests(kind: DigestKind, options: { now?: Date; only?: string } = {}): Promise<DigestSendResult> {
  const config = graphConfigFromEnv();
  if (!config) return { sent: 0, failed: [], unreachable: 0, recipients: [] };
  const now = options.now ?? new Date();
  const { previews, unreachable } = await previewDigests(kind, now);
  const chosen = options.only ? previews.filter((p) => p.digest.to.toLowerCase() === options.only!.toLowerCase()) : previews;
  const result: DigestSendResult = { sent: 0, failed: [], unreachable, recipients: [] };
  for (const p of chosen) {
    try {
      await sendMail(config, { to: [p.digest.to], subject: p.subject, html: p.html });
      result.sent += 1;
      result.recipients.push(p.digest.to);
    } catch (error) {
      result.failed.push({ to: p.digest.to, error: error instanceof MailError ? error.message : "Unknown error." });
    }
  }
  return result;
}
