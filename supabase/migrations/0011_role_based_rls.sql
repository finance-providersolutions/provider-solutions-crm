-- =============================================================
-- Provider Solutions CRM — role-based RLS (suite identity layer)
--
-- This migration retires the Phase-1 permissive RLS posture and
-- replaces it with role-aware policies. It introduces the
-- suite-wide identity layer:
--
--   public.profiles          — one row per auth.users id, carrying
--                              role and (for providers) provider_id.
--                              Single suite-wide table. Future apps
--                              (provider portal, Scheduler) read the
--                              same rows.
--
--   public.is_staff()        — boolean, SECURITY DEFINER. True when
--                              caller's profile role is admin or
--                              recruiter.
--
--   public.current_user_role()      — text, SECURITY DEFINER.
--   public.current_provider_id()    — uuid, SECURITY DEFINER. The
--                              key the universal provider-scoping
--                              rule keys on. Reusable by every
--                              future provider-scoped table in
--                              every backend app.
--
-- The universal scoping rule, applied here to every provider-scoped
-- CRM table and reusable by future apps verbatim:
--
--   create policy "<tbl> staff full" on public.<tbl>
--     for all to authenticated
--     using (public.is_staff()) with check (public.is_staff());
--
--   create policy "<tbl> provider own" on public.<tbl>
--     for select to authenticated
--     using (provider_id = public.current_provider_id());
--
-- Ordering rule for safety on a live DB: within each table, the new
-- staff-full policy is CREATED before the permissive policy is
-- DROPPED, so the seeded admin user never loses access during the
-- transaction.
--
-- Plan-of-record document: ps-app-crm/docs/RLS-PLAN.md.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

-- ─── 1. profiles table ───────────────────────────────────────────
-- One row per auth.users id. Suite-wide identity. The provider role
-- MUST carry a provider_id; non-provider roles MUST NOT. Enforced
-- at the schema level via CHECK so a mis-seeded row cannot quietly
-- become a security hole. Unique index on provider_id enforces
-- one-login-per-provider.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'recruiter', 'provider')),
  provider_id uuid references public.providers(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_provider_link check (
    (role =  'provider' and provider_id is not null)
    or
    (role <> 'provider' and provider_id is null)
  )
);

create unique index profiles_provider_id_uidx
  on public.profiles(provider_id)
  where provider_id is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── 2. helper functions ─────────────────────────────────────────
-- SECURITY DEFINER lets these read public.profiles without engaging
-- RLS — which is what avoids policy recursion when the helpers are
-- called from inside profiles' own policies. The function owner
-- (typically the migration runner, usually postgres) bypasses RLS;
-- the helpers themselves take no arguments and are pure reads
-- against the calling user's auth.uid().
--
-- `set search_path = public` is standard hardening so a shadow
-- `profiles` table in another schema cannot redirect the lookup.
--
-- The Scheduler and the provider portal reuse these three helpers
-- VERBATIM — they are the universal-scoping primitives for the
-- whole suite. Any future provider-scoped table in any backend app
-- applies the same two-policy template documented in the header.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'recruiter') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select provider_id from public.profiles where id = auth.uid();
$$;

-- ─── 3. seed admin profiles ──────────────────────────────────────
-- Pull real auth.users.id at apply time — no hardcoded UUIDs.
--
-- Two staff seats today, both seeded as 'admin':
--   finance.providersolutions@gmail.com  (Jason)
--   exec.providersolutions@gmail.com     (Reed, business email)
--
-- 'recruiter' is reserved in the role enum for future team members
-- who should NOT also have permission to manage other accounts.
-- For now both seats are admin and behave identically under
-- is_staff().
--
-- The WHERE ... IN (...) clause silently skips any email that has
-- not yet logged in (no row in auth.users). If Reed has never used
-- the CRM yet, his profile is NOT seeded here; he must log in once
-- so auth.users captures his id, then a follow-up one-line insert
-- adds his profile. The verification step in RLS-PLAN.md §8 lists
-- exactly what was actually seeded, so the gap (if any) is visible.
--
-- DEFERRED — Reed-as-provider. Reed is also a practicing physician
-- who takes shifts and will eventually need a SEPARATE provider
-- profile under his personal email (reedhogan@mac.com), scoped via
-- provider_id to his own providers row. That seat ships in the
-- portal slice — it cannot be seeded here because (a) the personal
-- email has not logged in, (b) his providers row id needs to be
-- identified, and (c) provider-scoping can only be honestly
-- verified end-to-end against a real provider login, which the
-- portal slice will be the first to provide.

insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email in (
  'finance.providersolutions@gmail.com',
  'exec.providersolutions@gmail.com'
)
on conflict (id) do nothing;

-- ─── 4. enable RLS on profiles + its policies ────────────────────
-- Own-row read uses auth.uid() directly (no helper needed); staff
-- full-access uses is_staff(). No recursion because the helper is
-- SECURITY DEFINER and bypasses RLS while reading profiles.
alter table public.profiles enable row level security;

create policy "profiles staff full"
  on public.profiles for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "profiles own read"
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- ─── 5. organizations — reference-readable ───────────────────────
-- Providers need to read the hospital name attached to their own
-- facility privileges and placements, so SELECT is open to every
-- authenticated user. All writes are staff-only.
create policy "organizations read all auth"
  on public.organizations for select to authenticated
  using (true);

create policy "organizations staff insert"
  on public.organizations for insert to authenticated
  with check (public.is_staff());

create policy "organizations staff update"
  on public.organizations for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "organizations staff delete"
  on public.organizations for delete to authenticated
  using (public.is_staff());

drop policy "authenticated all access on organizations" on public.organizations;

-- ─── 6. onboarding_item_types — reference-readable ───────────────
-- Same shape: the portal renders the same catalog the CRM does.
create policy "onboarding_item_types read all auth"
  on public.onboarding_item_types for select to authenticated
  using (true);

create policy "onboarding_item_types staff insert"
  on public.onboarding_item_types for insert to authenticated
  with check (public.is_staff());

create policy "onboarding_item_types staff update"
  on public.onboarding_item_types for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "onboarding_item_types staff delete"
  on public.onboarding_item_types for delete to authenticated
  using (public.is_staff());

drop policy "authenticated all access on onboarding_item_types" on public.onboarding_item_types;

-- ─── 7. staff-only tables (contacts, activities, opportunities, tasks) ─
-- These never surface in the provider portal. A task with
-- provider_id = X is a recruiter's todo ABOUT the provider, not
-- for them; same for activities. Opportunities are demand-side
-- recruiting data — providers only see what they've been
-- selected for, via placements.

create policy "contacts staff full"
  on public.contacts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy "authenticated all access on contacts" on public.contacts;

create policy "activities staff full"
  on public.activities for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy "authenticated all access on activities" on public.activities;

create policy "opportunities staff full"
  on public.opportunities for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy "authenticated all access on opportunities" on public.opportunities;

create policy "tasks staff full"
  on public.tasks for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy "authenticated all access on tasks" on public.tasks;

-- ─── 8. providers — staff full + provider own-row read ───────────
-- The row IS the provider. They can read only their own row; the
-- portal slice will add write paths (e.g., updating contact info)
-- explicitly, not via blanket UPDATE — for now the portal is
-- read-only against providers.
create policy "providers staff full"
  on public.providers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "providers own row read"
  on public.providers for select to authenticated
  using (id = public.current_provider_id());

drop policy "authenticated all access on providers" on public.providers;

-- ─── 9. provider-own-records read tables ─────────────────────────
-- provider_licenses, credentials, facility_privileges, placements.
-- Staff get full access; providers get SELECT only, scoped on
-- provider_id. Writes stay staff-only — credential entry,
-- privilege applications, and selection are recruiter motions.

create policy "provider_licenses staff full"
  on public.provider_licenses for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "provider_licenses provider own read"
  on public.provider_licenses for select to authenticated
  using (provider_id = public.current_provider_id());
drop policy "authenticated all access on provider_licenses" on public.provider_licenses;

create policy "credentials staff full"
  on public.credentials for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "credentials provider own read"
  on public.credentials for select to authenticated
  using (provider_id = public.current_provider_id());
drop policy "authenticated all access on credentials" on public.credentials;

create policy "facility_privileges staff full"
  on public.facility_privileges for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "facility_privileges provider own read"
  on public.facility_privileges for select to authenticated
  using (provider_id = public.current_provider_id());
drop policy "authenticated all access on facility_privileges" on public.facility_privileges;

create policy "placements staff full"
  on public.placements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "placements provider own read"
  on public.placements for select to authenticated
  using (provider_id = public.current_provider_id());
drop policy "authenticated all access on placements" on public.placements;

