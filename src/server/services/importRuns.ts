import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { MANUAL_SOURCE_PREFIX, cleanImportRun } from "@/lib/importRun";

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

// record_import_run: saves the run and claims every suggestion that has arrived and no earlier run has claimed.
// The agent sends its suggestions first and records the run last, so those are the ones this run produced (the
// first run claims everything so far). `ranAt` is when the run STARTED, so the next run's search window has no gap;
// it plays no part in claiming. Emails the agent skipped as irrelevant produce no suggestion, so they are never
// counted as unmatched. Proposals put in by hand (source starting "Manual: ") are never claimed: they did not come
// from the run. `claimUntil` (tests only) leaves out suggestions created after that moment.
export async function recordImportRun(raw: unknown, claimUntil?: Date): Promise<ImportRunView> {
  const cleaned = cleanImportRun(raw);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const { ranAt, emailsChecked } = cleaned.value;

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.importRun.create({ data: { ranAt, emailsChecked } });
    await tx.suggestion.updateMany({
      where: {
        importRunId: null,
        // (a plain NOT would also drop rows with no source at all, so the null case is spelled out)
        OR: [{ sourceFrom: null }, { NOT: { sourceFrom: { startsWith: MANUAL_SOURCE_PREFIX } } }],
        ...(claimUntil ? { createdAt: { lte: claimUntil } } : {}),
      },
      data: { importRunId: created.id },
    });
    return created;
  });
  return view(run);
}
