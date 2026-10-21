import { randomUUID } from "node:crypto";
import type { DataGateway, FilterValue, Row } from "./gateway";
import {
  mapActivity,
  mapAsset,
  mapLead,
  mapMedia,
  mapPosition,
  mapProperty,
  mapReservation,
  mapSettings,
  mapVisit,
} from "./mappers";
import type {
  ActivityLogEntry,
  AppSettings,
  DashboardMetrics,
  Lead,
  LeadStatus,
  MediaKind,
  ModelAsset,
  Paginated,
  Property,
  PropertyMedia,
  PropertyPosition,
  PropertyStatus,
  PropertyWithRelations,
  PublicationStatus,
  Reservation,
  Role,
  SessionUser,
  Typology,
  VisitRequest,
  VisitStatus,
} from "@/lib/domain/types";
import { can, DEMO_DISCLAIMER } from "@/lib/domain/constants";
import { canTransitionPublication, canTransitionStatus, statusTransitionError, validateStateCombination } from "@/lib/domain/transitions";
import { computeDashboardMetrics } from "@/lib/domain/metrics";
import { slugFor, SEED_UNITS } from "@/lib/domain/inventory";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { ConflictError, DomainError, NotFoundError, UnauthorizedError } from "@/lib/domain/errors";
import { normalizeRotation, SITE_BOUNDS, type PropertyInput } from "@/lib/domain/validation";
import { DEMO_SETTINGS } from "@/lib/domain/inventory";

export interface Actor {
  id: string | null;
  email: string | null;
  role: Role;
}

export function actorFromSession(user: SessionUser): Actor {
  return { id: user.id, email: user.email, role: user.role };
}

export function publicActor(): Actor {
  return { id: null, email: null, role: "viewer" };
}

function requireCapability(actor: Actor, capability: Parameters<typeof can>[1]): void {
  if (!can(actor.role, capability)) {
    throw new UnauthorizedError(`Your role (${actor.role}) is not permitted to perform this action.`);
  }
}

const nowIso = () => new Date().toISOString();

/* ── Activity / audit ─────────────────────────────────────────────────── */

export async function logActivity(
  db: DataGateway,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<ActivityLogEntry> {
  const row = await db.insert("activity_logs", {
    id: randomUUID(),
    actor_id: actor.id,
    actor_email: actor.email,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? null,
    created_at: nowIso(),
  });
  return mapActivity(row);
}

export async function listActivity(
  db: DataGateway,
  options: { limit?: number; entityType?: string; entityId?: string } = {},
): Promise<ActivityLogEntry[]> {
  const where: Record<string, FilterValue> = {};
  if (options.entityType) where.entity_type = options.entityType;
  if (options.entityId) where.entity_id = options.entityId;
  const rows = await db.select("activity_logs", {
    where,
    orderBy: [{ column: "created_at", ascending: false }],
    limit: options.limit ?? 25,
  });
  return rows.map(mapActivity);
}

/* ── Properties ───────────────────────────────────────────────────────── */

export interface ListPropertiesOptions {
  status?: PropertyStatus;
  typology?: Typology;
  publication?: PublicationStatus;
  search?: string;
  includeArchived?: boolean;
  sort?: "code" | "price" | "updated" | "title";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listProperties(
  db: DataGateway,
  options: ListPropertiesOptions = {},
): Promise<Paginated<Property>> {
  const where: Record<string, FilterValue> = {};
  if (options.status) where.status = options.status;
  if (options.typology) where.typology = options.typology;
  if (options.publication) where.publication = options.publication;
  const rows = await db.select("properties", {
    where,
    orderBy: [{ column: "sort_order", ascending: true }],
  });
  let properties = rows.map(mapProperty);
  if (!options.includeArchived) properties = properties.filter((p) => p.publication !== "archived");
  if (options.search) {
    const q = options.search.toLowerCase();
    properties = properties.filter(
      (p) => p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.features.join(" ").toLowerCase().includes(q),
    );
  }
  const dir = options.dir === "desc" ? -1 : 1;
  const sort = options.sort ?? "code";
  properties.sort((a, b) => {
    if (sort === "price") return ((a.priceCents ?? 0) - (b.priceCents ?? 0)) * dir;
    if (sort === "updated") return a.updatedAt.localeCompare(b.updatedAt) * dir;
    if (sort === "title") return a.title.localeCompare(b.title) * dir;
    return a.code.localeCompare(b.code, undefined, { numeric: true }) * dir;
  });

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 50));
  const total = properties.length;
  const sliced = properties.slice((page - 1) * pageSize, page * pageSize);
  return { rows: sliced, total, page, pageSize };
}

export async function getProperty(db: DataGateway, id: string): Promise<Property | null> {
  const rows = await db.select("properties", { where: { id }, limit: 1 });
  return rows[0] ? mapProperty(rows[0]) : null;
}

export async function getPropertyBySlug(db: DataGateway, slug: string): Promise<Property | null> {
  const rows = await db.select("properties", { where: { slug }, limit: 1 });
  return rows[0] ? mapProperty(rows[0]) : null;
}

export async function listPropertyMedia(db: DataGateway, propertyId?: string): Promise<PropertyMedia[]> {
  const rows = await db.select("property_media", {
    where: propertyId ? { property_id: propertyId } : undefined,
    orderBy: [{ column: "sort_order", ascending: true }],
  });
  return rows.map(mapMedia);
}

