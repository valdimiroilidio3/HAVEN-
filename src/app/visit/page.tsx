import type { Metadata } from "next";
import Image from "next/image";
import { getDb } from "@/lib/db";
import { getSettings, listPublicProperties } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { VisitForm } from "@/components/public/forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a visit",
  description: "Request a private visit to the HAVEN® condominium. Requests are confirmed personally by the team.",
};

export default async function VisitPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const params = await searchParams;
  const db = await getDb();
  const [properties, settings, session] = await Promise.all([listPublicProperties(db), getSettings(db), getSession()]);
  const bookable = properties.filter((p) => p.status === "available" || p.status === "reserved");
  const requested = params.property ? bookable.find((p) => p.code.toLowerCase() === params.property!.toLowerCase()) : null;

  return (
    <>
      <PublicHeader />
      <main id="main" className="bg-porcelain">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-14 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div>
            <p className="label-micro text-ink-400">Private visits</p>
            <h1 className="display mt-4 text-[2.8rem] leading-[0.98] sm:text-[3.6rem]">Come and see the landscape first.</h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-600">
              Visits begin at the gate and walk the loop road, so you can understand the position of each house before looking at
              interiors. Choose the residence that interests you; the team will confirm the final time personally.
            </p>
            <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-md border border-ink-900/10">
              <Image src="/media/demo/garden-suite.jpg" alt="Garden-facing living space at HAVEN" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="label-micro text-ink-400">Lead time</dt>
                <dd className="mt-1.5">{settings.visitLeadTimeHours} hours minimum</dd>
              </div>
              <div>
                <dt className="label-micro text-ink-400">Duration</dt>
                <dd className="mt-1.5">{settings.visitSlotMinutes} minutes</dd>
              </div>
              <div>
                <dt className="label-micro text-ink-400">Contact</dt>
                <dd className="mt-1.5">{settings.contactEmail}</dd>
              </div>
              <div>
                <dt className="label-micro text-ink-400">Location</dt>
                <dd className="mt-1.5">{settings.locationLabel}</dd>
              </div>
            </dl>
            <p className="mt-8 rounded-sm border border-ink-900/10 bg-white/50 p-4 text-[0.7rem] leading-relaxed text-ink-500">
              Demonstration project. Requests are stored in the HAVEN® platform and confirmed manually; no email or messaging
              provider is integrated, so no automated delivery is promised.
            </p>
          </div>

          <div className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-6 sm:p-8">
            <h2 className="font-display text-2xl">Request a viewing</h2>
            <p className="mt-1 text-[0.75rem] text-ink-500">{bookable.length} residences currently open for viewings.</p>
            <div className="mt-6">
              <VisitForm
                properties={bookable.map((p) => ({ id: p.id, code: p.code, title: p.title, typology: p.typology }))}
                defaultPropertyId={requested?.id}
                minDate={new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)}
                leadTimeHours={settings.visitLeadTimeHours}
              />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter settings={settings} isAdmin={Boolean(session)} />
    </>
  );
}
