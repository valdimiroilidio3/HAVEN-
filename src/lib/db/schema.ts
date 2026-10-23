/**
 * Single source of truth for table names and columns.
 * Used to (a) build the SQLite schema, (b) validate identifiers in the local
 * driver (preventing SQL injection through column names) and (c) serialise
 * JSON columns to portable TEXT.
 */

export type JsonColumn = "features" | "metadata" | "value";

export interface TableDefinition {
  columns: readonly string[];
  json: readonly JsonColumn[];
  primaryKey: string;
}

export const TABLES = {
  profiles: {
    columns: ["id", "email", "full_name", "role", "is_active", "password_hash", "created_at", "last_seen_at"],
    json: [],
    primaryKey: "id",
  },
  sessions: {
    columns: ["id", "user_id", "token_hash", "created_at", "expires_at", "user_agent"],
    json: [],
    primaryKey: "id",
  },
  properties: {
    columns: [
      "id",
      "code",
      "slug",
      "title",
      "typology",
      "bedrooms",
      "bathrooms",
      "parking_spaces",
      "usable_area_m2",
      "outdoor_area_m2",
      "plot_area_m2",
      "price_cents",
      "currency",
      "status",
      "publication",
      "description",
      "features",
      "exterior_model_ref",
      "interior_model_ref",
      "floor_plan_ref",
      "is_demo",
      "sort_order",
      "created_at",
      "updated_at",
      "updated_by",
      "archived_at",
    ],
    json: ["features"],
    primaryKey: "id",
  },
  property_media: {
    columns: [
      "id",
      "property_id",
      "kind",
      "url",
      "asset_id",
      "caption",
      "alt_text",
      "width",
      "height",
      "sort_order",
      "created_at",
    ],
    json: [],
    primaryKey: "id",
  },
  model_assets: {
    columns: [
      "id",
      "code",
      "role",
      "property_id",
      "typology",
      "storage_path",
      "format",
      "version",
      "publication",
      "validation",
      "width_m",
      "depth_m",
      "height_m",
      "origin_note",
      "orientation",
      "scale_note",
      "file_size_bytes",
      "notes",
      "created_at",
      "updated_at",
    ],
    json: [],
    primaryKey: "id",
  },
  property_positions: {
    columns: [
      "property_id",
      "x",
      "z",
      "rotation_y",
      "published_x",
      "published_z",
      "published_rotation_y",
      "draft_updated_at",
      "published_at",
      "updated_by",
    ],
    json: [],
    primaryKey: "property_id",
  },
  leads: {
    columns: [
      "id",
      "property_id",
      "typology",
      "name",
      "email",
      "phone",
      "message",
      "source",
      "consent",
      "consent_at",
      "status",
      "assigned_to",
      "notes",
      "created_at",
      "updated_at",
      "retention_until",
    ],
    json: [],
    primaryKey: "id",
  },
  visit_requests: {
    columns: [
      "id",
      "property_id",
      "lead_id",
      "name",
      "email",
      "phone",
      "preferred_at",
      "duration_minutes",
      "status",
      "notes",
      "admin_notes",
      "created_at",
      "updated_at",
      "confirmed_at",
      "created_by",
    ],
    json: [],
    primaryKey: "id",
  },
  reservations: {
    columns: [
      "id",
      "property_id",
      "lead_id",
      "status",
      "reserved_until",
      "deposit_cents",
      "notes",
      "created_at",
      "updated_at",
      "released_at",
      "created_by",
    ],
    json: [],
    primaryKey: "id",
  },
  activity_logs: {
    columns: ["id", "actor_id", "actor_email", "action", "entity_type", "entity_id", "summary", "metadata", "created_at"],
    json: ["metadata"],
    primaryKey: "id",
  },
  app_settings: {
    columns: ["key", "value", "updated_at", "updated_by"],
    json: ["value"],
    primaryKey: "key",
  },
} as const satisfies Record<string, TableDefinition>;

export type TableName = keyof typeof TABLES;

