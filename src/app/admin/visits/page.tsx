import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSettings, listProperties, listVisits } from "@/lib/db/repositories";
import { VISIT_STATUSES, VISIT_STATUS_LABELS } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { VisitEditor } from "@/components/admin/CrmEditors";
import { formatDateTime, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Viewings" };

export default async function AdminVisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const db = await getDb();
  const status = VISIT_STATUSES.includes(pick("status") as never) ? (pick("status") as (typeof VISIT_STATUSES)[number]) : undefined;
  const [result, properties, settings] = await Promise.all([
    listVisits(db, { status, pageSize: 100 }),
    listProperties(db, { includeArchived: true, pageSize: 100 }),
    getSettings(db),
  ]);
  const titles = new Map(properties.rows.map((property) => [property.id, `${property.code} · ${property.title}`]));

  const now = Date.now();
  const upcoming = result.rows.filter((visit) => new Date(visit.preferredAt).getTime() >= now);
  const past = result.rows.filter((visit) => new Date(visit.preferredAt).getTime() < now);

  const link = (value?: string) => (value ? `/admin/visits?status=${value}` : "/admin/visits");

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Viewings"
        description={`Appointments are offered in ${settings.visitSlotMinutes}-minute slots with ${settings.visitLeadTimeHours}h notice. Confirm by phone, then record the outcome here.`}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={link()} className={cn("rounded-full border px-3 py-1 text-[0.68rem]", !status ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-600")}>
          All ({result.total})
        </Link>
        {VISIT_STATUSES.map((value) => (
          <Link
            key={value}
            href={link(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[0.68rem]",
              status === value ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-600 hover:border-ink-900/35",
            )}
          >
            {VISIT_STATUS_LABELS[value]}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title={`Upcoming (${upcoming.length})`} bodyClassName="p-0">
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-[0.78rem] text-ink-400">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-ink-900/10">
              {upcoming.map((visit) => (
                <li key={visit.id}>
                  <div className="px-5 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[0.82rem] text-obsidian">{visit.name}</p>
                      <span className="rounded-full border border-ink-900/12 bg-white px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-ink-500">
                        {VISIT_STATUS_LABELS[visit.status]}
                      </span>
                    </div>
                    <p className="text-[0.68rem] text-ink-400">
                      {formatDateTime(visit.preferredAt)} · {titles.get(visit.propertyId) ?? "—"}
                    </p>
                    <p className="text-[0.68rem] text-ink-400">
                      {visit.email}
                      {visit.phone ? ` · ${visit.phone}` : ""}
                    </p>
                  </div>
                  <VisitEditor visit={visit} />
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title={`History (${past.length})`} bodyClassName="p-0">
          {past.length === 0 ? (
            <p className="px-5 py-8 text-[0.78rem] text-ink-400">No past appointments.</p>
          ) : (
            <ul className="divide-y divide-ink-900/10">
              {past.map((visit) => (
                <li key={visit.id}>
                  <div className="px-5 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[0.82rem] text-obsidian">{visit.name}</p>
                      <span className="text-[0.65rem] text-ink-500">{VISIT_STATUS_LABELS[visit.status]}</span>
                    </div>
                    <p className="text-[0.68rem] text-ink-400">
                      {formatDate(visit.preferredAt)} · {titles.get(visit.propertyId) ?? "—"}
                    </p>
                  </div>
                  <VisitEditor visit={visit} />
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </>
  );
}
