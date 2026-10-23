import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { PropertyForm } from "@/components/admin/PropertyForm";

export const metadata = { title: "New property" };

export default async function NewPropertyPage() {
  const session = await getSession();
  const allowed = session ? can(session.user.role, "property:create") : false;

  return (
    <>
      <Link href="/admin/properties" className="mb-5 inline-flex items-center gap-1.5 text-[0.7rem] text-ink-500 hover:text-obsidian">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All properties
      </Link>
      <PageHeader
        eyebrow="Portfolio"
        title="New property"
        description="Created as a draft and hidden from the public site until you publish it. Bedrooms follow the typology; the 3D scene uses the typology's model automatically."
      />
      {!allowed ? (
        <AdminCard title="Permission required">
          <p className="text-[0.8rem] text-ink-500">Your role cannot create properties. Ask an administrator for the manager role.</p>
        </AdminCard>
      ) : (
        <AdminCard>
          <PropertyForm />
        </AdminCard>
      )}
    </>
  );
}
