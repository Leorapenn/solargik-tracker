"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  VIEWS_STORAGE_KEY,
  canonicalQuery,
  checkViewName,
  hrefForView,
  parseStore,
  removeView,
  scopeFor,
  upsertView,
  type SavedView,
} from "@/lib/savedViews";
import { NAVY, TEXT_MUTED, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const CHANGED = "solargik-views-changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGED, callback);
  };
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(VIEWS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// "My views" for a table page. A view is the page's current sort and filters under a name; it is saved
// in this browser only, so it is private to whoever uses it and never changes the main view for anyone.
export function SavedViews({ basePath, query }: { basePath: string; query: string }) {
  const router = useRouter();
  const scope = scopeFor(basePath);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const views: SavedView[] = useMemo(() => parseStore(raw)[scope] ?? [], [raw, scope]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const current = canonicalQuery(query);
  const active = views.find((v) => canonicalQuery(v.query) === current) ?? null;
  const value = current === "" ? "" : active ? active.name : "__unsaved";

  function persist(next: SavedView[]): boolean {
    try {
      const store = parseStore(readRaw());
      store[scope] = next;
      window.localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(store));
      window.dispatchEvent(new Event(CHANGED));
      return true;
    } catch {
      setMessage("This browser won't let the site save views (private window or blocked storage).");
      return false;
    }
  }

  function save() {
    setMessage(null);
    if (current === "") return setMessage("Set a sort or filter first, then save it.");
    const check = checkViewName(name, views);
    if (!check.ok) return setMessage(check.error);
    if (persist(upsertView(views, check.name, current))) {
      setSaving(false);
      setName("");
    }
  }

  const small = { ...secondaryButton, padding: "4px 10px", fontSize: 12.5 };

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="My views">
      <span style={{ fontWeight: 700, color: NAVY }} title="Saved in this browser only. Nobody else sees them.">
        My views
      </span>
      <select
        aria-label="Saved views"
        value={value}
        style={{ ...inputStyle, padding: "4px 8px", fontSize: 13 }}
        onChange={(event) => {
          const picked = event.target.value;
          if (picked === "__unsaved") return;
          const view = views.find((v) => v.name === picked);
          router.push(hrefForView(basePath, view ? view.query : ""));
        }}
      >
        <option value="">Main view</option>
        {value === "__unsaved" && <option value="__unsaved">Current (not saved)</option>}
        {views.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name}
          </option>
        ))}
      </select>

      {active && (
        <button
          type="button"
          style={small}
          onClick={() => {
            if (window.confirm(`Delete your saved view "${active.name}"? The pages themselves are not changed.`)) persist(removeView(views, active.name));
          }}
        >
          Delete view
        </button>
      )}

      {saving ? (
        <form
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <input
            aria-label="Name for this view"
            placeholder="e.g. Finance only"
            value={name}
            autoFocus
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            style={{ ...inputStyle, padding: "4px 8px", fontSize: 13, width: 170 }}
          />
          <button type="submit" style={{ ...primaryButton, padding: "4px 12px", fontSize: 12.5 }}>
            Save
          </button>
          <button
            type="button"
            style={small}
            onClick={() => {
              setSaving(false);
              setMessage(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          style={small}
          disabled={current === ""}
          title={current === "" ? "Change the sort or filters first, then save them as a view" : "Save the current sort and filters under a name"}
          onClick={() => {
            setMessage(null);
            setSaving(true);
          }}
        >
          Save current view
        </button>
      )}
      {message && (
        <span role="alert" style={{ color: "#8C1D18", fontSize: 12.5 }}>
          {message}
        </span>
      )}
      {!saving && value === "" && views.length === 0 && <span style={{ color: TEXT_MUTED, fontSize: 12.5 }}>Saved in this browser only</span>}
    </div>
  );
}
