import type {
  ActivityLogEntry,
  AppSettings,
  Lead,
  ModelAsset,
  Profile,
  Property,
  PropertyMedia,
  PropertyPosition,
  Reservation,
  VisitRequest,
} from "@/lib/domain/types";
import type { Row } from "./gateway";

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1";

export function mapProperty(row: Row): Property {
  let features: string[] = [];
  if (Array.isArray(row.features)) features = row.features.filter((f): f is string => typeof f === "string");
  else if (typeof row.features === "string") {
    try {
      const parsed = JSON.parse(row.features);
      if (Array.isArray(parsed)) features = parsed.filter((f): f is string => typeof f === "string");
    } catch {
      features = [];
    }
  }
  return {
    id: str(row.id),
    code: str(row.code),
    slug: str(row.slug),
    title: str(row.title),
    typology: str(row.typology) as Property["typology"],
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    parkingSpaces: num(row.parking_spaces),
    usableAreaM2: num(row.usable_area_m2),
    outdoorAreaM2: num(row.outdoor_area_m2),
    plotAreaM2: numOrNull(row.plot_area_m2),
    priceCents: numOrNull(row.price_cents),
    currency: str(row.currency || "EUR") as Property["currency"],
    status: str(row.status) as Property["status"],
    publication: str(row.publication) as Property["publication"],
    description: strOrNull(row.description),
    features,
    exteriorModelRef: strOrNull(row.exterior_model_ref),
    interiorModelRef: strOrNull(row.interior_model_ref),
    floorPlanRef: strOrNull(row.floor_plan_ref),
    isDemo: bool(row.is_demo),
    sortOrder: num(row.sort_order),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    updatedBy: strOrNull(row.updated_by),
    archivedAt: strOrNull(row.archived_at),
  };
}

export function mapMedia(row: Row): PropertyMedia {
  return {
    id: str(row.id),
    propertyId: str(row.property_id),
    kind: str(row.kind) as PropertyMedia["kind"],
    url: str(row.url),
    assetId: strOrNull(row.asset_id),
    caption: strOrNull(row.caption),
    altText: strOrNull(row.alt_text),
    width: numOrNull(row.width),
    height: numOrNull(row.height),
    sortOrder: num(row.sort_order),
    createdAt: str(row.created_at),
  };
}

export function mapAsset(row: Row): ModelAsset {
  return {
    id: str(row.id),
    code: str(row.code),
    role: str(row.role) as ModelAsset["role"],
    propertyId: strOrNull(row.property_id),
    typology: (strOrNull(row.typology) as ModelAsset["typology"]) ?? null,
    storagePath: str(row.storage_path),
    format: str(row.format) as ModelAsset["format"],
    version: str(row.version),
    publication: str(row.publication) as ModelAsset["publication"],
    validation: str(row.validation) as ModelAsset["validation"],
    widthM: numOrNull(row.width_m),
    depthM: numOrNull(row.depth_m),
    heightM: numOrNull(row.height_m),
    originNote: strOrNull(row.origin_note),
    orientation: strOrNull(row.orientation),
    scaleNote: strOrNull(row.scale_note),
    fileSizeBytes: numOrNull(row.file_size_bytes),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapPosition(row: Row): PropertyPosition {
  return {
    propertyId: str(row.property_id),
    x: num(row.x),
    z: num(row.z),
    rotationY: num(row.rotation_y),
    publishedX: num(row.published_x),
    publishedZ: num(row.published_z),
    publishedRotationY: num(row.published_rotation_y),
    draftUpdatedAt: strOrNull(row.draft_updated_at),
    publishedAt: strOrNull(row.published_at),
    updatedBy: strOrNull(row.updated_by),
  };
}

export function mapLead(row: Row): Lead {
  return {
    id: str(row.id),
    propertyId: strOrNull(row.property_id),
    typology: (strOrNull(row.typology) as Lead["typology"]) ?? null,
    name: str(row.name),
    email: str(row.email),
    phone: strOrNull(row.phone),
    message: strOrNull(row.message),
    source: str(row.source) as Lead["source"],
    consent: bool(row.consent),
    consentAt: strOrNull(row.consent_at),
    status: str(row.status) as Lead["status"],
    assignedTo: strOrNull(row.assigned_to),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    retentionUntil: strOrNull(row.retention_until),
  };
}

export function mapVisit(row: Row): VisitRequest {
  return {
    id: str(row.id),
    propertyId: str(row.property_id),
    leadId: strOrNull(row.lead_id),
    name: str(row.name),
    email: str(row.email),
    phone: strOrNull(row.phone),
    preferredAt: str(row.preferred_at),
    durationMinutes: num(row.duration_minutes),
    status: str(row.status) as VisitRequest["status"],
    notes: strOrNull(row.notes),
    adminNotes: strOrNull(row.admin_notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    confirmedAt: strOrNull(row.confirmed_at),
    createdBy: strOrNull(row.created_by),
  };
}

export function mapReservation(row: Row): Reservation {
  return {
    id: str(row.id),
    propertyId: str(row.property_id),
    leadId: strOrNull(row.lead_id),
    status: str(row.status) as Reservation["status"],
    reservedUntil: strOrNull(row.reserved_until),
    depositCents: numOrNull(row.deposit_cents),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    releasedAt: strOrNull(row.released_at),
    createdBy: strOrNull(row.created_by),
  };
}

export function mapActivity(row: Row): ActivityLogEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata && typeof row.metadata === "object") metadata = row.metadata as Record<string, unknown>;
  else if (typeof row.metadata === "string" && row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: str(row.id),
    actorId: strOrNull(row.actor_id),
    actorEmail: strOrNull(row.actor_email),
    action: str(row.action),
    entityType: str(row.entity_type),
    entityId: strOrNull(row.entity_id),
    summary: str(row.summary),
    metadata,
    createdAt: str(row.created_at),
  };
}

export function mapProfile(row: Row): Profile & { passwordHash: string | null } {
  return {
    id: str(row.id),
    email: str(row.email),
    fullName: str(row.full_name),
    role: str(row.role) as Profile["role"],
    isActive: bool(row.is_active),
    passwordHash: strOrNull(row.password_hash),
    createdAt: str(row.created_at),
    lastSeenAt: strOrNull(row.last_seen_at),
  };
}

export function mapSettings(row: Row | undefined, fallback: AppSettings): AppSettings {
  if (!row) return fallback;
  const value = (row.value ?? {}) as Partial<AppSettings>;
  return { ...fallback, ...value };
}
