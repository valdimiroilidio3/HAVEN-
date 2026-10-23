import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/db/repositories";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s — HAVEN Admin" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");

  let condominiumName = "Condomínio HAVEN";
  try {
    const db = await getDb();
    const settings = await getSettings(db);
    condominiumName = settings.condominiumName;
  } catch {
    // Settings are non-critical chrome; never block the admin on them.
  }

  return (
    <AdminShell user={session.user} condominiumName={condominiumName}>
      {children}
    </AdminShell>
  );
}