export async function listPropertyPositions(db: DataGateway): Promise<PropertyPosition[]> {
  const rows = await db.select("property_positions");
  return rows.map(mapPosition);
}

export async function getPropertyRelations(db: DataGateway, id: string): Promise<PropertyWithRelations | null> {
  const property = await getProperty(db, id);
  if (!property) return null;
  const [media, positions, reservations] = await Promise.all([
    listPropertyMedia(db, id),
    db.select("property_positions", { where: { property_id: id }, limit: 1 }),
    db.select("reservations", { where: { property_id: id }, orderBy: [{ column: "created_at", ascending: false }] }),
  ]);
  return {
    ...property,
    media,
    position: positions[0] ? mapPosition(positions[0]) : null,
    reservations: reservations.map(mapReservation),
  };
}

export async function listPublicProperties(db: DataGateway): Promise<Property[]> {
  const rows = await db.select("properties", {
    where: { publication: "published", status: { neq: "hidden" } },
    orderBy: [{ column: "sort_order", ascending: true }],
  });
  return rows.map(mapProperty);
}

export interface PublicSceneEntry {
  property: Property;
  position: PropertyPosition;
  media: PropertyMedia[];
}

/** Published scene: only properties explicitly published and not archived. */
export async function getPublishedScene(db: DataGateway): Promise<PublicSceneEntry[]> {
  const [properties, positions, media] = await Promise.all([
    db.select("properties", { where: { publication: "published" } }),
    db.select("property_positions"),
    db.select("property_media", { orderBy: [{ column: "sort_order", ascending: true }] }),
  ]);
  const posMap = new Map(positions.map((row) => [String(row.property_id), mapPosition(row)]));
  const mediaMap = new Map<string, PropertyMedia[]>();
  for (const row of media) {
    const item = mapMedia(row);
    mediaMap.set(item.propertyId, [...(mediaMap.get(item.propertyId) ?? []), item]);
  }
  return properties
    .map(mapProperty)
    .filter((p) => p.publication === "published")
    .map((property) => {
      const position = posMap.get(property.id);
      if (!position) return null;
      return { property, position, media: mediaMap.get(property.id) ?? [] };
    })
    .filter((entry): entry is PublicSceneEntry => entry !== null);
}

function defaultSlot(taken: Array<{ x: number; z: number }>): { x: number; z: number } {
  const candidates = SEED_UNITS.map((u) => ({ x: u.position.x, z: u.position.z }));
  candidates.push({ x: 0, z: 0 }, { x: 0, z: -38 }, { x: 42, z: 40 }, { x: -44, z: -30 });
  for (const candidate of candidates) {
    if (!taken.some((t) => Math.hypot(t.x - candidate.x, t.z - candidate.z) < 9)) return candidate;
  }
  return { x: 0, z: 0 };
}

function propertyRowFromInput(input: PropertyInput, existing?: Property): Row {
  return {
    code: input.code,
    title: input.title,
    typology: input.typology,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    parking_spaces: input.parkingSpaces,
    usable_area_m2: input.usableAreaM2,
    outdoor_area_m2: input.outdoorAreaM2,
    plot_area_m2: input.plotAreaM2,
    price_cents: input.priceEuros === null ? null : input.priceEuros * 100,
    currency: input.currency,
    publication: input.publication,
    description: input.description || null,
    features: input.features,
    exterior_model_ref: input.exteriorModelRef || existing?.exteriorModelRef || `procedural:exterior:${input.typology}@1`,
    interior_model_ref: input.interiorModelRef || existing?.interiorModelRef || `procedural:interior:${input.typology}@1`,
    floor_plan_ref: input.floorPlanRef || existing?.floorPlanRef || `procedural:plan:${input.typology}@1`,
    updated_at: nowIso(),
  };
}

function assertNoUniqueViolation(error: unknown, message: string): never {
  const text = error instanceof Error ? error.message : String(error);
  if (/UNIQUE|duplicate key/i.test(text)) throw new ConflictError(message);
  throw error;
}

export async function createProperty(db: DataGateway, actor: Actor, input: PropertyInput): Promise<Property> {
  requireCapability(actor, "property:create");
  const existing = await listProperties(db, { includeArchived: true, pageSize: 100 });
  if (existing.rows.some((p) => p.code.toUpperCase() === input.code)) {
    throw new ConflictError(`Property code ${input.code} is already in use.`);
  }
  const id = randomUUID();
  const slug = slugFor(input.code, input.title);
  if (existing.rows.some((p) => p.slug === slug)) throw new ConflictError("A property with this title already exists.");
  const created = await db.transaction(async (tx) => {
    const row = await tx.insert("properties", {
      id,
      ...propertyRowFromInput(input),
      slug,
      status: "hidden",
      is_demo: 1,
      sort_order: existing.rows.length + 1,
      created_at: nowIso(),
      updated_by: actor.id,
      archived_at: null,
    });
    const taken = await tx.select("property_positions");
    const placed = defaultSlot(taken.map((p) => ({ x: Number(p.x), z: Number(p.z) })));
    await tx.insert("property_positions", {
      property_id: id,
      x: placed.x,
      z: placed.z,
      rotation_y: 0,
      published_x: placed.x,
      published_z: placed.z,
      published_rotation_y: 0,
      draft_updated_at: null,
      published_at: null,
      updated_by: actor.id,
    });
    await logActivity(tx, actor, {
      action: "property.created",
      entityType: "property",
      entityId: id,
      summary: `Created ${input.code} · ${input.title} (${input.typology}). New properties start hidden.`,
      metadata: { code: input.code, typology: input.typology },
    });
    return mapProperty(row);
  });
  return created;
}

