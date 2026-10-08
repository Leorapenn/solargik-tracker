import { isIntakeAuthorized } from "@/lib/intakeAuth";
import { listCustomersForMatching } from "@/server/services/intakeDirectory";

export const dynamic = "force-dynamic";

// Read-only: the customers the email agent can match an email to (name, name variants, business email domains and
// contacts). No amounts, phone numbers or file links. Needs INTAKE_TOKEN like the rest of /api/intake/*.
export async function GET(request: Request) {
  if (!isIntakeAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const customers = await listCustomersForMatching();
  return Response.json({ customers }, { headers: { "Cache-Control": "no-store" } });
}
