import { isAuthorizedBearer } from "@/lib/cron";

// The one place the email agent's token is checked. INTAKE_TOKEN opens the /api/intake/* endpoints and nothing
// else: pages and Server Actions need the login session, and the cron route has its own CRON_SECRET, so a leaked
// intake token can read the matching lists and submit proposals but can't change project data or log in.
//
// Rotation without downtime: put the old token in INTAKE_TOKEN_PREVIOUS while the new one is in INTAKE_TOKEN, update
// the scheduled task, then delete INTAKE_TOKEN_PREVIOUS. Both fail closed when unset or shorter than 16 characters.
export function isIntakeAuthorized(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  const header = request.headers.get("authorization");
  return isAuthorizedBearer(header, env.INTAKE_TOKEN) || isAuthorizedBearer(header, env.INTAKE_TOKEN_PREVIOUS);
}
