import Link from "next/link";
import { getDb } from "@/lib/db";
import { listAssets, listProperties, listPropertyMedia } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { ASSET_ROLE_LABELS, can } from "@/lib/domain/constants";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { AssetUploadForm } from "@/components/admin/AssetUploadForm";
import { InlineAction } from "@/components/admin/InlineAction";
import { setAssetStateAction } from "@/lib/actions/admin";
import { formatDate, formatStatus } from "@/lib/format";
import { Chip } from "@/components/ui/badge";

export const metadata = { title: "Media & assets" };

export default async function AdminMediaPage() {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  const [assets, media, properties] = await Promise.all([listAssets(db), listPropertyMedia(db), listProperties(db, { includeArchived: true, pageSize: 100 })]);
  const propertyById = new Map(properties.rows.map((property) => [property.id, property]));
  const byProperty = new Map<string, typeof media>();
  for (const item of media) {
    const list = byProperty.get(item.propertyId) ?? [];
    list.push(item);
    byProperty.set(item.propertyId, list);
  }
  const canManage = session ? can(session.user.role, "media:upload") : false;
  const canDelete = session ? can(session.user.role, "media:delete") : false;

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Media & assets"
        description="Photography for the public site and the 3D asset pipeline. Every model is validated before it can be attached to a home."
      />

      <div className="space-y-6">
        <AdminCard title="3D assets" description={`${assets.length} registered · ${assets.filter((a) => a.publication === "published").length} published`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[0.76rem]">
              <thead className="border-b border-ink-900/10 text-[0.6rem] uppercase tracking-[0.12em] text-ink-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="px-4 py-2.5 font-medium">Format</th>
                  <th className="px-4 py-2.5 font-medium">Validation</th>
                  <th className="px-4 py-2.5 font-medium">Publication</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/[0.07]">
                {assets.map((asset) => (
                  <tr key={asset.id} className="align-top hover:bg-white/60">
                    <td className="px-5 py-3">
                      <p className="font-mono text-[0.7rem] text-obsidian">{asset.code}</p>
                      <p className="text-[0.62rem] text-ink-400">v{asset.version} · {formatDate(asset.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{ASSET_ROLE_LABELS[asset.role]}</td>
                    <td className="px-4 py-3 text-ink-500">{asset.propertyId ? propertyById.get(asset.propertyId)?.code ?? "—" : asset.typology ?? "Any"}</td>
                    <td className="px-4 py-3 uppercase text-ink-500">{asset.format}</td>
                    <td className="px-4 py-3">
                      <Chip tone={asset.validation === "validated" ? "sage" : asset.validation === "rejected" ? "alert" : "neutral"}>
                        {formatStatus(asset.validation)}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={asset.publication === "published" ? "sage" : "neutral"}>{formatStatus(asset.publication)}</Chip>
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <div className="flex flex-wrap gap-1.5">
                          {asset.validation !== "validated" && (
                            <InlineAction action={setAssetStateAction} fields={{ assetId: asset.id, validation: "validated", publication: asset.publication }} label="Validate" size="sm" />
                          )}
                          {asset.validation === "validated" && asset.publication !== "published" && (
                            <InlineAction action={setAssetStateAction} fields={{ assetId: asset.id, validation: "validated", publication: "published" }} label="Publish" size="sm" />
                          )}
                          {asset.publication === "published" && (
                            <InlineAction action={setAssetStateAction} fields={{ assetId: asset.id, validation: asset.validation, publication: "archived" }} label="Archive" size="sm" variant="ghost" />
                          )}
                        </div>
                      ) : (
                        <span className="text-[0.65rem] text-ink-400">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[0.76rem] text-ink-400">
                      No assets registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        {canManage && (
          <AdminCard title="Upload a model" description="Registered as a draft; validate before publishing.">
            <AssetUploadForm properties={properties.rows} />
          </AdminCard>
        )}

        <AdminCard title="Photography" description={`${media.length} images across ${byProperty.size} homes`} bodyClassName="p-0">
          {media.length === 0 ? (
            <p className="px-5 py-8 text-[0.76rem] text-ink-400">No photography uploaded. Gallery images come from the seeded demonstration set.</p>
          ) : (
            <ul className="divide-y divide-ink-900/[0.07]">
              {[...byProperty.entries()]
                .sort(([a], [b]) => (propertyById.get(a)?.code ?? "").localeCompare(propertyById.get(b)?.code ?? "", undefined, { numeric: true }))
                .map(([propertyId, items]) => {
                  const property = propertyById.get(propertyId);
                  return (
                    <li key={propertyId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <Link href={`/admin/properties/${propertyId}`} className="text-[0.78rem] text-obsidian hover:underline">
                          {property ? `${property.code} · ${property.title}` : "Unknown property"}
                        </Link>
                        <p className="text-[0.64rem] text-ink-400">
                          {items.length} item{items.length === 1 ? "" : "s"} · {items.map((i) => i.kind).join(", ")}
                        </p>
                      </div>
                      <Link href={`/admin/properties/${propertyId}`} className="text-[0.68rem] text-ink-500 hover:text-obsidian">
                        Manage →
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </AdminCard>

        <p className="text-[0.66rem] leading-relaxed text-ink-400">
          Files are served from the application origin. {canDelete ? "Administrators can delete photography from a property page." : "Only administrators can delete media."}
        </p>
      </div>
    </>
  );
}
