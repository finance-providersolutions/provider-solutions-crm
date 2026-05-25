-- =============================================================
-- Provider Solutions CRM — add 'selected' to placements.status
--
-- Phase 4b introduces the Selected lifecycle state — the recruiter's
-- internal "committed this provider to this opportunity" link,
-- distinct from the Scheduler-owned downstream statuses. Selected is
-- opportunity-specific and lives on placements; Applied and
-- Privileged remain derived from facility_privileges and are
-- hospital-specific.
--
-- This migration is ADDITIVE only — it relaxes the placements.status
-- CHECK constraint to include 'selected' alongside the existing five
-- values. None of the existing values are removed or renamed; the
-- future Scheduler app will continue to use proposed / accepted /
-- active / completed / cancelled for its own lifecycle.
--
-- The DEFAULT remains 'proposed'. The CRM's Select action writes
-- status='selected' explicitly; the default applies only if some
-- future caller inserts a row without specifying status. No data
-- migration — no existing rows (the table is empty as of 4a) and
-- new rows are explicit.
--
-- Migrations are immutable once shipped. Never edit this file after
-- it has been applied to a Supabase environment — add a new
-- numbered migration instead.
-- =============================================================

alter table public.placements drop constraint placements_status_check;

alter table public.placements add constraint placements_status_check
  check (status in (
    'selected',
    'proposed', 'accepted', 'active',
    'completed', 'cancelled'
  ));