export async function updateProperty(db: DataGateway, actor: Actor, id: string, input: PropertyInput): Promise<Property> {
  requireCapability(actor, "property:update");
  const current = await getProperty(db, id);
  if (!current) throw new NotFoundError("Property");
  if (current.publication === "archived") throw new DomainError("Archived properties are read-only. Restore the property first.");

  const conflict = await listProperties(db, { includeArchived: true, pageSize: 100 });
  if (conflict.rows.some((p) => p.id !== id && p.code.toUpperCase() === input.code)) {
    throw new ConflictError(`Property code ${input.code} is already in use.`);
  }

  if (input.publication !== current.publication) {
    if (!canTransitionPublication(current.publication, input.publication)) {
      throw new DomainError(`Cannot move publication from ${current.publication} to ${input.publication}. Use the archive action instead.`);
    }
  }
  const stateError = validateStateCombination(current.status, input.publication);
  if (stateError) throw new DomainError(stateError);

  const { publication: _publication, ...rest } = propertyRowFromInput(input, current);
  void _publication;
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update("properties", { id }, { ...rest, updated_by: actor.id });
    const property = mapProperty(rows[0]!);
    const changed = diffFields(current, property);
    await logActivity(tx, actor, {
      action: "property.updated",
      entityType: "property",
      entityId: id,
      summary: `Updated ${property.code} · ${property.title} (${changed.length} field${changed.length === 1 ? "" : "s"}).`,
      metadata: { changed, publication: property.publication },
    });
    if (input.publication !== current.publication) {
      const pubRows = await tx.update("properties", { id }, { publication: input.publication, updated_by: actor.id, updated_at: nowIso() });
      await logActivity(tx, actor, {
        action: "property.publication_changed",
        entityType: "property",
        entityId: id,
        summary: `${property.code} publication: ${current.publication} → ${input.publication}.`,
        metadata: { from: current.publication, to: input.publication },
      });
      return mapProperty(pubRows[0]!);
    }
    return property;
  });
  return updated;
}

function diffFields(before: Property, after: Property): string[] {
  const keys: Array<keyof Property> = [
    "code",
    "title",
    "typology",
    "bedrooms",
    "bathrooms",
    "parkingSpaces",
    "usableAreaM2",
    "outdoorAreaM2",
    "plotAreaM2",
    "priceCents",
    "currency",
    "description",
    "features",
    "exteriorModelRef",
    "interiorModelRef",
    "floorPlanRef",
  ];
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export interface StatusChangeInput {
  propertyId: string;
  status: PropertyStatus;
  reason?: string;
  reservedUntil?: string;
  leadId?: string;
  depositEuros?: number;
}

export async function changePropertyStatus(db: DataGateway, actor: Actor, input: StatusChangeInput): Promise<Property> {
  requireCapability(actor, "property:status");
  const current = await getProperty(db, input.propertyId);
  if (!current) throw new NotFoundError("Property");
  if (current.publication === "archived") throw new DomainError("Restore the property before changing its commercial status.");
  const transitionError = statusTransitionError(actor.role, current.status, input.status);
  if (transitionError) throw new DomainError(transitionError);
  if (input.status === "hidden" && current.publication === "published") {
    // Keep the invariant published ⇏ hidden: hide also unpublishes.
  }

  const updated = await db.transaction(async (tx) => {
    if (input.status === "reserved") {
      const active = await tx.select("reservations", { where: { property_id: current.id, status: "active" } });
      for (const reservation of active) {
        await tx.update("reservations", { id: reservation.id }, { status: "cancelled", released_at: nowIso(), updated_at: nowIso() });
      }
      await tx.insert("reservations", {
        id: randomUUID(),
        property_id: current.id,
        lead_id: input.leadId ?? null,
        status: "active",
        reserved_until: input.reservedUntil ?? new Date(Date.now() + 21 * 86_400_000).toISOString(),
        deposit_cents: input.depositEuros != null ? Math.round(input.depositEuros * 100) : null,
        notes: input.reason ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
        released_at: null,
        created_by: actor.id,
      });
    } else {
      const active = await tx.select("reservations", { where: { property_id: current.id, status: "active" } });
      for (const reservation of active) {
        await tx.update("reservations", { id: reservation.id }, {
          status: input.status === "sold" ? "converted" : "cancelled",
          released_at: nowIso(),
          updated_at: nowIso(),
        });
      }
    }

    const patch: Row = { status: input.status, updated_at: nowIso(), updated_by: actor.id };
    if (input.status === "hidden" && current.publication === "published") patch.publication = "draft";
    if (input.status === "available" && current.publication === "draft" && current.status === "sold") {
      patch.publication = "draft";
    }
    const rows = await tx.update("properties", { id: current.id }, patch);
    await logActivity(tx, actor, {
      action: "property.status_changed",
      entityType: "property",
      entityId: current.id,
      summary: `${current.code} · ${current.title}: ${current.status} → ${input.status}${input.reason ? ` — ${input.reason}` : ""}`,
      metadata: { from: current.status, to: input.status, reason: input.reason ?? null },
    });
    return mapProperty(rows[0]!);
  });
  return updated;
}

export async function setPublication(
  db: DataGateway,
  actor: Actor,
  propertyId: string,
  publication: PublicationStatus,
): Promise<Property> {
  requireCapability(actor, "property:update");
  const current = await getProperty(db, propertyId);
  if (!current) throw new NotFoundError("Property");
  if (publication === "archived") return archiveProperty(db, actor, propertyId);
  if (!canTransitionPublication(current.publication, publication)) {
    throw new DomainError(`Cannot move publication from ${current.publication} to ${publication}.`);
  }
  const stateError = validateStateCombination(current.status, publication);
  if (stateError) throw new DomainError(stateError);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update("properties", { id: propertyId }, { publication, updated_at: nowIso(), updated_by: actor.id });
    await logActivity(tx, actor, {
      action: "property.publication_changed",
      entityType: "property",
      entityId: propertyId,
      summary: `${current.code} publication: ${current.publication} → ${publication}.`,
      metadata: { from: current.publication, to: publication },
    });
    return mapProperty(rows[0]!);
  });
  return updated;
}

