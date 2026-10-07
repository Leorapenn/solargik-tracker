import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { formatDate, parseDateInput, todayInAppTz } from "@/lib/dates";
import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import { PRESET_LABELS, RANGE_PRESETS, parseRange, presetOf, presetRange } from "@/lib/weeklyUpdates";
import { getUpdatesInRange } from "@/server/services/weeklyUpdates";
import { UpdatesRange } from "@/components/UpdatesRange";
import { EmailUpdatesButton } from "@/components/EmailUpdatesButton";
import { weeklyEmailConfigured } from "@/server/services/weeklyEmail";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle, secondaryButton } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const fmt = (iso: string) => formatDate(parseDateInput(iso));

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const today = todayInAppTz();
  const range = parseRange(params, today);
  const preset = presetOf(range, today);
  const projects = await getUpdatesInRange(range);
  const total = projects.reduce((sum, p) => sum + p.entries.length, 0);

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
          Every phase and sub-phase update dated in the chosen period, by project, for the weekly project meeting. Weeks run Sunday to Saturday.
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
        <a href={`/updates/export?from=${range.from}&to=${range.to}`} style={{ ...secondaryButton, textDecoration: "none", display: "inline-block" }}>
          Download Excel (CSV)
        </a>
        {weeklyEmailConfigured() && <EmailUpdatesButton from={range.from} to={range.to} />}
      </div>

      {projects.length === 0 && (
        <div style={{ ...cardStyle, padding: 24, color: TEXT_MUTED }}>No updates are dated in this period.</div>
      )}

      {projects.map((p) => {
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
    </main>
  );
}
