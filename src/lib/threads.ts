// Email chains: the proposals that come from one email conversation are shown together in the Inbox.
// A proposal carries the mail system's conversation id when the agent sent it; older ones have none, so they are grouped
// by their subject (without "Re:", "Fw:", "AW:"...) within the same project (or customer), which keeps two unrelated
// emails with a generic subject apart.

const PREFIX = /^\s*(?:(?:re|fw|fwd|aw|wg|r|i|sv|vs|rv|res|enc|tr|antw|odp)\s*:\s*)+/i;

// "RE: Fw: 318 PRJ Full package design" -> "318 PRJ Full package design" (case kept; used for showing).
export function stripSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(PREFIX, "").replace(/\s+/g, " ").trim();
}

// The same, lower-cased: what two emails of one chain share.
export function normalizeSubject(subject: string | null | undefined): string {
  return stripSubject(subject).toLowerCase();
}

export type ThreadRow = {
  id: string;
  conversationId?: string | null;
  sourceSubject: string | null;
  sourceFrom: string | null;
  sourceReceivedAt: string | null; // ISO date or date-time
  sourceMessageId: string | null;
  sourceLink: string | null;
  projectId: string | null;
  customerId: string | null;
};

export type ThreadEmail = { from: string | null; day: string | null; link: string | null };

export type Thread<T extends ThreadRow> = {
  key: string;
  subject: string;
  rows: T[]; // in the order they came in
  emails: ThreadEmail[]; // each distinct email of the chain once, oldest first
};

const day = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

// Groups rows into email chains. Order: chains appear where their first row appears; rows keep their order inside.
export function groupThreads<T extends ThreadRow>(rows: T[]): Thread<T>[] {
  const threads: Thread<T>[] = [];
  const byConversation = new Map<string, Thread<T>>();
  const bySubject = new Map<string, Thread<T>>();
  const emailKeys = new Map<Thread<T>, Set<string>>();

  const start = (key: string, row: T): Thread<T> => {
    const thread: Thread<T> = { key, subject: stripSubject(row.sourceSubject) || "(no subject)", rows: [], emails: [] };
    threads.push(thread);
    emailKeys.set(thread, new Set());
    return thread;
  };

  for (const row of rows) {
    const norm = normalizeSubject(row.sourceSubject);
    const subjectKey = norm ? `${norm}|${row.projectId ?? row.customerId ?? ""}` : "";
    let thread: Thread<T> | undefined;
    if (row.conversationId) {
      thread = byConversation.get(row.conversationId);
      if (!thread) {
        // a chain whose older proposals have no conversation id yet joins by subject (and the same project or customer)
        thread = (subjectKey ? bySubject.get(subjectKey) : undefined) ?? start(`c:${row.conversationId}`, row);
        byConversation.set(row.conversationId, thread);
      }
    } else if (subjectKey) {
      thread = bySubject.get(subjectKey);
    }
    if (!thread) thread = start(row.conversationId ? `c:${row.conversationId}` : subjectKey ? `s:${subjectKey}` : `r:${row.id}`, row);
    if (subjectKey && !bySubject.has(subjectKey)) bySubject.set(subjectKey, thread);

    thread.rows.push(row);
    const k = row.sourceMessageId || row.sourceLink || `${row.sourceFrom ?? ""}|${row.sourceReceivedAt ?? ""}`;
    const seen = emailKeys.get(thread)!;
    if (!seen.has(k)) {
      seen.add(k);
      thread.emails.push({ from: row.sourceFrom, day: day(row.sourceReceivedAt), link: row.sourceLink });
    }
  }
  for (const t of threads) t.emails.sort((a, b) => (a.day ?? "").localeCompare(b.day ?? ""));
  return threads;
}