export async function archiveProperty(db: DataGateway, actor: Actor, propertyId: string): Promise<Property> {
  requireCapability(actor, "property:archive");
  const current = await getProperty(db, propertyId);
  if (!current) throw new NotFoundError("Property");
  if (current.publication === "archived") return current;
  const updated = await db.transaction(async (tx) => {
    const patch: Row = {
      publication: "archived",
      updated_at: nowIso(),
      updated_by: actor.id,
      archived_at: nowIso(),
    };
    if (current.status !== "sold") patch.status = "hidden";
    const rows = await tx.update("properties", { id: propertyId }, patch);
    const active = await tx.select("reservations", { where: { property_id: propertyId, status: "active" } });
    for (const reservation of active) {
      await tx.update("reservations", { id: reservation.id }, { status: "cancelled", released_at: nowIso(), updated_at: nowIso() });
    }
    await logActivity(tx, actor, {
      action: "property.archived",
      entityType: "property",
      entityId: propertyId,
      summary: `Archived ${current.code} · ${current.title}. Historical leads and visits were preserved.`,
      metadata: { status: current.status },
    });
    return mapProperty(rows[0]!);
  });
  return updated;
}

export async function restoreProperty(db: DataGateway, actor: Actor, propertyId: string): Promise<Property> {
  requireCapability(actor, "property:archive");
  const current = await getProperty(db, propertyId);
  if (!current) throw new NotFoundError("Property");
  if (current.publication !== "archived") throw new DomainError("This property is not archived.");
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update("properties", { id: propertyId }, {
      publication: "draft",
      archived_at: null,
      updated_at: nowIso(),
      updated_by: actor.id,
    });
    await logActivity(tx, actor, {
      action: "property.restored",
      entityType: "property",
      entityId: propertyId,
      summary: `Restored ${current.code} to draft (hidden until republished).`,
      metadata: {},
    });
    return mapProperty(rows[0]!);
  });
  return updated;
}

/* ── Media ────────────────────────────────────────────────────────────── */

export async function addPropertyMedia(
  db: DataGateway,
  actor: Actor,
  input: { propertyId: string; kind: MediaKind; url: string; caption?: string; altText?: string },
): Promise<PropertyMedia> {
  requireCapability(actor, "media:upload");
  const property = await getProperty(db, input.propertyId);
  if (!property) throw new NotFoundError("Property");
  const existing = await listPropertyMedia(db, input.propertyId);
  const row = await db.insert("property_media", {
    id: randomUUID(),
    property_id: input.propertyId,
    kind: input.kind,
    url: input.url,
    asset_id: null,
    caption: input.caption ?? null,
    alt_text: input.altText ?? null,
    width: null,
    height: null,
    sort_order: existing.length,
    created_at: nowIso(),
  });
  await logActivity(db, actor, {
    action: "media.added",
    entityType: "property",
    entityId: input.propertyId,
    summary: `Added ${input.kind} media to ${property.code}.`,
    metadata: { url: input.url },
  });
  return mapMedia(row);
}

export async function deletePropertyMedia(db: DataGateway, actor: Actor, mediaId: string): Promise<void> {
  requireCapability(actor, "media:delete");
  const rows = await db.select("property_media", { where: { id: mediaId }, limit: 1 });
  if (!rows[0]) throw new NotFoundError("Media");
  const media = mapMedia(rows[0]);
  await db.remove("property_media", { id: mediaId });
  await logActivity(db, actor, {
    action: "media.deleted",
    entityType: "property",
    entityId: media.propertyId,
    summary: `Deleted media ${media.id}.`,
    metadata: { url: media.url },
  });
}

/* ── Scene editor ─────────────────────────────────────────────────────── */

export interface PlacementItem {
  propertyId: string;
  x: number;
  z: number;
  rotationY: number;
}

function footprintExtents(typology: Typology, rotationDeg: number) {
  const plan = getFloorPlan(typology);
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const hx = (plan.widthM / 2) * c + (plan.depthM / 2) * s;
  const hz = (plan.widthM / 2) * s + (plan.depthM / 2) * c;
  return { hx, hz };
}

