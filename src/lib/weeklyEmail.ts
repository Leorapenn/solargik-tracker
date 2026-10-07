import { formatDate, parseDateInput } from "@/lib/dates";
import { STATUS_LABELS } from "@/lib/statusColors";
import { toCsv, type DateRange, type ExportRow } from "@/lib/weeklyUpdates";
import type { ProjectUpdates } from "@/server/services/weeklyUpdates";

const fmt = (iso: string) => formatDate(parseDateInput(iso));

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The text with line breaks kept, escaped for HTML.
const multiline = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

// The weekly email: a subject, an HTML body grouped by project, and the same data as a CSV attachment.
export function buildWeeklyEmail(range: DateRange, projects: ProjectUpdates[], rows: ExportRow[], baseUrl: string) {
  const total = projects.reduce((sum, p) => sum + p.entries.length, 0);
  const period = `${fmt(range.from)} – ${fmt(range.to)}`;
  const link = `${baseUrl.replace(/\/$/, "")}/updates?from=${range.from}&to=${range.to}`;

  const body =
    projects.length === 0
      ? `<p>No phase or sub-phase updates are dated in this period.</p>`
      : projects
          .map((p) => {
            const items = p.entries
              .map(
                (e) =>
                  `<tr>` +
                  `<td style="padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap"><strong>${escapeHtml(e.item ?? "Whole phase")}</strong><br><span style="color:#5A6172;font-size:12px">${escapeHtml(e.phase)}${e.owner ? ` · ${escapeHtml(e.owner)}` : ""} · ${escapeHtml(STATUS_LABELS[e.status])}</span></td>` +
                  `<td style="padding:6px 12px 6px 0;vertical-align:top">${multiline(e.text)}</td>` +
                  `<td style="padding:6px 0;vertical-align:top;white-space:nowrap;color:#5A6172">${escapeHtml(fmt(e.date))}</td>` +
                  `</tr>`,
              )
              .join("");
            return (
              `<h3 style="margin:22px 0 2px;color:#142A5C">${escapeHtml(p.name)} <span style="font-weight:400;color:#5A6172;font-size:14px">${escapeHtml(p.customer)}</span></h3>` +
              `<div style="color:#5A6172;font-size:13px;margin-bottom:6px">Summary: ${multiline(p.summary.text)}</div>` +
              `<table style="border-collapse:collapse;font-size:14px">${items}</table>`
            );
          })
          .join("");

  const html =
    `<div style="font-family:Segoe UI,Arial,sans-serif;color:#333;max-width:820px">` +
    `<h2 style="color:#142A5C;margin:0 0 4px">Weekly project updates</h2>` +
    `<div style="color:#5A6172">${escapeHtml(period)} · ${projects.length} project${projects.length === 1 ? "" : "s"} · ${total} update${total === 1 ? "" : "s"}</div>` +
    body +
    `<p style="margin-top:26px"><a href="${escapeHtml(link)}">Open this period in the tracker</a></p>` +
    `</div>`;

  return {
    subject: `Solargik weekly updates, ${period} (${total} update${total === 1 ? "" : "s"})`,
    html,
    attachment: { name: `solargik-updates-${range.from}-to-${range.to}.csv`, contentType: "text/csv", content: toCsv(rows) },
  };
}
