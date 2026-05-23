-- =============================================================
-- Provider Solutions CRM — Phase 3 slice 3a: credentialing core
--
-- Layered credentialing model per ROADMAP.md "Next up" item 3:
--
--   provider_licenses     — provider-level. State medical licenses.
--                           Matching reads this layer (specialty
--                           plus state license + current core
--                           credentials in 3b/Phase 4).
--   credentials           — provider-level. Core credentials not
--                           tied to a state or facility: board
--                           certification, DEA, BLS/ACLS,
--                           malpractice, etc.
--   facility_privileges   — facility-level. Bridges a provider to
--                           a specific hospital (organization).
--                           The per-placement gate — readiness for
--                           an opportunity requires privileges at
--                           the opportunity's hospital.
--
-- Also creates the private `credentials` storage bucket — NOT
-- public-read (unlike organization-logos and provider-photos in
-- 0002). Documents are served via createSignedUrl from the client,
-- which checks the authenticated user's SELECT policy below.
--
-- The cross-provider expiration dashboard (UI) reads all three
-- tables bucketed by expiration_date; the expiration_date indexes
-- below back that view.
--
-- Slice 3a scope: schema + manual entry UI + cross-provider
-- expiration view. The onboarding/privileging checklists and
-- computed shift-eligibility readiness view (3b), and the daily
-- credential-alerts Supabase Edge Function (3c), are separate
-- slices and not included here.
--
-- Originally penciled as 0003 in BUILD_PLAN; the 0003 slot was
-- consumed by the travel-cost migration, so credentialing lands
-- here as 0004. The 0002 comment referencing "0003_credentialing"
-- is stale; 0002 is immutable and is not edited to fix it.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

-- ─── 1. provider_licenses ───────────────────────────────────────
-- `pending` status supports the workflow of pursuing a new state
-- license before it's granted (an explicit recruiting motion, not
-- a data quirk).
--
-- State is CHECK-constrained to the explicit US_STATES list (50
-- states + DC) because this column drives Phase 4 matching
-- ("licensed in state X") — a typo here silently breaks a match,
-- which is higher stakes than the display-only address fields on
-- organizations.state and providers.home_state (both free-text by
-- precedent, intentionally not retrofitted). The explicit list
-- also catches values like 'XX' that a 2-char regex would pass.
-- Adding a new licensure jurisdiction (territories like PR, GU,
-- VI) is a deliberate future migration, not data drift.
create table public.provider_licenses (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers(id) on delete cascade,
  state           text not null check (state in (
                    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
                    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
                    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
                    'DC'
                  )),
  license_number  text,
  status          text not null check (status in ('active', 'pending', 'expired')),
  issue_date      date,
  expiration_date date,
  document_path   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint provider_licenses_dates_ordered check (
    issue_date is null
    or expiration_date is null
    or expiration_date >= issue_date
  )
);

create index provider_licenses_provider_id_idx     on public.provider_licenses(provider_id);
create index provider_licenses_expiration_date_idx on public.provider_licenses(expiration_date);

create trigger provider_licenses_set_updated_at
  before update on public.provider_licenses
  for each row execute function public.set_updated_at();

-- ─── 2. credentials ─────────────────────────────────────────────
-- Provider-level core credentials. `credential_type` is enum-like;
-- the named set covers what's on the table today (board cert, DEA,
-- BLS, ACLS, malpractice). `other` is the catch-all for anything
-- not enumerated — new explicit types (e.g., PALS) come in via a
-- future migration when the need is real, not speculatively.
--
-- `label` is a free-text human-readable name for the credential.
-- Optional for the named types (the type already says what it is —
-- "DEA", "ACLS", etc. read fine on their own), but REQUIRED when
-- credential_type = 'other' so two `other` rows are distinguishable
-- (PALS vs ATLS vs NRP vs anything else not yet enumerated). Use
-- the UI to display label when present, otherwise fall back to the
-- enum label. `identifier` stays separate — that's the certificate
-- or DEA number, not a name.
create table public.credentials (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers(id) on delete cascade,
  credential_type text not null check (credential_type in (
                    'board_certification', 'dea', 'bls', 'acls',
                    'malpractice', 'other'
                  )),
  label           text,
  identifier      text,
  status          text not null check (status in ('active', 'pending', 'expired')),
  issue_date      date,
  expiration_date date,
  document_path   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,

  constraint credentials_dates_ordered check (
    issue_date is null
    or expiration_date is null
    or expiration_date >= issue_date
  ),

  -- When credential_type = 'other', label must be populated and
  -- non-blank so the row is identifiable. Named types may omit it.
  constraint credentials_other_requires_label check (
    credential_type <> 'other'
    or (label is not null and char_length(trim(label)) > 0)
  )
);

