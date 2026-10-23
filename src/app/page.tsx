import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Boxes, Compass, Layers, MapPin } from "lucide-react";
import { getDb } from "@/lib/db";
import { getPublishedScene, getSettings } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { CondominiumExperience } from "@/components/viewer/CondominiumExperience";
import { FloorPlan2D, PlanLegend } from "@/components/plan/FloorPlan2D";
import { LeadForm } from "@/components/public/forms";
import { SiteFooter } from "@/components/public/SiteFooter";
import { TYPOLOGIES, TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { formatArea, formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HAVEN® — Thirteen houses, one quiet landscape",
  description:
    "A private condominium of thirteen houses in the Algarve. Explore the masterplan in 3D, compare T1–T4 residences and request a private visit.",
};

export default async function HomePage() {
  const db = await getDb();
  const [entries, settings, session] = await Promise.all([getPublishedScene(db), getSettings(db), getSession()]);
  const properties = entries.map((entry) => entry.property);
  const propertyOptions = properties.map((p) => ({ id: p.id, code: p.code, title: p.title, typology: p.typology }));
  const typologyCounts = TYPOLOGIES.map((typology) => ({
    typology,
    count: properties.filter((p) => p.typology === typology).length,
  }));

  return (
    <main id="main">
      <CondominiumExperience
        entries={entries.map((entry) => ({ property: entry.property, position: entry.position, media: entry.media }))}
        settings={settings}
        isAdmin={Boolean(session)}
      />

      {/* Editorial intro */}
      <section id="condominium" className="border-t border-ink-900/10 bg-porcelain">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <p className="label-micro text-ink-400">The condominium</p>
            <h2 className="display mt-5 max-w-xl text-balance text-[2.6rem] leading-[0.98] sm:text-[3.6rem]">
              Thirteen houses arranged around a quiet garden, not a corridor.
            </h2>
            <p className="mt-6 max-w-xl text-[0.95rem] leading-relaxed text-ink-600">
              HAVEN® is a private residential condominium of exactly thirteen houses, drawn around a loop road, a central garden
              and a continuous canopy of cork oak and olive. Four typologies — T1 to T4 — share the same architectural language:
              stone bases, timber screens, deep overhangs and rooms that open directly to the garden.
            </p>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-600">
              Explore the masterplan above in three dimensions. Select a house to see its position, floor plan and — in this
              prototype — a generated interior. Every figure shown is demonstration data awaiting architectural validation.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-900/10 bg-ink-900/10 sm:grid-cols-4">
              {typologyCounts.map(({ typology, count }) => (
                <div key={typology} className="bg-[#fbfbf8] p-5">
                  <p className="font-display text-4xl leading-none tracking-tightest">{count}</p>
                  <p className="mt-2 label-micro text-ink-400">{typology} houses</p>
                  <p className="mt-1 text-[0.7rem] text-ink-500">{TYPOLOGY_CATALOGUE[typology].short}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-md border border-ink-900/10 bg-[#eee9dd]">
              <Image
                src="/media/demo/masterplan.jpg"
                alt="Illustrative masterplan of the thirteen-house condominium"
                width={1600}
                height={1200}
                className="h-full w-full object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
            </div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className="label-micro text-ink-400">Illustrative masterplan</p>
                <p className="mt-1 max-w-xs text-[0.7rem] leading-relaxed text-ink-500">
                  A reference image used to communicate the prototype landscape. Not a surveyed plan; pools and facilities shown in
                  reference imagery are not part of this scheme.
                </p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[0.65rem] text-ink-400">
                <MapPin className="h-3 w-3" aria-hidden /> {settings.locationLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Typologies */}
      <section id="typologies" className="border-t border-ink-900/10 bg-[#efede5]">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="label-micro text-ink-400">Four typologies</p>
              <h2 className="display mt-4 max-w-2xl text-[2.4rem] leading-[1] sm:text-[3.1rem]">
                One architecture, four scales of living.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-600">
              Every house is planned around a private garden edge. The T4 adds a double-height living volume and a service wing;
              the T1 keeps the same material language at a smaller scale.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {TYPOLOGIES.map((typology) => {
              const catalogue = TYPOLOGY_CATALOGUE[typology];
              const sample = properties.find((p) => p.typology === typology);
              return (
                <article key={typology} className="group flex flex-col overflow-hidden rounded-md border border-ink-900/10 bg-[#f8f6ef]">
                  <div className="border-b border-ink-900/10 bg-[#f3f0e7] p-3">
                    <FloorPlan2D typology={typology} showFurniture showDimensions={false} className="opacity-95" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-3xl leading-none">{typology}</h3>
                      <span className="text-[0.68rem] text-ink-400">{catalogue.homes} houses</span>
                    </div>
                    <p className="mt-1 label-micro text-ink-400">{catalogue.short}</p>
                    <p className="mt-4 flex-1 text-[0.82rem] leading-relaxed text-ink-600">{catalogue.description}</p>
                    <dl className="mt-5 grid grid-cols-2 gap-2 border-t border-ink-900/10 pt-3 text-[0.72rem]">
                      <div>
                        <dt className="label-micro text-ink-400">Useful</dt>
                        <dd className="mt-1">{sample ? formatArea(sample.usableAreaM2) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="label-micro text-ink-400">Bedrooms</dt>
                        <dd className="mt-1">{catalogue.bedrooms}</dd>
                      </div>
                    </dl>
                    {sample && (
                      <Link
                        href={`/properties/${sample.slug}`}
                        className="mt-4 inline-flex items-center gap-1 text-[0.72rem] font-medium text-obsidian underline-offset-4 hover:underline"
                      >
                        See available examples <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-6"><PlanLegend /></div>
        </div>
      </section>

      {/* Experience */}
      <section className="border-t border-ink-900/10 bg-porcelain">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:py-24">
          <p className="label-micro text-ink-400">The HAVEN experience</p>
          <div className="mt-4 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <h2 className="display max-w-md text-[2.4rem] leading-[1] sm:text-[3.1rem]">
              A masterplan that behaves like an index.
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                {
                  icon: Boxes,
                  title: "Condominium in 3D",
                  body: "Begin above the thirteen houses. Orbit, zoom and select any residence directly from the model. Filter by typology and commercial status.",
                },
                {
                  icon: Layers,
                  title: "House mode",
                  body: "Selecting a house brings the camera down and opens its record: price, areas, status, features, plan and interior.",
                },
                {
                  icon: Compass,
                  title: "Interior exploration",
                  body: "Ground-floor interiors are generated from the same plan as the drawings, with room-by-room camera presets and a dollhouse cutaway.",
                },
                {
                  icon: MapPin,
                  title: "Placement that persists",
                  body: "Administrators can reposition houses, rotate them and publish the masterplan. The public scene reads only published placements.",
                },
              ].map((feature) => (
                <div key={feature.title} className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-6">
                  <feature.icon className="h-5 w-5 text-ink-400" aria-hidden />
                  <h3 className="mt-4 font-display text-xl">{feature.title}</h3>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-600">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Imagery strip */}
      <section className="border-t border-ink-900/10 bg-[#171916] text-porcelain">
        <div className="mx-auto grid max-w-7xl gap-px px-0 sm:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image src="/media/demo/garden-suite.jpg" alt="Glass-walled living space opening to a garden" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="label-micro text-white/50">Indoor / outdoor</p>
              <p className="display mt-2 text-2xl text-white">Rooms that open to the garden</p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image src="/media/demo/living-kitchen.jpg" alt="Open plan living room and kitchen with timber surfaces" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="label-micro text-white/50">Material palette</p>
              <p className="display mt-2 text-2xl text-white">Stone, timber, lime plaster</p>
            </div>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section id="availability" className="border-t border-ink-900/10 bg-porcelain">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-micro text-ink-400">Availability</p>
              <h2 className="display mt-3 text-[2.4rem] leading-none">The thirteen residences</h2>
            </div>
            <Link href="/properties" className="inline-flex items-center gap-1.5 text-sm text-ink-600 underline underline-offset-4 hover:text-obsidian">
              All residences <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-8 overflow-x-auto rounded-md border border-ink-900/10 bg-[#fbfbf8]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-ink-900/10">
                <tr className="label-micro text-ink-400">
                  <th scope="col" className="px-5 py-3 font-medium">Ref.</th>
                  <th scope="col" className="px-5 py-3 font-medium">Residence</th>
                  <th scope="col" className="px-5 py-3 font-medium">Typology</th>
                  <th scope="col" className="px-5 py-3 font-medium">Useful area</th>
                  <th scope="col" className="px-5 py-3 font-medium">Outdoor</th>
                  <th scope="col" className="px-5 py-3 font-medium">Price</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 font-medium text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/8">
                {properties
                  .filter((property) => property.publication === "published")
                  .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                  .map((property) => (
                    <tr key={property.id} className="transition hover:bg-white/70">
                      <td className="px-5 py-4 font-mono text-[0.72rem] text-ink-500">{property.code}</td>
                      <td className="px-5 py-4">
                        <Link href={`/properties/${property.slug}`} className="font-medium underline-offset-4 hover:underline">
                          {property.title}
                        </Link>
                        <span className="ml-2 text-[0.68rem] text-ink-400">{property.bedrooms} bed · {property.bathrooms} bath</span>
                      </td>
                      <td className="px-5 py-4">{property.typology}</td>
                      <td className="px-5 py-4 tabular text-ink-600">{formatArea(property.usableAreaM2)}</td>
                      <td className="px-5 py-4 tabular text-ink-600">{formatArea(property.outdoorAreaM2)}</td>
                      <td className="px-5 py-4 tabular">{formatCurrency(property.priceCents, property.currency)}</td>
                      <td className="px-5 py-4"><StatusBadge status={property.status} /></td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/properties/${property.slug}`} className="text-[0.72rem] text-ink-500 underline underline-offset-4 hover:text-obsidian">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.65rem] leading-relaxed text-ink-400">
            H05 and H13 are intentionally unpublished in the demonstration inventory and therefore do not appear here.
            Prices and areas are demonstration values.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="enquire" className="border-t border-ink-900/10 bg-[#efede5]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
          <div>
            <p className="label-micro text-ink-400">Enquiries</p>
            <h2 className="display mt-4 text-[2.4rem] leading-[1] sm:text-[3rem]">Speak to the studio.</h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-600">
              Tell us which typology interests you and how you would like to use the house. Enquiries are recorded in the HAVEN®
              platform and answered personally. Demonstration data only — no real sales process is implied.
            </p>
            <div className="mt-8 space-y-1 text-sm text-ink-600">
              <p>{settings.contactEmail}</p>
              <p>{settings.contactPhone}</p>
              <p className="text-ink-400">{settings.locationLabel}</p>
            </div>
            <div className="mt-8 rounded-sm border border-ink-900/10 bg-white/50 p-4 text-[0.7rem] leading-relaxed text-ink-500">
              Consent and retention: enquiries are stored with your consent, for a limited retention period, and can be deleted on
              request. No automated marketing email is sent from this demonstration.
            </div>
          </div>
          <div className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-6 sm:p-8">
            <LeadForm properties={propertyOptions} />
          </div>
        </div>
      </section>

      <SiteFooter settings={settings} isAdmin={Boolean(session)} />
    </main>
  );
}
