"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/server/actions/auth";
import { NAVY, NAVY_HOVER, ORANGE } from "@/lib/theme";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/import", label: "Import Review" },
];

export function NavBar() {
  const pathname = usePathname();
  const onLogin = pathname === "/login";

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        padding: "0.75rem 2rem",
        backgroundColor: NAVY,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
        <span style={{ fontSize: "1.15rem", fontWeight: 700, whiteSpace: "nowrap" }}>
          <span style={{ color: ORANGE }}>Solar</span>
          <span style={{ color: "#fff" }}>gik</span>
        </span>
        {!onLogin && (
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: 6,
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#fff",
                    backgroundColor: active ? NAVY_HOVER : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {!onLogin && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <form action={logout}>
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 6,
                color: "#fff",
                padding: "0.3rem 0.7rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: ORANGE,
              color: NAVY,
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
            title="Leora Penn"
          >
            LP
          </span>
        </div>
      )}
    </nav>
  );
}
