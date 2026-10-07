import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { agentInstructions } from "@/lib/suggestions";
import { baseUrl } from "@/server/services/weeklyEmail";
import { listSuggestions, pendingCount } from "@/server/services/suggestions";
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

  const [items, projects, waiting] = await Promise.all([
    listSuggestions(status),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    pendingCount(),
  ]);
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

      {items.map((s) => (
        <SuggestionCard key={s.id} s={s} projects={projects} />
      ))}

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
