import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { UserError } from "@/lib/errors";
import { createProject } from "./createProject";
import { approveSuggestion, createSuggestions, listSuggestions, rejectSuggestion } from "./suggestions";
import { listCustomerCorrespondence } from "./correspondence";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("suggestions", () => {
  let customerId: string;
  let projectId: string;
  let projectName: string;
  const ids: string[] = [];

  const send = async (raw: Record<string, unknown>) => {
    const r = await createSuggestions([{ summary: "s", source: { from: "x@y.com", subject: "subj" }, ...raw }]);
    const row = await prisma.suggestion.findFirst({ where: { externalId: raw.id as string } });
    if (row) ids.push(row.id);
    return { r, row };
  };

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-Test ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    projectName = project.name;
    await prisma.milestone.create({ data: { projectId, order: 0, label: "Milestone 1 (AP)", percent: 5 } });
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { id: { in: ids } } });
    if (customerId) await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("stores valid suggestions as pending, reports bad ones, and skips a repeated id", async () => {
    const code = projectName.split("-")[0];
    const first = await createSuggestions([
      { kind: "PHASE_UPDATE", phase: "DESIGN", text: "Waiting on geotech", summary: "Design", project: code, id: `${RUN}-a` },
      { kind: "NOPE", summary: "bad" },
    ]);
    expect(first).toMatchObject({ created: 1, duplicates: 0 });
    expect(first.rejected).toHaveLength(1);
    expect(first.rejected[0].index).toBe(1);

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-a` } });
    ids.push(row.id);
    expect(row).toMatchObject({ status: "PENDING", projectId, kind: "PHASE_UPDATE" });

    const again = await createSuggestions([{ kind: "PHASE_UPDATE", phase: "DESIGN", text: "Waiting on geotech", summary: "Design", project: code, id: `${RUN}-a` }]);
    expect(again).toMatchObject({ created: 0, duplicates: 1 });
    await expect(createSuggestions(Array.from({ length: 21 }, () => ({})))).rejects.toBeInstanceOf(UserError);
  });

  it("changes nothing until approved, then applies a phase update with today's date", async () => {
    const row = await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-a` } });
    const phase = () => prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name: "DESIGN" } } });
    expect((await phase()).statusUpdate).toBeNull();

    await approveSuggestion(row.id, { text: "Geotech report received" }); // reworded by the reviewer
    expect(await phase()).toMatchObject({ statusUpdate: "Geotech report received" });
    expect((await phase()).statusUpdateAt).not.toBeNull();
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("APPROVED");
    await expect(approveSuggestion(row.id)).rejects.toBeInstanceOf(UserError); // already handled
    expect((await listSuggestions("PENDING")).some((s) => s.id === row.id)).toBe(false);
  });

  it("needs a project when none matched, and fails clearly for an unknown item", async () => {
    const { row } = await send({ kind: "ITEM_UPDATE", item: "Nonexistent Thing", text: "x", id: `${RUN}-b`, project: "no such project" });
    expect(row?.projectId).toBeNull();
    await expect(approveSuggestion(row!.id)).rejects.toThrow("Choose which project");
    await expect(approveSuggestion(row!.id, { projectId })).rejects.toThrow(/no item called/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("PENDING"); // a failed apply stays pending
    await rejectSuggestion(row!.id);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("REJECTED");
    await expect(rejectSuggestion(row!.id)).rejects.toBeInstanceOf(UserError);
  });

  it("applies a milestone update and a new contact", async () => {
    const m = await send({ kind: "MILESTONE_UPDATE", milestone: "Milestone 1", status: "INVOICE_SENT", invoiceSentDate: "2026-10-05", invoiceLink: "https://x.sharepoint.com/inv.pdf", id: `${RUN}-c`, project: projectName });
    await approveSuggestion(m.row!.id);
    expect(await prisma.milestone.findFirstOrThrow({ where: { projectId } })).toMatchObject({ status: "INVOICE_SENT", invoiceLink: "https://x.sharepoint.com/inv.pdf" });

    const c = await send({ kind: "CONTACT", name: "Dana Levi", email: "dana@example.com", phone: "+39 06 1234 5678", id: `${RUN}-d`, project: projectName });
    await approveSuggestion(c.row!.id);
    expect(await prisma.contact.findFirstOrThrow({ where: { customerId, email: "dana@example.com" } })).toMatchObject({ name: "Dana Levi", phone: "+39 06 1234 5678", source: "MANUAL", locked: true });
    const dup = await send({ kind: "CONTACT", name: "Dana Again", email: "DANA@example.com", id: `${RUN}-e`, project: projectName });
    await expect(approveSuggestion(dup.row!.id)).rejects.toThrow(/already exists/);
  });

  it("applies a status change like a manual one (dates, history, phase) only on approval, and stores confidence and message id", async () => {
    const item = await prisma.subStage.findFirstOrThrow({ where: { phase: { projectId, name: "DESIGN" } }, orderBy: { order: "asc" } });
    const { row } = await send({
      kind: "STATUS_CHANGE", item: item.name, phase: "DESIGN", status: "in progress", id: `${RUN}-s1`, project: projectName,
      confidence: "high", source: { from: "x@y.com", subject: "subj", messageId: "MSG-S1" },
    });
    expect(row).toMatchObject({ status: "PENDING", confidence: "HIGH", sourceMessageId: "MSG-S1", projectId });
    expect((await prisma.subStage.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("NOT_STARTED"); // nothing yet

    expect(await approveSuggestion(row!.id)).toBe(`"${item.name}" set to In progress.`);
    const after = await prisma.subStage.findUniqueOrThrow({ where: { id: item.id } });
    expect(after).toMatchObject({ status: "IN_PROGRESS" });
    expect(after.startedAt).not.toBeNull();
    expect(await prisma.statusEvent.findFirst({ where: { subStageId: item.id, source: "inbox", toStatus: "IN_PROGRESS" } })).not.toBeNull();
    expect((await prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name: "DESIGN" } } })).status).toBe("IN_PROGRESS");

    // the same status again changes nothing and says so
    const again = await send({ kind: "STATUS_CHANGE", item: item.name, phase: "DESIGN", status: "IN_PROGRESS", id: `${RUN}-s2`, project: projectName });
    expect(await approveSuggestion(again.row!.id)).toBe(`"${item.name}" was already In progress.`);
    expect(await prisma.statusEvent.count({ where: { subStageId: item.id, source: "inbox" } })).toBe(1);
  });

  it("refuses a status that doesn't exist, and won't guess between several matching items", async () => {
    const r = await createSuggestions([{ kind: "STATUS_CHANGE", item: "Anything", status: "Delayed", summary: "s", id: `${RUN}-s3` }]);
    expect(r).toMatchObject({ created: 0 });
    expect(r.rejected[0].error).toMatch(/status/);

    const { row } = await send({ kind: "STATUS_CHANGE", item: "Delivery", phase: "SUPPLY", status: "DONE", id: `${RUN}-s4`, project: projectName });
    await expect(approveSuggestion(row!.id)).rejects.toThrow(/Several items match/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("PENDING");
    expect(await prisma.subStage.count({ where: { phase: { projectId }, name: { contains: "Delivery" }, status: "DONE" } })).toBe(0);
  });

  describe("change orders", () => {
    const orders = () => prisma.changeOrder.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    const emailLink = (n: string) => `https://outlook.office.com/mail/${RUN}-${n}`;
    const reason = `Change Order 02: additional PDUs ${RUN}`;

    it("creates the change order only on approval, with the email as its file link, and applies the reviewer's corrections", async () => {
      const { row } = await send({
        kind: "CHANGE_ORDER", reason, amount: 12000, currency: "USD", dateSent: "2026-10-07", id: `${RUN}-co1`, project: projectName,
        source: { from: "x@y.com", subject: "CO 02", link: emailLink("co") },
      });
      expect(row).toMatchObject({ status: "PENDING", projectId });
      expect(await orders()).toHaveLength(0); // nothing yet

      // the reviewer fixes the amount and adds the invoice date and terms before approving
      const note = await approveSuggestion(row!.id, { fields: { amount: "12500.50", invoicedDate: "2026-10-09", paymentTermsDays: "30" } });
      expect(note).toBe(`Change order "${reason}" created on the Payments page, with its file link.`);
      const [created] = await orders();
      expect(created).toMatchObject({ reason, status: "SENT", invoiceStatus: "SENT", paymentTermsDays: 30, fileLink: emailLink("co"), invoiceLink: null, payslipLink: null });
      expect(created.amount?.toString()).toBe("12500.5");
      expect(created.dateSent?.toISOString().slice(0, 10)).toBe("2026-10-07");
      expect(created.invoicedDate?.toISOString().slice(0, 10)).toBe("2026-10-09");
      // what was approved (with the corrections) is what is kept on the proposal
      expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).payload).toMatchObject({ amount: "12500.50", invoicedDate: "2026-10-09" });
    });

    it("refuses a second change order with the same name, and a bad correction, and stays pending", async () => {
      const dup = await send({ kind: "CHANGE_ORDER", reason: reason.toLowerCase(), id: `${RUN}-co2`, project: projectName });
      await expect(approveSuggestion(dup.row!.id)).rejects.toThrow(/already has a change order/);
      expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: dup.row!.id } })).status).toBe("PENDING");

      const other = await send({ kind: "CHANGE_ORDER", reason: `Change Order 03 ${RUN}`, id: `${RUN}-co3`, project: projectName });
      await expect(approveSuggestion(other.row!.id, { fields: { amount: "12,5" } })).rejects.toThrow(/amount/);
      await expect(approveSuggestion(other.row!.id, { fields: { invoicedDate: "2026-13-40" } })).rejects.toThrow(/invoicedDate/);
      await expect(approveSuggestion(other.row!.id, { fields: { reason: "" } })).rejects.toThrow(/reason/);
      expect(await orders()).toHaveLength(1);
      expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: other.row!.id } })).status).toBe("PENDING");
    });

    it("won't put an amount in the wrong currency on a project", async () => {
      const { row } = await send({ kind: "CHANGE_ORDER", reason: `Change Order 04 ${RUN}`, amount: 800, currency: "EUR", id: `${RUN}-co4`, project: projectName });
      await expect(approveSuggestion(row!.id)).rejects.toThrow(/in EUR, but .* payments are in USD/);
      expect(await orders()).toHaveLength(1);
      await prisma.project.update({ where: { id: projectId }, data: { paymentCurrency: "EUR" } });
      await approveSuggestion(row!.id);
      expect(await orders()).toHaveLength(2);
      await prisma.project.update({ where: { id: projectId }, data: { paymentCurrency: "USD" } });
    });

    it("updates the existing change order when its invoice arrives, instead of creating another", async () => {
      const before = (await orders())[0];
      const { row } = await send({
        kind: "CHANGE_ORDER_UPDATE", changeOrder: "Change Order 02", invoicedDate: "2026-10-12", invoiceStatus: "paid", paymentTermsDays: 45, invoiceLink: emailLink("inv"),
        id: `${RUN}-co5`, project: projectName,
      });
      expect(await approveSuggestion(row!.id)).toBe(`Change order "${reason}" updated.`);
      const orderList = await orders();
      expect(orderList).toHaveLength(2); // none added
      const after = orderList.find((o) => o.id === before.id)!;
      expect(after).toMatchObject({ invoiceStatus: "PAID", status: "COMPLETE", paymentTermsDays: 45, invoiceLink: emailLink("inv"), fileLink: emailLink("co") });
      expect(after.amount?.toString()).toBe("12500.5"); // untouched
      expect(after.invoicedDate?.toISOString().slice(0, 10)).toBe("2026-10-12");
    });

    it("says so when the change order to update doesn't exist or is ambiguous", async () => {
      const none = await send({ kind: "CHANGE_ORDER_UPDATE", changeOrder: "Change Order 99", invoiceStatus: "PAID", id: `${RUN}-co6`, project: projectName });
      await expect(approveSuggestion(none.row!.id)).rejects.toThrow(/no change order called/);
      const several = await send({ kind: "CHANGE_ORDER_UPDATE", changeOrder: "Change Order 0", invoiceStatus: "PAID", id: `${RUN}-co7`, project: projectName });
      await expect(approveSuggestion(several.row!.id)).rejects.toThrow(/Several change orders match/);
    });
  });

  describe("general items for a customer", () => {
    it("matches the customer at intake and files a general note on the customer's page only", async () => {
      const general = await send({ kind: "CORRESPONDENCE_NOTE", text: "General question about the framework agreement", summary: `general ${RUN}`, id: `${RUN}-g1`, customer: `test customer ${RUN}` });
      expect(general.row).toMatchObject({ projectId: null, customerId });
      expect(await approveSuggestion(general.row!.id)).toBe(`Saved on Test Customer ${RUN}'s page under Correspondence and actions.`);
      expect(await prisma.suggestion.findUniqueOrThrow({ where: { id: general.row!.id } })).toMatchObject({ status: "APPROVED", projectId: null, customerId });

      // an item about a project belongs to the project page, not the customer's general list
      const aboutProject = await send({ kind: "ACTION_ITEM", text: "Send the layout", summary: `project item ${RUN}`, id: `${RUN}-g2`, project: projectName });
      expect(aboutProject.row?.customerId).toBe(customerId); // the project's customer
      await approveSuggestion(aboutProject.row!.id);
      // pending and rejected ones stay out too
      await send({ kind: "CORRESPONDENCE_NOTE", text: "x", summary: `pending ${RUN}`, id: `${RUN}-g3`, customer: `Test Customer ${RUN}` });
      const rejected = await send({ kind: "CORRESPONDENCE_NOTE", text: "x", summary: `rejected ${RUN}`, id: `${RUN}-g4`, customer: `Test Customer ${RUN}` });
      await rejectSuggestion(rejected.row!.id);

      const list = await listCustomerCorrespondence(customerId);
      expect(list.map((i) => i.summary)).toEqual([`general ${RUN}`]);
      expect(await listCustomerCorrespondence("no-such-customer")).toEqual([]);
    });

    it("lets the reviewer pick the customer, or none, and refuses a customer that doesn't exist", async () => {
      const a = await send({ kind: "ACTION_ITEM", text: "Revalue asks for the price list", who: "Solargik", summary: `picked ${RUN}`, id: `${RUN}-g5` });
      expect(a.row?.customerId).toBeNull();
      await expect(approveSuggestion(a.row!.id, { customerId: "no-such-customer" })).rejects.toThrow(/customer no longer exists/);
      expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: a.row!.id } })).status).toBe("PENDING");
      expect(await approveSuggestion(a.row!.id, { customerId })).toBe(`Saved on Test Customer ${RUN}'s page under Correspondence and actions.`);
      expect((await listCustomerCorrespondence(customerId)).map((i) => i.summary)).toContain(`picked ${RUN}`);

      const none = await send({ kind: "NOTE", text: "General", summary: `none ${RUN}`, id: `${RUN}-g6`, customer: `Test Customer ${RUN}` });
      expect(await approveSuggestion(none.row!.id, { customerId: null })).toBe("Noted. It has no project or customer, so no page shows it.");
      expect((await listCustomerCorrespondence(customerId)).map((i) => i.summary)).not.toContain(`none ${RUN}`);
    });

    it("picking a project overrides the customer: the item shows on the project page, not the customer's general list", async () => {
      const n = await send({ kind: "CORRESPONDENCE_NOTE", text: "Turns out this is about one project", summary: `moved ${RUN}`, id: `${RUN}-g7`, customer: `Test Customer ${RUN}` });
      await approveSuggestion(n.row!.id, { projectId, customerId: null });
      expect((await listCustomerCorrespondence(customerId)).map((i) => i.summary)).not.toContain(`moved ${RUN}`);
      expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: n.row!.id } })).customerId).toBe(customerId);
    });

    it("leaves the customer empty when the name matches none or several", async () => {
      const unknown = await send({ kind: "CORRESPONDENCE_NOTE", text: "x", summary: `unknown ${RUN}`, id: `${RUN}-g8`, customer: "Nobody Corp" });
      expect(unknown.row?.customerId).toBeNull();
    });
  });

  it("approving an action item or a correspondence note only marks it reviewed, with or without a project", async () => {
    const before = await prisma.phase.findMany({ where: { projectId }, select: { id: true, status: true, statusUpdate: true }, orderBy: { id: "asc" } });

    const action = await send({ kind: "ACTION_ITEM", text: "Revalue to send the signed layout", who: "Dan", by: "end of next week", id: `${RUN}-ai` });
    expect(action.row?.projectId).toBeNull(); // no project: it would be listed as Unmatched
    expect(await approveSuggestion(action.row!.id)).toBe("Noted. It has no project or customer, so no page shows it.");
    expect(await prisma.suggestion.findUniqueOrThrow({ where: { id: action.row!.id } })).toMatchObject({ status: "APPROVED", projectId: null });

    const note = await send({ kind: "CORRESPONDENCE_NOTE", text: "Customer confirmed the site access dates", id: `${RUN}-cn`, project: projectName });
    expect(await approveSuggestion(note.row!.id)).toBe("Saved on the project page under Correspondence and actions.");
    expect(await prisma.suggestion.findUniqueOrThrow({ where: { id: note.row!.id } })).toMatchObject({ status: "APPROVED", projectId });

    expect(await prisma.phase.findMany({ where: { projectId }, select: { id: true, status: true, statusUpdate: true }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("approving a signed contract sets the contract link (and the signing date when empty), never replaces a link, and needs a file link", async () => {
    const link = (name: string) => `https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/${encodeURIComponent(projectName)}/Contracts%20%2B%20Legal/${encodeURIComponent(name)}`;
    expect(await createSuggestions([{ kind: "CONTRACT_DOCUMENT", description: "No file", summary: "s", id: `${RUN}-k0` }])).toMatchObject({ created: 0 });

    const first = await send({ kind: "CONTRACT_DOCUMENT", description: "Signed Framework Supply Agreement", fileLink: link("Agreement.pdf"), signedDate: "2025-06-30", id: `${RUN}-k1`, project: projectName });
    expect(first.row).toMatchObject({ status: "PENDING", kind: "CONTRACT_DOCUMENT" });
    expect(await prisma.projectProfile.findUnique({ where: { projectId } })).toBeNull(); // nothing yet

    expect(await approveSuggestion(first.row!.id)).toBe("Contract link saved on the project profile and the signing date set.");
    const profile = await prisma.projectProfile.findUniqueOrThrow({ where: { projectId } });
    expect(profile.contractLink).toBe(link("Agreement.pdf"));
    expect(profile.contractSigningDate?.toISOString().slice(0, 10)).toBe("2025-06-30");

    // an amendment can't replace the main contract link, and the pending proposal stays pending with the reason
    const second = await send({ kind: "CONTRACT_DOCUMENT", description: "Amendment 1", fileLink: link("Amendment 1.pdf"), signedDate: "2026-01-15", id: `${RUN}-k2`, project: projectName });
    await expect(approveSuggestion(second.row!.id)).rejects.toThrow(/already has a contract link/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: second.row!.id } })).status).toBe("PENDING");
    expect(await prisma.projectProfile.findUniqueOrThrow({ where: { projectId } })).toMatchObject({ contractLink: link("Agreement.pdf") });

    // once the link is cleared by a person, a later contract can be approved, but an existing signing date is kept
    await prisma.projectProfile.update({ where: { projectId }, data: { contractLink: null } });
    expect(await approveSuggestion(second.row!.id)).toBe("Contract link saved on the project profile.");
    const after = await prisma.projectProfile.findUniqueOrThrow({ where: { projectId } });
    expect(after.contractLink).toBe(link("Amendment 1.pdf"));
    expect(after.contractSigningDate?.toISOString().slice(0, 10)).toBe("2025-06-30");
  });

  it("a proof of payment is linked through the milestone and change-order updates, and a note can carry a file link", async () => {
    const slip = "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/x/Contracts%20%2B%20Legal/Invoices/Proof%20of%20payment.pdf";
    const m = await send({ kind: "MILESTONE_UPDATE", milestone: "Milestone 1", status: "PAYMENT_RECEIVED", paidDate: "2026-10-09", payslipLink: slip, id: `${RUN}-pp1`, project: projectName });
    await approveSuggestion(m.row!.id);
    expect(await prisma.milestone.findFirstOrThrow({ where: { projectId } })).toMatchObject({ status: "PAYMENT_RECEIVED", payslipLink: slip });

    const co = await prisma.changeOrder.create({ data: { projectId, reason: `Change Order 07 ${RUN}`, status: "SENT", amount: 100, invoicedDate: new Date("2026-10-01"), invoiceStatus: "SENT", paymentTermsDays: 10 } });
    const u = await send({ kind: "CHANGE_ORDER_UPDATE", changeOrder: "Change Order 07", invoiceStatus: "PAID", payslipLink: slip, id: `${RUN}-pp2`, project: projectName });
    await approveSuggestion(u.row!.id);
    expect(await prisma.changeOrder.findUniqueOrThrow({ where: { id: co.id } })).toMatchObject({ invoiceStatus: "PAID", status: "COMPLETE", payslipLink: slip });

    const n = await send({ kind: "CORRESPONDENCE_NOTE", text: "Amendment 2 signed by both sides", fileLink: slip, id: `${RUN}-nf`, project: projectName });
    expect((n.row!.payload as { fileLink?: string }).fileLink).toBe(slip);
    await approveSuggestion(n.row!.id);
  });
});
