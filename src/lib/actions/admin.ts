"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  addPropertyMedia,
  archiveProperty,
  assignModelToProperty,
  changePropertyStatus,
  createProperty,
  deletePropertyMedia,
  getAsset,
  getProperty,
  logActivity,
  publishScene,
  purgeLead,
  registerAsset,
  resetPlacementDraft,
  restoreProperty,
  savePlacementDraft,
  setPublication,
  updateLead,
  updateProperty,
  updateSettings,
  updateVisit,
} from "@/lib/db/repositories";
import { setProfileActive, setProfileRole } from "@/lib/db/auth-repo";
import { getSession } from "@/lib/auth/session";
import { can, type Capability } from "@/lib/domain/constants";
import { storeUpload } from "@/lib/storage";
import {
  archivePropertySchema,
  assetInputSchema,
  leadUpdateSchema,
  mediaInputSchema,
  placementSchema,
  propertyInputSchema,
  publicationChangeSchema,
  settingsSchema,
  statusChangeSchema,
  visitUpdateSchema,
  zodFieldErrors,
} from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
import { DomainError, SceneValidationError } from "@/lib/domain/errors";
import { featuresFromForm, formToObject } from "./helpers";
import type { Actor } from "@/lib/db/repositories";

export type AdminState = ActionResult<{ message: string; warnings?: string[] }> | null;

async function actorFor(capability: Capability): Promise<{ ok: true; actor: Actor } | { ok: false; state: AdminState }> {
  const session = await getSession();
  if (!session) return { ok: false, state: { ok: false, error: "Your session has expired. Please sign in again." } };
  if (!can(session.user.role, capability)) {
    return { ok: false, state: { ok: false, error: `Your role (${session.user.role}) is not permitted to perform this action.` } };
  }
  return { ok: true, actor: { id: session.user.id, email: session.user.email, role: session.user.role } };
}

function revalidateAll(slug?: string) {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/properties");
  if (slug) revalidatePath(`/properties/${slug}`);
}

function toState(error: unknown): AdminState {
  if (error instanceof SceneValidationError) {
    return {
      ok: false,
      error: error.message,
      issues: error.issues.map((issue) => ({
        objectId: issue.objectId,
        severity: issue.severity,
        message: issue.message,
        suggestion: issue.suggestion,
      })),
    };
  }
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error("[HAVEN] admin action failed:", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/* ── Properties ───────────────────────────────────────────────────────── */

export async function createPropertyAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:create");
  if (!auth.ok) return auth.state;
  const raw = formToObject(formData);
  raw.features = featuresFromForm(formData);
  const parsed = propertyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  try {
    const db = await getDb();
    const property = await createProperty(db, auth.actor, parsed.data);
    revalidateAll(property.slug);
    return { ok: true, data: { message: `${property.code} created as a hidden draft.` } };
  } catch (error) {
    return toState(error);
  }
}

export async function updatePropertyAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:update");
  if (!auth.ok) return auth.state;
  const id = String(formData.get("propertyId") ?? "");
  if (!id) return { ok: false, error: "Missing property id." };
  const raw = formToObject(formData);
  raw.features = featuresFromForm(formData);
  const parsed = propertyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  try {
    const db = await getDb();
    const property = await updateProperty(db, auth.actor, id, parsed.data);
    revalidateAll(property.slug);
    return { ok: true, data: { message: "Property saved." } };
  } catch (error) {
    return toState(error);
  }
}

export async function changeStatusAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:status");
  if (!auth.ok) return auth.state;
  const raw = formToObject(formData);
  if (!raw.reason) delete raw.reason;
  if (!raw.leadId) delete raw.leadId;
  if (!raw.reservedUntil) delete raw.reservedUntil;
  if (!raw.depositEuros) delete raw.depositEuros;
  const parsed = statusChangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status change." };
  }
  try {
    const db = await getDb();
    const property = await changePropertyStatus(db, auth.actor, parsed.data);
    revalidateAll(property.slug);
    return { ok: true, data: { message: `Status updated to ${property.status}.` } };
  } catch (error) {
    return toState(error);
  }
}