create index credentials_provider_id_idx     on public.credentials(provider_id);
create index credentials_expiration_date_idx on public.credentials(expiration_date);

create trigger credentials_set_updated_at
  before update on public.credentials
  for each row execute function public.set_updated_at();

-- ─── 3. facility_privileges ─────────────────────────────────────
-- Bridges a provider to a specific hospital (organization). The
-- statuses model the privilege lifecycle: pending application,
-- active grant, expired, denied (by the hospital), or withdrawn
-- (by the provider). Cascade-deletes from both parents — a deleted
-- provider or a deleted hospital takes its privileges with it.
create table public.facility_privileges (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.providers(id)     on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  status            text not null check (status in (
                      'pending', 'active', 'expired', 'denied', 'withdrawn'
                    )),
  application_date  date,
  approval_date     date,
  expiration_date   date,
  document_path     text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,

  -- Date ordering: application sits before approval, approval sits
  -- before expiration. Any leg may be null while the privilege
  -- moves through the cycle; pairs are only compared when both
  -- ends are populated.
  constraint facility_privileges_dates_ordered check (
    (application_date is null or approval_date    is null or approval_date    >= application_date)
    and (approval_date is null or expiration_date is null or expiration_date >= approval_date)
  )
);

create index facility_privileges_provider_id_idx     on public.facility_privileges(provider_id);
create index facility_privileges_organization_id_idx on public.facility_privileges(organization_id);
create index facility_privileges_expiration_date_idx on public.facility_privileges(expiration_date);

create trigger facility_privileges_set_updated_at
  before update on public.facility_privileges
  for each row execute function public.set_updated_at();

-- ─── 4. Row-Level Security ──────────────────────────────────────
-- Phase 1 strategy continues (BUILD_PLAN §4.5): any authenticated
-- user can SELECT/INSERT/UPDATE/DELETE everything. No anonymous
-- access. Role-based RLS (admin/recruiter/viewer via a profiles
-- table) is still deferred — gating note in ROADMAP.md before any
-- user beyond Jason and Reed gets an account.

alter table public.provider_licenses    enable row level security;
alter table public.credentials          enable row level security;
alter table public.facility_privileges  enable row level security;

create policy "authenticated all access on provider_licenses"
  on public.provider_licenses for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on credentials"
  on public.credentials for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on facility_privileges"
  on public.facility_privileges for all to authenticated
  using (true) with check (true);

-- ─── 5. Storage bucket: credentials (private) ───────────────────
-- The `credentials` bucket is private (public=false) — unlike the
-- two Phase 2 public-read buckets, getPublicUrl returns a non-
-- functional URL here. Documents are accessed via createSignedUrl
-- from the client, which checks the authenticated user's SELECT
-- policy below before issuing a short-lived signed URL.
--
-- No anonymous access; only authenticated users can read, write,
-- update, or delete. Per-provider scoping (only the assigned
-- recruiter sees a provider's docs) is a future profiles-table
-- concern that lives with role-based RLS.

insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

create policy "authenticated read on credentials"
  on storage.objects for select to authenticated
  using (bucket_id = 'credentials');

create policy "authenticated insert on credentials"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'credentials');

create policy "authenticated update on credentials"
  on storage.objects for update to authenticated
  using (bucket_id = 'credentials')
  with check (bucket_id = 'credentials');

create policy "authenticated delete on credentials"
  on storage.objects for delete to authenticated
  using (bucket_id = 'credentials');
