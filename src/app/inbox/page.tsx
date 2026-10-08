import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { agentInstructions } from "@/lib/suggestions";
import { baseUrl } from "@/server/services/weeklyEmail";
import { listSuggestions, pendingCount } from "@/server/services/suggestions";
import { getLastImport } from "@/server/services/importRuns";
import { formatRunTime } from "@/lib/importRun";
import { SuggestionCard } from "@/components/SuggestionCard";
import { CopyBox } from "@/components/CopyBox";
import { NAVY, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const TABS = [
  { key: "PENDING", label: "To review" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = TABS.find((t) => t.key === raw?.toUpperCase())?.key ?? "PENDING";

  const [items, projects, waiting, lastRun] = await Promise.all([
    listSuggestions(status),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    pendingCount(),
    getLastImport(),
  ]);
  const unmatched = items.filter((s) => !s.projectId);
  const matched = items.filter((s) => s.projectId);
  const connected = Boolean(process.env.INTAKE_TOKEN && process.env.INTAKE_TOKEN.length >= 16);
  const endpoint = `${baseUrl().replace(/\/$/, "")}/api/intake/suggestions`;

  const chip = (active: boolean) => ({
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 600,
    border: `1px solid ${active ? NAVY : "#E4E6EC"}`,
    background: active ? NAVY : "#fff",
    color: active ? "#fff" : NAVY,
  });

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Inbox</h1>
        <div style={pageSubtitleStyle}>Changes proposed from your emails by the email-reading agent. Nothing is applied until you approve it.</div>
      </div>

      <div style={{ ...cardStyle, padding: "12px 20px", display: "flex", gap: "6px 28px", flexWrap: "wrap", alignItems: "baseline" }}>
        {lastRun ? (
          <>
            <div>
              <span style={{ color: TEXT_MUTED }}>Last email check: </span>
              <strong style={{ color: NAVY }}>{formatRunTime(new Date(lastRun.ranAt))}</strong>
            </div>
            <div>
              <strong>{lastRun.emailsChecked}</strong> <span style={{ color: TEXT_MUTED }}>emails checked</span>
            </div>
            <div>
              <strong>{lastRun.proposalsCreated}</strong> <span style={{ color: TEXT_MUTED }}>proposals created</span>
            </div>
            <div>
              <strong>{lastRun.unmatched}</strong> <span style={{ color: TEXT_MUTED }}>unmatched (no project assigned)</span>
            </div>
          </>
        ) : (
          <div style={{ color: TEXT_MUTED }}>No email check has been reported yet. The agent reports each finished run here.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/inbox?status=${t.key}`} style={chip(status === t.key)} aria-current={status === t.key ? "true" : undefined}>
            {t.label}
            {t.key === "PENDING" && waiting > 0 ? ` (${waiting})` : ""}
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ ...cardStyle, padding: 24, color: TEXT_MUTED }}>
          {status === "PENDING" ? (connected ? "Nothing to review right now." : "Nothing to review yet. The email agent isn't connected (see below).") : "Nothing here."}
        </div>
      )}

      {status === "PENDING" && unmatched.length > 0 && (
        <h2 id="unmatched" style={{ margin: "4px 0 0", fontSize: 16, color: NAVY }}>
          Unmatched ({unmatched.length}) <span style={{ fontWeight: 400, color: TEXT_MUTED, fontSize: 13.5 }}>about a customer, but no project yet: pick one on each card</span>
        </h2>
      )}
      {(status === "PENDING" ? unmatched : items).map((s) => (
        <SuggestionCard key={s.id} s={s} projects={projects} />
      ))}
      {status === "PENDING" && unmatched.length > 0 && matched.length > 0 && (
        <h2 style={{ margin: "12px 0 0", fontSize: 16, color: NAVY }}>Matched to a project ({matched.length})</h2>
      )}
      {status === "PENDING" && matched.map((s) => <SuggestionCard key={s.id} s={s} projects={projects} />)}

      <details style={{ ...cardStyle, padding: "14px 20px" }}>
        <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700 }}>
          Connecting the email agent {connected ? "(token set)" : "(not set up yet)"}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, fontSize: 14 }}>
          <div>
            Address the agent posts to: <code>{endpoint}</code>
          </div>
          <div style={{ color: TEXT_MUTED }}>
            The agent sends its suggestions with a secret token. You create the token yourself: any random text of 16+ characters, saved as <code>INTAKE_TOKEN</code> in Vercel and in the agent&apos;s own settings. Never paste it into chat or the code.
          </div>
          <div style={{ fontWeight: 700, color: NAVY }}>Instructions to give the agent</div>
          <CopyBox label="Instructions for the email agent" rows={14} value={agentInstructions(endpoint)} />
        </div>
      </details>
    </main>
  );
}
