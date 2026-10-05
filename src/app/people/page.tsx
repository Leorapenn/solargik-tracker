import type { Department } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { parseSort, sortRows } from "@/lib/sort";
import { PeopleManager, type PersonRow } from "@/components/PeopleManager";
import { pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;

  const [people, departmentOwners] = await Promise.all([
    prisma.person.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { subStages: true } } } }),
    prisma.departmentOwner.findMany(),
  ]);

  const rows: PersonRow[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    active: p.active,
    itemCount: p._count.subStages,
  }));
  const accessors = {
    name: (r: PersonRow) => r.name,
    email: (r: PersonRow) => r.email,
    items: (r: PersonRow) => r.itemCount,
    status: (r: PersonRow) => (r.active ? 0 : 1),
  };
  const sort = parseSort(params, Object.keys(accessors), { key: "name", dir: "asc" });
  const defaults = Object.fromEntries(departmentOwners.map((d) => [d.department, d.personId])) as Partial<
    Record<Department, string>
  >;

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>People</h1>
        <div style={pageSubtitleStyle}>
          Who can own phase items, and who owns each department&apos;s items by default on new projects
        </div>
      </div>
      <PeopleManager people={sortRows(rows, accessors, sort)} defaults={defaults} sort={sort} params={params} />
    </main>
  );
}
