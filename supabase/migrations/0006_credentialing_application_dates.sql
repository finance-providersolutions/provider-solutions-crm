-- =============================================================
-- Provider Solutions CRM — application_date on licenses + credentials
--
-- Adds a nullable `application_date date` column to
-- public.provider_licenses and public.credentials. Brings the two
-- tables in line with public.facility_privileges (which already
-- carries application_date alongside approval_date) so all three
-- credentialing sections share one consistent four-state UI model:
--
--   1. expiration_date set AND in the past  → "Expired"
--   2. granting date present                → "Active"
--          (issue_date for licenses + credentials;
--           approval_date for facility_privileges)
--   3. application_date present              → "Applied"
--   4. otherwise                              → "Pending"
--
-- No CHECK constraint changes here. No backfill. No data migration
-- — every existing row keeps its current issue/expiration values
-- untouched and the new column simply defaults to NULL. Each row
-- can be edited later to populate application_date if the
-- recruiter wants the Applied stage recorded historically; not
-- doing so just means the row continues to read as Pending until
-- an issue_date is set, which matches today's behavior.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

alter table public.provider_licenses
  add column application_date date;

alter table public.credentials
  add column application_date date;
