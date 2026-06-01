-- =============================================================
-- Provider Solutions CRM — Phase 2 schema
--
-- Adds the demand/supply pipeline:
--   - opportunities (with full 6-bill / 5-pay rate structure
--     per BUILD_PLAN §4.1)
--   - providers
--   - tasks
--   - placements (table only; create-flow UI ships in Phase 4)
--
-- Also:
--   - appsheet_id columns on organizations, providers, opportunities
--     (text, nullable, unique) so legacy AppSheet records can be
--     matched stably during the transition.
--   - Image columns on organizations + providers, plus the two
--     public-read storage buckets (organization-logos, provider-photos).
--   - ALTER TABLE activities to add foreign-key constraints for
--     opportunity_id and provider_id (the Phase 1 CHECK constraint
--     covering all four FK columns is left untouched per BUILD_PLAN).
--   - Seed: one row for 'Medicus Healthcare Solutions' as a
--     locums_partner (the only LOCUMs partner relevant to legacy
--     AppSheet data; new partners are added through the CRM UI).
--
-- Phase 2 is one atomic schema change. Phase 3 will create the
-- private `credentials` bucket as part of 0003_credentialing.sql.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

-- ─── 0. defensive idempotency: ensure set_updated_at() exists ─────
-- The set_updated_at() trigger function was created in Phase 1's
-- 0001_initial.sql and should already exist in any environment
-- where Phase 1 was applied. This `create or replace` block makes
-- 0002 safe to apply regardless of Phase 1's actual state in the
-- target database — if the function exists with this exact body,
-- the statement is a no-op; if it's missing (e.g., partial 0001
-- copy-paste in a dashboard SQL editor), this restores it before
-- the new triggers below try to reference it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. organizations: add appsheet_id + image / recruiting cols ──
alter table public.organizations
  add column appsheet_id       text,
  add column logo_path         text,
  add column image_path        text,
  add column tourist_site_url  text,
  add column long_description  text;

create unique index organizations_appsheet_id_uidx
  on public.organizations(appsheet_id)
  where appsheet_id is not null;

-- ─── 2. providers ─────────────────────────────────────────────────
create table public.providers (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  middle_name          text,
  suffix               text,
  email                text,
  phone                text,
  npi                  text,
  specialty            text,
  position_type        text check (position_type in (
                         'MD', 'DO', 'NP', 'CRNA', 'PA'
                       )),
  home_city            text,
  home_state           text,
  photo_path           text,
  aadvantage_number    text,
  flight_preference    text,
  shirt_size           text,
  status               text check (status in (
                         'lead', 'contacted', 'interested',
                         'interviewing', 'onboarding', 'credentialed',
                         'active', 'inactive', 'disqualified'
                       )),
  source               text check (source in (
                         'referral', 'inbound', 'partner',
                         'recruiting', 'other'
                       )),
  archived             boolean not null default false,
  appsheet_id          text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null
);

create unique index providers_appsheet_id_uidx
  on public.providers(appsheet_id)
  where appsheet_id is not null;

create index providers_status_idx    on public.providers(status);
create index providers_specialty_idx on public.providers(specialty);
create index providers_archived_idx  on public.providers(archived);

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

