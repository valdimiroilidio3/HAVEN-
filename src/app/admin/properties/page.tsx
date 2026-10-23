import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { listProperties } from "@/lib/db/repositories";
import { PROPERTY_STATUSES, PUBLICATION_STATUSES, TYPOLOGIES, TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { StatusBadge, PublicationBadge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Properties" };

const SORTS = [
  { value: "code", label: "Code" },
  { value: "price", label: "Price" },
  { value: "updated", label: "Recently updated" },
] as const;

export default async function AdminPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const db = await getDb();
  const result = await listProperties(db, {
    status: PROPERTY_STATUSES.includes(pick("status") as never) ? (pick("status") as (typeof PROPERTY_STATUSES)[number]) : undefined,
    typology: TYPOLOGIES.includes(pick("typology") as never) ? (pick("typology") as (typeof TYPOLOGIES)[number]) : undefined,
    publication: PUBLICATION_STATUSES.includes(pick("publication") as never) ? (pick("publication") as (typeof PUBLICATION_STATUSES)[number]) : undefined,
    search: pick("q"),
    sort: SORTS.some((s) => s.value === pick("sort")) ? (pick("sort") as "code" | "price" | "updated") : "code",
    includeArchived: pick("archived") === "1",
    pageSize: 100,
  });

  const base = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const key of ["status", "typology", "publication", "q", "sort", "archived"]) {
      const value = overrides[key] ?? pick(key);
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    return `/admin/properties${qs ? `?${qs}` : ""}`;
  };

  const filterChip = (label: string, href: string, active: boolean) => (
    <Link
      key={href + label}
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-[0.68rem] transition",
        active ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-600 hover:border-ink-900/35",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Properties"
        description="13 homes across four typologies. Availability, publication and pricing are independent: archiving a home keeps its history without breaking the public site."
        actions={
          <Link href="/admin/properties/new" className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain hover:bg-ink-800">
            <Plus className="h-3.5 w-3.5" aria-hidden /> New property
          </Link>
        }
      />

      <form action="/admin/properties" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" aria-hidden />
          <input
            name="q"
            defaultValue={pick("q") ?? ""}
            placeholder="Search code or title"
            aria-label="Search properties"
            className="h-9 w-56 rounded-sm border border-ink-900/15 bg-white pl-9 pr-3 text-xs text-obsidian placeholder:text-ink-400 focus:border-ink-900/40 focus:outline-none"
          />
        </div>
        <select name="typology" defaultValue={pick("typology") ?? ""} aria-label="Filter by typology" className="h-9 rounded-sm border border-ink-900/15 bg-white px-2 text-xs">
          <option value="">All typologies</option>
          {TYPOLOGIES.map((t) => (
            <option key={t} value={t}>
              {t} · {TYPOLOGY_CATALOGUE[t].label}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={pick("sort") ?? "code"} aria-label="Sort" className="h-9 rounded-sm border border-ink-900/15 bg-white px-2 text-xs">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input type="hidden" name="status" value={pick("status") ?? ""} />
        <input type="hidden" name="publication" value={pick("publication") ?? ""} />
        {pick("archived") === "1" && <input type="hidden" name="archived" value="1" />}
        <button type="submit" className="h-9 rounded-sm border border-ink-900 bg-transparent px-3 text-xs text-obsidian hover:bg-obsidian hover:text-porcelain">
          Apply
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {filterChip("All statuses", base({ status: undefined }), !pick("status"))}
        {PROPERTY_STATUSES.map((status) => filterChip(status[0]!.toUpperCase() + status.slice(1), base({ status }), pick("status") === status))}
        <span className="mx-1 h-5 w-px bg-ink-900/10" aria-hidden />
        {filterChip("All visibility", base({ publication: undefined }), !pick("publication"))}
        {PUBLICATION_STATUSES.map((p) => filterChip(p[0]!.toUpperCase() + p.slice(1), base({ publication: p }), pick("publication") === p))}
      </div>

      <AdminCard bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[0.78rem]">
            <thead className="border-b border-ink-900/10 text-[0.62rem] uppercase tracking-[0.12em] text-ink-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">Home</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Area</th>
                <th className="px-4 py-2.5 font-medium">Price</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Visibility</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900/[0.07]">
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[0.78rem] text-ink-400">
                    No properties match these filters.
                  </td>
                </tr>
              )}
              {result.rows.map((property) => (
                <tr key={property.id} className={cn("hover:bg-white/70", property.publication === "archived" && "opacity-60")}>
                  <td className="px-5 py-3">
                    <Link href={`/admin/properties/${property.id}`} className="block text-obsidian hover:underline">
                      {property.title}
                    </Link>
                    <span className="tabular text-[0.66rem] text-ink-400">{property.code}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{property.typology}</td>
                  <td className="tabular px-4 py-3 text-ink-500">{formatNumber(property.usableAreaM2)} m²</td>
                  <td className="tabular px-4 py-3 text-ink-700">{formatCurrency(property.priceCents, property.currency)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={property.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PublicationBadge publication={property.publication} />
                  </td>
                  <td className="px-4 py-3 text-[0.7rem] text-ink-400">{formatDate(property.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-900/10 px-5 py-3 text-[0.68rem] text-ink-400">
          <span>
            {result.total} propert{result.total === 1 ? "y" : "ies"} · {result.rows.filter((p) => p.status === "available").length} available in view
          </span>
          <Link href={base({ archived: pick("archived") === "1" ? undefined : "1" })} className="underline underline-offset-4 hover:text-obsidian">
            {pick("archived") === "1" ? "Hide archived" : "Show archived"}
          </Link>
        </div>
      </AdminCard>
    </>
  );
}
