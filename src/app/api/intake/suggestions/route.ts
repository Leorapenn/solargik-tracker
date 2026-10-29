import { isIntakeAuthorized } from "@/lib/intakeAuth";
import { UserError } from "@/lib/errors";
import { KIND_LABELS, MAX_PER_REQUEST } from "@/lib/suggestions";
import { createSuggestions } from "@/server/services/suggestions";
import { listItemNames } from "@/server/services/intakeDirectory";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

// The doorway for an outside reader (a Dots agent reading Outlook). It can only add PENDING suggestions that a
// person reviews on the Inbox page; it can't read or change any project data. The proxy lets /api/intake/* through
// without a login session, so every call must carry INTAKE_TOKEN (16+ characters) as a Bearer token; with no token
// set, everything is refused.
function unauthorized(request: Request) {
  return !isIntakeAuthorized(request);
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
    // the exact item names a STATUS_CHANGE or ITEM_UPDATE can name, by phase
    itemNames: await listItemNames(),
    how: "POST JSON to this address with the header 'Authorization: Bearer <token>'. A person reviews every suggestion before anything changes.",
    body: { suggestions: "array of up to " + MAX_PER_REQUEST },
    bookkeeping: "/api/intake/import-run: GET = get_last_import (when the last run finished), POST {emailsChecked, ranAt = when this run STARTED} = record_import_run (send your suggestions first; the tracker counts proposals and unmatched itself).",
    commonFields: {
      kind: Object.keys(KIND_LABELS),
      project: "the project code or name as written in the email, e.g. '259' or 'Rignano Flaminio 1'. Leave it out for a general item that is not about one project.",
      customer: "the customer's name as written, e.g. 'Revalue'. With no project, a note or action item is filed on this customer's page.",
      summary: "one line saying what you propose (required, max 200 characters)",
      evidence: "the sentence(s) from the email that support it (max 1500 characters)",
      source: { from: "sender", subject: "email subject", receivedAt: "ISO date-time", messageId: "the email's own id (e.g. the Outlook message id)", conversationId: "the id of the email's conversation / chain (e.g. the Outlook conversationId), the same for every email of one chain: the tracker shows the proposals of one chain together", link: "https link to the email (optional)" },
      confidence: "high | medium | low: how sure you are (optional)",
      id: "your own unique id for this suggestion (e.g. the email's id plus a number) so a retry is not duplicated",
    },
    kinds: {
      PHASE_UPDATE: { phase: "INITIATION | DESIGN | SUPPLY | CONSTRUCTION | COMMISSIONING | OM", text: "the update text" },
      ITEM_UPDATE: { item: "the sub-phase name, e.g. 'Layout Approval'", phase: "optional, as above", text: "the update text" },
      STATUS_CHANGE: { item: "the sub-phase name", phase: "optional, as above", status: "NOT_STARTED | IN_PROGRESS | BLOCKED | DONE (no other values exist)", date: "optional, YYYY-MM-DD, only with DONE: the day it really happened (e.g. the delivery day on a signed proof of delivery); it becomes the completed date. Leave it out when the email does not state it." },
      CHANGE_ORDER: { reason: "what it is for, e.g. 'Change Order 02: additional PDUs' (required)", amount: "plain number, no thousands separators, only if the email states it", currency: "USD | EUR | ILS | GBP | CHF | CAD, if stated", dateSent: "YYYY-MM-DD", invoicedDate: "YYYY-MM-DD", invoiceStatus: "SENT | PAID", paymentTermsDays: "whole days, e.g. 30 for Net+30", fileLink: "the SharePoint link of the saved change order PDF (preferred), else this email's Outlook web link", invoiceLink: "the SharePoint link of the saved invoice PDF (preferred), else the email's link" },
      CHANGE_ORDER_UPDATE: { changeOrder: "the name of an existing change order (see the project's changeOrders list)", invoicedDate: "YYYY-MM-DD", invoiceStatus: "SENT | PAID", paymentTermsDays: "whole days", fileLink: "link", invoiceLink: "link", payslipLink: "link to the saved proof of payment (the customer's bank transfer confirmation)" },
      CONTRACT_DOCUMENT: { description: "what the document is, e.g. 'Signed Framework Supply Agreement' (required)", fileLink: "the SharePoint link of the saved contract file (required, not an email link)", signedDate: "YYYY-MM-DD, only if the document states it. Approving sets the project's contract link only when none is set yet." },
      NEW_PROJECT: { number: "the project number as named in its SharePoint folder, 2 to 4 digits, e.g. '370' (required; never guess it)", name: "the project's name without its number, e.g. 'Blumberg' (required)", country: "optional", capacityKwp: "optional, kWp as a plain number", contractAmount: "optional, a plain number, only if the signed document states it", currency: "USD | EUR | ILS | GBP | CHF | CAD (optional: only when the document states one; missing = EUR, as Solargik's contracts are normally in Euro)", signedDate: "YYYY-MM-DD, the contract signing date, only if stated", profile: "optional object of contract details, only what the document states: incoterms (e.g. DDP, Incoterms 2020), supplyTerms (payment and delivery conditions), deliveryExpectations (delivery schedule / timeline), pileDrivingStart (YYYY-MM-DD), ntpDate (YYYY-MM-DD), supplyObligations, contractType (EPC | Tracker Supply | Pilot), soilTest (the tracker's power: SPT = Self-Powered Tracker | GPT = Grid-Powered Tracker, as the document specifies it; a mentioned upgrade option is not the choice), incoterms, soma, projectType, deliveryAddress (the project site address as the document gives it, with GPS if shown), shippingAddress (only if a different one is named)", sources: "optional object: for each profile key (and signedDate) the sentence of the document it was read from, max 300 characters", note: "also send 'customer' (as written). Approving CREATES the project in 360 once a person confirms the customer; send it only for a real signed order that is not in the projects list." },
      ACTION_ITEM: { text: "the request or commitment, saying whether it is the customer's or Solargik's. Approving it CREATES A TASK (an action item and a task are one thing)", who: "optional: the person's full name if the email names one", by: "optional: a date as YYYY-MM-DD only when the email states one (it becomes the task's follow-up date); otherwise leave it out or write it as the email does" },
      TASK_UPDATE: { taskId: "the id of an open task, copied exactly from the openTasks list of the project or customer (required)", taskIds: "optional: when ONE email settles several open tasks, the list of their ids (up to 10, all of the same customer); the outcome then applies to every one of them, so use RESOLVED only if the email settles all of them", text: "what the email says about it, one or two plain lines (required)", outcome: "RESOLVED (matter settled / question fully answered) | WAITING_CUSTOMER | WAITING_US | LOG (only adds information). Default LOG. Use this instead of an ACTION_ITEM or note when an email answers or follows up a task that is already open; a person confirms it. The same subject alone does not mean resolved." },
      SHIPMENT_UPDATE: { reference: "how the email names the shipment: a PO or invoice number, or 'Shipment #02' (required)", goods: "e.g. 'Pylons'", forwarder: "e.g. 'Viamar'", vessel: "optional", containers: "optional array of container numbers (four letters and seven digits, e.g. 'TCNU5368259'); they are added to the shipment, never removed", portOfLoading: "optional", portOfDischarge: "optional", status: "BOOKED | IN_TRANSIT | AT_PORT | CUSTOMS | DELIVERY_PLANNED | DELIVERED (the stage the email shows)", customsStatus: "NOT_STARTED | IN_PROGRESS | HELD | CLEARED", etd: "YYYY-MM-DD", eta: "YYYY-MM-DD, expected arrival at the port", arrivedAt: "YYYY-MM-DD, arrived at the port", customsClearedAt: "YYYY-MM-DD", deliveryDate: "YYYY-MM-DD, planned delivery to the site", deliveredAt: "YYYY-MM-DD, delivered (needed with status DELIVERED)", notes: "one short line: a delay and why, the questions asked", note: "send only what the email states, at least one fact besides the reference. Approving adds the shipment to the project's Shipments or updates the one with the same reference (else the one sharing a container number). Match against the project's `shipments` list." },
      CORRESPONDENCE_NOTE: { text: "other meaningful project communication, one plain line or two", fileLink: "optional: the SharePoint link of a saved document that belongs with the note (e.g. an amendment)" },
      MILESTONE_UPDATE: { milestone: "e.g. 'Milestone 2'", status: "INVOICE_SENT | PAYMENT_RECEIVED (optional)", invoiceSentDate: "YYYY-MM-DD (optional)", paidDate: "YYYY-MM-DD (optional)", paymentTermsDays: "whole days after the invoice date, only if the invoice states it: Net 30 = 30, immediate = 0 (optional; the tracker assumes 30)", invoiceLink: "https link (optional)", payslipLink: "link to the saved proof of payment (optional)" },
      CONTACT: { name: "required", email: "optional", phone: "optional", role: "optional" },
      NOTE: { text: "anything worth a person's attention that doesn't fit the kinds above" },
    },
  });
}
