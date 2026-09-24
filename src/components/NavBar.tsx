"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVY, NAVY_HOVER, ORANGE } from "@/lib/theme";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/import", label: "Import Review" },
];

export function NavBar() {
  const pathname = usePathname();

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
      </div>

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
    </nav>
  );
}
