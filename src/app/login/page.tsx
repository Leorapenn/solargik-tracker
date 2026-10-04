import { LoginForm } from "@/components/LoginForm";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: "1.75rem",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: NAVY }}>Sign in</h1>
        <p style={{ color: TEXT_MUTED, margin: "0.25rem 0 1.25rem", fontSize: "0.9rem" }}>
          Enter the team password to view Solargik projects.
        </p>
        <LoginForm next={next ?? ""} />
      </div>
    </main>
  );
}
