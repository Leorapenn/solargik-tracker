import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { cleanImportRun } from "@/lib/importRun";

export type ImportRunView = {
  id: string;
  ranAt: string;
  emailsChecked: number;
  // counted here, live, from the suggestions that arrived during the run
  proposalsCreated: number;
  unmatched: number; // of those, the ones with no project assigned (what the Inbox lists as Unmatched)
};

type Row = { id: string; ranAt: Date; emailsChecked: number };

async function view(r: Row): Promise<ImportRunView> {
  const [proposalsCreated, unmatched] = await Promise.all([
    prisma.suggestion.count({ where: { importRunId: r.id } }),
    prisma.suggestion.count({ where: { importRunId: r.id, projectId: null } }),
  ]);
  return { id: r.id, ranAt: r.ranAt.toISOString(), emailsChecked: r.emailsChecked, proposalsCreated, unmatched };
}

export async function getImportRun(id: string): Promise<ImportRunView | null> {
  const row = await prisma.importRun.findUnique({ where: { id } });
  return row ? view(row) : null;
}

// get_last_import: the newest run by its own timestamp (a late-arriving older report can't move it backwards),
// or null when the agent has never reported one.
export async function getLastImport(): Promise<ImportRunView | null> {
  const row = await prisma.importRun.findFirst({ orderBy: [{ ranAt: "desc" }, { createdAt: "desc" }] });
  return row ? view(row) : null;
}

// record_import_run: saves the run and claims the suggestions that arrived during it: those created after the
// previous run finished (ranAt) up to this run's ranAt, and not already claimed. The first run claims everything
// so far. Emails the agent skipped as irrelevant produce no suggestion, so they are never counted as unmatched.
export async function recordImportRun(raw: unknown): Promise<ImportRunView> {
  const cleaned = cleanImportRun(raw);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const { ranAt, emailsChecked } = cleaned.value;

  const run = await prisma.$transaction(async (tx) => {
    const previous = await tx.importRun.findFirst({ where: { ranAt: { lt: ranAt } }, orderBy: { ranAt: "desc" }, select: { ranAt: true } });
    const created = await tx.importRun.create({ data: { ranAt, emailsChecked } });
    await tx.suggestion.updateMany({
      where: { importRunId: null, createdAt: { ...(previous ? { gt: previous.ranAt } : {}), lte: ranAt } },
      data: { importRunId: created.id },
    });
    return created;
  });
  return view(run);
}
