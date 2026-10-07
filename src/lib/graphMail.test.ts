import { describe, expect, it } from "vitest";
import { MailError, graphConfigFromEnv, recipientsFromEnv, sendMail } from "./graphMail";
import { isAuthorizedCron, isSundayMorningSlot } from "./cron";
import { buildWeeklyEmail, escapeHtml } from "./weeklyEmail";
import type { ProjectUpdates } from "@/server/services/weeklyUpdates";

describe("graphConfigFromEnv / recipientsFromEnv", () => {
  const all = { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", MAIL_SENDER: "tracker@solargik.com" };
  it("needs all four Microsoft values", () => {
    expect(graphConfigFromEnv(all)).toEqual({ tenantId: "t", clientId: "c", clientSecret: "s", sender: "tracker@solargik.com" });
    expect(graphConfigFromEnv({ ...all, GRAPH_CLIENT_SECRET: " " })).toBeNull();
    expect(graphConfigFromEnv({})).toBeNull();
  });
  it("reads a list of valid recipients", () => {
    expect(recipientsFromEnv({ WEEKLY_UPDATES_TO: "a@x.com; b@y.org ,nope" })).toEqual(["a@x.com", "b@y.org"]);
    expect(recipientsFromEnv({})).toEqual([]);
  });
});

describe("sendMail", () => {
  const config = { tenantId: "tenant-1", clientId: "client", clientSecret: "secret", sender: "tracker@solargik.com" };
  const mail = { to: ["me@solargik.com"], subject: "Hi", html: "<p>x</p>", attachments: [{ name: "u.csv", contentType: "text/csv", content: "a,b" }] };

  it("gets a token, then sends the mail with the attachment as base64", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.includes("oauth2") ? Response.json({ access_token: "TOKEN" }) : new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    await sendMail(config, mail, fake);
    expect(calls[0].url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    expect(String(calls[0].init.body)).toContain("grant_type=client_credentials");
    expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/users/tracker%40solargik.com/sendMail");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    const sent = JSON.parse(String(calls[1].init.body));
    expect(sent.message.toRecipients).toEqual([{ emailAddress: { address: "me@solargik.com" } }]);
    expect(sent.message.attachments[0]).toMatchObject({ name: "u.csv", contentBytes: Buffer.from("a,b").toString("base64") });
    expect(sent.saveToSentItems).toBe(false);
  });

  it("reports sign-in and send failures without leaking the secret", async () => {
    const badLogin = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(sendMail(config, mail, badLogin)).rejects.toBeInstanceOf(MailError);
    const badSend = (async (url: string) => (url.includes("oauth2") ? Response.json({ access_token: "T" }) : new Response("no", { status: 403 }))) as unknown as typeof fetch;
    const error = await sendMail(config, mail, badSend).catch((e: Error) => e);
    expect(error).toBeInstanceOf(MailError);
    expect((error as Error).message).not.toContain("secret");
  });
});

describe("cron guards", () => {
  const secret = "a-long-random-secret-123";
  it("accepts only the exact bearer secret, and fails closed without one", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron("Bearer wrong-secret-of-same-len", secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false); // too-short secrets are refused
  });
  it("is the Sunday 07:xx slot in Israel, in summer and winter time", () => {
    expect(isSundayMorningSlot(new Date("2026-10-18T04:10:00Z"))).toBe(true); // IDT = UTC+3 -> 07:10
    expect(isSundayMorningSlot(new Date("2026-10-18T05:10:00Z"))).toBe(false); // 08:10
    expect(isSundayMorningSlot(new Date("2026-11-01T05:10:00Z"))).toBe(true); // IST = UTC+2 -> 07:10
    expect(isSundayMorningSlot(new Date("2026-11-01T04:10:00Z"))).toBe(false); // 06:10
    expect(isSundayMorningSlot(new Date("2026-10-19T04:10:00Z"))).toBe(false); // a Monday
  });
});

describe("buildWeeklyEmail", () => {
  const projects: ProjectUpdates[] = [
    {
      id: "p1",
      name: "257-Barge 2",
      customer: "Revalue <b>",
      lifecycle: "ACTIVE",
      summary: { text: "In progress: Design (1 of 5 items done).", manual: false },
      entries: [{ level: "Item", phase: "01 Design", item: "Layout", status: "IN_PROGRESS", owner: "Dan", text: "Sent <script>x</script>\nwaiting", date: "2026-10-01" }],
    },
  ];
  const range = { from: "2026-09-27", to: "2026-10-03" };

  it("builds the subject, an escaped body and a CSV attachment", () => {
    const mail = buildWeeklyEmail(range, projects, [], "https://example.com/");
    expect(mail.subject).toBe("Solargik weekly updates, 27 Sep 2026 – 03 Oct 2026 (1 update)");
    expect(mail.html).toContain("257-Barge 2");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Revalue &lt;b&gt;");
    expect(mail.html).toContain("https://example.com/updates?from=2026-09-27&amp;to=2026-10-03".replace("&amp;", "&amp;"));
    expect(mail.attachment.name).toBe("solargik-updates-2026-09-27-to-2026-10-03.csv");
  });
  it("says so when there are no updates", () => {
    const mail = buildWeeklyEmail(range, [], [], "https://example.com");
    expect(mail.html).toContain("No phase or sub-phase updates");
    expect(mail.subject).toContain("(0 updates)");
  });
  it("escapes html", () => {
    expect(escapeHtml(`<a href="x">'&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;");
  });
});
