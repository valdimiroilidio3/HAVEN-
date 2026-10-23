-- HAVEN® — Row Level Security
--
-- Threat model
--  * The application server connects with the SERVICE ROLE key, which bypasses
--    RLS. Every privileged read/write is authorised in the server layer
--    (see lib/db/repositories.ts and lib/auth/session.ts) BEFORE it reaches SQL.
--  * The anon key may only ever read published, non-archived content.
--  * There is no direct browser write path: enquiries and viewings are inserted
--    by server actions after validation, rate limiting and honeypot checks.
--
-- Run after 0001_init.sql.

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table properties enable row level security;
alter table property_media enable row level security;
alter table model_assets enable row level security;
alter table property_positions enable row level security;
alter table leads enable row level security;
alter table visit_requests enable row level security;
alter table reservations enable row level security;
alter table activity_logs enable row level security;
alter table app_settings enable row level security;

-- ── Staff helpers ─────────────────────────────────────────────────────────
create or replace function haven_current_role()
returns text
language sql stable security definer set search_path = public as $$
  select p.role
  from profiles p
  where p.id = auth.uid() and p.is_active
  limit 1;
$$;

create or replace function haven_is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(haven_current_role() in ('admin','manager','viewer'), false);
$$;

create or replace function haven_is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(haven_current_role() in ('admin','manager'), false);
$$;

create or replace function haven_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(haven_current_role() = 'admin', false);
$$;

-- ── Public read: published, non-archived content only ─────────────────────
drop policy if exists "public reads published properties" on properties;
create policy "public reads published properties" on properties
  for select using (publication = 'published');

drop policy if exists "public reads media of published properties" on property_media;
create policy "public reads media of published properties" on property_media
  for select using (
    exists (
      select 1 from properties p
      where p.id = property_media.property_id and p.publication = 'published'
    )
  );

drop policy if exists "public reads placements" on property_positions;
create policy "public reads placements" on property_positions
  for select using (
    exists (
      select 1 from properties p
      where p.id = property_positions.property_id and p.publication = 'published'
    )
  );

drop policy if exists "public reads published assets" on model_assets;
create policy "public reads published assets" on model_assets
  for select using (publication = 'published' and validation = 'validated');

-- ── Staff access ──────────────────────────────────────────────────────────
drop policy if exists "staff reads properties" on properties;
create policy "staff reads properties" on properties for select using (haven_is_staff());
drop policy if exists "manager writes properties" on properties;
create policy "manager writes properties" on properties for insert with check (haven_is_manager());
drop policy if exists "manager updates properties" on properties;
create policy "manager updates properties" on properties for update using (haven_is_manager()) with check (haven_is_manager());
drop policy if exists "admin deletes properties" on properties;
create policy "admin deletes properties" on properties for delete using (haven_is_admin());

drop policy if exists "staff reads media" on property_media;
create policy "staff reads media" on property_media for select using (haven_is_staff());
drop policy if exists "manager writes media" on property_media;
create policy "manager writes media" on property_media for insert with check (haven_is_manager());
drop policy if exists "manager updates media" on property_media;
create policy "manager updates media" on property_media for update using (haven_is_manager());
drop policy if exists "admin deletes media" on property_media;
create policy "admin deletes media" on property_media for delete using (haven_is_admin());

drop policy if exists "staff reads assets" on model_assets;
create policy "staff reads assets" on model_assets for select using (haven_is_staff());
drop policy if exists "manager writes assets" on model_assets;
create policy "manager writes assets" on model_assets for insert with check (haven_is_manager());
drop policy if exists "manager updates assets" on model_assets;
create policy "manager updates assets" on model_assets for update using (haven_is_manager());

drop policy if exists "staff reads placements" on property_positions;
create policy "staff reads placements" on property_positions for select using (haven_is_staff());
drop policy if exists "manager writes placements" on property_positions;
create policy "manager writes placements" on property_positions for insert with check (haven_is_manager());
drop policy if exists "manager updates placements" on property_positions;
create policy "manager updates placements" on property_positions for update using (haven_is_manager());

drop policy if exists "staff reads leads" on leads;
create policy "staff reads leads" on leads for select using (haven_is_staff());
drop policy if exists "manager writes leads" on leads;
create policy "manager writes leads" on leads for insert with check (haven_is_manager());
drop policy if exists "manager updates leads" on leads;
create policy "manager updates leads" on leads for update using (haven_is_manager());
drop policy if exists "admin deletes leads" on leads;
create policy "admin deletes leads" on leads for delete using (haven_is_admin());

drop policy if exists "staff reads visits" on visit_requests;
create policy "staff reads visits" on visit_requests for select using (haven_is_staff());
drop policy if exists "manager writes visits" on visit_requests;
create policy "manager writes visits" on visit_requests for insert with check (haven_is_manager());
drop policy if exists "manager updates visits" on visit_requests;
create policy "manager updates visits" on visit_requests for update using (haven_is_manager());

drop policy if exists "staff reads reservations" on reservations;
create policy "staff reads reservations" on reservations for select using (haven_is_staff());
drop policy if exists "manager writes reservations" on reservations;
create policy "manager writes reservations" on reservations for insert with check (haven_is_manager());
drop policy if exists "manager updates reservations" on reservations;
create policy "manager updates reservations" on reservations for update using (haven_is_manager());

drop policy if exists "staff reads activity" on activity_logs;
create policy "staff reads activity" on activity_logs for select using (haven_is_staff());
drop policy if exists "manager writes activity" on activity_logs;
create policy "manager writes activity" on activity_logs for insert with check (haven_is_manager());

drop policy if exists "staff reads settings" on app_settings;
create policy "staff reads settings" on app_settings for select using (haven_is_staff());
drop policy if exists "admin writes settings" on app_settings;
create policy "admin writes settings" on app_settings for insert with check (haven_is_admin());
drop policy if exists "admin updates settings" on app_settings;
create policy "admin updates settings" on app_settings for update using (haven_is_admin());

drop policy if exists "staff reads own profile" on profiles;
create policy "staff reads own profile" on profiles for select using (id = auth.uid() or haven_is_staff());
drop policy if exists "admin manages profiles" on profiles;
create policy "admin manages profiles" on profiles for update using (haven_is_admin()) with check (haven_is_admin());

-- Sessions are touched only by the server (service role).
drop policy if exists "no client session access" on sessions;
create policy "no client session access" on sessions for select using (false);

-- ── Storage ───────────────────────────────────────────────────────────────
-- The bucket is private; the app serves media through its own route or signed
-- URLs. Public read is granted per-object only for published photography.
insert into storage.buckets (id, name, public)
values ('haven-media', 'haven-media', false)
on conflict (id) do nothing;
