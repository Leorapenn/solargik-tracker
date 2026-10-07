import { hasSession } from "@/lib/auth";
import { todayInAppTz } from "@/lib/dates";
import { parseRange, toCsv } from "@/lib/weeklyUpdates";
import { getUpdatesInRange, toExportRows } from "@/server/services/weeklyUpdates";

export const dynamic = "force-dynamic";

// CSV download of the updates dated in ?from=&to= (default: last week). Opens in Excel.
export async function GET(request: Request) {
  // The proxy already redirects signed-out visitors; this re-checks next to the data.
  if (!(await hasSession())) return new Response("Unauthorized", { status: 401 });

  const search = new URL(request.url).searchParams;
  const range = parseRange({ from: search.get("from") ?? undefined, to: search.get("to") ?? undefined }, todayInAppTz());
  const csv = toCsv(toExportRows(await getUpdatesInRange(range)));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="solargik-updates-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
