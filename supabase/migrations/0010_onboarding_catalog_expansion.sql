-- =============================================================
-- Provider Solutions CRM — onboarding catalog expansion
--
-- Two nullable columns and six new catalog rows on top of 0008.
--
-- New columns on onboarding_item_types:
--   template_path  — path within the `credentials` storage bucket
--                    where the blank fillable template PDF lives,
--                    e.g. 'templates/w9/v2024-03.pdf'. Null for
--                    catalog items with no template (the information-
--                    shaped items below — emergency contact info and
--                    the malpractice COI which the provider supplies
--                    from their carrier).
--   version        — version identifier for the template, e.g. '1.0'
--                    for in-house forms or '2024-03' for an IRS-
--                    revisioned W-9. Null whenever template_path is
--                    null. Stored alongside template_path so the
--                    rendered catalog row can name what version the
--                    provider downloaded without parsing the path.
--
-- The four template PDFs are uploaded to the existing private
-- `credentials` bucket (from 0004) by scripts/upload-onboarding-
-- templates.js, run once after this migration applies. No new
-- bucket; templates and per-provider documents coexist in the same
-- private bucket under different path prefixes (templates/{item_key}/
-- v{version}.pdf for blanks; {row_id}/{uuid}.{ext} for signed copies).
--
-- HIPAA Acknowledgment is intentionally NOT seeded here — the
-- template language has not been drafted yet. It will land in a
-- follow-on migration once the language is ready.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied — add a new numbered migration.
-- =============================================================

-- ─── 1. New columns on the catalog ──────────────────────────────
alter table public.onboarding_item_types
  add column template_path text,
  add column version        text;

-- ─── 2. New catalog rows ────────────────────────────────────────
-- Sort orders sit after the existing 10 / 20 / 30 from 0008 so the
-- catalog renders in lifecycle order: existing intake items first
-- (CV, references, background check), then the new document and
-- information items below.
insert into public.onboarding_item_types
  (key, label, repeatable, sort_order, template_path, version) values
  ('physician_services_agreement', 'Physician Services Agreement',     false, 40, 'templates/physician_services_agreement/v1.0.pdf', '1.0'),
  ('attestation',                  'Physician Attestation',            false, 50, 'templates/attestation/v1.0.pdf',                  '1.0'),
  ('w9',                           'IRS Form W-9',                     false, 60, 'templates/w9/v2024-03.pdf',                       '2024-03'),
  ('direct_deposit',               'Direct Deposit Authorization',     false, 70, 'templates/direct_deposit/v1.0.pdf',               '1.0'),
  ('emergency_contact',            'Emergency Contact Information',    false, 80, null,                                              null),
  ('malpractice_coi',              'Malpractice Insurance Certificate',false, 90, null,                                              null)
on conflict (key) do nothing;
