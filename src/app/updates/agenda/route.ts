import { hasSession } from "@/lib/auth";
import { todayInAppTz } from "@/lib/dates";
import { buildAgendaDocx } from "@/lib/agendaDocx";
import { parseRange } from "@/lib/weeklyUpdates";
import { getGeneralEmailUpdates, getUpdatesInRange } from "@/server/services/weeklyUpdates";
import { pendingCount } from "@/server/services/suggestions";

export const dynamic = "force-dynamic";

// The Sunday meeting agenda as a Word file for ?from=&to= (default: last week): updates from the approved emails and the typed
// phase / item updates, by stage and project.
export async function GET(request: Request) {
  // The proxy already redirects signed-out visitors; this re-checks next to the data.
  if (!(await hasSession())) return new Response("Unauthorized", { status: 401 });

  const search = new URL(request.url).searchParams;
  const range = parseRange({ from: search.get("from") ?? undefined, to: search.get("to") ?? undefined }, todayInAppTz());
  const [projects, general, pending] = await Promise.all([getUpdatesInRange(range), getGeneralEmailUpdates(range), pendingCount()]);
  const file = await buildAgendaDocx({ range, projects, general, pendingCount: pending });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="solargik-meeting-agenda-${range.from}-to-${range.to}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
