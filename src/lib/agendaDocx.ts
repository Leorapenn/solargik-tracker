import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { formatDate, parseDateInput } from "@/lib/dates";
import { groupByStage, type EmailEntry } from "@/lib/agenda";
import type { DateRange } from "@/lib/weeklyUpdates";
import type { ProjectUpdates } from "@/server/services/weeklyUpdates";
import { STATUS_LABELS } from "@/lib/statusColors";

// The downloadable Sunday meeting agenda (a Word file): the period's updates by stage, then by project, each with a line for notes.

const NAVY = "142A5C";
const ORANGE = "E8801A";
const GREY = "5A6172";
const FONT = "Calibri";

const fmt = (iso: string) => formatDate(parseDateInput(iso));
const run = (text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean; underline?: Record<string, never> } = {}) => new TextRun({ text, font: FONT, ...opts });

// An email update: the day and the email's subject (a link to the email), with the one-line summary under it.
const emailLine = (e: EmailEntry): Paragraph[] => {
  const title = e.subject ?? e.label;
  const subject = e.link ? new ExternalHyperlink({ link: e.link, children: [run(title, { bold: true, size: 21, color: "1D4F9F", underline: {} })] }) : run(title, { bold: true, size: 21 });
  return [
    new Paragraph({ bullet: { level: 0 }, spacing: { after: 10 }, keepNext: true, children: [run(`${fmt(e.date)}  `, { color: GREY, size: 19 }), subject] }),
    new Paragraph({ indent: { left: 720 }, spacing: { after: 70 }, children: [run(e.summary, { size: 21 })] }),
  ];
};

const typedLine = (e: ProjectUpdates["entries"][number]): Paragraph =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 50 },
    children: [
      run(`${fmt(e.date)}  `, { color: GREY, size: 19 }),
      run(`${e.item ?? "Whole phase"} (${e.phase}, ${STATUS_LABELS[e.status]}): `, { bold: true, size: 21 }),
      run(e.text.replace(/\s+/g, " ").trim(), { size: 21 }),
    ],
  });

const notesLine = () =>
  new Paragraph({ spacing: { before: 60, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9CFDC", space: 8 } }, children: [run("Notes:", { color: GREY, size: 19, italics: true })] });

export async function buildAgendaDocx(args: { range: DateRange; projects: ProjectUpdates[]; general: { customer: string; emails: EmailEntry[] }[]; pendingCount: number }): Promise<Buffer> {
  const { range, projects, general, pendingCount } = args;
  const total = projects.reduce((n, p) => n + p.entries.length + p.emails.length, 0) + general.reduce((n, g) => n + g.emails.length, 0);
  const kids: Paragraph[] = [
    new Paragraph({ spacing: { after: 40 }, children: [run("Solargik project meeting", { bold: true, size: 44, color: NAVY })] }),
    new Paragraph({ spacing: { after: 40 }, children: [run(`Updates from ${fmt(range.from)} to ${fmt(range.to)}`, { size: 26, color: ORANGE, bold: true })] }),
    new Paragraph({
      spacing: { after: 200 },
      children: [run(`${projects.length} project${projects.length === 1 ? "" : "s"} · ${total} update${total === 1 ? "" : "s"}, from emails read by the agent and approved in the tracker, and updates typed on the projects. Grouped by stage.`, { color: GREY, size: 20 })],
    }),
  ];

  if (projects.length === 0 && general.length === 0) {
    kids.push(new Paragraph({ children: [run("No updates are dated in this period.", { size: 22 })] }));
  }

  for (const group of groupByStage(projects)) {
    kids.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ORANGE, space: 3 } },
        children: [run(group.stage, { bold: true, size: 30, color: NAVY }), run(`   ${group.projects.length} project${group.projects.length === 1 ? "" : "s"}`, { size: 20, color: GREY })],
      }),
    );
    for (const p of group.projects) {
      kids.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 40 },
          keepNext: true,
          children: [run(p.name, { bold: true, size: 25, color: NAVY }), run(`   ${p.customer}`, { size: 20, color: GREY })],
        }),
        new Paragraph({ spacing: { after: 70 }, keepNext: true, children: [run(`Where it stands: ${p.summary.text}`, { size: 18, color: GREY, italics: true })] }),
        ...p.emails.flatMap(emailLine),
        ...p.entries.map(typedLine),
        notesLine(),
      );
    }
  }

  if (general.length > 0) {
    kids.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ORANGE, space: 3 } },
        children: [run("Customer-level items (not about one project)", { bold: true, size: 30, color: NAVY })],
      }),
    );
    for (const g of general) {
      kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 }, keepNext: true, children: [run(g.customer, { bold: true, size: 25, color: NAVY })] }), ...g.emails.flatMap(emailLine), notesLine());
    }
  }

  if (pendingCount > 0) {
    kids.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 280 },
        children: [run(`${pendingCount} proposal${pendingCount === 1 ? " is" : "s are"} still waiting for review in the tracker's Inbox and ${pendingCount === 1 ? "is" : "are"} not in this agenda yet.`, { size: 18, color: GREY, italics: true })],
      }),
    );
  }

  const doc = new Document({
    creator: "Solargik 360",
    title: `Solargik project meeting, updates ${range.from} to ${range.to}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }],
  });
  return Packer.toBuffer(doc);
}
