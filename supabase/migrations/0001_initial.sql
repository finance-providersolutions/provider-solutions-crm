-- =============================================================
-- Provider Solutions CRM — initial schema
-- Phase 1: organizations, contacts, activities
-- See BUILD_PLAN.md §4.1 (entities) and §4.3 (activity model).
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

create extension if not exists pgcrypto;

-- ─── shared updated_at trigger function ─────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── organizations ──────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text check (type in ('hospital', 'locums_partner', 'other')),
  website     text,
  address     text,
  city        text,
  state       text,
  zip         text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ─── contacts ───────────────────────────────────────────────────
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name      text,
  last_name       text,
  title           text,
  role            text check (role in (
                    'decision_maker', 'scheduler', 'credentialing',
                    'billing', 'clinical', 'other'
                  )),
  email           text,
  phone           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create index contacts_organization_id_idx on public.contacts(organization_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ─── activities ─────────────────────────────────────────────────
-- Polymorphic log of touches (calls, emails, meetings, notes, sms).
-- Per BUILD_PLAN §4.3 (Option A): all 4 fk columns exist from day
-- one, but only organization_id and contact_id carry REFERENCES in
-- Phase 1. Phase 2 adds REFERENCES for opportunity_id and
-- provider_id when those parent tables are introduced.
create table public.activities (
  id              uuid primary key default gen_random_uuid(),
  activity_type   text not null check (activity_type in (
                    'call', 'email', 'meeting', 'note', 'sms'
                  )),
  subject         text,
  body            text,
  occurred_at     timestamptz not null default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete cascade,
  opportunity_id  uuid,  -- Phase 2: alter to add references opportunities(id)
  provider_id     uuid,  -- Phase 2: alter to add references providers(id)
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  -- Exactly one parent must be non-null. CHECK covers all four
  -- columns from day one to avoid migration churn in Phase 2.
  constraint activities_one_parent check (
    (case when organization_id is not null then 1 else 0 end)
    + (case when contact_id      is not null then 1 else 0 end)
    + (case when opportunity_id  is not null then 1 else 0 end)
    + (case when provider_id     is not null then 1 else 0 end)
    = 1
  )
);

create index activities_organization_id_idx on public.activities(organization_id);
create index activities_contact_id_idx      on public.activities(contact_id);
create index activities_occurred_at_idx     on public.activities(occurred_at desc);

-- ─── Row-Level Security ─────────────────────────────────────────
-- Phase 1 strategy (BUILD_PLAN §4.5): any authenticated user can
-- SELECT/INSERT/UPDATE/DELETE everything. No anonymous access.
-- Phase 2+ will introduce profiles + role-based policies.

alter table public.organizations enable row level security;
alter table public.contacts      enable row level security;
alter table public.activities    enable row level security;

create policy "authenticated all access on organizations"
  on public.organizations for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on contacts"
  on public.contacts for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on activities"
  on public.activities for all to authenticated
  using (true) with check (true);