export async function savePlacementDraft(
  db: DataGateway,
  actor: Actor,
  items: PlacementItem[],
): Promise<PropertyPosition[]> {
  requireCapability(actor, "scene:edit-draft");
  const all = await listProperties(db, { includeArchived: false, pageSize: 100 });
  const byId = new Map(all.rows.map((p) => [p.id, p]));
  for (const item of items) {
    if (!byId.has(item.propertyId)) throw new DomainError(`Unknown property in placement payload: ${item.propertyId}.`);
    if (item.x < SITE_BOUNDS.minX || item.x > SITE_BOUNDS.maxX || item.z < SITE_BOUNDS.minZ || item.z > SITE_BOUNDS.maxZ) {
      throw new DomainError("A property was placed outside the site boundary.");
    }
  }

  const merged = new Map<string, PlacementItem>();
  const existing = await listPropertyPositions(db);
  for (const pos of existing) {
    merged.set(pos.propertyId, { propertyId: pos.propertyId, x: pos.x, z: pos.z, rotationY: pos.rotationY });
  }
  for (const item of items) merged.set(item.propertyId, item);

  // Simple, predictable overlap test between rotated footprints.
  const list = [...merged.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const pa = byId.get(a.propertyId);
      const pb = byId.get(b.propertyId);
      if (!pa || !pb) continue;
      const ea = footprintExtents(pa.typology, a.rotationY);
      const eb = footprintExtents(pb.typology, b.rotationY);
      const gap = 1.0;
      const overlapX = Math.abs(a.x - b.x) < ea.hx + eb.hx + gap;
      const overlapZ = Math.abs(a.z - b.z) < ea.hz + eb.hz + gap;
      if (overlapX && overlapZ) {
        throw new DomainError(`${pa.code} and ${pb.code} would overlap. Move one of them before saving.`);
      }
    }
  }

  return db.transaction(async (tx) => {
    const saved: PropertyPosition[] = [];
    for (const item of items) {
      const rows = await tx.update(
        "property_positions",
        { property_id: item.propertyId },
        {
          x: Number(item.x.toFixed(2)),
          z: Number(item.z.toFixed(2)),
          rotation_y: normalizeRotation(item.rotationY),
          draft_updated_at: nowIso(),
          updated_by: actor.id,
        },
      );
      if (rows[0]) saved.push(mapPosition(rows[0]));
    }
    await logActivity(tx, actor, {
      action: "scene.draft_saved",
      entityType: "scene",
      entityId: null,
      summary: `Saved draft placement for ${items.length} propert${items.length === 1 ? "y" : "ies"} (not yet published).`,
      metadata: { items },
    });
    return saved;
  });
}

export interface SceneAdminState {
  positions: PropertyPosition[];
  isDirty: boolean;
  lastPublishedAt: string | null;
  lastPublishedBy: string | null;
}

/** Admin view of the masterplan: draft coordinates plus published baseline. */
export async function getSceneAdmin(db: DataGateway): Promise<SceneAdminState> {
  const [positions, settings] = await Promise.all([listPropertyPositions(db), getSettings(db)]);
  // Compare coordinates rather than timestamps: restoring or reverting a draft
  // can touch draft_updated_at without changing where the house actually is.
  const isDirty = positions.some(
    (pos) => pos.x !== pos.publishedX || pos.z !== pos.publishedZ || pos.rotationY !== pos.publishedRotationY,
  );
  return {
    positions,
    isDirty,
    lastPublishedAt: settings.scenePublishedAt ?? null,
    lastPublishedBy: settings.scenePublishedBy ?? null,
  };
}

export async function publishScene(db: DataGateway, actor: Actor): Promise<{ published: number; publishedAt: string }> {
  requireCapability(actor, "scene:publish");
  const publishedAt = nowIso();
  return db.transaction(async (tx) => {
    const positions = await tx.select("property_positions");
    for (const row of positions) {
      await tx.update("property_positions", { property_id: row.property_id }, {
        published_x: row.x,
        published_z: row.z,
        published_rotation_y: row.rotation_y,
        published_at: publishedAt,
        updated_by: actor.id,
      });
    }
    const settingsRow = await tx.select("app_settings", { where: { key: "app" }, limit: 1 });
    const settings = mapSettings(settingsRow[0], DEMO_SETTINGS as AppSettings);
    await tx.update("app_settings", { key: "app" }, {
      value: { ...settings, scenePublishedAt: publishedAt, scenePublishedBy: actor.email },
      updated_at: publishedAt,
      updated_by: actor.id,
    });
    await logActivity(tx, actor, {
      action: "scene.published",
      entityType: "scene",
      entityId: null,
      summary: `Published the condominium masterplan (${positions.length} placements).`,
      metadata: { publishedAt },
    });
    return { published: positions.length, publishedAt };
  });
}

export async function resetPlacementDraft(db: DataGateway, actor: Actor): Promise<PropertyPosition[]> {
  requireCapability(actor, "scene:edit-draft");
  return db.transaction(async (tx) => {
    const positions = await tx.select("property_positions");
    const result: PropertyPosition[] = [];
    for (const row of positions) {
      const rows = await tx.update("property_positions", { property_id: row.property_id }, {
        x: row.published_x,
        z: row.published_z,
        rotation_y: row.published_rotation_y,
        draft_updated_at: nowIso(),
        updated_by: actor.id,
      });
      if (rows[0]) result.push(mapPosition(rows[0]));
    }
    await logActivity(tx, actor, {
      action: "scene.draft_reset",
      entityType: "scene",
      entityId: null,
      summary: "Discarded unsaved scene placement and restored the published masterplan.",
      metadata: {},
    });
    return result;
  });
}

