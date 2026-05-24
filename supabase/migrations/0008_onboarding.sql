-- =============================================================
-- Provider Solutions CRM — onboarding checklist (Phase 3b final)
--
-- Two tables and three seed rows. No new storage bucket; onboarding
-- documents land in the existing private `credentials` bucket from
-- 0004 (same committee-sensitive surface).
--
-- Model — three kinds of checklist row, ONE section on the provider
-- detail page:
--
--   DERIVED              "License on file", "DEA on file" — read-only,
--                        computed from 3a credentialing rows. NEVER
--                        stored here. No catalog seed for these.
--
--   SINGLE PERSISTED     catalog items expected once per provider
--                        (e.g. cv, background_check). One row per
--                        (provider, item_key).
--
--   REPEATABLE PERSISTED catalog items that may repeat (e.g.
--                        references). Zero-to-many rows per
--                        (provider, item_key).
--
-- Item-key reference choice — REPORT: this migration uses a real
-- foreign key from onboarding_items.item_key to
-- onboarding_item_types(key) with on delete restrict. Existing
-- enum-like text columns elsewhere (credentials.credential_type,
-- provider_licenses.state) lean on CHECK constraints instead, but
-- those reference HARD-CODED lists baked into the migration. The
-- onboarding catalog is the first surface in this repo that's an
-- editable table — a real FK keeps onboarding_items honest as the
-- catalog evolves (orphan rows on a typo'd item_key would silently
-- vanish from the UI). on delete restrict so a catalog row that's
-- already in use can't be removed by accident.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

-- ─── 1. onboarding_item_types (the catalog) ─────────────────────
-- Edited via direct SQL until the polish-pass admin UI ships.
-- `key` is the stable identifier referenced from onboarding_items
-- and any future readiness logic — keep it lower-snake.
create table public.onboarding_item_types (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  label           text not null,
  repeatable      boolean not null default false,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger onboarding_item_types_set_updated_at
  before update on public.onboarding_item_types
  for each row execute function public.set_updated_at();

-- ─── 2. onboarding_items (per-provider persisted rows) ──────────
-- One row per single-persisted item per provider; zero-to-many rows
-- per repeatable item per provider. `done` is the explicit toggle;
-- `completed_date` is auto-stamped at toggle-on time so the surface
-- can show "completed N days ago" without a separate write path.
-- `document_path` points into the `credentials` bucket at
-- `<row id>/<uuid>.<ext>`, mirroring 3a credentialing rows so each
-- row owns its own folder (cascade-friendly on delete).
create table public.onboarding_items (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers(id) on delete cascade,
  item_key        text not null references public.onboarding_item_types(key) on delete restrict,
  done            boolean not null default false,
  completed_date  date,
  document_path   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create index onboarding_items_provider_id_idx on public.onboarding_items(provider_id);
create index onboarding_items_item_key_idx    on public.onboarding_items(item_key);

create trigger onboarding_items_set_updated_at
  before update on public.onboarding_items
  for each row execute function public.set_updated_at();

-- ─── 3. Row-Level Security ──────────────────────────────────────
-- Matches the 0004 credentialing tables: any authenticated user
-- gets full access. Role-based RLS is still deferred.
alter table public.onboarding_item_types enable row level security;
alter table public.onboarding_items      enable row level security;

create policy "authenticated all access on onboarding_item_types"
  on public.onboarding_item_types for all to authenticated
  using (true) with check (true);

create policy "authenticated all access on onboarding_items"
  on public.onboarding_items for all to authenticated
  using (true) with check (true);

-- ─── 4. Catalog seed ────────────────────────────────────────────
-- License and DEA are DERIVED from 3a credentialing rows and
-- intentionally have NO catalog entries here — the UI computes
-- their done state from the credentialing tables, not from rows
-- in onboarding_items.
insert into public.onboarding_item_types (key, label, repeatable, sort_order) values
  ('cv',                'CV',               false, 10),
  ('references',        'References',       true,  20),
  ('background_check',  'Background check', false, 30)
on conflict (key) do nothing;
