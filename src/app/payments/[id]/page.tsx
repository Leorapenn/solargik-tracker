import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { getPaymentData } from "@/server/services/payments";
import { PaymentsEditor } from "@/components/PaymentsEditor";
import { NAVY, TEXT_MUTED, pageStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ProjectPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAuth();
  const { id } = await params;
  const [project, data] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true, customer: { select: { name: true } } } }),
    getPaymentData(id),
  ]);
  if (!project || !data) notFound();

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/payments" style={{ color: NAVY, fontWeight: 600 }}>
          Payments
        </Link>{" "}
        › {project.name}
      </div>
      <div style={{ marginTop: -8 }}>
        <h1 style={pageTitleStyle}>{project.name}</h1>
        <div style={{ color: TEXT_MUTED, marginTop: 4 }}>{project.customer.name}</div>
      </div>
      <PaymentsEditor projectId={id} projectName={project.name} initial={data} todayIso={toDateInputValue(todayInAppTz())} />
    </main>
  );
}
