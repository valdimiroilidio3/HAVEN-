import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Bath, BedDouble, Car, ChefHat, Ruler, Trees, Waves } from "lucide-react";
import { getDb } from "@/lib/db";
import { getPropertyBySlug, getSettings, listPropertyMedia, listPublicProperties } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { FloorPlan2D, PlanLegend } from "@/components/plan/FloorPlan2D";
import { StatusBadge, PublicationBadge } from "@/components/ui/badge";
import { InteriorLauncher } from "@/components/public/InteriorLauncher";
import { poolFor } from "@/lib/3d/site";
import { VisitForm } from "@/components/public/forms";
import { TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { formatArea, formatCurrency, typologyHeadline } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const property = await getPropertyBySlug(db, slug);
  if (!property) return { title: "Residence not found" };
  return {
    title: `${property.title} — ${property.typology}`,
    description: property.description ?? `${property.title}, a ${property.typology} residence at HAVEN®.`,
    openGraph: { images: ["/media/demo/villa-dusk.jpg"] },
  };
}

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const property = await getPropertyBySlug(db, slug);
  if (!property || property.publication === "archived") notFound();
  const viewable = property.publication === "published" && property.status !== "hidden";
  const pool = poolFor(property.code, property.typology);
  const session = await getSession();
  if (!viewable && !session) notFound();

  const [media, all, settings] = await Promise.all([listPropertyMedia(db, property.id), listPublicProperties(db), getSettings(db)]);
  const gallery = media.filter((m) => m.kind !== "plan");
  const related = all.filter((p) => p.typology === property.typology && p.id !== property.id).slice(0, 3);
  const propertyOptions = all
    .filter((p) => p.status === "available" || p.status === "reserved")
    .map((p) => ({ id: p.id, code: p.code, title: p.title, typology: p.typology }));

  return (
    <>
      <PublicHeader
        right={
          <>
            {session && (
              <Link href={`/admin/properties/${property.id}`} className="hidden text-ink-500 hover:text-obsidian sm:inline">
                Edit in admin
              </Link>
            )}
            <Link href="/visit" className="inline-flex h-9 items-center rounded-full bg-obsidian px-4 font-medium text-porcelain">
              Book a visit
            </Link>
          </>
        }
      />
      <main id="main" className="bg-porcelain">
        <div className="mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:py-14">
          <Link href="/properties" className="inline-flex items-center gap-1.5 text-[0.72rem] text-ink-500 hover:text-obsidian">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All residences
          </Link>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-ink-900/10 bg-ink-100">
                <Image
                  src={gallery[0]?.url ?? "/media/demo/villa-dusk.jpg"}
                  alt={gallery[0]?.altText ?? property.title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 65vw"
                  className="object-cover"
                />
                <div className="absolute left-4 top-4 flex gap-2">
                  <StatusBadge status={property.status} />
                  {property.publication !== "published" && <PublicationBadge publication={property.publication} />}
                </div>
              </div>

              {gallery.length > 1 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {gallery.slice(1, 5).map((item) => (
                    <div key={item.id} className="relative aspect-[4/3] overflow-hidden rounded-sm border border-ink-900/10 bg-ink-100">
                      <Image src={item.url} alt={item.altText ?? item.caption ?? property.title} fill sizes="200px" className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="label-micro text-ink-400">{property.code} · {typologyHeadline(property.typology)}</p>
              <h1 className="display mt-3 text-[2.8rem] leading-[0.98] sm:text-[3.4rem]">{property.title}</h1>
              <p className="mt-4 display text-3xl">{formatCurrency(property.priceCents, property.currency)}</p>
              <p className="mt-1 text-[0.7rem] text-ink-400">Demonstration price · {TYPOLOGY_CATALOGUE[property.typology].character}</p>

              <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-900/10 bg-ink-900/10 text-sm">
                {[
                  { icon: Ruler, label: "Useful area", value: formatArea(property.usableAreaM2) },
                  { icon: Trees, label: "Outdoor area", value: formatArea(property.outdoorAreaM2) },
                  { icon: BedDouble, label: "Bedrooms", value: String(property.bedrooms) },
                  { icon: Bath, label: "Bathrooms", value: String(property.bathrooms) },
                  { icon: Car, label: "Parking", value: property.parkingSpaces ? `${property.parkingSpaces}` : "—" },
                  { icon: Ruler, label: "Plot", value: formatArea(property.plotAreaM2) },
                  { icon: Waves, label: "Private pool", value: pool ? `${pool.width.toFixed(1)} × ${pool.depth.toFixed(1)} m` : "—" },
                  { icon: ChefHat, label: "Kitchen", value: "Equipped" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-[#fbfbf8] px-4 py-3">
                    <dt className="flex items-center gap-1.5 label-micro text-ink-400">
                      <stat.icon className="h-3 w-3" aria-hidden /> {stat.label}
                    </dt>
                    <dd className="mt-1.5 tabular">{stat.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-6 text-sm leading-relaxed text-ink-600">{property.description}</p>

              <div className="mt-5 rounded-md border border-ink-900/10 bg-[#fbfbf8] px-4 py-3">
                <p className="label-micro text-ink-400">Every home is delivered with</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    "Private walled plot",
                    pool ? "Private pool and deck" : "Landscaped private garden",
                    "Equipped kitchen: fridge, induction hob, oven, extractor, dishwasher, microwave",
                    "Laundry: washer / dryer",
                    property.typology === "T3" || property.typology === "T4" ? "Double carport with two bays" : "Private carport",
                  ].map((item) => (
                    <li key={item} className="rounded-full border border-moss-300/60 bg-moss-100/60 px-2.5 py-1 text-[0.68rem] text-moss-800">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {property.features.length > 0 && (
                <div className="mt-5">
                  <p className="label-micro text-ink-400">Confirmed features</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {property.features.map((feature) => (
                      <li key={feature} className="rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.68rem] text-ink-600">
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-7 flex flex-wrap gap-2">
                <a href="#visit" className="inline-flex h-11 items-center rounded-sm bg-obsidian px-5 text-sm font-medium text-porcelain transition hover:bg-ink-800">
                  Book a private visit
                </a>
                <InteriorLauncher property={property} isAdmin={Boolean(session)} />
              </div>
              <p className="mt-3 text-[0.65rem] leading-relaxed text-ink-400">
                Demonstration data. Areas, prices and specifications are prototypes pending architectural and commercial validation.
              </p>
            </div>
          </div>

          {/* Plan */}
          <section className="mt-16 border-t border-ink-900/10 pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label-micro text-ink-400">Floor plan · {property.typology}</p>
                <h2 className="display mt-3 text-3xl">Ground floor</h2>
              </div>
              <p className="max-w-sm text-[0.72rem] leading-relaxed text-ink-500">
                Generated from the same specification that drives the 3D interior. The upper floor is not modelled in this prototype.
              </p>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="overflow-hidden rounded-md border border-ink-900/10 bg-[#f8f6ef]">
                <FloorPlan2D typology={property.typology} title={`${property.title} floor plan`} />
              </div>
              <div className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-5">
                <p className="label-micro text-ink-400">Plan notes</p>
                <ul className="mt-3 space-y-2.5 text-[0.8rem] leading-relaxed text-ink-600">
                  <li>Prototype layout — not for construction.</li>
                  <li>Furniture shown for scale only and not included in the sale.</li>
                  <li>Areas are demonstration values and must be surveyed.</li>
                  <li>Interior 3D covers the ground floor only.</li>
                </ul>
                <div className="mt-6"><PlanLegend /></div>
                <div className="mt-6 border-t border-ink-900/10 pt-4 text-[0.7rem] leading-relaxed text-ink-500">
                  <p>Model references</p>
                  <p className="mt-1 font-mono text-[0.62rem] break-all text-ink-400">{property.exteriorModelRef}</p>
                  <p className="font-mono text-[0.62rem] break-all text-ink-400">{property.interiorModelRef}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Visit */}
          <section id="visit" className="mt-16 grid gap-10 border-t border-ink-900/10 pt-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="label-micro text-ink-400">Visit</p>
              <h2 className="display mt-3 text-3xl">See {property.title} in person.</h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-600">
                Viewings are arranged personally. Choose a preferred slot and the team will confirm by email or phone. This
                demonstration does not send automated confirmations.
              </p>
              <p className="mt-4 text-[0.7rem] text-ink-400">Requested at least {settings.visitLeadTimeHours} hours in advance.</p>
            </div>
            <div className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-6 sm:p-8">
              <VisitForm
                properties={propertyOptions}
                defaultPropertyId={property.id}
                minDate={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                leadTimeHours={settings.visitLeadTimeHours}
              />
            </div>
          </section>

          {related.length > 0 && (
            <section className="mt-16 border-t border-ink-900/10 pt-10">
              <div className="flex items-end justify-between">
                <h2 className="display text-3xl">Other {property.typology} houses</h2>
                <Link href={`/properties?typology=${property.typology}`} className="inline-flex items-center gap-1 text-[0.72rem] text-ink-500 hover:text-obsidian">
                  View all <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {related.map((item) => (
                  <Link key={item.id} href={`/properties/${item.slug}`} className="group rounded-md border border-ink-900/10 bg-[#fbfbf8] p-5 transition hover:border-ink-900/25">
                    <div className="flex items-center justify-between">
                      <p className="label-micro text-ink-400">{item.code}</p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="display mt-2 text-2xl">{item.title}</p>
                    <p className="mt-1 text-[0.75rem] text-ink-500">{formatArea(item.usableAreaM2)} · {formatCurrency(item.priceCents, item.currency)}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <SiteFooter settings={settings} isAdmin={Boolean(session)} />
    </>
  );
}