-- ─── 10. onboarding_items — staff full + provider RW on own ──────
-- This is the only table where the portal CONTRIBUTES today:
-- providers toggle done, attach a document, edit a note. DELETE is
-- intentionally NOT granted to providers — the "uncomplete" flow
-- updates done = false rather than deleting the row, matching the
-- CRM's existing toggle semantics and preserving the audit trail.
create policy "onboarding_items staff full"
  on public.onboarding_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "onboarding_items provider own select"
  on public.onboarding_items for select to authenticated
  using (provider_id = public.current_provider_id());

create policy "onboarding_items provider own insert"
  on public.onboarding_items for insert to authenticated
  with check (provider_id = public.current_provider_id());

create policy "onboarding_items provider own update"
  on public.onboarding_items for update to authenticated
  using (provider_id = public.current_provider_id())
  with check (provider_id = public.current_provider_id());

drop policy "authenticated all access on onboarding_items" on public.onboarding_items;

-- =============================================================
-- DEFERRED — flagged here, NOT addressed by this migration
-- =============================================================
--
-- Storage bucket 'credentials' currently allows any authenticated
-- user to SELECT every object. Once a provider can log in, that is
-- a leak — but path-scoped storage policies depend on the portal's
-- chosen path convention, so they belong with the portal slice.
-- The two public-read buckets (organization-logos, provider-photos)
-- remain fine.
--
-- Reed-as-provider: a separate provider profile under his personal
-- email (reedhogan@mac.com) is deferred to the portal slice (see
-- comment on §3 above).
--
-- Provider-scoping verification against a real provider account is
-- deferred to the portal slice. Staff-side verification (see
-- RLS-PLAN.md §8) is what this slice ships.

-- =============================================================
-- ROLLBACK — uncomment and run as a separate SQL editor pass
-- only if verification fails. Restores the Phase-1 permissive
-- posture exactly. The ordering rule still applies: create the
-- permissive policy first, then drop the new ones, so the user
-- never loses access mid-revert.
-- =============================================================
-- begin;
--
-- create policy "authenticated all access on organizations"          on public.organizations          for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on contacts"               on public.contacts               for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on activities"             on public.activities             for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on providers"              on public.providers              for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on opportunities"          on public.opportunities          for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on tasks"                  on public.tasks                  for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on placements"             on public.placements             for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on provider_licenses"      on public.provider_licenses      for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on credentials"            on public.credentials            for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on facility_privileges"    on public.facility_privileges    for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on onboarding_item_types"  on public.onboarding_item_types  for all to authenticated using (true) with check (true);
-- create policy "authenticated all access on onboarding_items"       on public.onboarding_items       for all to authenticated using (true) with check (true);
--
-- drop policy "organizations read all auth"            on public.organizations;
-- drop policy "organizations staff insert"             on public.organizations;
-- drop policy "organizations staff update"             on public.organizations;
-- drop policy "organizations staff delete"             on public.organizations;
-- drop policy "onboarding_item_types read all auth"    on public.onboarding_item_types;
-- drop policy "onboarding_item_types staff insert"     on public.onboarding_item_types;
-- drop policy "onboarding_item_types staff update"     on public.onboarding_item_types;
-- drop policy "onboarding_item_types staff delete"     on public.onboarding_item_types;
-- drop policy "contacts staff full"                    on public.contacts;
-- drop policy "activities staff full"                  on public.activities;
-- drop policy "opportunities staff full"               on public.opportunities;
-- drop policy "tasks staff full"                       on public.tasks;
-- drop policy "providers staff full"                   on public.providers;
-- drop policy "providers own row read"                 on public.providers;
-- drop policy "provider_licenses staff full"           on public.provider_licenses;
-- drop policy "provider_licenses provider own read"    on public.provider_licenses;
-- drop policy "credentials staff full"                 on public.credentials;
-- drop policy "credentials provider own read"          on public.credentials;
-- drop policy "facility_privileges staff full"         on public.facility_privileges;
-- drop policy "facility_privileges provider own read"  on public.facility_privileges;
-- drop policy "placements staff full"                  on public.placements;
-- drop policy "placements provider own read"           on public.placements;
-- drop policy "onboarding_items staff full"            on public.onboarding_items;
-- drop policy "onboarding_items provider own select"   on public.onboarding_items;
-- drop policy "onboarding_items provider own insert"   on public.onboarding_items;
-- drop policy "onboarding_items provider own update"   on public.onboarding_items;
-- drop policy "profiles staff full"                    on public.profiles;
-- drop policy "profiles own read"                      on public.profiles;
--
-- drop function if exists public.is_staff();
-- drop function if exists public.current_user_role();
-- drop function if exists public.current_provider_id();
-- drop table if exists public.profiles;
--
-- commit;
