import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/public/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session) redirect("/admin");
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/admin";

  return (
    <main id="main" className="grid min-h-[100svh] grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-obsidian lg:block">
        <Image src="/media/demo/villa-dusk.jpg" alt="HAVEN house at dusk" fill priority className="object-cover opacity-80" sizes="55vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-obsidian/10 to-obsidian/30" />
        <div className="absolute inset-x-0 top-0 p-10">
          <Link href="/" className="display text-2xl text-porcelain">
            HAVEN<span className="align-super text-[0.6rem]">®</span>
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="label-micro text-porcelain/40">Private condominium · Algarve</p>
          <p className="display mt-3 max-w-md text-4xl leading-[1.05] text-porcelain">
            Thirteen houses, one quiet landscape, and a single source of truth.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-porcelain/60">
            This is the operational platform behind the HAVEN® presentation: property inventory, commercial workflow, leads,
            viewings and the condominium masterplan.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="display text-2xl lg:hidden">
            HAVEN<span className="align-super text-[0.6rem]">®</span>
          </Link>
          <p className="label-micro mt-6 text-ink-400 lg:mt-0">Administration</p>
          <h1 className="display mt-3 text-[2.6rem] leading-none">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Protected access for the sales and operations team. Roles: administrator, manager, read-only.
          </p>
          <div className="mt-8">
            <LoginForm
              next={next}
              demoEmail={process.env.HAVEN_SEED_ADMIN_EMAIL || "admin@haven.pt"}
              demoPassword={process.env.HAVEN_SEED_ADMIN_PASSWORD || "Haven!2026"}
            />
          </div>
          <div className="mt-8 flex items-center justify-between text-[0.7rem] text-ink-400">
            <Link href="/" className="underline underline-offset-4 hover:text-obsidian">
              ← Back to the condominium
            </Link>
            <span>Authorised access only</span>
          </div>
        </div>
      </section>
    </main>
  );
}
