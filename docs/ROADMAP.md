# ROADMAP — Provider Solutions CRM

Scope is this app only. Cross-app and suite-level work lives in ps-apps-suite/docs/.

## In flight

Nothing actively under development right now. Phase 1 shipped. Recent finishing touches landed in the last few sessions: PWA install metadata, iOS safe-area-inset-top handling on the fixed header and pages, and switching login from magic link to a 6-to-10 digit email OTP so the flow stays inside the installed PWA.

## Next up

Phase 2 — opportunities and providers pipeline. New tables (opportunities with the full bill-side and pay-side rate structure, providers, tasks, placements), the activities FK constraints for opportunity_id and provider_id added by ALTER TABLE, plus storage buckets for organization-logos and provider-photos. Two new pages each for opportunities and providers (list and detail), a Tasks page, and an updated Home with real pipeline KPIs.

Phase 2 — one-time AppSheet import. A local-only Node script at scripts/import-from-appsheet.js reads from _reference/Snapshot of AppSheet Data - Provider Solutions (2026-05-05).xlsx, normalizes specialty and position type, parses City/ST, and upserts providers, organizations, and opportunities by appsheet_id. Idempotent, dry-run required, run by Jason locally with the service role key in env. Image binaries from _reference/appsheet-images/ upload to the public-read storage buckets when present.

Phase 2 — GP modeler on opportunity detail. Live computation from the rate-structure fields on the opportunity row times saved utilization assumptions (shifts per week, OT hours per day, on-call frequency, etc.). Saves the assumption blob to opportunities.modeling_assumptions as jsonb. Estimates render in italic with the warning color and a tilde prefix per the design system.

Phase 2 — image upload component. A reusable src/components/uploads/ImageUpload.jsx with drag-drop, progress, and size/type validation, written so it can extend into Phase 3 credential document uploads against the private credentials bucket.

Phase 3 — credentialing. New tables for provider_licenses, credentials, and facility_privileges, a private credentials storage bucket with RLS and signed-URL viewing, a cross-provider expiration dashboard with 30/60/90-day buckets, and a daily credential-alerts Supabase Edge Function that emails the team digest via Resend to all.provider.solutions@gmail.com.

Phase 4 — matching and placement. A Matching page that filters providers against an opportunity by specialty, state license, and current credentials. Suggested-providers section on opportunity detail. Placement creation flow as the eventual handoff to the future scheduling app.

Role-based RLS. Before granting accounts beyond Jason and Reed, introduce a profiles table keyed to auth.users with admin, recruiter, and viewer roles, and tighten the all-access Phase 1 policies.

## Considered and parked

Two-way sync with AppSheet — parked. Sync is a real engineering project (conflicts, idempotency, dead-letter queues) and the suite trajectory makes it unnecessary. Read-only appsheet_id linkage is enough until AppSheet retires.

Provider portal as part of this app — parked. It is a separate app in the suite, built after Phase 4 against the same Supabase backend. Combining it with the CRM would conflate internal and external user surfaces.

Scheduling and shift calendar inside the CRM — parked. Separate suite app. Placements are the contract; the scheduler reads them.

Direct ingestion of QBO actuals into CRM tables — parked. The financial dashboard remains the source of truth for actuals. The CRM will fetch via the qbo-proxy worker on demand instead of duplicating data.

Soft-delete with deleted_at — parked for Phase 1. Acceptable to revisit if accidental hard-deletes cause real data loss; today the cascade is gated only by window.confirm.

TypeScript migration — parked. The dashboard is plain JSX and the CRM matches for suite consistency. Revisit only if a third suite app starts in TS.

React Query or SWR — parked. Custom hooks per resource are simple, mirror the dashboard, and are sufficient at current data volumes.

Shared component library across the suite — parked permanently. Each app owns its components. shadcn copies primitives into the repo by design. Consistency comes from shared tokens, not shared components.

Shared tokens.css extraction into a package — parked until a third suite app exists or token drift becomes painful. Today tokens are manually mirrored from the dashboard.
