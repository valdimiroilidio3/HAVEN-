import Link from "next/link";
import { ArrowUpRight, Building2, CalendarDays, Sparkles, TrendingUp, Users } from "lucide-react";
import { getDb } from "@/lib/db";
import { getDashboardMetrics, listActivity, listLeads, listProperties, listVisits, getSceneAdmin } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { StatusBadge, PublicationBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatNumber, formatStatus } from "@/lib/format";
import { PROPERTY_STATUS_LABELS } from "@/lib/domain/constants";

export const metadata = { title: "Overview" };

const ACTIVITY_ICONS: Record<string, typeof Building2> = {
  property: Building2,
  lead: Users,
  visit: CalendarDays,
  scene: Sparkles,
};

export default async function AdminDashboardPage() {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  const [metrics, properties, leads, visits, activity, scene] = await Promise.all([
    getDashboardMetrics(db),
    listProperties(db, { pageSize: 6 }),
    listLeads(db, { pageSize: 5 }),
    listVisits(db, { pageSize: 4 }),
    listActivity(db, { limit: 8 }),
    getSceneAdmin(db),
  ]);

  const statCards = [
    { label: "Homes in portfolio", value: metrics.totalProperties, hint: `${metrics.unpublished} unpublished` },
    { label: "Available", value: metrics.available, hint: `${metrics.reserved} reserved · ${metrics.sold} sold` },
    { label: "Leads", value: metrics.totalLeads, hint: `${metrics.newLeads} awaiting contact` },
    { label: "Viewing requests", value: metrics.pendingVisits, hint: "pending confirmation" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`Good to see you, ${session?.user.fullName.split(" ")[0] ?? "team"}`}
        title="Overview"
        description="Live commercial position across the condominium, what needs attention, and the last changes made by the team."
        actions={
          <Link href="/admin/3d-editor" className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain transition hover:bg-ink-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Open 3D editor
          </Link>
        }
      />

      {metrics.sceneDraftPending && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-clay-500/50 bg-clay-500/10 px-4 py-3">
          <p className="text-[0.78rem] text-ink-700">
            <span className="font-medium">Unpublished 3D draft.</span> Placements have been edited but not published to the public site.
          </p>
          <Link href="/admin/3d-editor" className="text-[0.72rem] font-medium underline underline-offset-4">
            Review and publish
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-md border border-ink-900/10 bg-[#fbfbf8] p-5">
            <p className="label-micro text-ink-400">{card.label}</p>
            <p className="tabular mt-3 text-[2.1rem] leading-none text-obsidian">{formatNumber(card.value)}</p>
            <p className="mt-2 text-[0.7rem] text-ink-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <AdminCard
          title="Recent enquiries"
          description="Newest leads captured from the public site."
          actions={<Link href="/admin/leads" className="text-[0.7rem] text-ink-500 hover:text-obsidian">All leads →</Link>}
          bodyClassName="p-0"
        >
          {leads.rows.length === 0 ? (
            <p className="px-5 py-8 text-[0.78rem] text-ink-400">No enquiries yet.</p>
          ) : (
            <ul className="divide-y divide-ink-900/[0.07]">
              {leads.rows.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.8rem] text-obsidian">{lead.name}</p>
                    <p className="truncate text-[0.68rem] text-ink-400">
                      {lead.email} · {formatDateTime(lead.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.typology && <span className="tabular text-[0.68rem] text-ink-400">{lead.typology}</span>}
                    <span className="rounded-full border border-ink-900/12 bg-white px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-ink-500">
                      {formatStatus(lead.status)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard
          title="Upcoming viewings"
          description="Appointments awaiting or confirmed."
          actions={<Link href="/admin/visits" className="text-[0.7rem] text-ink-500 hover:text-obsidian">Schedule →</Link>}
          bodyClassName="p-0"
        >
          {visits.rows.length === 0 ? (
            <p className="px-5 py-8 text-[0.78rem] text-ink-400">No viewing requests.</p>
          ) : (
            <ul className="divide-y divide-ink-900/[0.07]">
              {visits.rows.map((visit) => (
                <li key={visit.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[0.8rem] text-obsidian">{visit.name}</p>
                    <span className="text-[0.65rem] text-ink-400">{formatStatus(visit.status)}</span>
                  </div>
                  <p className="mt-0.5 text-[0.68rem] text-ink-400">
                    {formatDateTime(visit.preferredAt)}
                    
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <AdminCard title="Portfolio" description="Each home with current availability and publication state." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[0.78rem]">
              <thead className="border-b border-ink-900/10 text-[0.62rem] uppercase tracking-[0.12em] text-ink-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Home</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Public</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/[0.07]">
                {properties.rows.map((property) => (
                  <tr key={property.id} className="hover:bg-white/60">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/properties/${property.id}`} className="text-obsidian hover:underline">
                        {property.code} · {property.title}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-ink-500">{property.typology}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={property.status} />
                    </td>
                    <td className="px-5 py-2.5">
                      <PublicationBadge publication={property.publication} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-900/10 px-5 py-3">
            <Link href="/admin/properties" className="inline-flex items-center gap-1 text-[0.7rem] text-ink-500 hover:text-obsidian">
              Manage all {metrics.totalProperties} homes <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </AdminCard>

        <div className="space-y-6">
          <AdminCard title="Availability mix">
            <ul className="space-y-2">
              {(Object.keys(metrics.statusBreakdown) as Array<keyof typeof metrics.statusBreakdown>).map((status) => {
                const count = metrics.statusBreakdown[status];
                if (!count) return null;
                return (
                  <li key={status} className="flex items-center justify-between text-[0.76rem]">
                    <span className="text-ink-600">{PROPERTY_STATUS_LABELS[status]}</span>
                    <span className="tabular text-obsidian">{count}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-ink-900/8">
              {(Object.keys(metrics.statusBreakdown) as Array<keyof typeof metrics.statusBreakdown>).map((status, index) => {
                const count = metrics.statusBreakdown[status];
                if (!count) return null;
                const palette = ["bg-moss-500", "bg-clay-500", "bg-ink-700", "bg-ink-300", "bg-ink-200"];
                return (
                  <span
                    key={status}
                    className={palette[index % palette.length]}
                    style={{ width: `${(count / Math.max(1, metrics.totalProperties)) * 100}%` }}
                    title={`${PROPERTY_STATUS_LABELS[status]}: ${count}`}
                  />
                );
              })}
            </div>
          </AdminCard>

          <AdminCard title="Activity" bodyClassName="p-0">
            {activity.length === 0 ? (
              <p className="px-5 py-6 text-[0.75rem] text-ink-400">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-ink-900/[0.07]">
                {activity.map((entry) => {
                  const Icon = ACTIVITY_ICONS[entry.entityType] ?? TrendingUp;
                  return (
                    <li key={entry.id} className="flex gap-3 px-5 py-2.5">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[0.72rem] leading-snug text-ink-700">{entry.summary}</p>
                        <p className="text-[0.62rem] text-ink-400">
                          {entry.actorEmail ?? "system"} · {formatDate(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminCard>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/admin/3d-editor", label: "3D masterplan", hint: `${scene.positions.length} placements, ${scene.isDirty ? "draft pending" : "published"}` },
          { href: "/admin/media", label: "Media & assets", hint: "Images, models, documents" },
          { href: "/admin/leads", label: "Lead pipeline", hint: `${metrics.newLeads} new` },
          { href: "/admin/settings", label: "Settings", hint: "Contact details and defaults" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center justify-between rounded-md border border-ink-900/10 bg-[#fbfbf8] px-4 py-3 transition hover:border-ink-900/25"
          >
            <span>
              <span className="block text-[0.78rem] text-obsidian">{item.label}</span>
              <span className="block text-[0.66rem] text-ink-400">{item.hint}</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-ink-300 transition group-hover:text-obsidian" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
