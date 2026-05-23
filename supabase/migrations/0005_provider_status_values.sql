-- =============================================================
-- Provider Solutions CRM — provider status value swap
--
-- Replaces the providers.status CHECK constraint to match the new
-- PROVIDER_STATUSES list in src/utils/constants.js:
--
--   added:   'target'      — pre-engagement (identified for
--                            outreach, no signal yet)
--            'declined'    — they withdrew (not interested, took
--                            other work, went quiet)
--   removed: 'credentialed' — credentialing readiness is now
--                            computed from the 0004 credentialing
--                            tables, not a manual provider status.
--                            Keeping it as a status would create
--                            a drifting second source of truth.
--   split:   the old 'disqualified' is now two distinct terminal
--            stages — 'declined' (they walked) and 'disqualified'
--            (we screened them out). At-a-glance visual split
--            between the two is load-bearing in the UI's badge.
--
-- Applied as NOT VALID so the constraint adds without scanning the
-- existing table — rows still holding the removed 'credentialed'
-- value continue to read normally and render with the fallback
-- badge in the UI.
--
-- Subtle gotcha worth knowing: NOT VALID skips the initial scan
-- but the CHECK is still enforced on every future write — so
-- editing any field on a stale 'credentialed' row will fail
-- unless the same edit also moves status to a value in the new
-- list. That failure surfaces via the existing toast.error path
-- in ProviderFormDialog; it is the prompt to reassign the status.
-- Per-row reassignment is being handled manually as those rows
-- surface, not via a batch UPDATE here.
--
-- Once all stale rows are gone, the constraint can be formally
-- validated against the historical data:
--
--   alter table public.providers validate constraint providers_status_check;
--
-- That statement is intentionally NOT part of this migration —
-- VALIDATE scans the table at apply time and would fail here on
-- the still-present 'credentialed' rows. Run it manually later
-- as a someday cleanup step, after the orphaned values are gone.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

alter table public.providers drop constraint providers_status_check;

alter table public.providers add constraint providers_status_check
  check (status in (
    'target', 'lead', 'contacted', 'interested',
    'interviewing', 'onboarding',
    'active', 'inactive', 'declined', 'disqualified'
  )) not valid;
