import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { formatDate, parseDateInput } from "@/lib/dates";
import { ACTION_FILTERS, applyFilters, countByStatus, groupActions, parseScope, parseStatusFilter } from "@/lib/actionItems";
import { listActionItems } from "@/server/services/actionItems";
import { ActionDoneToggle } from "@/components/ActionDoneToggle";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, pageStyle, pageSubtitleStyle, pageTitleStyle, secondaryButton } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function ActionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const status = parseStatusFilter(params.status);
  const scope = parseScope(params.scope);

  const everything = await listActionItems();
  // the counts on the chips follow the project / customer picked, not the status chip
  const scoped = applyFilters(everything, "all", scope);
  const counts = countByStatus(scoped);
  const groups = groupActions(applyFilters(everything, status, scope));

  // everything that can be picked: each project and each customer's general items that have an action item
  const scopes = new Map<string, string>();
  for (const r of everything) {
    if (r.projectId && r.projectName) scopes.set(`p:${r.projectId}`, r.projectName);
    else if (r.customerId && r.customerName) scopes.set(`c:${r.customerId}`, `${r.customerName} (general)`);
  }
  const scopeOptions = [...scopes.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  const scopeValue = scope ? `${scope.kind === "project" ? "p" : "c"}:${scope.id}` : "";

  const href = (s: string) => `/actions?status=${s}${scopeValue ? `&scope=${encodeURIComponent(scopeValue)}` : ""}`;
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
        <h1 style={pageTitleStyle}>Actions</h1>
        <div style={pageSubtitleStyle}>
          Requests and commitments found in emails and approved from the Inbox, by project. Tick them off when they are done.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {ACTION_FILTERS.map((f) => (
          <Link key={f.key} href={href(f.key)} style={chip(status === f.key)} aria-current={status === f.key ? "true" : undefined}>
            {f.label} ({counts[f.key]})
          </Link>
        ))}
        <form method="get" action="/actions" style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <input type="hidden" name="status" value={status} />
          <select name="scope" aria-label="Project or customer" defaultValue={scopeValue} style={{ ...inputStyle, maxWidth: 260 }}>
            <option value="">All projects and customers</option>
            {scopeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" style={secondaryButton}>
            Show
          </button>
        </form>
      </div>

      {groups.length === 0 && (
        <div style={{ ...cardStyle, padding: 24, color: TEXT_MUTED }}>
          {everything.length === 0
            ? "No action items yet. When you approve an action item from the Inbox, it appears here."
            : status === "open"
              ? "Nothing open. Every action item here is done."
              : "Nothing here."}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: NAVY }}>
            {group.href ? (
              <Link href={group.href} style={{ color: NAVY }}>
                {group.title}
              </Link>
            ) : (
              group.title
            )}{" "}
            <span style={{ fontWeight: 400, fontSize: 13.5, color: TEXT_MUTED }}>({group.items.length})</span>
          </h2>
          <div style={{ ...cardStyle, padding: "4px 20px" }}>
            {group.items.map((item, i) => (
              <div
                key={item.id}
                style={{ padding: "14px 0", borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "start" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, overflowWrap: "anywhere", textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.65 : 1 }}>{item.summary}</div>
                  {item.text && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.text}</div>}
                  <div style={{ fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap", color: TEXT_MUTED }}>
                    {item.who && (
                      <span>
                        Who: <span style={{ color: "#1A1A1A" }}>{item.who}</span>
                      </span>
                    )}
                    {item.by && (
                      <span>
                        By: <span style={{ color: "#1A1A1A" }}>{item.by}</span>
                      </span>
                    )}
                    <span>{formatDate(parseDateInput(item.date))}</span>
                    {item.from && <span style={{ overflowWrap: "anywhere" }}>from {item.from}</span>}
                    {item.done && item.doneOn && <span style={{ color: "#047857", fontWeight: 700 }}>Done {formatDate(parseDateInput(item.doneOn))}</span>}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                        Open email
                      </a>
                    )}
                  </div>
                </div>
                <ActionDoneToggle id={item.id} done={item.done} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
