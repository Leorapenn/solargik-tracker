"use client";

import { useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { UPLOAD_ACCEPT, UPLOAD_RULES_TEXT, checkUpload, isOwnFileLink, ownFileLink, uploadPathnameFor, type UploadMode } from "@/lib/uploads";
import { NAVY, TEXT_MUTED, inputStyle, secondaryButton } from "@/lib/theme";

// A file-link box with an Upload button beside it. Pasting a link still works. Choosing a file sends it straight to
// the private store and puts OUR link to it in the box; like any other edit it is saved with the form's own Save.
// Until the store is connected (`uploadMode` null) the button is disabled and says why.
export function FileLinkField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  uploadMode,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder: string;
  uploadMode: UploadMode;
}) {
  const uploadsEnabled = uploadMode !== null;
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function send(file: File) {
    const check = checkUpload(file);
    if (!check.ok) return setNote({ kind: "error", text: check.error });
    setBusy(true);
    setNote(null);
    try {
      // a random suffix in the name, so two files with the same name never collide
      const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
      const options = { access: "private" as const, handleUploadUrl: "/api/files/upload", contentType: check.contentType, multipart: file.size > 4 * 1024 * 1024 };
      const pathname = uploadPathnameFor(file.name, suffix);
      const stored = uploadMode === "oidc" ? await uploadPresigned(pathname, file, options) : await upload(pathname, file, options);
      const link = ownFileLink(stored.pathname);
      if (!link) throw new Error("unexpected name");
      onChange(link);
      setNote({ kind: "ok", text: "Uploaded. Press Save to keep it." });
    } catch {
      setNote({ kind: "error", text: "The upload didn't work. Check the file (" + UPLOAD_RULES_TEXT + ") and try again." });
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <input
          ref={picker}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          aria-label={`${ariaLabel}: choose a file to upload`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <button
          type="button"
          style={{ ...secondaryButton, whiteSpace: "nowrap", opacity: uploadsEnabled ? 1 : 0.55, cursor: uploadsEnabled && !busy ? "pointer" : "default" }}
          disabled={!uploadsEnabled || busy}
          title={uploadsEnabled ? `${UPLOAD_RULES_TEXT}` : "File uploads are not set up yet"}
          onClick={() => picker.current?.click()}
        >
          {busy ? "Uploading…" : "Upload file"}
        </button>
      </div>
      {note ? (
        <span role={note.kind === "error" ? "alert" : "status"} style={{ fontSize: 12.5, color: note.kind === "error" ? "#8C1D18" : "#047857" }}>
          {note.text}
        </span>
      ) : isOwnFileLink(value) ? (
        <span style={{ fontSize: 12.5, color: TEXT_MUTED }}>
          An uploaded file.{" "}
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
            Open
          </a>
        </span>
      ) : null}
    </div>
  );
}