export async function publicationAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:update");
  if (!auth.ok) return auth.state;
  const raw = formToObject(formData);
  if (raw.publication === "archived") {
    const archived = archivePropertySchema.safeParse(raw);
    if (!archived.success) return { ok: false, error: "Could not archive this property." };
    return archiveAction(archived.data.propertyId);
  }
  const parsed = publicationChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid publication state." };
  try {
    const db = await getDb();
    const property = await setPublication(db, auth.actor, parsed.data.propertyId, parsed.data.publication);
    revalidateAll(property.slug);
    return { ok: true, data: { message: `Publication set to ${property.publication}.` } };
  } catch (error) {
    return toState(error);
  }
}

async function archiveAction(propertyId: string): Promise<AdminState> {
  const auth = await actorFor("property:archive");
  if (!auth.ok) return auth.state;
  try {
    const db = await getDb();
    const property = await archiveProperty(db, auth.actor, propertyId);
    revalidateAll(property.slug);
    return { ok: true, data: { message: "Property archived. Historical records were preserved." } };
  } catch (error) {
    return toState(error);
  }
}

export async function restorePropertyAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:archive");
  if (!auth.ok) return auth.state;
  const id = String(formData.get("propertyId") ?? "");
  try {
    const db = await getDb();
    const property = await restoreProperty(db, auth.actor, id);
    revalidateAll(property.slug);
    return { ok: true, data: { message: "Property restored to draft." } };
  } catch (error) {
    return toState(error);
  }
}

/* ── Media ────────────────────────────────────────────────────────────── */

export async function uploadMediaAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("media:upload");
  if (!auth.ok) return auth.state;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  const raw = {
    propertyId: String(formData.get("propertyId") ?? ""),
    kind: String(formData.get("kind") ?? "gallery"),
    url: "pending",
    caption: String(formData.get("caption") ?? "") || undefined,
    altText: String(formData.get("altText") ?? "") || undefined,
  };
  const parsed = mediaInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid media data." };
  try {
    const db = await getDb();
    const property = await getProperty(db, parsed.data.propertyId);
    if (!property) return { ok: false, error: "Property not found." };
    const stored = await storeUpload(db, file, { prefix: "media" });
    await addPropertyMedia(db, auth.actor, {
      propertyId: parsed.data.propertyId,
      kind: parsed.data.kind,
      url: stored.url,
      caption: parsed.data.caption,
      altText: parsed.data.altText,
    });
    revalidateAll(property.slug);
    return { ok: true, data: { message: "Media uploaded and attached to the property." } };
  } catch (error) {
    return toState(error);
  }
}

export async function deleteMediaAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("media:delete");
  if (!auth.ok) return auth.state;
  const mediaId = String(formData.get("mediaId") ?? "");
  try {
    const db = await getDb();
    const rows = await db.select("property_media", { where: { id: mediaId }, limit: 1 });
    await deletePropertyMedia(db, auth.actor, mediaId);
    const propertyId = rows[0] ? String(rows[0].property_id) : null;
    if (propertyId) {
      const property = await getProperty(db, propertyId);
      revalidateAll(property?.slug);
    } else {
      revalidateAll();
    }
    return { ok: true, data: { message: "Media deleted." } };
  } catch (error) {
    return toState(error);
  }
}

/* ── Scene editor ─────────────────────────────────────────────────────── */

export async function saveSceneDraftAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("scene:edit-draft");
  if (!auth.ok) return auth.state;
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { ok: false, error: "Invalid placement payload." };
  }
  const parsed = placementSchema.safeParse({ items });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid placement." };
  try {
    const db = await getDb();
    const saved = await savePlacementDraft(db, auth.actor, parsed.data.items);
    revalidateAll();
    return { ok: true, data: { message: `Draft saved for ${saved.length} placement${saved.length === 1 ? "" : "s"}.` } };
  } catch (error) {
    return toState(error);
  }
}