/* ── Leads ────────────────────────────────────────────────────────────── */

export interface ListLeadsOptions {
  status?: LeadStatus;
  propertyId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listLeads(db: DataGateway, options: ListLeadsOptions = {}): Promise<Paginated<Lead>> {
  const where: Record<string, FilterValue> = {};
  if (options.status) where.status = options.status;
  if (options.propertyId) where.property_id = options.propertyId;
  const rows = await db.select("leads", { where, orderBy: [{ column: "created_at", ascending: false }] });
  let leads = rows.map(mapLead);
  if (options.search) {
    const q = options.search.toLowerCase();
    leads = leads.filter(
      (l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.message ?? "").toLowerCase().includes(q),
    );
  }
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 25));
  return {
    rows: leads.slice((page - 1) * pageSize, page * pageSize),
    total: leads.length,
    page,
    pageSize,
  };
}

export async function getLead(db: DataGateway, id: string): Promise<Lead | null> {
  const rows = await db.select("leads", { where: { id }, limit: 1 });
  return rows[0] ? mapLead(rows[0]) : null;
}

export interface PublicLeadData {
  name: string;
  email: string;
  phone?: string;
  message: string;
  propertyId?: string;
  typology?: Typology;
  source?: Lead["source"];
  consent: boolean;
}

export async function createLead(db: DataGateway, data: PublicLeadData, actor: Actor = publicActor()): Promise<Lead> {
  if (!data.consent) throw new DomainError("Consent is required to store an enquiry.");
  const propertyId = data.propertyId ?? null;
  let typology = data.typology ?? null;
  if (propertyId) {
    const property = await getProperty(db, propertyId);
    if (!property || property.publication !== "published" || property.status === "hidden") {
      throw new DomainError("That property is no longer available.");
    }
    typology = typology ?? property.typology;
  }
  const settings = await getSettings(db);
  const retentionUntil = new Date(Date.now() + settings.leadRetentionDays * 86_400_000).toISOString();
  const row = await db.insert("leads", {
    id: randomUUID(),
    property_id: propertyId,
    typology,
    name: data.name,
    email: data.email,
    phone: data.phone ?? null,
    message: data.message,
    source: data.source ?? "website",
    consent: 1,
    consent_at: nowIso(),
    status: "new",
    assigned_to: null,
    notes: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    retention_until: retentionUntil,
  });
  await logActivity(db, actor, {
    action: "lead.created",
    entityType: "lead",
    entityId: String(row.id),
    summary: `New enquiry from ${data.name}${typology ? ` (${typology})` : ""}.`,
    metadata: { source: data.source ?? "website", consent: true },
  });
  return mapLead(row);
}

export async function updateLead(
  db: DataGateway,
  actor: Actor,
  leadId: string,
  patch: { status?: LeadStatus; assignedTo?: string | null; notes?: string },
): Promise<Lead> {
  requireCapability(actor, "lead:update");
  const current = await getLead(db, leadId);
  if (!current) throw new NotFoundError("Lead");
  const row = await db.update("leads", { id: leadId }, {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.assignedTo !== undefined ? { assigned_to: patch.assignedTo } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    updated_at: nowIso(),
  });
  await logActivity(db, actor, {
    action: "lead.updated",
    entityType: "lead",
    entityId: leadId,
    summary: `Lead ${current.name}: ${patch.status ? `status ${current.status} → ${patch.status}` : "details updated"}.`,
    metadata: { ...patch },
  });
  return mapLead(row[0]!);
}

