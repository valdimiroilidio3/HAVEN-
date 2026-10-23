import { getDb } from "@/lib/db";
import { getSettings, listActivity, listProperties } from "@/lib/db/repositories";
import { listProfiles } from "@/lib/db/auth-repo";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { TeamEditor } from "@/components/admin/TeamEditor";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  const [settings, profiles, activity, properties] = await Promise.all([
    getSettings(db),
    listProfiles(db),
    listActivity(db, { limit: 25 }),
    listProperties(db, { includeArchived: true, pageSize: 100 }),
  ]);
  const canEdit = session ? can(session.user.role, "settings:update") : false;
  const canManageTeam = session ? can(session.user.role, "profile:manage") : false;

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Contact details, commercial defaults and team access. Changes are logged and take effect immediately."
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <AdminCard title="Site & contact" description="Shown on the public site and used in enquiry notifications.">
            {canEdit ? (
              <SettingsForm settings={settings} />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-[0.78rem]">
                <div>
                  <dt className="text-ink-400">Name</dt>
                  <dd>{settings.condominiumName}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Email</dt>
                  <dd>{settings.contactEmail}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Phone</dt>
                  <dd>{settings.contactPhone}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Location</dt>
                  <dd>{settings.locationLabel}</dd>
                </div>
              </dl>
            )}
          </AdminCard>

          <AdminCard title="Team" description={canManageTeam ? "Manage roles and account access." : "Read-only — administrators manage access."}>
            <TeamEditor profiles={profiles} currentUserId={session?.user.id ?? ""} />
          </AdminCard>

          <AdminCard title="Activity log" description="Most recent 25 recorded actions." bodyClassName="p-0">
            <ul className="divide-y divide-ink-900/[0.07]">
              {activity.map((entry) => (
                <li key={entry.id} className="px-5 py-2.5">
                  <p className="text-[0.74rem] leading-snug text-ink-700">{entry.summary}</p>
                  <p className="text-[0.62rem] text-ink-400">
                    {entry.actorEmail ?? "system"} · {entry.action} · {formatDateTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>

        <div className="space-y-6">
          <AdminCard title="Environment">
            <dl className="space-y-2 text-[0.74rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Storage driver</dt>
                <dd className="font-mono text-[0.7rem]">{process.env.HAVEN_DB_DRIVER || (process.env.SUPABASE_URL ? "supabase" : "sqlite (local)")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Homes</dt>
                <dd className="tabular">{properties.total}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Published</dt>
                <dd className="tabular">{properties.rows.filter((p) => p.publication === "published").length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Scene published</dt>
                <dd>{settings.scenePublishedAt ? formatDateTime(settings.scenePublishedAt) : "never"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Demo mode</dt>
                <dd>{settings.demoMode ? "on" : "off"}</dd>
              </div>
            </dl>
          </AdminCard>

          <AdminCard title="Demonstration content">
            <p className="text-[0.74rem] leading-relaxed text-ink-500">
              Photography, plans and site dimensions are demonstration material. Replace imagery per home in the media panel, and replace the masterplan asset once a surveyed model is available. The public site keeps a visible demonstration notice until demo mode is switched off.
            </p>
          </AdminCard>

          <AdminCard title="Data retention">
            <p className="text-[0.74rem] leading-relaxed text-ink-500">
              Leads are retained for {settings.leadRetentionDays} days. Administrators can permanently erase a lead from the pipeline, which also removes its message and notes.
            </p>
          </AdminCard>
        </div>
      </div>
    </>
  );
}
