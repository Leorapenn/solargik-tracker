"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { extractContract, saveProjectProfile } from "@/server/actions/projectProfile";
import { CONTRACT_FIELD_LABELS, type ContractFields } from "@/lib/contractExtraction";
import { formatDate, parseDateInput } from "@/lib/dates";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import {
  BOM_STATUS,
  DESIGN_INFO,
  GENIO_CIVILE,
  GEOTECH,
  LINKED_ITEMS,
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  SOIL_TESTS,
  choiceFor,
  type ChoiceField,
  type LinkedKey,
  type LinkedValue,
  type ProfileInput,
} from "@/lib/projectProfile";
import { ChoicePill, ColorSelect } from "@/components/ColorSelect";
import { DateField } from "@/components/DateField";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const fmt = (iso: string) => (iso ? formatDate(parseDateInput(iso)) : "");
const NOTE = { fontSize: 12, color: TEXT_MUTED } as const;

// The project profile: details people fill in by hand, some of them read from the contract, and values
// that are shown straight from the project's own items (kickoffs, layout approval, BOM release...).
export function ProjectProfileCard({
  projectId,
  initial,
  linked,
  people,
  contractReading,
}: {
  projectId: string;
  initial: ProfileInput;
  linked: Record<LinkedKey, LinkedValue>;
  people: { id: string; name: string }[];
  contractReading: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [filled, setFilled] = useState<Set<keyof ProfileInput>>(new Set());
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [reading, startReading] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // after a save the page re-renders with fresh data; keep what was just saved in the meantime
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSaved(initial);
    if (!editing) setForm(initial);
  }

  const set = <K extends keyof ProfileInput>(key: K, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const view = editing ? form : saved;

  function startEditing() {
    setForm(saved);
    setFilled(new Set());
    setMessage(null);
    setEditing(true);
  }
  function cancel() {
    setForm(saved);
    setFilled(new Set());
    setMessage(null);
    setEditing(false);
  }
  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveProjectProfile(projectId, form);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setSaved(form);
      setEditing(false);
      setFilled(new Set());
      setMessage({ kind: "ok", text: "Profile saved." });
    });
  }

  function readContract(file: File) {
    setMessage(null);
    const data = new FormData();
    data.set("contract", file);
    startReading(async () => {
      const result = await extractContract(data);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      const next = { ...form };
      const added: string[] = [];
      const kept: string[] = [];
      const touched = new Set(filled);
      for (const key of Object.keys(CONTRACT_FIELD_LABELS) as (keyof ContractFields)[]) {
        const found = result.fields[key];
        if (!found) continue;
        if (next[key]) kept.push(CONTRACT_FIELD_LABELS[key]);
        else {
          next[key] = found;
          touched.add(key);
          added.push(CONTRACT_FIELD_LABELS[key]);
        }
      }
      setForm(next);
      setFilled(touched);
      setMessage({
        kind: "ok",
        text:
          (added.length ? `Filled in from the contract: ${added.join(", ")}. Review them, then press Save.` : "The contract didn't state anything for the empty fields.") +
          (kept.length ? ` Kept what you had for: ${kept.join(", ")}.` : ""),
      });
    });
  }

  const mark = (key: keyof ProfileInput) => (filled.has(key) ? { background: "#F1F8FF", outline: "2px solid #BBD4F7", outlineOffset: 2, borderRadius: 6 } : {});

  const field = (label: string, children: ReactNode, opts: { wide?: boolean; note?: string } = {}) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: opts.wide ? "1 / -1" : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT_MUTED }}>{label}</div>
      <div style={{ fontSize: 14.5, minWidth: 0 }}>{children}</div>
      {opts.note && <div style={NOTE}>{opts.note}</div>}
    </div>
  );

  const text = (key: keyof ProfileInput, label: string, opts: { long?: boolean; fromContract?: boolean } = {}) =>
    field(
      label,
      editing ? (
        opts.long ? (
          <textarea
            aria-label={label}
            value={form[key]}
            maxLength={LONG_TEXT_MAX}
            rows={3}
            onChange={(e) => set(key, e.target.value)}
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", ...mark(key) }}
          />
        ) : (
          <input aria-label={label} value={form[key]} maxLength={SHORT_TEXT_MAX} onChange={(e) => set(key, e.target.value)} style={{ ...inputStyle, width: "100%", ...mark(key) }} />
        )
      ) : view[key] ? (
        <span style={{ whiteSpace: "pre-wrap" }}>{view[key]}</span>
      ) : (
        <span style={{ color: TEXT_MUTED }}>—</span>
      ),
      { wide: opts.long, note: editing && opts.fromContract ? "Can be read from the contract." : undefined },
    );

  const date = (key: keyof ProfileInput, label: string) =>
    field(
      label,
      editing ? (
        <DateField ariaLabel={label} value={form[key] || null} onCommit={(c) => set(key, c.date ?? "")} />
      ) : view[key] ? (
        fmt(view[key])
      ) : (
        <span style={{ color: TEXT_MUTED }}>—</span>
      ),
    );

  const choose = (key: ChoiceField, label: string, options: typeof SOIL_TESTS, opts: { fromContract?: boolean } = {}) =>
    field(
      label,
      editing ? (
        <span style={mark(key)}>
          <ColorSelect ariaLabel={label} value={form[key]} options={options} onChange={(v) => set(key, v)} />
        </span>
      ) : (
        <ChoicePill choice={choiceFor(key, view[key])} />
      ),
      { note: editing && opts.fromContract ? "Can be read from the contract." : undefined },
    );

  const linkedDate = (key: LinkedKey, label: string, fallback?: string) => {
    const l = linked[key];
    const shown = l.date ? fmt(l.date) : fallback ? fmt(fallback) : "";
    return field(
      label,
      shown ? shown : <span style={{ color: TEXT_MUTED }}>—</span>,
      {
        note: l.found
          ? `From the “${LINKED_ITEMS[key].name}” item${l.date ? "" : fallback ? " (not done yet; date from the contract)" : " (not done yet)"}.`
          : `No “${LINKED_ITEMS[key].name}” item on this project.`,
      },
    );
  };

  const engineerName = people.find((p) => p.id === view.projectEngineerId)?.name;
  const designPackage = linked.designPackage;

  const section = (title: string, children: ReactNode) => (
    <section style={{ padding: "18px 20px", borderTop: `1px solid ${ROW_DIVIDER}` }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, color: NAVY }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px 24px" }}>{children}</div>
    </section>
  );

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>Project profile</h2>
        <span style={{ ...NOTE, flex: 1 }}>Details for this project. Dates that come from the items below are shown here read-only.</span>
        {editing ? (
          <>
            <button type="button" style={primaryButton} disabled={pending || reading} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" style={secondaryButton} disabled={pending} onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" style={secondaryButton} onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {message && (
        <div
          role={message.kind === "error" ? "alert" : "status"}
          style={{ margin: "0 20px 12px", padding: "10px 14px", borderRadius: 8, fontSize: 14, background: message.kind === "ok" ? "#D8F5E3" : "#FCE9E7", color: message.kind === "ok" ? "#047857" : "#8C1D18" }}
        >
          {message.text}
        </div>
      )}

      {section(
        "Project details",
        <>
          {date("pileDrivingStart", "Customer ideal pile driving start")}
          {text("deliveryExpectations", "Delivery expectations", { long: true })}
          {text("supplyTerms", "Contractual supply terms", { long: true, fromContract: true })}
          {text("supplyObligations", "Contractual supply obligations", { long: true, fromContract: true })}
          {choose("soilTest", "SPT or GPT", SOIL_TESTS, { fromContract: true })}
          {text("intercoms", "Intercoms", { fromContract: true })}
          {text("soma", "SOMA", { fromContract: true })}
          {linkedDate("contractSigning", "Contract signing date", saved.contractSigningDate)}
          {editing &&
            field(
              "Contract signing date (from the contract)",
              <span style={mark("contractSigningDate")}>
                <DateField ariaLabel="Contract signing date from the contract" value={form.contractSigningDate || null} onCommit={(c) => set("contractSigningDate", c.date ?? "")} />
              </span>,
              { note: "Only shown until the Contract Signing item is marked Done." },
            )}
          {linkedDate("internalKickoff", "Internal kickoff")}
          {linkedDate("clientKickoff", "Client kickoff")}
          {date("ntpDate", "NTP date")}
          {text("projectType", "Type", { fromContract: true })}
          {field(
            "Contract file",
            editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input aria-label="Contract link" placeholder="Paste the SharePoint / OneDrive link to the contract" value={form.contractLink} onChange={(e) => set("contractLink", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,.pdf"
                    aria-label="Contract PDF to read"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) readContract(file);
                    }}
                  />
                  <button type="button" style={secondaryButton} disabled={!contractReading || reading || pending} onClick={() => fileInput.current?.click()}>
                    {reading ? "Reading the contract…" : "Fill from a contract PDF…"}
                  </button>
                  <span style={NOTE}>
                    {contractReading
                      ? "The PDF (max 4 MB) is sent to Claude to read once and is not stored. Check what it fills in, then press Save."
                      : "Not switched on yet: it needs an ANTHROPIC_API_KEY setting."}
                  </span>
                </div>
              </div>
            ) : view.contractLink ? (
              <a href={view.contractLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                Open the contract
              </a>
            ) : (
              <span style={{ color: TEXT_MUTED }}>—</span>
            ),
            { wide: true },
          )}
        </>,
      )}

      {section(
        "Design details",
        <>
          {field(
            "Project engineer",
            editing ? (
              <select aria-label="Project engineer" value={form.projectEngineerId} onChange={(e) => set("projectEngineerId", e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                <option value=""></option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : engineerName ? (
              engineerName
            ) : (
              <span style={{ color: TEXT_MUTED }}>—</span>
            ),
          )}
          {text("designNotes", "Design notes", { long: true })}
          {date("designQuestionnaireReceived", "Design questionnaire received")}
          {choose("designInfoStatus", "Design info", DESIGN_INFO)}
          {choose("geotechStatus", "POT / Geotech analysis", GEOTECH)}
          {date("initialLayoutSent", "Initial layout sent")}
          {linkedDate("initialLayoutApproval", "Initial layout approved")}
          {choose("genioCivileStatus", "Genio Civile status", GENIO_CIVILE)}
          {choose("bomStatus", "BOM status", BOM_STATUS)}
          {linkedDate("bomRelease", "BOM release date")}
          {field(
            "Design package status",
            designPackage.status ? (
              <span style={{ display: "inline-block", background: STATUS_PILL_STYLES[designPackage.status].bg, color: STATUS_PILL_STYLES[designPackage.status].text, borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
                {STATUS_LABELS[designPackage.status]}
              </span>
            ) : (
              <span style={{ color: TEXT_MUTED }}>—</span>
            ),
            { note: designPackage.found ? `From the “${LINKED_ITEMS.designPackage.name}” item.` : `No “${LINKED_ITEMS.designPackage.name}” item on this project.` },
          )}
        </>,
      )}
    </div>
  );
}
