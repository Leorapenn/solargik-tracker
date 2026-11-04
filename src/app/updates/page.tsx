import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { formatDate, parseDateInput, todayInAppTz } from "@/lib/dates";
import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import { PRESET_LABELS, RANGE_PRESETS, parseRange, presetOf, presetRange } from "@/lib/weeklyUpdates";
import { getGeneralEmailUpdates, getUpdatesInRange } from "@/server/services/weeklyUpdates";
import { pendingCount } from "@/server/services/suggestions";
import { groupByStage, type EmailEntry } from "@/lib/agenda";
import { UpdatesRange } from "@/components/UpdatesRange";
import { EmailUpdatesButton } from "@/components/EmailUpdatesButton";
import { weeklyEmailConfigured } from "@/server/services/weeklyEmail";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle, primaryButton, secondaryButton } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const fmt = (iso: string) => formatDate(parseDateInput(iso));

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const today = todayInAppTz();
  const range = parseRange(params, today);
  const preset = presetOf(range, today);
  const [projects, general, waiting] = await Promise.all([getUpdatesInRange(range), getGeneralEmailUpdates(range), pendingCount()]);
  const total = projects.reduce((sum, p) => sum + p.entries.length + p.emails.length, 0) + general.reduce((sum, g) => sum + g.emails.length, 0);
  const stages = groupByStage(projects);

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
        <h1 style={pageTitleStyle}>Updates</h1>
        <div style={pageSubtitleStyle}>
          The week&apos;s updates for the project meeting, by stage and project: what the emails said (proposals approved in the Inbox, by the day of the email) and the phase and sub-phase updates typed on the projects. Weeks run Sunday to Saturday.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {RANGE_PRESETS.map((p) => {
          const r = presetRange(p, today);
          return (
            <Link key={p} href={`/updates?from=${r.from}&to=${r.to}`} style={chip(preset === p)} aria-current={preset === p ? "true" : undefined}>
              {PRESET_LABELS[p]}
            </Link>
          );
        })}
        <UpdatesRange key={`${range.from}${range.to}`} from={range.from} to={range.to} />
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: NAVY, fontWeight: 700 }}>
          {fmt(range.from)} – {fmt(range.to)}
        </span>
        <span style={{ fontSize: 14, color: TEXT_MUTED }}>
          {projects.length} project{projects.length === 1 ? "" : "s"} · {total} update{total === 1 ? "" : "s"}
        </span>
        <a href={`/updates/agenda?from=${range.from}&to=${range.to}`} style={{ ...primaryButton, textDecoration: "none", display: "inline-block" }}>
          Download agenda (Word)
        </a>
        <a href={`/updates/export?from=${range.from}&to=${range.to}`} style={{ ...secondaryButton, textDecoration: "none", display: "inline-block" }}>
          Download Excel (CSV)
        </a>
        {weeklyEmailConfigured() && <EmailUpdatesButton from={range.from} to={range.to} />}
      </div>

      {projects.length === 0 && general.length === 0 && (
        <div style={{ ...cardStyle, padding: 24, color: TEXT_MUTED }}>No updates are dated in this period.</div>
      )}

      {waiting > 0 && (
        <div style={{ fontSize: 13.5, color: TEXT_MUTED }}>
          {waiting} proposal{waiting === 1 ? " is" : "s are"} still waiting for review in the <Link href="/inbox" style={{ color: NAVY, fontWeight: 700 }}>Inbox</Link> and {waiting === 1 ? "is" : "are"} not shown here until approved.
        </div>
      )}

      {stages.map((group) => (
        <div key={group.stage} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: "10px 0 0", fontSize: 17, color: NAVY, borderBottom: "2px solid #E8801A", paddingBottom: 4 }}>
            {group.stage} <span style={{ fontSize: 13.5, fontWeight: 400, color: TEXT_MUTED }}>{group.projects.length} project{group.projects.length === 1 ? "" : "s"}</span>
          </h2>
      {group.projects.map((p) => {
        const life = LIFECYCLE_STYLES[p.lifecycle];
        return (
          <section key={p.id} style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <Link href={`/projects/${p.id}`} style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>
                {p.name}
              </Link>
              <span style={{ color: TEXT_MUTED, fontSize: 14 }}>{p.customer}</span>
              {p.lifecycle !== "ACTIVE" && (
                <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: life.bg, color: life.text }}>
                  {LIFECYCLE_LABELS[p.lifecycle]}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: TEXT_MUTED }}>
              <strong style={{ color: NAVY }}>Summary{p.summary.manual ? " (edited by hand)" : ""}:</strong> {p.summary.text}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {p.emails.map((e) => (
                <EmailRow key={e.id} e={e} />
              ))}
              {p.entries.map((e, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "minmax(170px, 260px) 1fr 110px", gap: 16, padding: "10px 0", borderTop: `1px solid ${ROW_DIVIDER}`, alignItems: "start" }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{e.item ?? "Whole phase"}</div>
                    <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
                      {e.phase}
                      {e.owner ? ` · ${e.owner}` : ""}
                    </div>
                    <span
                      style={{ display: "inline-block", marginTop: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: STATUS_PILL_STYLES[e.status].bg, color: STATUS_PILL_STYLES[e.status].text }}
                    >
                      {STATUS_LABELS[e.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.text}</div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "right" }}>{fmt(e.date)}</div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
        </div>
      ))}

      {general.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: "10px 0 0", fontSize: 17, color: NAVY, borderBottom: "2px solid #E8801A", paddingBottom: 4 }}>Customer-level items <span style={{ fontSize: 13.5, fontWeight: 400, color: TEXT_MUTED }}>not about one project</span></h2>
          {general.map((g) => (
            <section key={g.customer} style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{g.customer}</div>
              {g.emails.map((e) => (
                <EmailRow key={e.id} e={e} />
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

// One approved email proposal: its day, the email's subject as the link to the email, and the one-line summary under it.
function EmailRow({ e }: { e: EmailEntry }) {
  const title = e.subject ?? e.label;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 16, padding: "10px 0", borderTop: `1px solid ${ROW_DIVIDER}`, alignItems: "start" }}>
      <div style={{ overflowWrap: "anywhere" }}>
        {e.link ? (
          <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: NAVY, fontWeight: 700, textDecoration: "underline" }}>
            {title}
          </a>
        ) : (
          <span style={{ fontSize: 14, color: NAVY, fontWeight: 700 }}>{title}</span>
        )}
        <div style={{ fontSize: 14.5, marginTop: 2 }}>{e.summary}</div>
      </div>
      <div style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "right" }}>{fmt(e.date)}</div>
    </div>
  );
}
