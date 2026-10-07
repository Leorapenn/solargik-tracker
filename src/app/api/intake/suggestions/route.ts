import { isAuthorizedBearer } from "@/lib/cron";
import { UserError } from "@/lib/errors";
import { KIND_LABELS, MAX_PER_REQUEST } from "@/lib/suggestions";
import { createSuggestions } from "@/server/services/suggestions";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

// The doorway for an outside reader (a Dots agent reading Outlook). It can only add PENDING suggestions that a
// person reviews on the Inbox page; it can't read or change any project data. The proxy lets /api/intake/* through
// without a login session, so every call must carry INTAKE_TOKEN (16+ characters) as a Bearer token; with no token
// set, everything is refused.
function unauthorized(request: Request) {
  return !isAuthorizedBearer(request.headers.get("authorization"), process.env.INTAKE_TOKEN);
}

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
  const list = Array.isArray((body as { suggestions?: unknown })?.suggestions) ? (body as { suggestions: unknown[] }).suggestions : body && typeof body === "object" && !Array.isArray(body) ? [body] : null;
  if (!list || list.length === 0) return Response.json({ error: `Send {"suggestions": [ ... ]}.` }, { status: 400 });

  try {
    return Response.json(await createSuggestions(list));
  } catch (error) {
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

// Describes what can be sent, for the agent (or a person) setting it up.
export async function GET(request: Request) {
  if (unauthorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json({
    how: "POST JSON to this address with the header 'Authorization: Bearer <token>'. A person reviews every suggestion before anything changes.",
    body: { suggestions: "array of up to " + MAX_PER_REQUEST },
    commonFields: {
      kind: Object.keys(KIND_LABELS),
      project: "the project code or name as written in the email, e.g. '259' or 'Rignano Flaminio 1'",
      summary: "one line saying what you propose (required, max 200 characters)",
      evidence: "the sentence(s) from the email that support it (max 1500 characters)",
      source: { from: "sender", subject: "email subject", receivedAt: "ISO date-time", link: "https link to the email" },
      id: "your own unique id for this suggestion (e.g. the email's id plus a number) so a retry is not duplicated",
    },
    kinds: {
      PHASE_UPDATE: { phase: "INITIATION | DESIGN | SUPPLY | CONSTRUCTION | COMMISSIONING | OM", text: "the update text" },
      ITEM_UPDATE: { item: "the sub-phase name, e.g. 'Layout Approval'", phase: "optional, as above", text: "the update text" },
      MILESTONE_UPDATE: { milestone: "e.g. 'Milestone 2'", status: "INVOICE_SENT | PAYMENT_RECEIVED (optional)", invoiceSentDate: "YYYY-MM-DD (optional)", paidDate: "YYYY-MM-DD (optional)", invoiceLink: "https link (optional)", payslipLink: "https link (optional)" },
      CONTACT: { name: "required", email: "optional", phone: "optional", role: "optional" },
      NOTE: { text: "anything worth a person's attention that doesn't fit the kinds above" },
    },
  });
}