export async function purgeLead(db: DataGateway, actor: Actor, leadId: string): Promise<void> {
  requireCapability(actor, "lead:delete");
  const lead = await getLead(db, leadId);
  if (!lead) throw new NotFoundError("Lead");
  await db.transaction(async (tx) => {
    await tx.remove("leads", { id: leadId });
    await logActivity(tx, actor, {
      action: "lead.purged",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead permanently deleted at operator request (retention / GDPR).`,
      metadata: { emailHashHint: lead.email.slice(0, 3) + "…" },
    });
  });
}

/* ── Visits ───────────────────────────────────────────────────────────── */

export interface ListVisitsOptions {
  status?: VisitStatus;
  propertyId?: string;
  page?: number;
  pageSize?: number;
}

export async function listVisits(db: DataGateway, options: ListVisitsOptions = {}): Promise<Paginated<VisitRequest>> {
  const where: Record<string, FilterValue> = {};
  if (options.status) where.status = options.status;
  if (options.propertyId) where.property_id = options.propertyId;
  const rows = await db.select("visit_requests", { where, orderBy: [{ column: "preferred_at", ascending: true }] });
  const visits = rows.map(mapVisit);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 25));
  return { rows: visits.slice((page - 1) * pageSize, page * pageSize), total: visits.length, page, pageSize };
}

export async function getVisit(db: DataGateway, id: string): Promise<VisitRequest | null> {
  const rows = await db.select("visit_requests", { where: { id }, limit: 1 });
  return rows[0] ? mapVisit(rows[0]) : null;
}

export interface PublicVisitData {
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
  consent: boolean;
}

export async function createPublicVisit(db: DataGateway, data: PublicVisitData): Promise<VisitRequest> {
  if (!data.consent) throw new DomainError("Consent is required to request a viewing.");
  const property = await getProperty(db, data.propertyId);
  if (!property) throw new NotFoundError("Property");
  if (property.publication !== "published" || property.status === "hidden") {
    throw new DomainError("That property is not currently available for viewings.");
  }
  const settings = await getSettings(db);
  const preferredAt = new Date(`${data.preferredDate}T${data.preferredTime}:00Z`);
  if (Number.isNaN(preferredAt.getTime())) throw new DomainError("Choose a valid date and time.");
  const minimum = Date.now() + settings.visitLeadTimeHours * 3_600_000;
  if (preferredAt.getTime() < minimum) {
    throw new DomainError(`Viewings must be requested at least ${settings.visitLeadTimeHours} hours in advance.`);
  }
  if (preferredAt.getTime() > Date.now() + 120 * 86_400_000) {
    throw new DomainError("Choose a date within the next four months.");
  }

  return db.transaction(async (tx) => {
    const lead = await tx.insert("leads", {
      id: randomUUID(),
      property_id: property.id,
      typology: property.typology,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      message: data.notes ?? "Viewing request submitted through the website.",
      source: "website",
      consent: 1,
      consent_at: nowIso(),
      status: "viewing",
      assigned_to: null,
      notes: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      retention_until: new Date(Date.now() + settings.leadRetentionDays * 86_400_000).toISOString(),
    });
    const visit = await tx.insert("visit_requests", {
      id: randomUUID(),
      property_id: property.id,
      lead_id: String(lead.id),
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      preferred_at: preferredAt.toISOString(),
      duration_minutes: settings.visitSlotMinutes,
      status: "requested",
      notes: data.notes ?? null,
      admin_notes: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      confirmed_at: null,
      created_by: null,
    });
    await logActivity(tx, publicActor(), {
      action: "visit.requested",
      entityType: "visit",
      entityId: String(visit.id),
      summary: `Viewing requested for ${property.code} by ${data.name}.`,
      metadata: { propertyId: property.id, preferredAt: preferredAt.toISOString() },
    });
    return mapVisit(visit);
  });
}

export async function updateVisit(
  db: DataGateway,
  actor: Actor,
  visitId: string,
  patch: { status: VisitStatus; adminNotes?: string; preferredAt?: string },
): Promise<VisitRequest> {
  requireCapability(actor, "visit:update");
  const current = await getVisit(db, visitId);
  if (!current) throw new NotFoundError("Visit");
  const patchRow: Row = { status: patch.status, updated_at: nowIso() };
  if (patch.adminNotes !== undefined) patchRow.admin_notes = patch.adminNotes;
  if (patch.preferredAt) patchRow.preferred_at = patch.preferredAt;
  if (patch.status === "confirmed") patchRow.confirmed_at = nowIso();
  if (current.status === "completed" || current.status === "cancelled") {
    if (patch.status !== current.status) throw new DomainError("Completed and cancelled viewings are final.");
  }
  const rows = await db.update("visit_requests", { id: visitId }, patchRow);
  await logActivity(db, actor, {
    action: "visit.updated",
    entityType: "visit",
    entityId: visitId,
    summary: `Viewing ${current.status} → ${patch.status} for ${current.name}.`,
    metadata: { from: current.status, to: patch.status },
  });
  return mapVisit(rows[0]!);
}

/* ── Reservations ─────────────────────────────────────────────────────── */

export async function listReservations(db: DataGateway, propertyId?: string): Promise<Reservation[]> {
  const rows = await db.select("reservations", {
    where: propertyId ? { property_id: propertyId } : undefined,
    orderBy: [{ column: "created_at", ascending: false }],
  });
  return rows.map(mapReservation);
}

/* ── Assets ───────────────────────────────────────────────────────────── */

export async function listAssets(db: DataGateway, options: { role?: ModelAsset["role"]; propertyId?: string } = {}): Promise<ModelAsset[]> {
  const where: Record<string, FilterValue> = {};
  if (options.role) where.role = options.role;
  if (options.propertyId) where.property_id = options.propertyId;
  const rows = await db.select("model_assets", { where, orderBy: [{ column: "code", ascending: true }] });
  return rows.map(mapAsset);
}

export async function getAsset(db: DataGateway, id: string): Promise<ModelAsset | null> {
  const rows = await db.select("model_assets", { where: { id }, limit: 1 });
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function getAssetByCode(db: DataGateway, code: string): Promise<ModelAsset | null> {
  const rows = await db.select("model_assets", { where: { code }, limit: 1 });
  return rows[0] ? mapAsset(rows[0]) : null;
}

export interface AssetInput {
  code: string;
  role: ModelAsset["role"];
  propertyId?: string | null;
  typology?: Typology | null;
  storagePath: string;
  format: ModelAsset["format"];
  version: string;
  publication: ModelAsset["publication"];
  validation: ModelAsset["validation"];
  widthM?: number | null;
  depthM?: number | null;
  heightM?: number | null;
  originNote?: string;
  orientation?: string;
  scaleNote?: string;
  notes?: string;
}

const SUPPORTED_MODEL_FORMATS = new Set(["glb", "gltf", "obj", "procedural"]);

export async function registerAsset(db: DataGateway, actor: Actor, input: AssetInput): Promise<ModelAsset> {
  requireCapability(actor, "media:upload");
  if (input.role === "exterior" || input.role === "interior") {
    if (!SUPPORTED_MODEL_FORMATS.has(input.format)) {
      throw new DomainError("Model assets must be GLB, glTF, OBJ or procedural.");
    }
  }
  if (input.publication === "published" && input.validation !== "validated") {
    throw new DomainError("Only validated assets can be published.");
  }
  if (input.format !== "procedural" && !/^(https?:\/\/|\/uploads\/|\/media\/)/.test(input.storagePath)) {
    throw new DomainError("Storage path must be an https URL or an /uploads path.");
  }
  const existing = await getAssetByCode(db, input.code);
  if (existing) {
    const rows = await db.update("model_assets", { id: existing.id }, {
      ...input,
      property_id: input.propertyId ?? null,
      typology: input.typology ?? null,
      width_m: input.widthM ?? null,
      depth_m: input.depthM ?? null,
      height_m: input.heightM ?? null,
      origin_note: input.originNote ?? null,
      orientation: input.orientation ?? null,
      scale_note: input.scaleNote ?? null,
      notes: input.notes ?? null,
      updated_at: nowIso(),
    });
    await logActivity(db, actor, {
      action: "asset.updated",
      entityType: "asset",
      entityId: existing.id,
      summary: `Asset ${input.code} updated to version ${input.version}.`,
      metadata: { format: input.format, validation: input.validation },
    });
    return mapAsset(rows[0]!);
  }
  const row = await db.insert("model_assets", {
    id: randomUUID(),
    code: input.code,
    role: input.role,
    property_id: input.propertyId ?? null,
    typology: input.typology ?? null,
    storage_path: input.storagePath,
    format: input.format,
    version: input.version,
    publication: input.publication,
    validation: input.validation,
    width_m: input.widthM ?? null,
    depth_m: input.depthM ?? null,
    height_m: input.heightM ?? null,
    origin_note: input.originNote ?? null,
    orientation: input.orientation ?? null,
    scale_note: input.scaleNote ?? null,
    file_size_bytes: null,
    notes: input.notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  await logActivity(db, actor, {
    action: "asset.registered",
    entityType: "asset",
    entityId: String(row.id),
    summary: `Registered asset ${input.code} (${input.role}, ${input.format}).`,
    metadata: { validation: input.validation },
  });
  return mapAsset(row);
}

export async function assignModelToProperty(
  db: DataGateway,
  actor: Actor,
  input: { propertyId: string; role: "exterior" | "interior"; assetId: string },
): Promise<Property> {
  requireCapability(actor, "property:update");
  const property = await getProperty(db, input.propertyId);
  if (!property) throw new NotFoundError("Property");
  const asset = await getAsset(db, input.assetId);
  if (!asset) throw new NotFoundError("Asset");
  if (asset.publication !== "published" || asset.validation !== "validated") {
    throw new DomainError("Only published, validated assets can be assigned to a property.");
  }
  const expectedRole = input.role;
  if (asset.role !== expectedRole) throw new DomainError(`That asset is a ${asset.role} asset, not ${expectedRole}.`);
  const ref = `asset:${asset.code}`;
  const patch: Row =
    input.role === "exterior"
      ? { exterior_model_ref: ref, updated_at: nowIso(), updated_by: actor.id }
      : { interior_model_ref: ref, updated_at: nowIso(), updated_by: actor.id };
  const rows = await db.update("properties", { id: input.propertyId }, patch);
  await logActivity(db, actor, {
    action: "asset.assigned",
    entityType: "property",
    entityId: input.propertyId,
    summary: `${property.code} ${input.role} model → ${asset.code} v${asset.version}.`,
    metadata: { assetId: asset.id, code: asset.code },
  });
  return mapProperty(rows[0]!);
}

/* ── Settings & dashboard ─────────────────────────────────────────────── */

export async function getSettings(db: DataGateway): Promise<AppSettings> {
  const rows = await db.select("app_settings", { where: { key: "app" }, limit: 1 });
  return mapSettings(rows[0], DEMO_SETTINGS as AppSettings);
}

export async function updateSettings(
  db: DataGateway,
  actor: Actor,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  requireCapability(actor, "settings:update");
  const current = await getSettings(db);
  const next: AppSettings = { ...current, ...patch };
  await db.update("app_settings", { key: "app" }, { value: next, updated_at: nowIso(), updated_by: actor.id });
  await logActivity(db, actor, {
    action: "settings.updated",
    entityType: "settings",
    entityId: "app",
    summary: "Updated application settings.",
    metadata: { changed: Object.keys(patch) },
  });
  return next;
}

export async function getDashboardMetrics(db: DataGateway): Promise<DashboardMetrics> {
  const [properties, leads, visits, positions] = await Promise.all([
    listProperties(db, { includeArchived: false, pageSize: 200 }),
    db.select("leads"),
    db.select("visit_requests"),
    db.select("property_positions"),
  ]);
  return computeDashboardMetrics({
    properties: properties.rows,
    leads: leads.map(mapLead),
    visits: visits.map(mapVisit),
    positions: positions.map(mapPosition),
  });
}

export async function getRecentActivity(db: DataGateway, limit = 8): Promise<ActivityLogEntry[]> {
  return listActivity(db, { limit });
}

export { DEMO_DISCLAIMER };
