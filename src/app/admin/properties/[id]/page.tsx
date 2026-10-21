import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  getPropertyRelations,
  listActivity,
  listAssets,
  listLeads,
  listVisits,
} from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { can, PUBLICATION_LABELS } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { StatusControl, PublicationControl } from "@/components/admin/StatusControl";
import { MediaManager } from "@/components/admin/MediaManager";
import { ModelAssign } from "@/components/admin/ModelAssign";
import { InlineAction } from "@/components/admin/InlineAction";
import { StatusBadge, PublicationBadge } from "@/components/ui/badge";
import { formatArea, formatCurrency, formatDate, formatDateTime, formatStatus } from "@/lib/format";
import { restorePropertyAction } from "@/lib/actions/admin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const relations = await getPropertyRelations(db, id);
  return { title: relations ? `${relations.code} · ${relations.title}` : "Property" };
}

export default async function AdminPropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [db, session] = await Promise.all([getDb(), getSession()]);
  const relations = await getPropertyRelations(db, id);
  if (!relations) notFound();

  const [assets, activity, leads, visits] = await Promise.all([
    listAssets(db),
    listActivity(db, { entityType: "property", entityId: id, limit: 12 }),
    listLeads(db, { propertyId: id, pageSize: 5 }),
    listVisits(db, { propertyId: id, pageSize: 5 }),
  ]);

  const canEdit = session ? can(session.user.role, "property:update") : false;
  const canStatus = session ? can(session.user.role, "property:status") : false;
  const canMedia = session ? can(session.user.role, "media:upload") : false;
  const canArchive = session ? can(session.user.role, "property:archive") : false;

  return (
    <>
      <Link href="/admin/properties" className="mb-5 inline-flex items-center gap-1.5 text-[0.7rem] text-ink-500 hover:text-obsidian">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All properties
      </Link>

      <PageHeader
        eyebrow={`${relations.code} · ${relations.typology} · ${PUBLICATION_LABELS[relations.publication]}`}
        title={relations.title}
        description={relations.description ?? "No public description yet."}
        actions={
          <>
            <Link href={`/properties/${relations.slug}`} className="inline-flex h-9 items-center gap-2 rounded-sm border border-ink-900/15 bg-white px-4 text-xs text-obsidian hover:border-ink-900/35">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Public page
            </Link>
            <Link href="/admin/3d-editor" className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain hover:bg-ink-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Placement
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={relations.status} />
        <PublicationBadge publication={relations.publication} />
        <span className="tabular text-[0.7rem] text-ink-500">
          {formatArea(relations.usableAreaM2)} usable · {formatArea(relations.outdoorAreaM2)} outdoor
        </span>
        <span className="text-[0.7rem] text-ink-600">{formatCurrency(relations.priceCents, relations.currency)}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {canEdit ? (
            <AdminCard title="Property details" description="Saved changes are logged with your name and the time.">
              <PropertyForm property={relations} />
            </AdminCard>
          ) : (
            <AdminCard title="Property details">
              <p className="text-[0.8rem] text-ink-500">Your role has read-only access to property details.</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.75rem]">
                <div>
                  <dt className="text-ink-400">Bedrooms</dt>
                  <dd className="tabular">{relations.bedrooms}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Bathrooms</dt>
                  <dd className="tabular">{relations.bathrooms}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Parking</dt>
                  <dd className="tabular">{relations.parkingSpaces}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Plot</dt>
                  <dd className="tabular">{relations.plotAreaM2 ? `${relations.plotAreaM2} m²` : "—"}</dd>
                </div>
              </dl>
            </AdminCard>
          )}

          <AdminCard title="Media" description={`${relations.media.length} item${relations.media.length === 1 ? "" : "s"}`}>
            {canMedia ? (
              <MediaManager propertyId={relations.id} media={relations.media} />
            ) : (
              <p className="text-[0.78rem] text-ink-500">Your role cannot manage media.</p>
            )}
          </AdminCard>

          <AdminCard title="3D model" description="Replace the generated model with a validated upload.">
            {canEdit ? (
              <ModelAssign propertyId={relations.id} assets={assets} />
            ) : (
              <div className="space-y-1 text-[0.75rem] text-ink-500">
                <p>Exterior: {relations.exteriorModelRef ?? "—"}</p>
                <p>Interior: {relations.interiorModelRef ?? "—"}</p>
              </div>
            )}
          </AdminCard>

          <AdminCard title="Enquiries for this home" bodyClassName="p-0">
            {leads.rows.length === 0 ? (
              <p className="px-5 py-6 text-[0.76rem] text-ink-400">No enquiries yet.</p>
            ) : (
              <ul className="divide-y divide-ink-900/[0.07]">
                {leads.rows.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.76rem]">
                    <div className="min-w-0">
                      <p className="truncate text-obsidian">{lead.name}</p>
                      <p className="truncate text-[0.66rem] text-ink-400">{lead.email}</p>
                    </div>
                    <span className="text-[0.65rem] text-ink-500">{formatStatus(lead.status)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-ink-900/10 px-5 py-2.5">
              <Link href={`/admin/leads?propertyId=${relations.id}`} className="text-[0.68rem] text-ink-500 hover:text-obsidian">
                Open the lead pipeline →
              </Link>
            </div>
          </AdminCard>

          <AdminCard title="Viewings" bodyClassName="p-0">
            {visits.rows.length === 0 ? (
              <p className="px-5 py-6 text-[0.76rem] text-ink-400">No viewing requests.</p>
            ) : (
              <ul className="divide-y divide-ink-900/[0.07]">
                {visits.rows.map((visit) => (
                  <li key={visit.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.76rem]">
                    <div className="min-w-0">
                      <p className="truncate text-obsidian">{visit.name}</p>
                      <p className="truncate text-[0.66rem] text-ink-400">{formatDateTime(visit.preferredAt)}</p>
                    </div>
                    <span className="text-[0.65rem] text-ink-500">{formatStatus(visit.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        </div>

        <div className="space-y-6">
          <AdminCard title="Availability" description="Availability is commercial state; it never hides the home.">
            {canStatus ? <StatusControl property={relations} /> : <p className="text-[0.78rem] text-ink-500">Read-only for your role.</p>}
          </AdminCard>

          <AdminCard title="Publication" description="Control whether this home appears on the public site.">
            {canEdit ? <PublicationControl property={relations} /> : <p className="text-[0.78rem] text-ink-500">Read-only for your role.</p>}
          </AdminCard>

          {relations.publication === "archived" && canArchive && (
            <AdminCard title="Archived" description="Archived homes are hidden and excluded from the viewer.">
              <InlineAction action={restorePropertyAction} fields={{ propertyId: relations.id }} label="Restore to draft" />
            </AdminCard>
          )}

          <AdminCard title="Position" description="Coordinates are stored in metres on the site grid.">
            {relations.position ? (
              <dl className="grid grid-cols-2 gap-3 text-[0.75rem]">
                <div>
                  <dt className="text-ink-400">Draft x / z</dt>
                  <dd className="tabular">
                    {relations.position.x.toFixed(1)} / {relations.position.z.toFixed(1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-400">Rotation</dt>
                  <dd className="tabular">{relations.position.rotationY}°</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Published</dt>
                  <dd className="tabular">
                    {relations.position.publishedX.toFixed(1)} / {relations.position.publishedZ.toFixed(1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-400">Draft edited</dt>
                  <dd>{relations.position.draftUpdatedAt ? formatDate(relations.position.draftUpdatedAt) : "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-[0.76rem] text-ink-400">No placement recorded.</p>
            )}
          </AdminCard>

          <AdminCard title="Reservations" bodyClassName="p-0">
            {relations.reservations.length === 0 ? (
              <p className="px-5 py-5 text-[0.75rem] text-ink-400">No reservations.</p>
            ) : (
              <ul className="divide-y divide-ink-900/[0.07]">
                {relations.reservations.map((reservation) => (
                  <li key={reservation.id} className="px-5 py-2.5 text-[0.75rem]">
                    <div className="flex items-center justify-between">
                      <span className="text-obsidian">{formatStatus(reservation.status)}</span>
                      <span className="tabular text-[0.7rem] text-ink-500">{formatCurrency(reservation.depositCents, relations.currency)}</span>
                    </div>
                    <p className="text-[0.65rem] text-ink-400">
                      {reservation.reservedUntil ? `Until ${formatDate(reservation.reservedUntil)}` : "No expiry set"} · created {formatDate(reservation.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          <AdminCard title="History" bodyClassName="p-0">
            {activity.length === 0 ? (
              <p className="px-5 py-5 text-[0.75rem] text-ink-400">No activity recorded.</p>
            ) : (
              <ul className="divide-y divide-ink-900/[0.07]">
                {activity.map((entry) => (
                  <li key={entry.id} className="px-5 py-2.5">
                    <p className="text-[0.72rem] leading-snug text-ink-700">{entry.summary}</p>
                    <p className="text-[0.62rem] text-ink-400">
                      {entry.actorEmail ?? "system"} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        </div>
      </div>
    </>
  );
}