export async function publishSceneAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("scene:publish");
  if (!auth.ok) return auth.state;
  const expect = String(formData.get("draftDirty") ?? "false");
  if (expect === "true") {
    return { ok: false, error: "Save your draft before publishing. Unsaved changes are never published." };
  }
  // The fingerprint ties this request to the draft the operator was reviewing.
  const expectedFingerprint = String(formData.get("draftFingerprint") ?? "").trim();
  try {
    const db = await getDb();
    // The repository validates the scene inside the publish transaction; an
    // invalid scene never reaches the published columns.
    const result = await publishScene(db, auth.actor, { expectedFingerprint: expectedFingerprint || null });
    revalidateAll();
    const base = `Published ${result.published} placements.`;
    return {
      ok: true,
      data: {
        message: result.warnings.length === 0 ? base : `${base} ${result.warnings.length} recorded warning${result.warnings.length === 1 ? "" : "s"}.`,
        warnings: result.warnings,
      },
    };
  } catch (error) {
    return toState(error);
  }
}

export async function resetSceneDraftAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const auth = await actorFor("scene:edit-draft");
  if (!auth.ok) return auth.state;
  try {
    const db = await getDb();
    const positions = await resetPlacementDraft(db, auth.actor);
    revalidateAll();
    return { ok: true, data: { message: `Restored ${positions.length} published placements.` } };
  } catch (error) {
    return toState(error);
  }
}

/* ── CRM ──────────────────────────────────────────────────────────────── */

export async function updateLeadAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("lead:update");
  if (!auth.ok) return auth.state;
  const raw = formToObject(formData);
  if (!raw.assignedTo) delete raw.assignedTo;
  const parsed = leadUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid lead update." };
  try {
    const db = await getDb();
    await updateLead(db, auth.actor, parsed.data.leadId, {
      status: parsed.data.status,
      assignedTo: parsed.data.assignedTo,
      notes: parsed.data.notes,
    });
    revalidatePath("/admin/leads");
    revalidatePath("/admin");
    return { ok: true, data: { message: "Lead updated." } };
  } catch (error) {
    return toState(error);
  }
}

export async function purgeLeadAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("lead:delete");
  if (!auth.ok) return auth.state;
  const leadId = String(formData.get("leadId") ?? "");
  try {
    const db = await getDb();
    await purgeLead(db, auth.actor, leadId);
    revalidatePath("/admin/leads");
    return { ok: true, data: { message: "Lead permanently deleted." } };
  } catch (error) {
    return toState(error);
  }
}

export async function updateVisitAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("visit:update");
  if (!auth.ok) return auth.state;
  const raw = formToObject(formData) as Record<string, unknown>;
  const date = String(raw.preferredDate ?? "");
  const time = String(raw.preferredTime ?? "");
  if (date && time) {
    const iso = new Date(`${date}T${time}:00Z`);
    if (!Number.isNaN(iso.getTime())) raw.preferredAt = iso.toISOString();
  }
  delete raw.preferredDate;
  delete raw.preferredTime;
  const parsed = visitUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid visit update." };
  try {
    const db = await getDb();
    await updateVisit(db, auth.actor, parsed.data.visitId, {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes,
      preferredAt: parsed.data.preferredAt,
    });
    revalidatePath("/admin/visits");
    revalidatePath("/admin");
    return { ok: true, data: { message: "Viewing updated." } };
  } catch (error) {
    return toState(error);
  }
}

/* ── Settings & people ────────────────────────────────────────────────── */

export async function updateSettingsAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("settings:update");
  if (!auth.ok) return auth.state;
  const parsed = settingsSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  try {
    const db = await getDb();
    await updateSettings(db, auth.actor, parsed.data);
    revalidateAll();
    return { ok: true, data: { message: "Settings saved." } };
  } catch (error) {
    return toState(error);
  }
}

export async function updateProfileAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("profile:manage");
  if (!auth.ok) return auth.state;
  const profileId = String(formData.get("profileId") ?? "");
  const role = String(formData.get("role") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  if (!profileId || !["admin", "manager", "viewer"].includes(role)) return { ok: false, error: "Invalid profile update." };
  if (profileId === auth.actor.id && role !== "admin") {
    return { ok: false, error: "You cannot remove your own administrator role." };
  }
  try {
    const db = await getDb();
    await setProfileRole(db, profileId, role as "admin" | "manager" | "viewer");
    await setProfileActive(db, profileId, active);
    if (profileId !== auth.actor.id) {
      await logActivity(db, auth.actor, {
        action: "profile.updated",
        entityType: "profile",
        entityId: profileId,
        summary: `Profile role set to ${role}${active ? "" : " (deactivated)"}.`,
        metadata: { role, active },
      });
    }
    revalidatePath("/admin/settings");
    return { ok: true, data: { message: "Profile updated." } };
  } catch (error) {
    return toState(error);
  }
}

