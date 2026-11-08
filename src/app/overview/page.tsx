import Link from "next/link";
import { requireAnyPageAuth } from "@/lib/auth";
import { formatDate, parseDateInput, toDateInputValue, todayInAppTz } from "@/lib/dates";
import { DEPARTMENTS, departmentLabel } from "@/lib/departments";
import { phaseShortName } from "@/lib/phases";
import { STATUS_LABELS } from "@/lib/statusColors";
import {
  OVERVIEW_STATUSES,
  byOwner,
  byPhase,
  daysOverdue,
  inDepartment,
  isOverdue,
  needsAttention,
  parseDepartment,
  parseOverviewStatus,
  summarize,
  withStatus,
  type OverviewItem,
  type OverviewStatus,
  type StatusCounts,
} from "@/lib/overview";
import { getOverviewItems } from "@/server/services/overview";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const fmt = (iso: string) => formatDate(parseDateInput(iso));
const MAX_ROWS = 100;

// bar colors by status
const COLOR: Record<OverviewStatus, string> = { DONE: "#2FB171", IN_PROGRESS: "#4C7DE0", BLOCKED: "#D6364F", NOT_STARTED: "#C9CED8" };

// A stacked bar of the four statuses. With `href`, each segment is a link to the items of that status.
function Bar({ counts, height = 14, href }: { counts: StatusCounts; height?: number; href?: (s: OverviewStatus) => string }) {
  const total = OVERVIEW_STATUSES.reduce((n, s) => n + counts[s], 0);
  if (total === 0) return <div style={{ height, borderRadius: 999, background: "#EEF0F5" }} />;
  return (
    <div style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", background: "#EEF0F5" }} role="img" aria-label={OVERVIEW_STATUSES.map((s) => `${counts[s]} ${STATUS_LABELS[s]}`).join(", ")}>
      {OVERVIEW_STATUSES.filter((s) => counts[s] > 0).map((s) => {
        const style = { width: `${(counts[s] / total) * 100}%`, background: COLOR[s], display: "block" } as const;
        return href ? <Link key={s} href={href(s)} title={`${counts[s]} ${STATUS_LABELS[s]}`} style={style} /> : <span key={s} title={`${counts[s]} ${STATUS_LABELS[s]}`} style={style} />;
      })}
    </div>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  // managers and staff both open this page; it is read-only and holds no money, contract or file links
  const role = await requireAnyPageAuth();
  const staff = role === "staff";
  const params = await searchParams;
  const department = parseDepartment(params.dept);
  const status = parseOverviewStatus(params.status);
  const todayIso = toDateInputValue(todayInAppTz());
  const everything = await getOverviewItems();

  const here = inDepartment(everything, department);
  const summary = summarize(here, todayIso);
  const href = (dept: typeof department, s?: OverviewStatus | null) => `/overview${dept || s ? "?" : ""}${[dept ? `dept=${dept}` : "", s ? `status=${s}` : ""].filter(Boolean).join("&")}`;
  const chip = (active: boolean) => ({
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 600,
    border: `1px solid ${active ? NAVY : "#E4E6EC"}`,
    background: active ? NAVY : "#fff",
    color: active ? "#fff" : NAVY,
  });

  const phases = byPhase(here);
  const owners = byOwner(here, todayIso);
  const list = status ? withStatus(here, status) : needsAttention(here, todayIso);
  const listTitle = status ? `${STATUS_LABELS[status]} items` : "Needs attention: blocked and overdue items";
  const maxOpen = Math.max(1, ...owners.map((o) => o.open));

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Overview</h1>
        <div style={pageSubtitleStyle}>
          How each department&apos;s work stands across the active projects. Click a department, or a color in a bar, to see the items. Items marked N/A are not counted.
        </div>
      </div>

      {/* one card per department */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {DEPARTMENTS.map((d) => {
          const s = summarize(inDepartment(everything, d), todayIso);
          const active = department === d;
          return (
            <Link key={d} href={href(d)} aria-current={active ? "true" : undefined} style={{ ...cardStyle, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, border: `2px solid ${active ? NAVY : "transparent"}`, color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ color: NAVY, fontSize: 16 }}>{departmentLabel(d)}</strong>
                <span style={{ fontSize: 12.5, color: TEXT_MUTED }}>{s.total} items</span>
              </div>
              <Bar counts={s.counts} />
              <div style={{ display: "flex", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
                <span><strong style={{ color: COLOR.DONE }}>{s.donePercent}%</strong> done</span>
                <span style={{ color: s.blocked ? COLOR.BLOCKED : TEXT_MUTED, fontWeight: s.blocked ? 700 : 400 }}>{s.blocked} blocked</span>
                <span style={{ color: s.overdue ? "#B45309" : TEXT_MUTED, fontWeight: s.overdue ? 700 : 400 }}>{s.overdue} overdue</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link href={href(null)} style={chip(!department)} aria-current={!department ? "true" : undefined}>
          All departments
        </Link>
        {DEPARTMENTS.map((d) => (
          <Link key={d} href={href(d)} style={chip(department === d)} aria-current={department === d ? "true" : undefined}>
            {departmentLabel(d)}
          </Link>
        ))}
      </div>

      <section style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: NAVY }}>{department ? departmentLabel(department) : "All departments"}</h2>
          <span style={{ fontSize: 14, color: TEXT_MUTED }}>
            {summary.total} items · <strong style={{ color: COLOR.DONE }}>{summary.donePercent}% done</strong>
          </span>
        </div>
        <Bar counts={summary.counts} height={22} href={(s) => href(department, s)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OVERVIEW_STATUSES.map((s) => (
            <Link key={s} href={href(department, status === s ? null : s)} aria-current={status === s ? "true" : undefined} style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13.5, padding: "5px 12px", borderRadius: 999, border: `1px solid ${status === s ? NAVY : "#E4E6EC"}`, background: status === s ? "#EEF2FB" : "#fff", color: "#1A1A1A" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: COLOR[s], display: "inline-block" }} />
              {STATUS_LABELS[s]} <strong>{summary.counts[s]}</strong>
            </Link>
          ))}
          {summary.overdue > 0 && <span style={{ fontSize: 13.5, padding: "5px 12px", color: "#B45309", fontWeight: 700 }}>{summary.overdue} past their target date</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, paddingTop: 6 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>By phase</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {phases.length === 0 && <span style={{ color: TEXT_MUTED, fontSize: 14 }}>Nothing here.</span>}
              {phases.map((p) => (
                <div key={p.phase} style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <span>{phaseShortName(p.phase)}</span>
                  <Bar counts={p.counts} height={10} />
                  <span style={{ color: TEXT_MUTED, textAlign: "right" }}>{p.counts.DONE}/{p.total}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>Open items by owner</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {owners.length === 0 && <span style={{ color: TEXT_MUTED, fontSize: 14 }}>No open items.</span>}
              {owners.slice(0, 12).map((o) => (
                <div key={o.name ?? "none"} style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <span style={{ color: o.name ? "inherit" : TEXT_MUTED, overflowWrap: "anywhere" }}>{o.name ?? "Not assigned"}</span>
                  <div style={{ height: 10, borderRadius: 999, background: "#EEF0F5" }} title={`${o.open} open, ${o.blocked} blocked, ${o.overdue} overdue`}>
                    <div style={{ width: `${(o.open / maxOpen) * 100}%`, height: "100%", borderRadius: 999, background: o.blocked || o.overdue ? ORANGE : "#4C7DE0" }} />
                  </div>
                  <span style={{ color: TEXT_MUTED, textAlign: "right" }}>{o.open}</span>
                </div>
              ))}
              {owners.length > 12 && <span style={{ color: TEXT_MUTED, fontSize: 13 }}>and {owners.length - 12} more</span>}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: NAVY }}>
            {listTitle} <span style={{ fontWeight: 400, fontSize: 13.5, color: TEXT_MUTED }}>({list.length})</span>
          </h2>
          {status && (
            <Link href={href(department)} style={{ color: NAVY, fontWeight: 700, fontSize: 13.5 }}>
              Back to blocked and overdue
            </Link>
          )}
        </div>
        {list.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 14, padding: "10px 0" }}>{status ? "No items." : "Nothing is blocked or overdue."}</div>}
        {list.slice(0, MAX_ROWS).map((i) => (
          <ItemRow key={i.id} item={i} todayIso={todayIso} staff={staff} />
        ))}
        {list.length > MAX_ROWS && <div style={{ color: TEXT_MUTED, fontSize: 13.5, paddingTop: 8 }}>and {list.length - MAX_ROWS} more: choose a department to narrow it.</div>}
      </section>
    </main>
  );
}

function ItemRow({ item, todayIso, staff }: { item: OverviewItem; todayIso: string; staff: boolean }) {
  const late = isOverdue(item, todayIso);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1.1fr) minmax(180px, 1.6fr) 120px 130px 150px", gap: 14, padding: "9px 0", borderTop: `1px solid ${ROW_DIVIDER}`, alignItems: "center", fontSize: 14 }}>
      <span style={{ overflowWrap: "anywhere" }}>
        {/* staff cannot open the project pages: the name is plain text for them */}
        {staff ? <strong style={{ color: NAVY }}>{item.projectName}</strong> : <Link href={`/projects/${item.projectId}`} style={{ color: NAVY, fontWeight: 700 }}>{item.projectName}</Link>}
        <span style={{ display: "block", color: TEXT_MUTED, fontSize: 12.5 }}>{item.customerName}</span>
      </span>
      <span style={{ overflowWrap: "anywhere" }}>
        {item.item}
        <span style={{ display: "block", color: TEXT_MUTED, fontSize: 12.5 }}>{departmentLabel(item.department)} · {phaseShortName(item.phase)}</span>
      </span>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR[item.status] }} />
        {STATUS_LABELS[item.status]}
      </span>
      <span style={{ color: item.ownerName ? "inherit" : TEXT_MUTED }}>{item.ownerName ?? "Not assigned"}</span>
      <span style={{ textAlign: "right", color: late ? "#B45309" : TEXT_MUTED, fontWeight: late ? 700 : 400 }}>
        {item.targetDate ? `${fmt(item.targetDate)}${late ? ` · ${daysOverdue(item, todayIso)} d late` : ""}` : "no target date"}
      </span>
    </div>
  );
}
