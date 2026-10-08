import { isAuthorizedBearer } from "@/lib/cron";
import { UserError } from "@/lib/errors";
import { getLastImport, recordImportRun } from "@/server/services/importRuns";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_000;

// The agent's two bookkeeping tools. Like the suggestions doorway, the proxy lets /api/intake/* through without a
// login session, so every call must carry INTAKE_TOKEN as a Bearer token; with no token set, everything is refused.
// They only store and return run statistics: no project data is read or changed here.
function unauthorized(request: Request) {
  return !isAuthorizedBearer(request.headers.get("authorization"), process.env.INTAKE_TOKEN);
}

// get_last_import: when the last finished run was, with its counts (null before the first one).
export async function GET(request: Request) {
  if (unauthorized(request)) return new Response("Unauthorized", { status: 401 });
  const last = await getLastImport();
  return Response.json({ lastImport: last, lastImportAt: last?.ranAt ?? null });
}

// record_import_run: body {"emailsChecked": 42, "ranAt": "<optional ISO finish time, default now>"}. Proposals created and
// unmatched are counted by the tracker from the suggestions that arrived during the run, never taken from the agent.
export async function POST(request: Request) {
  if (unauthorized(request)) return new Response("Unauthorized", { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "That request is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "The body must be JSON." }, { status: 400 });
  }

  try {
    return Response.json({ recorded: await recordImportRun(body) });
  } catch (error) {
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
