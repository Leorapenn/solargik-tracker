import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { previewDigests, digestFallbackTo, taskDigestConfigured } from "@/server/services/taskDigest";
import { NAVY, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

// What the task emails would say right now, and to whom. Nothing is sent from here.
export default async function TaskDigestPreview({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const kind = raw === "weekly" ? "weekly" : "daily";
  const { previews, unreachable } = await previewDigests(kind);
  const fallback = digestFallbackTo();

  const chip = (active: boolean) => ({ padding: "7px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, border: `1px solid ${active ? NAVY : "#E4E6EC"}`, background: active ? NAVY : "#fff", color: active ? "#fff" : NAVY });

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/tasks" style={{ color: NAVY, fontWeight: 600 }}>
          Tasks
        </Link>{" "}
        › Email preview
      </div>
      <div>
        <h1 style={pageTitleStyle}>Task emails: preview</h1>
        <div style={pageSubtitleStyle}>
          What each owner would be emailed right now. Every working morning (07:00, Sunday to Thursday) owners get what is due that day; on Sunday morning they also get the week ahead.
          A task with no owner, or whose owner has no email address in People, goes to {fallback ?? "the fallback address (not set yet)"}.{" "}
          {taskDigestConfigured() ? "Sending is switched on." : "Sending is OFF until the Microsoft mail setup is done: nothing is emailed yet."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Link href="/tasks/digest?kind=daily" style={chip(kind === "daily")}>
          Every morning
        </Link>
        <Link href="/tasks/digest?kind=weekly" style={chip(kind === "weekly")}>
          Sunday: the week ahead
        </Link>
      </div>
      {unreachable > 0 && (
        <div style={{ ...cardStyle, padding: 14, color: "#9A4B00" }}>
          {unreachable} item{unreachable === 1 ? "" : "s"} could not be addressed (no owner or owner email, and no fallback address is set).
        </div>
      )}
      {previews.length === 0 && <div style={{ ...cardStyle, padding: 24, color: TEXT_MUTED }}>Nothing is due, so no emails would be sent right now.</div>}
      {previews.map((p) => (
        <section key={p.digest.to} style={{ ...cardStyle, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13.5 }}>
            <strong style={{ color: NAVY }}>To: {p.digest.to}</strong> <span style={{ color: TEXT_MUTED }}>· {p.digest.itemCount} item{p.digest.itemCount === 1 ? "" : "s"}</span>
          </div>
          <div style={{ fontSize: 13.5, color: TEXT_MUTED }}>Subject: {p.subject}</div>
          {/* the email as built, in a sandboxed frame (everything typed in it was escaped when it was built) */}
          <iframe title={`Email to ${p.digest.to}`} sandbox="" srcDoc={p.html} style={{ width: "100%", height: 360, border: "1px solid #E4E6EC", borderRadius: 8, background: "#fff" }} />
        </section>
      ))}
    </main>
  );
}
