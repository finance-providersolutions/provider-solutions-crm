# ROADMAP — Provider Solutions CRM

Scope is this app only. Cross-app and suite-level work lives in ps-apps-suite/docs/.

## In flight

Phase 2 schema migration. supabase/migrations/0002_pipelines.sql is written and adds providers, opportunities (with the full six-bill / five-pay rate structure plus shift defaults, on-call window, and a modeling_assumptions jsonb column), tasks, and placements; adds appsheet_id and image columns to organizations; wires the placeholder activities.opportunity_id and provider_id columns to real foreign keys; turns on Phase 1-style permissive RLS on the four new tables; creates organization-logos and provider-photos public-read buckets with authenticated-write policies; and seeds Medicus Healthcare Solutions. The migration has not yet been applied to Supabase.

Phase 2 image upload plumbing. components/uploads/ImageUpload.jsx (drag-drop, progress, size/type validation, designed to extend into Phase 3 credentials), components/uploads/Thumb.jsx (thumbnail with initials fallback), utils/storage.js (getPublicUrl wrapper + initialsFor helper), and shadcn avatar and progress primitives are in place. Organization.jsx detail page now renders the organization logo via Thumb.

Phase 2 AppSheet import script. scripts/import-from-appsheet.js is written — local-only Node script that reads the AppSheet snapshot workbook from the suite-level _reference/ folder, normalizes specialty and position type, parses City/ST, upserts providers, organizations, and opportunities by appsheet_id, and uploads image binaries from _reference/appsheet-images/ when present. Dry-run mode required. Has not yet been run against the live Supabase project.

## Next up

Phase 2 — apply 0002_pipelines.sql to Supabase, then run the AppSheet import in dry-run, review the log, and run it for real.

Phase 2 — opportunities pages. List view with kanban-by-stage and table modes plus filters, and a detail page with associated activities, tasks, suggested-providers placeholder, and the GP modeler section.

Phase 2 — providers pages. List view with status, specialty, and search filters and provider photo thumbnails in rows. Detail page with activities, tasks, placements, header photo, and a credentialing tab placeholder for Phase 3.

Phase 2 — tasks page. Three views (my open tasks, all open tasks, completed in last 30 days) with quick-complete.

Phase 2 — GP modeler component on opportunity detail. Live computation from the opportunity's rate-structure fields times saved utilization assumptions. Saves the assumption blob to opportunities.modeling_assumptions. Estimates render in italic with the warning color and a tilde prefix.

Phase 2 — updated Home dashboard. Replace the Phase 1 KPIs with pipeline-aware ones: open opportunities by stage, active providers, tasks due today, and recent activity. Wire any opportunity-vs-actuals views to the qbo-proxy worker rather than copying QBO data into Supabase.

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
