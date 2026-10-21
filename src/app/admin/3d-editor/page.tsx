import { getDb } from "@/lib/db";
import { getSceneAdmin, listAssets, listProperties } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/constants";
import { SceneEditor, type EditorProperty } from "@/components/admin/SceneEditor";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "3D masterplan" };

export default async function SceneEditorPage() {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  const [scene, properties, assets] = await Promise.all([
    getSceneAdmin(db),
    listProperties(db, { includeArchived: true, pageSize: 100 }),
    listAssets(db),
  ]);

  const positions = new Map(scene.positions.map((position) => [position.propertyId, position]));
  const editorProperties: EditorProperty[] = properties.rows.map((property) => {
    const position = positions.get(property.id);
    return {
      id: property.id,
      code: property.code,
      title: property.title,
      typology: property.typology,
      status: property.status,
      publication: property.publication,
      x: position?.x ?? 0,
      z: position?.z ?? 0,
      rotationY: position?.rotationY ?? 0,
      publishedX: position?.publishedX ?? 0,
      publishedZ: position?.publishedZ ?? 0,
      publishedRotationY: position?.publishedRotationY ?? 0,
      draftUpdatedAt: position?.draftUpdatedAt ?? null,
    };
  });

  const canDraft = session ? can(session.user.role, "scene:edit-draft") : false;
  const canPublish = session ? can(session.user.role, "scene:publish") : false;
  const models = assets.filter((asset) => asset.publication === "published" && asset.validation === "validated").length;

  return (
    <>
      <PageHeader
        eyebrow="Masterplan"
        title="3D editor"
        description="Move homes on the site grid, save a draft, then publish. The public viewer only ever renders published coordinates."
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 text-[0.7rem] text-ink-500">
        <span>
          {scene.positions.length} placements · {models} validated model{models === 1 ? "" : "s"} available
        </span>
        <span>Last published: {scene.lastPublishedAt ? formatDateTime(scene.lastPublishedAt) : "never"}</span>
        {scene.isDirty && <span className="rounded-full border border-clay-500/60 bg-clay-500/10 px-2 py-0.5 text-clay-700">Draft differs from published</span>}
      </div>

      {canDraft ? (
        <SceneEditor
          properties={editorProperties}
          canPublish={canPublish}
          publishedAt={scene.lastPublishedAt}
          publishedBy={scene.lastPublishedBy}
        />
      ) : (
        <AdminCard title="Read-only access">
          <p className="text-[0.8rem] text-ink-500">Your role can view the masterplan but not edit placements. Ask an administrator for manager access.</p>
        </AdminCard>
      )}
    </>
  );
}
