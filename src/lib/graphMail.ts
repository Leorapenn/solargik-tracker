// Sending one email through Microsoft Graph with an Entra app (client credentials, "Mail.Send" application
// permission), from one sender mailbox. No library: two fetch calls. `fetchImpl` is injectable for tests.

export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string; sender: string };

export type MailAttachment = { name: string; contentType: string; content: string }; // content = plain text, sent as base64

export type Mail = { to: string[]; subject: string; html: string; attachments?: MailAttachment[] };

// All five values must be set; otherwise the weekly email stays off.
export function graphConfigFromEnv(env: Record<string, string | undefined> = process.env): GraphConfig | null {
  const tenantId = env.GRAPH_TENANT_ID?.trim();
  const clientId = env.GRAPH_CLIENT_ID?.trim();
  const clientSecret = env.GRAPH_CLIENT_SECRET?.trim();
  const sender = env.MAIL_SENDER?.trim();
  return tenantId && clientId && clientSecret && sender ? { tenantId, clientId, clientSecret, sender } : null;
}

// Who gets the weekly email (set in Vercel, not in the code).
export function recipientsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return (env.WEEKLY_UPDATES_TO ?? "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

export class MailError extends Error {}

export async function sendMail(config: GraphConfig, mail: Mail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const tokenResponse = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!tokenResponse.ok) throw new MailError(`Microsoft sign-in failed (${tokenResponse.status}).`);
  const { access_token: token } = (await tokenResponse.json()) as { access_token?: string };
  if (!token) throw new MailError("Microsoft sign-in returned no token.");

  const response = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: { contentType: "HTML", content: mail.html },
        toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
        attachments: (mail.attachments ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.name,
          contentType: a.contentType,
          contentBytes: Buffer.from(a.content, "utf8").toString("base64"),
        })),
      },
      saveToSentItems: false,
    }),
  });
  if (!response.ok) throw new MailError(`Microsoft refused to send the email (${response.status}).`);
}