-- ─── 3. opportunities ─────────────────────────────────────────────
-- Rate columns live directly on this table per BUILD_PLAN §4.1 and
-- docs/CRM-appsheet-schema-notes.md §D. Six bill-side dimensions, five
-- pay-side dimensions, plus shift defaults and on-call window.
-- Future split into a sibling opportunity_rate_cards table is a
-- Phase 5+ candidate (see schema notes §D for trigger conditions).
create table public.opportunities (
  id                                uuid primary key default gen_random_uuid(),
  organization_id                   uuid not null
                                      references public.organizations(id)
                                      on delete cascade,
  source_partner_id                 uuid
                                      references public.organizations(id)
                                      on delete set null,
  appsheet_id                       text,
  title                             text,
  name                              text,
  position_type                     text check (position_type in (
                                      'MD', 'DO', 'NP', 'CRNA', 'PA'
                                    )),
  specialty                         text,
  setting                           text check (setting in (
                                      'inpatient', 'outpatient', 'other'
                                    )),
  location_city                     text,
  location_state                    text,
  start_date                        date,
  end_date                          date,

  -- shift defaults
  shift_time_in                     time,
  shift_time_out                    time,
  regular_hours_per_day             numeric(5,2),
  hours_guaranteed                  boolean not null default true,
  ot_threshold_hours                numeric(5,2) not null default 0,

  -- bill-side rates (6 dimensions)
  bill_orientation_hourly           numeric(10,2) not null default 0,
  bill_regular_hourly               numeric(10,2),
  bill_ot_hourly                    numeric(10,2),
  bill_advanced_shift_bonus_daily   numeric(10,2) not null default 0,
  on_call_enabled                   boolean not null default false,
  bill_on_call_nightly              numeric(10,2),
  bill_call_back_hourly             numeric(10,2),
  call_start_time                   time,
  call_end_time                     time,

  -- pay-side rates (5 dimensions)
  pay_orientation_daily             numeric(10,2) not null default 0,
  pay_regular_daily                 numeric(10,2),
  pay_advanced_shift_bonus_daily    numeric(10,2) not null default 0,
  pay_on_call_nightly               numeric(10,2),
  pay_other_bonus_daily             numeric(10,2) not null default 0,

  -- GP modeler persistence (utilization assumptions; rate fields
  -- stay as columns above so they're queryable)
  modeling_assumptions              jsonb,

  -- pipeline
  stage                             text check (stage in (
                                      'lead', 'qualified', 'proposal',
                                      'contracted', 'filled', 'lost'
                                    )),
  probability                       int check (probability between 0 and 100),
  next_action_date                  date,
  notes                             text,

  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  created_by                        uuid references auth.users(id) on delete set null,

  -- on-call columns must be populated when on-call is enabled
  constraint opportunities_on_call_consistent check (
    on_call_enabled = false
    or (bill_on_call_nightly is not null
        and pay_on_call_nightly is not null)
  ),

  -- regular hours bounded to a real day
  constraint opportunities_regular_hours_range check (
    regular_hours_per_day is null
    or regular_hours_per_day between 0 and 24
  ),

  -- every numeric rate column is non-negative when populated
  constraint opportunities_rates_nonneg check (
    bill_orientation_hourly         >= 0
    and bill_advanced_shift_bonus_daily >= 0
    and pay_orientation_daily       >= 0
    and pay_advanced_shift_bonus_daily  >= 0
    and pay_other_bonus_daily       >= 0
    and ot_threshold_hours          >= 0
    and (bill_regular_hourly        is null or bill_regular_hourly        >= 0)
    and (bill_ot_hourly             is null or bill_ot_hourly             >= 0)
    and (bill_on_call_nightly       is null or bill_on_call_nightly       >= 0)
    and (bill_call_back_hourly      is null or bill_call_back_hourly      >= 0)
    and (pay_on_call_nightly        is null or pay_on_call_nightly        >= 0)
    and (pay_regular_daily          is null or pay_regular_daily          >= 0)
  )
);

create unique index opportunities_appsheet_id_uidx
  on public.opportunities(appsheet_id)
  where appsheet_id is not null;

create index opportunities_organization_id_idx   on public.opportunities(organization_id);
create index opportunities_source_partner_id_idx on public.opportunities(source_partner_id);
create index opportunities_stage_idx             on public.opportunities(stage);
create index opportunities_next_action_date_idx  on public.opportunities(next_action_date);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ─── 4. tasks ─────────────────────────────────────────────────────
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  due_date        date,
  status          text not null default 'open'
                    check (status in ('open', 'completed', 'cancelled')),
  priority        text not null default 'normal'
                    check (priority in ('low', 'normal', 'high')),
  assignee_id     uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  opportunity_id  uuid references public.opportunities(id) on delete cascade,
  provider_id     uuid references public.providers(id)     on delete cascade,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create index tasks_assignee_id_idx    on public.tasks(assignee_id);
create index tasks_status_idx         on public.tasks(status);
create index tasks_due_date_idx       on public.tasks(due_date);
create index tasks_organization_id_idx on public.tasks(organization_id);
create index tasks_opportunity_id_idx on public.tasks(opportunity_id);
create index tasks_provider_id_idx    on public.tasks(provider_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ─── 5. placements ────────────────────────────────────────────────
-- Bridge between provider and opportunity. The eventual handoff to
-- the future scheduling app. Phase 2 ships the schema only —
-- create-flow UI lands in Phase 4.
create table public.placements (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers(id)     on delete cascade,
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  start_date      date,
  end_date        date,
  status          text not null default 'proposed'
                    check (status in (
                      'proposed', 'accepted', 'active',
                      'completed', 'cancelled'
                    )),
  pay_rate        numeric(10,2),
  bill_rate       numeric(10,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint placements_rates_nonneg check (
    (pay_rate  is null or pay_rate  >= 0)
    and (bill_rate is null or bill_rate >= 0)
  )
);

create index placements_provider_id_idx    on public.placements(provider_id);
create index placements_opportunity_id_idx on public.placements(opportunity_id);
create index placements_status_idx         on public.placements(status);

create trigger placements_set_updated_at
  before update on public.placements
  for each row execute function public.set_updated_at();

-- ─── 6. activities: wire up the previously placeholder FK columns ─
-- Phase 1 created opportunity_id and provider_id as plain uuid (no
-- REFERENCES) because the parent tables didn't exist yet. The CHECK
-- constraint covering all four FK columns was added in Phase 1 and
-- is left untouched here per BUILD_PLAN §4.3.
alter table public.activities
  add constraint activities_opportunity_id_fkey
    foreign key (opportunity_id)
    references public.opportunities(id)
    on delete cascade;

alter table public.activities
  add constraint activities_provider_id_fkey
    foreign key (provider_id)
    references public.providers(id)
    on delete cascade;

create index activities_opportunity_id_idx on public.activities(opportunity_id);
create index activities_provider_id_idx    on public.activities(provider_id);

-- ─── 7. Row-Level Security ────────────────────────────────────────
-- Phase 1 strategy continues (BUILD_PLAN §4.5): any authenticated
-- user can SELECT/INSERT/UPDATE/DELETE everything. No anonymous
-- access. Phase 2+ profile-based roles slot in cleanly later.

alter table public.providers     enable row level security;
alter table public.opportunities enable row level security;
alter table public.tasks         enable row level security;
alter table public.placements    enable row level security;

create policy "authenticated all access on providers"
  on public.providers for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on opportunities"
  on public.opportunities for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on tasks"
  on public.tasks for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on placements"
  on public.placements for all to authenticated
  using (true) with check (true);

-- ─── 8. Storage buckets ───────────────────────────────────────────
-- Two public-read buckets per BUILD_PLAN §4.6. Public read so logos
-- and photos render without signing every URL; writes are gated to
-- authenticated users via RLS on storage.objects.
--
-- The Phase 3 `credentials` bucket is intentionally NOT created
-- here — it ships in 0003_credentialing.sql, private, signed-URL
-- only.

insert into storage.buckets (id, name, public)
values
  ('organization-logos', 'organization-logos', true),
  ('provider-photos',    'provider-photos',    true)
on conflict (id) do nothing;

-- Public read: anyone (anon or authenticated) can SELECT objects in
-- the two public buckets. This is what makes getPublicUrl() work
-- without auth.
create policy "public read on organization-logos"
  on storage.objects for select
  using (bucket_id = 'organization-logos');

create policy "public read on provider-photos"
  on storage.objects for select
  using (bucket_id = 'provider-photos');

-- Authenticated write: insert / update / delete on the two public
-- buckets is restricted to authenticated users.
create policy "authenticated insert on organization-logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-logos');

create policy "authenticated update on organization-logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'organization-logos')
  with check (bucket_id = 'organization-logos');

create policy "authenticated delete on organization-logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'organization-logos');

create policy "authenticated insert on provider-photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'provider-photos');

create policy "authenticated update on provider-photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'provider-photos')
  with check (bucket_id = 'provider-photos');

create policy "authenticated delete on provider-photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'provider-photos');

-- ─── 9. Seed: Medicus Healthcare Solutions ────────────────────────
-- Currently the only LOCUMs partner relevant to legacy AppSheet
-- data. The import script's SOURCE_PARTNER_OVERRIDES map looks this
-- row up by name to set source_partner_id on the two Billings
-- Clinic opportunities. Additional partners are added through the
-- CRM UI as relationships develop.
--
-- organizations.name is not unique, so ON CONFLICT can't be used
-- meaningfully here. The WHERE NOT EXISTS form gives the same
-- "safely re-runnable" property without forcing a unique constraint
-- on a name column where it doesn't generally belong.
insert into public.organizations (name, type)
select 'Medicus Healthcare Solutions', 'locums_partner'
where not exists (
  select 1 from public.organizations
  where name = 'Medicus Healthcare Solutions'
);
