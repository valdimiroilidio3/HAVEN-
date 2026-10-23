-- HAVEN® — initial schema (Postgres / Supabase)
-- Mirrors src/lib/db/schema.ts. Run before 0002_rls.sql.
--
-- Design notes
--  * Availability (`status`) and visibility (`publication`) are independent.
--  * Archiving keeps rows; nothing is hard-deleted except leads (GDPR) and media.
--  * Scene coordinates are stored twice: draft (x,z,rotation_y) and published
--    (published_x, published_z, published_rotation_y). The public viewer reads
--    only the published triple, so an unfinished edit can never go live.

create extension if not exists "pgcrypto";

create or replace function haven_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── People ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null default 'viewer' check (role in ('admin','manager','viewer')),
  is_active boolean not null default true,
  password_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index if not exists sessions_token_idx on sessions (token_hash);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- ── Portfolio ─────────────────────────────────────────────────────────────
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  title text not null,
  typology text not null check (typology in ('T1','T2','T3','T4')),
  bedrooms integer not null check (bedrooms between 0 and 10),
  bathrooms integer not null check (bathrooms between 1 and 10),
  parking_spaces integer not null default 0 check (parking_spaces between 0 and 10),
  usable_area_m2 double precision not null check (usable_area_m2 > 0),
  outdoor_area_m2 double precision not null default 0 check (outdoor_area_m2 >= 0),
  plot_area_m2 double precision,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text not null default 'EUR' check (currency in ('EUR','USD','GBP')),
  status text not null default 'available' check (status in ('available','reserved','sold','hidden')),
  publication text not null default 'draft' check (publication in ('draft','published','archived')),
  description text,
  features jsonb not null default '[]'::jsonb,
  exterior_model_ref text,
  interior_model_ref text,
  floor_plan_ref text,
  is_demo boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  archived_at timestamptz
);
create index if not exists properties_status_idx on properties (status);
create index if not exists properties_publication_idx on properties (publication);
create index if not exists properties_typology_idx on properties (typology);
drop trigger if exists properties_touch on properties;
create trigger properties_touch before update on properties
  for each row execute function haven_touch_updated_at();

create table if not exists property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  kind text not null check (kind in ('hero','gallery','plan','interior','exterior')),
  url text not null,
  asset_id uuid,
  caption text,
  alt_text text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists property_media_property_idx on property_media (property_id, sort_order);

create table if not exists model_assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  role text not null check (role in ('exterior','interior','site','furniture')),
  property_id uuid references properties(id) on delete set null,
  typology text check (typology in ('T1','T2','T3','T4')),
  storage_path text not null,
  format text not null check (format in ('glb','gltf','obj')),
  version text not null default '1',
  publication text not null default 'draft' check (publication in ('draft','published','archived')),
  validation text not null default 'pending' check (validation in ('pending','validated','rejected')),
  width_m double precision,
  depth_m double precision,
  height_m double precision,
  origin_note text,
  orientation text,
  scale_note text,
  file_size_bytes bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists model_assets_role_idx on model_assets (role, publication);
drop trigger if exists model_assets_touch on model_assets;
create trigger model_assets_touch before update on model_assets
  for each row execute function haven_touch_updated_at();

create table if not exists property_positions (
  property_id uuid primary key references properties(id) on delete cascade,
  x double precision not null,
  z double precision not null,
  rotation_y double precision not null default 0,
  published_x double precision not null,
  published_z double precision not null,
  published_rotation_y double precision not null default 0,
  draft_updated_at timestamptz,
  published_at timestamptz,
  updated_by uuid references profiles(id)
);

-- ── CRM ───────────────────────────────────────────────────────────────────
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete set null,
  typology text check (typology in ('T1','T2','T3','T4')),
  name text not null,
  email text not null,
  phone text,
  message text,
  source text not null default 'website' check (source in ('website','viewing','phone','referral','portal','walk_in')),
  consent boolean not null default false,
  consent_at timestamptz,
  status text not null default 'new' check (status in ('new','contacted','qualified','viewing','won','lost','archived')),
  assigned_to uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz
);
create index if not exists leads_status_idx on leads (status, created_at desc);
create index if not exists leads_property_idx on leads (property_id);
drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads
  for each row execute function haven_touch_updated_at();

create table if not exists visit_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  preferred_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes between 15 and 240),
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled','rescheduled')),
  notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_by uuid references profiles(id)
);
create index if not exists visits_status_idx on visit_requests (status, preferred_at);
create index if not exists visits_property_idx on visit_requests (property_id);
drop trigger if exists visits_touch on visit_requests;
create trigger visits_touch before update on visit_requests
  for each row execute function haven_touch_updated_at();

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  status text not null default 'active' check (status in ('active','released','expired','converted')),
  reserved_until timestamptz,
  deposit_cents bigint check (deposit_cents is null or deposit_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid references profiles(id)
);
create index if not exists reservations_property_idx on reservations (property_id, status);

-- ── System ────────────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_created_idx on activity_logs (created_at desc);
create index if not exists activity_entity_idx on activity_logs (entity_type, entity_id);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table property_media
  drop constraint if exists property_media_asset_fk;
alter table property_media
  add constraint property_media_asset_fk foreign key (asset_id) references model_assets(id) on delete set null;
