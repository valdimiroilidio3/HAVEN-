import Link from "next/link";
import { Download, Mail, Phone } from "lucide-react";
import { getDb } from "@/lib/db";
import { listLeads, listProperties } from "@/lib/db/repositories";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { LeadEditor } from "@/components/admin/CrmEditors";
import { formatDate, formatDateTime, formatStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads" };

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const db = await getDb();
  const status = LEAD_STATUSES.includes(pick("status") as never) ? (pick("status") as (typeof LEAD_STATUSES)[number]) : undefined;
  const propertyId = pick("propertyId");
  const [result, properties] = await Promise.all([
    listLeads(db, { status, propertyId, search: pick("q"), pageSize: 100 }),
    listProperties(db, { includeArchived: true, pageSize: 100 }),
  ]);
  const titles = new Map(properties.rows.map((property) => [property.id, `${property.code} · ${property.title}`]));

  const link = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const key of ["status", "propertyId", "q"]) {
      const value = overrides[key] !== undefined ? overrides[key] : pick(key);
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    return `/admin/leads${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Every enquiry captured by the public site, in chronological order. Consent and retention are recorded with the original submission."
        actions={
          <a href="/api/admin/leads/export" className="inline-flex h-9 items-center gap-2 rounded-sm border border-ink-900/15 bg-white px-4 text-xs text-obsidian hover:border-ink-900/35">
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link
          href={link({ status: undefined })}
          className={cn("rounded-full border px-3 py-1 text-[0.68rem]", !status ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-600")}
        >
          All ({result.total})
        </Link>
        {LEAD_STATUSES.map((value) => (
          <Link
            key={value}
            href={link({ status: value })}
            className={cn(
              "rounded-full border px-3 py-1 text-[0.68rem]",
              status === value ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-600 hover:border-ink-900/35",
            )}
          >
            {LEAD_STATUS_LABELS[value]}
          </Link>
        ))}
        {propertyId && (
          <Link href={link({ propertyId: undefined })} className="text-[0.68rem] text-ink-500 underline underline-offset-4">
            Clear property filter
          </Link>
        )}
      </div>

      <AdminCard bodyClassName="p-0">
        {result.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[0.8rem] text-ink-400">No leads in this view.</p>
        ) : (
          <ul className="divide-y divide-ink-900/10">
            {result.rows.map((lead) => (
              <li key={lead.id}>
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-white/60 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.82rem] text-obsidian">
                        {lead.name}
                        {lead.propertyId && <span className="ml-2 text-[0.66rem] text-ink-400">{titles.get(lead.propertyId) ?? "—"}</span>}
                      </p>
                      <p className="truncate text-[0.68rem] text-ink-400">
                        {lead.email} · {LEAD_SOURCE_LABELS[lead.source] ?? formatStatus(lead.source)} · {formatDateTime(lead.createdAt)}
                      </p>
                    </div>
                    {lead.typology && <span className="tabular text-[0.68rem] text-ink-500">{lead.typology}</span>}
                    <span className="rounded-full border border-ink-900/12 bg-white px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-ink-500">
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                    <span className="text-[0.65rem] text-ink-400 transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="space-y-3 px-5 pb-4">
                    {lead.message && (
                      <blockquote className="border-l-2 border-clay-500/60 pl-3 text-[0.78rem] leading-relaxed text-ink-600">{lead.message}</blockquote>
                    )}
                    <div className="flex flex-wrap gap-4 text-[0.7rem]">
                      <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-ink-600 hover:text-obsidian">
                        <Mail className="h-3.5 w-3.5" aria-hidden /> Email
                      </a>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-ink-600 hover:text-obsidian">
                          <Phone className="h-3.5 w-3.5" aria-hidden /> {lead.phone}
                        </a>
                      )}
                      <span className="text-ink-400">Received {formatDate(lead.createdAt)}</span>
                    </div>
                  </div>
                  <LeadEditor lead={lead} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