export function isTableName(name: string): name is TableName {
  return Object.prototype.hasOwnProperty.call(TABLES, name);
}

export function assertColumn(table: TableName, column: string): void {
  if (!(TABLES[table].columns as readonly string[]).includes(column)) {
    throw new Error(`Unknown column ${table}.${column}`);
  }
}

/** Local SQLite DDL. Kept in sync with supabase/migrations/0001_init.sql. */
export const SQLITE_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','viewer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  typology TEXT NOT NULL CHECK (typology IN ('T1','T2','T3','T4')),
  bedrooms INTEGER NOT NULL CHECK (bedrooms BETWEEN 0 AND 10),
  bathrooms INTEGER NOT NULL CHECK (bathrooms BETWEEN 1 AND 10),
  parking_spaces INTEGER NOT NULL DEFAULT 0 CHECK (parking_spaces BETWEEN 0 AND 10),
  usable_area_m2 REAL NOT NULL CHECK (usable_area_m2 > 0),
  outdoor_area_m2 REAL NOT NULL DEFAULT 0 CHECK (outdoor_area_m2 >= 0),
  plot_area_m2 REAL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD','GBP')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold','hidden')),
  publication TEXT NOT NULL DEFAULT 'draft' CHECK (publication IN ('draft','published','archived')),
  description TEXT,
  features TEXT NOT NULL DEFAULT '[]',
  exterior_model_ref TEXT,
  interior_model_ref TEXT,
  floor_plan_ref TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS properties_status_idx ON properties(status);
CREATE INDEX IF NOT EXISTS properties_publication_idx ON properties(publication);
CREATE INDEX IF NOT EXISTS properties_typology_idx ON properties(typology);

CREATE TABLE IF NOT EXISTS property_media (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gallery','plan','exterior','interior','video')),
  url TEXT NOT NULL,
  asset_id TEXT REFERENCES model_assets(id) ON DELETE SET NULL,
  caption TEXT,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS property_media_property_idx ON property_media(property_id, sort_order);

CREATE TABLE IF NOT EXISTS model_assets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('site','exterior','interior','floorplan')),
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  typology TEXT CHECK (typology IS NULL OR typology IN ('T1','T2','T3','T4')),
  storage_path TEXT NOT NULL,
  format TEXT NOT NULL,
  version TEXT NOT NULL,
  publication TEXT NOT NULL DEFAULT 'draft' CHECK (publication IN ('draft','published','archived')),
  validation TEXT NOT NULL DEFAULT 'pending' CHECK (validation IN ('pending','validated','rejected')),
  width_m REAL,
  depth_m REAL,
  height_m REAL,
  origin_note TEXT,
  orientation TEXT,
  scale_note TEXT,
  file_size_bytes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS model_assets_role_idx ON model_assets(role, typology);
CREATE INDEX IF NOT EXISTS model_assets_property_idx ON model_assets(property_id);

CREATE TABLE IF NOT EXISTS property_positions (
  property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  z REAL NOT NULL DEFAULT 0,
  rotation_y REAL NOT NULL DEFAULT 0,
  published_x REAL NOT NULL DEFAULT 0,
  published_z REAL NOT NULL DEFAULT 0,
  published_rotation_y REAL NOT NULL DEFAULT 0,
  draft_updated_at TEXT,
  published_at TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  typology TEXT CHECK (typology IS NULL OR typology IN ('T1','T2','T3','T4')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','viewing','won','lost','archived')),
  assigned_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retention_until TEXT
);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_property_idx ON leads(property_id);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);

CREATE TABLE IF NOT EXISTS visit_requests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  preferred_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled','rescheduled')),
  notes TEXT,
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS visits_status_idx ON visit_requests(status, preferred_at);
CREATE INDEX IF NOT EXISTS visits_property_idx ON visit_requests(property_id);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','converted')),
  reserved_until TEXT,
  deposit_cents INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  released_at TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS reservations_property_idx ON reservations(property_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_active_idx ON reservations(property_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
`;