/* ── Asset pipeline ───────────────────────────────────────────────────── */

export async function uploadAssetAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("media:upload");
  if (!auth.ok) return auth.state;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a GLB file to upload." };
  const raw = formData;
  const code = String(raw.get("code") ?? "").toUpperCase();
  const role = String(raw.get("role") ?? "exterior");
  const typology = String(raw.get("typology") ?? "") || null;
  const version = String(raw.get("version") ?? "1");
  const propertyId = String(raw.get("propertyId") ?? "") || null;
  try {
    const db = await getDb();
    const stored = await storeUpload(db, file, { prefix: "models" });
    const format = stored.extension === "gltf" ? "gltf" : stored.extension === "obj" ? "obj" : "glb";
    const parsed = assetInputSchema.safeParse({
      code,
      role,
      propertyId,
      typology,
      storagePath: stored.url,
      format,
      version,
      publication: "draft",
      validation: "pending",
      widthM: raw.get("widthM") || undefined,
      depthM: raw.get("depthM") || undefined,
      heightM: raw.get("heightM") || undefined,
      originNote: String(raw.get("originNote") ?? "") || undefined,
      orientation: String(raw.get("orientation") ?? "") || undefined,
      scaleNote: String(raw.get("scaleNote") ?? "") || undefined,
      notes: String(raw.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid asset metadata." };
    }
    const asset = await registerAsset(db, auth.actor, parsed.data);
    revalidatePath("/admin/media");
    revalidatePath("/admin/3d-editor");
    return { ok: true, data: { message: `Asset ${asset.code} uploaded. It must be validated and published before assignment.` } };
  } catch (error) {
    return toState(error);
  }
}

export async function setAssetStateAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("media:upload");
  if (!auth.ok) return auth.state;
  const assetId = String(formData.get("assetId") ?? "");
  const validation = String(formData.get("validation") ?? "");
  const publication = String(formData.get("publication") ?? "");
  try {
    const db = await getDb();
    const asset = await getAsset(db, assetId);
    if (!asset) return { ok: false, error: "Asset not found." };
    const nextValidation = ["pending", "validated", "rejected"].includes(validation) ? validation : asset.validation;
    const nextPublication = ["draft", "published", "archived"].includes(publication) ? publication : asset.publication;
    if (nextPublication === "published" && nextValidation !== "validated") {
      return { ok: false, error: "Validate the asset before publishing it." };
    }
    await registerAsset(db, auth.actor, {
      code: asset.code,
      role: asset.role,
      propertyId: asset.propertyId,
      typology: asset.typology,
      storagePath: asset.storagePath,
      format: asset.format,
      version: asset.version,
      publication: nextPublication as typeof asset.publication,
      validation: nextValidation as typeof asset.validation,
      widthM: asset.widthM,
      depthM: asset.depthM,
      heightM: asset.heightM,
      originNote: asset.originNote ?? undefined,
      orientation: asset.orientation ?? undefined,
      scaleNote: asset.scaleNote ?? undefined,
      notes: asset.notes ?? undefined,
    });
    revalidatePath("/admin/media");
    revalidatePath("/admin/3d-editor");
    revalidateAll();
    return { ok: true, data: { message: `${asset.code}: validation ${nextValidation}, publication ${nextPublication}.` } };
  } catch (error) {
    return toState(error);
  }
}

export async function assignModelAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const auth = await actorFor("property:update");
  if (!auth.ok) return auth.state;
  const propertyId = String(formData.get("propertyId") ?? "");
  const role = String(formData.get("role") ?? "exterior");
  const assetId = String(formData.get("assetId") ?? "");
  if (role !== "exterior" && role !== "interior") return { ok: false, error: "Choose exterior or interior." };
  try {
    const db = await getDb();
    const property = await assignModelToProperty(db, auth.actor, { propertyId, role, assetId });
    revalidateAll(property.slug);
    return { ok: true, data: { message: `Model replaced for ${property.code}.` } };
  } catch (error) {
    return toState(error);
  }
}
