"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/server/actions/auth";
import { NAVY, ORANGE } from "@/lib/theme";

const LINKS = [
  { href: "/customers", label: "Customers" },
  { href: "/projects", label: "Projects" },
  { href: "/phases", label: "Phases" },
  { href: "/payments", label: "Payments" },
  { href: "/people", label: "People" },
];

export function NavBar() {
  const pathname = usePathname();
  const onLogin = pathname === "/login";

  return (
    <nav
      style={{
        minHeight: 72,
        flexShrink: 0,
        backgroundColor: NAVY,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 40px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>
          <span style={{ color: ORANGE }}>Solar</span>
          <span style={{ color: "#FFFFFF" }}>gik</span>
          <span style={{ color: "#9FB0D0", fontWeight: 600 }}> 360</span>
        </div>
        {!onLogin && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  style={{
                    color: active ? "#FFFFFF" : "#C9D2E6",
                    fontSize: 15,
                    fontWeight: 600,
                    padding: "12px 16px",
                    lineHeight: "20px",
                    borderRadius: 6,
                    background: active ? "rgba(255,255,255,0.14)" : "transparent",
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <form action="/search" method="get" role="search">
            <label
              htmlFor="q"
              style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
            >
              Search customers and projects
            </label>
            <input
              id="q"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Search customers, projects"
              style={{
                width: 260,
                height: 44,
                boxSizing: "border-box",
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid #3D558C",
                background: "#1D3872",
                color: "#FFFFFF",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
          </form>
          <form action={logout}>
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 6,
                color: "#fff",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
          <div
            title="Leora Penn"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: ORANGE,
              color: NAVY,
              fontSize: 15,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            LP
          </div>
        </div>
      )}
    </nav>
  );
}
