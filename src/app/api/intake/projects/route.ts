import { isIntakeAuthorized } from "@/lib/intakeAuth";
import { listProjectsForMatching } from "@/server/services/intakeDirectory";

export const dynamic = "force-dynamic";

// Read-only: the projects the email agent can match an email to (number, name, other names, customer, lifecycle, the
// monday.com stage and status, and each phase's status). No contract values, payments or file links. Needs
// INTAKE_TOKEN like the rest of /api/intake/*.
export async function GET(request: Request) {
  if (!isIntakeAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const projects = await listProjectsForMatching();
  return Response.json({ projects }, { headers: { "Cache-Control": "no-store" } });
}
