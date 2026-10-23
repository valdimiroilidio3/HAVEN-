/**
 * HAVEN® — domain types.
 *
 * These types are the shared contract between the database layer, server
 * actions, API routes and every client surface. They contain no runtime
 * dependencies so they can be imported from server and client components.
 */

export type ISODate = string;

export const TYPOLOGIES = ["T1", "T2", "T3", "T4"] as const;
export type Typology = (typeof TYPOLOGIES)[number];

export const PROPERTY_STATUSES = ["available", "reserved", "sold", "hidden"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PUBLICATION_STATUSES = ["draft", "published", "archived"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const ROLES = ["admin", "manager", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ASSET_ROLES = ["site", "exterior", "interior", "floorplan"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const ASSET_FORMATS = ["glb", "gltf", "obj", "jpg", "png", "webp", "svg", "pdf", "procedural"] as const;
export type AssetFormat = (typeof ASSET_FORMATS)[number];

export const ASSET_VALIDATION_STATES = ["pending", "validated", "rejected"] as const;
export type AssetValidationState = (typeof ASSET_VALIDATION_STATES)[number];

export const ASSET_PUBLICATION_STATES = ["draft", "published", "archived"] as const;
export type AssetPublicationState = (typeof ASSET_PUBLICATION_STATES)[number];

export const MEDIA_KINDS = ["gallery", "plan", "exterior", "interior", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "viewing", "won", "lost", "archived"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ["website", "referral", "portal", "walk_in", "event", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const VISIT_STATUSES = ["requested", "confirmed", "completed", "cancelled", "rescheduled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const RESERVATION_STATUSES = ["active", "cancelled", "expired", "converted"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: ISODate;
  lastSeenAt: ISODate | null;
}

export interface Property {
  id: string;
  code: string;
  slug: string;
  title: string;
  typology: Typology;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  usableAreaM2: number;
  outdoorAreaM2: number;
  plotAreaM2: number | null;
  priceCents: number | null;
  currency: Currency;
  status: PropertyStatus;
  publication: PublicationStatus;
  description: string | null;
  features: string[];
  exteriorModelRef: string | null;
  interiorModelRef: string | null;
  floorPlanRef: string | null;
  isDemo: boolean;
  sortOrder: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  updatedBy: string | null;
  archivedAt: ISODate | null;
}

export interface PropertyMedia {
  id: string;
  propertyId: string;
  kind: MediaKind;
  url: string;
  assetId: string | null;
  caption: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: ISODate;
}

export interface ModelAsset {
  id: string;
  code: string;
  role: AssetRole;
  propertyId: string | null;
  typology: Typology | null;
  storagePath: string;
  format: AssetFormat;
  version: string;
  publication: AssetPublicationState;
  validation: AssetValidationState;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  originNote: string | null;
  orientation: string | null;
  scaleNote: string | null;
  fileSizeBytes: number | null;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface PropertyPosition {
  propertyId: string;
  /** Draft coordinates (scene editor working copy). */
  x: number;
  z: number;
  rotationY: number;
  /** Last published coordinates (what the public viewer renders). */
  publishedX: number;
  publishedZ: number;
  publishedRotationY: number;
  draftUpdatedAt: ISODate | null;
  publishedAt: ISODate | null;
  updatedBy: string | null;
}

export interface Lead {
  id: string;
  propertyId: string | null;
  typology: Typology | null;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  source: LeadSource;
  consent: boolean;
  consentAt: ISODate | null;
  status: LeadStatus;
  assignedTo: string | null;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  retentionUntil: ISODate | null;
}

export interface VisitRequest {
  id: string;
  propertyId: string;
  leadId: string | null;
  name: string;
  email: string;
  phone: string | null;
  preferredAt: ISODate;
  durationMinutes: number;
  status: VisitStatus;
  notes: string | null;
  adminNotes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  confirmedAt: ISODate | null;
  createdBy: string | null;
}

export interface Reservation {
  id: string;
  propertyId: string;
  leadId: string | null;
  status: ReservationStatus;
  reservedUntil: ISODate | null;
  depositCents: number | null;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  releasedAt: ISODate | null;
  createdBy: string | null;
}

export interface ActivityLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: ISODate;
}

export interface AppSettings {
  condominiumName: string;
  tagline: string;
  locationLabel: string;
  contactEmail: string;
  contactPhone: string;
  currency: Currency;
  demoMode: boolean;
  leadRetentionDays: number;
  visitSlotMinutes: number;
  visitLeadTimeHours: number;
  scenePublishedAt: ISODate | null;
  scenePublishedBy: string | null;
}

export interface PropertyWithRelations extends Property {
  position: PropertyPosition | null;
  media: PropertyMedia[];
  reservations: Reservation[];
}

export interface DashboardMetrics {
  totalProperties: number;
  available: number;
  reserved: number;
  sold: number;
  unpublished: number;
  newLeads: number;
  pendingVisits: number;
  totalLeads: number;
  typologyBreakdown: Record<Typology, number>;
  statusBreakdown: Record<PropertyStatus, number>;
  sceneDraftPending: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthSession {
  user: SessionUser;
  expiresAt: ISODate;
}

/** A blocking problem the operator can act on, returned with a failed action. */
export interface ActionResultIssue {
  objectId: string;
  severity: string;
  message: string;
  suggestion: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; issues?: ActionResultIssue[] };

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
