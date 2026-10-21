import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { getSettings, listPropertyMedia, listPublicProperties } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { StatusBadge } from "@/components/ui/badge";
import { TYPOLOGIES } from "@/lib/domain/constants";
import { PROPERTY_STATUS_LABELS } from "@/lib/domain/constants";
import { formatArea, formatCurrency } from "@/lib/format";
import type { PropertyStatus, Typology } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The residences",
  description: "All thirteen HAVEN® residences, with typology, useful area, outdoor area and commercial availability.",
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ typology?: string; status?: string }>;
}) {
  const params = await searchParams;
  const db = await getDb();
  const [properties, media, settings, session] = await Promise.all([
    listPublicProperties(db),
    listPropertyMedia(db),
    getSettings(db),
    getSession(),
  ]);

  const typologyFilter = TYPOLOGIES.includes(params.typology as Typology) ? (params.typology as Typology) : null;
  const statusFilter = ["available", "reserved", "sold"].includes(params.status ?? "") ? (params.status as PropertyStatus) : null;

  const filtered = properties.filter(
    (property) =>
      (!typologyFilter || property.typology === typologyFilter) && (!statusFilter || property.status === statusFilter),
  );
  const imageFor = (propertyId: string) => media.find((m) => m.propertyId === propertyId && m.kind !== "plan")?.url ?? "/media/demo/villa-dusk.jpg";

  return (
    <>
      <PublicHeader />
      <main id="main" className="bg-porcelain">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10 lg:py-20">
          <p className="label-micro text-ink-400">The condominium</p>
          <h1 className="display mt-4 text-[2.8rem] leading-none sm:text-[4rem]">Thirteen residences</h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-600">
            Three T1, three T2, four T3 and three T4 houses. Availability is read directly from the management platform; sold and
            reserved houses remain visible so the composition of the condominium is honest.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Link href="/properties" className={cn("rounded-full border px-3 py-1.5 text-xs", !typologyFilter && !statusFilter ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white/60 text-ink-600")}>
              All
            </Link>
            {TYPOLOGIES.map((typology) => (
              <Link
                key={typology}
                href={`/properties?typology=${typology}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  typologyFilter === typology ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white/60 text-ink-600 hover:border-ink-900/35",
                )}
              >
                {typology} · {properties.filter((p) => p.typology === typology).length}
              </Link>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-ink-900/15 sm:block" />
            {(["available", "reserved", "sold"] as const).map((status) => (
              <Link
                key={status}
                href={`/properties?status=${status}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  statusFilter === status ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white/60 text-ink-600 hover:border-ink-900/35",
                )}
              >
                {PROPERTY_STATUS_LABELS[status]} · {properties.filter((p) => p.status === status).length}
              </Link>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-12 rounded-md border border-dashed border-ink-900/15 p-12 text-center">
              <p className="display text-2xl">No residences match this filter.</p>
              <Link href="/properties" className="mt-3 inline-block text-sm underline underline-offset-4">Clear filters</Link>
            </div>
          ) : (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((property) => (
                <article key={property.id} className="group overflow-hidden rounded-md border border-ink-900/10 bg-[#fbfbf8]">
                  <Link href={`/properties/${property.slug}`} className="block">
                    <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
                      <Image
                        src={imageFor(property.id)}
                        alt={`${property.title} demonstration image`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="absolute left-3 top-3"><StatusBadge status={property.status} /></div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="label-micro text-ink-400">{property.code} · {property.typology}</p>
                        <p className="font-mono text-[0.65rem] text-ink-300">{property.bedrooms} bed</p>
                      </div>
                      <h2 className="display mt-2 text-2xl">{property.title}</h2>
                      <p className="mt-1 text-[0.8rem] text-ink-500">{formatArea(property.usableAreaM2)} useful · {formatArea(property.outdoorAreaM2)} outdoor</p>
                      <div className="mt-4 flex items-center justify-between border-t border-ink-900/10 pt-3">
                        <p className="text-sm tabular">{formatCurrency(property.priceCents, property.currency)}</p>
                        <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-500 transition group-hover:text-obsidian">
                          View <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
          <p className="mt-8 text-[0.65rem] leading-relaxed text-ink-400">
            Demonstration inventory. Areas and prices are prototypes pending architectural and commercial validation.
          </p>
        </div>
      </main>
      <SiteFooter settings={settings} isAdmin={Boolean(session)} />
    </>
  );
}
