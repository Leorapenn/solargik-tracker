import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { TASK_FILTERS, matchesFilter, parseTaskFilter, type TaskFilter } from "@/lib/tasks";
import { listTasks, type TaskView } from "@/server/services/tasks";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskButton } from "@/components/NewTaskButton";
import { NAVY, TEXT_MUTED, cardStyle, inputStyle, pageStyle, pageSubtitleStyle, pageTitleStyle, secondaryButton } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const filter = parseTaskFilter(one(params.filter));
  const customerId = one(params.customer) ?? "";
  const todayIso = toDateInputValue(todayInAppTz());

  const [everything, customers, projects, people] = await Promise.all([
    listTasks(),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true, customerId: true } }),
    prisma.person.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const times = (t: TaskView) => ({ status: t.status, nextFollowUp: t.nextFollowUp, lastContactAt: t.lastContactAt, createdOn: t.createdOn });
  // the chip counts follow the customer picked, not the chip
  const inCustomer = customerId ? everything.filter((t) => t.customerId === customerId) : everything;
  const count = (f: TaskFilter) => inCustomer.filter((t) => matchesFilter(times(t), f, todayIso)).length;
  const shown = inCustomer.filter((t) => matchesFilter(times(t), filter, todayIso));

  // grouped by customer; the customer with the most urgent task comes first (the list is already most urgent first)
  const groups: { customerId: string; name: string; tasks: TaskView[] }[] = [];
  for (const t of shown) {
    let g = groups.find((x) => x.customerId === t.customerId);
    if (!g) groups.push((g = { customerId: t.customerId, name: t.customerName, tasks: [] }));
    g.tasks.push(t);
  }

  const href = (f: TaskFilter) => `/tasks?filter=${f}${customerId ? `&customer=${encodeURIComponent(customerId)}` : ""}`;
  const chip = (active: boolean) => ({
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 600,
    border: `1px solid ${active ? NAVY : "#E4E6EC"}`,
    background: active ? NAVY : "#fff",
    color: active ? "#fff" : NAVY,
  });
  const customersWithTasks = [...new Map(everything.map((t) => [t.customerId, t.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Tasks</h1>
        <div style={pageSubtitleStyle}>
          Matters to chase, per customer and project: the issue, its status, the last correspondence and when to follow up next. The bell in the top bar shows what needs attention.
        </div>
      </div>

      <NewTaskButton customers={customers} projects={projects} people={people} presetCustomerId={customerId} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TASK_FILTERS.map((f) => (
          <Link key={f.key} href={href(f.key)} style={chip(filter === f.key)} aria-current={filter === f.key ? "true" : undefined}>
            {f.label} ({count(f.key)})
          </Link>
        ))}
        <form method="get" action="/tasks" style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <input type="hidden" name="filter" value={filter} />
          <select name="customer" aria-label="Customer" defaultValue={customerId} style={{ ...inputStyle, maxWidth: 260 }}>
            <option value="">All customers</option>
            {customersWithTasks.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
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
            ? "No tasks yet. Press + New task to add the first one."
            : filter === "attention"
              ? "Nothing needs attention right now."
              : filter === "resolved"
                ? "No resolved tasks."
                : "Nothing here."}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.customerId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>
            <Link href={`/customers/${g.customerId}`} style={{ color: NAVY }}>
              {g.name}
            </Link>{" "}
            <span style={{ fontWeight: 400, fontSize: 13.5, color: TEXT_MUTED }}>({g.tasks.length})</span>
          </h2>
          {g.tasks.map((t) => (
            <TaskCard key={t.id} task={t} todayIso={todayIso} customers={customers} projects={projects} people={people} />
          ))}
        </section>
      ))}
    </main>
  );
}
