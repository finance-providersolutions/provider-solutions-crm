# Phase 2 Kickoff Prompt for Claude Code

> **Document version**: v1 (Phase 2 — pipelines, AppSheet import, image
> support, GP modeler).
>
> Paste the prompt block at the bottom into Claude Code after completing the
> prerequisites. There are no `[PASTE HERE]` placeholders for this phase —
> all configuration values are either already in the repo (Supabase URL,
> publishable key, in `src/api/supabase.js`) or supplied by Jason at run time
> (service role key for the import script).

---

## Prerequisites (do these before pasting the prompt)

### A. Phase 1 must be shipped

1. Phase 1 is deployed and the deployment URL is captured in `ps-app-crm/README.md`.
2. The Phase 1 schema is live in Supabase: `organizations`, `contacts`, and `activities` exist; the `activities` table has all four nullable FK columns (`organization_id`, `contact_id`, `opportunity_id`, `provider_id`) with `REFERENCES` only on `organization_id` and `contact_id`; the CHECK constraint covers all four columns; the `updated_at` trigger is in place. (Phase 2's migration adds the missing `REFERENCES` for `opportunity_id` and `provider_id` once the parent tables exist.)
3. You can sign in, create an organization + contact, and log an activity against them. If anything is broken in Phase 1, fix that first — do not start Phase 2 on top of broken Phase 1 state.

### B. Reference data

4. Confirm `_reference/Snapshot of AppSheet Data - Provider Solutions (2026-05-05).xlsx` is present in the suite parent (`C:\Users\jmcdavid\OneDrive\ps-apps-suite\_reference\`) and OneDrive has finished syncing it (cloud icon, not the spinning sync icon).
5. **Image export (best-effort)** — export the AppSheet image storage into `_reference/appsheet-images/`, preserving the folder structure referenced by the workbook's path strings. Specifically:
   - `_reference/appsheet-images/Providers_Images/<id>.Photo.<timestamp>.{png|jpg}`
   - `_reference/appsheet-images/Locations_Images/<id>.Logo.<timestamp>.{png|jpg}`
   - `_reference/appsheet-images/Locations_Images/<id>.Image.<timestamp>.{png|jpg}`

   The AppSheet images typically live in a Google Drive folder owned by the AppSheet app. Download → unzip → drop into `_reference/appsheet-images/` keeping the relative paths intact.

   This is **best-effort**: partial coverage is fine, and the folder being missing entirely is fine. The import script logs missing images per row and leaves the corresponding `logo_path` / `image_path` / `photo_path` fields null. You can re-upload via the CRM UI for any record where the image matters right now.

### C. Supabase service role key (for the import script ONLY)

6. The one-time AppSheet import script bypasses RLS to insert legacy data. It needs the **service role key**, which is fundamentally different from the publishable key already shipping in the frontend.

   Where it lives: Supabase dashboard → **Settings → API → service_role key** (starts with `sb_secret_...`).

   How to use it: set it as an env var **only when running the script**, e.g. on Windows PowerShell:
   ```
   $env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."
   node scripts/import-from-appsheet.js --dry-run
   ```
   On macOS/Linux:
   ```
   SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." node scripts/import-from-appsheet.js --dry-run
   ```

7. **The service role key never goes in:**
   - frontend code
   - `src/api/supabase.js`
   - any `.env` file that gets committed to git
   - any chat message pasted into Claude Code

   `.env` (if used locally) must be `.gitignore`d. The key lives only in Jason's terminal session env at run time.

### D. Local prerequisites

8. Same as Phase 1 — Node 20+, Supabase CLI installed. If you upgraded machines since Phase 1, re-verify with `node -v`.

### E. Claude Code session

9. Close any existing Claude Code session in this workspace.
10. Open a fresh terminal at the **parent folder** `ps-apps-suite\` (NOT at `ps-app-crm\`). Same as Phase 1.
11. Run `claude` to start a fresh session — do not carry Phase 1 conversation state into Phase 2. The repo + `BUILD_PLAN.md` + `CLAUDE.md` + `docs/appsheet-schema-notes.md` + this file are the handoff.
12. Paste the prompt below.

---

## The prompt

```
We're starting Phase 2 of the Provider Solutions CRM. The current working
directory is ps-apps-suite/, the suite-level parent. The CRM repo is at
ps-app-crm/ (Phase 1 already shipped). The sibling folders —
ps-app-dashboard/, _reference/, .claude/, .wrangler/ — are READ-ONLY.
Never modify, create, or delete files outside of ps-app-crm/ for any
reason. Reading from _reference/ is allowed (the AppSheet snapshot
workbook and image export folder both live there).

DOCS TO READ FIRST
- ps-app-crm/BUILD_PLAN.md — full architecture, data model (§4.1, §4.6),
  Phase 2 deliverables (§7), suite migration roadmap (§10).
- ps-app-crm/CLAUDE.md — conventions, hard rules, what this app is NOT.
- ps-app-crm/docs/appsheet-schema-notes.md — the AppSheet study that
  drove the Phase 2 schema. §D is the schema proposal that's now in
  §4.1 of BUILD_PLAN. §E is the GP modeler input model. §F has the
  resolved decisions including the specialty/position_type
  normalization mapping table.

After reading those, also re-orient on Phase 1 by reading the live code
in ps-app-crm/src/ — pages, hooks, brand components, AuthContext, the
0001_initial.sql migration. Phase 2 builds on Phase 1, so consistency
with what's already there matters more than reinventing patterns.

PHASE 2 GOAL
The full sales motion runs in the app:
- Opportunities can be created, edited, viewed in a kanban-by-stage and
  in a table; full rate structure on each opportunity per BUILD_PLAN §4.1.
- Providers can be created, edited, viewed; photos render in list rows
  and detail headers.
- Tasks drive day-to-day follow-up.
- Placements (the bridge between provider and opportunity) exist in the
  schema for Phase 4 to use; Phase 2 does NOT need to build the full
  placement creation UI yet, but the table must exist.
- Legacy AppSheet data (providers, organizations, opportunities) is
  migrated into Supabase via a one-time import script that Jason runs
  locally — Claude Code writes the script but does not run it.
- Image support is wired across the schema: organization logos,
  organization images, provider photos.
- The opportunity detail page has a working interactive GP modeler that
  projects weekly / monthly / annual gross profit and GP margin from the
  rate structure × user-adjustable utilization assumptions.

DELIVERABLES (all paths relative to ps-app-crm/)

A. Database
1. supabase/migrations/0002_pipelines.sql — full schema for opportunities
   (with the 6+5+jsonb rate/modeler structure per BUILD_PLAN §4.1),
   providers (per §4.1), tasks (per §4.3), placements (per §4.3).
   Add appsheet_id text columns (nullable, unique-where-not-null) on
   organizations, providers, and opportunities. ALTER TABLE activities
   to add REFERENCES for opportunity_id and provider_id (do NOT touch
   the Phase 1 CHECK constraint — it already covers all four FK
   columns and stays as-is). Match the CHECK constraints listed in
   BUILD_PLAN §4.1 for opportunities (on-call columns required when
   on_call_enabled = true; rates >= 0; regular_hours_per_day BETWEEN
   0 AND 24). RLS enabled on all new tables with the same Phase 1
   policy (any authenticated user, all CRUD). Audit columns
   (created_at, updated_at, created_by) on user-editable tables;
   updated_at trigger.

   Storage bucket creation (organization-logos, provider-photos,
   both public read with authenticated write via RLS) goes inside
   0002_pipelines.sql, not a separate migration. Phase 2 is one
   atomic schema change. Phase 3 will create the private credentials
   bucket as part of 0003_credentialing.sql at its own phase boundary.

   Seed insert (also inside 0002_pipelines.sql): one organization row
   for 'Medicus Healthcare Solutions' with type = 'locums_partner'.
   This is the only LOCUMs partner currently relevant to legacy
   AppSheet data; additional partners are added through the CRM UI
   as relationships develop. Use ON CONFLICT DO NOTHING so the
   migration is safely re-runnable.

B. AppSheet import script
3. scripts/import-from-appsheet.js — Node script run locally by Jason.
   Reads _reference/Snapshot of AppSheet Data - Provider Solutions
   (2026-05-05).xlsx directly (use the xlsx package — already in the
   dashboard's deps as a pattern; install for the CRM if not present).
   Imports providers, organizations (type='hospital' for AppSheet
   "Locations"), and opportunities. Does NOT import shifts, daily
   shift logs, timesheets, or any other tab — those are out of CRM
   scope per BUILD_PLAN §10.

   Behavior requirements (from BUILD_PLAN §7 deliverable #2):
   - Idempotent on appsheet_id: re-runs upsert by AppSheet ID, never
     duplicate.
   - --dry-run flag prints planned writes without touching the
     database.
   - Reads SUPABASE_SERVICE_ROLE_KEY from process.env. If missing,
     exits with a clear error message. Never hardcodes the key.
     Hardcodes the Supabase URL as a constant at the top of the
     script with a comment: "// Duplicated from src/api/supabase.js
     — keep in sync if it ever changes." Do not import from
     src/api/supabase.js — that file assumes a browser environment
     and pulls in frontend deps. Two lines of duplication is the
     right trade-off.
   - Specialty / position_type normalization: maps AppSheet values to
     canonical CRM values per the table in
     docs/appsheet-schema-notes.md §F. Every normalization is logged
     as INFO. Values that don't match a known mapping are flagged
     needs-review in the log; the row is NOT silently coerced.
   - Address parsing: populate address (full AppSheet string), parse
     city + state from the "City, ST" field, leave zip null. No
     street regex.
   - Image migration: if _reference/appsheet-images/ exists, upload
     matching binaries (per the AppSheet path strings in the
     workbook) into the organization-logos and provider-photos
     buckets. Populate logo_path / image_path / photo_path with the
     resulting Supabase Storage paths. If the folder is absent or
     a specific image binary is missing, log per row and leave the
     field null — do NOT error out. Idempotent: don't re-upload an
     image that's already in the manifest.
   - Image manifest at _reference/appsheet-image-import-manifest.json:
     mapping AppSheet image path → Supabase Storage path. Read at
     start (if exists) to skip already-uploaded images; written
     atomically at end.
   - Source partner override: after importing organizations and
     opportunities, apply a hardcoded SOURCE_PARTNER_OVERRIDES map
     (declared at the top of the script, well-commented) to set
     source_partner_id on affected opportunities. Current entries:
     the two Billings Clinic opportunities (looked up by AppSheet
     Opportunity ID) → 'Medicus Healthcare Solutions'. The script
     resolves the partner by name to its organizations.id and
     patches the rows. If a target partner organization doesn't
     exist (e.g., the seed insert from the migration didn't run),
     the script logs ERROR and exits non-zero. Map updates are
     committed to the script file like any other code change.
   - Per-run log at _reference/import-run-YYYY-MM-DD-HHMM.log
     (UTC or local — pick one and document it). Plain text, one
     issue per line, severity prefix (INFO / WARN / ERROR). Top of
     log summarizes counts: inserted / updated / skipped / flagged.
     Below: one line per flagged row with reason.
   - Exit code 0 on success (including dry-run); non-zero on hard
     error (e.g., missing service role key, workbook unreadable).

   The script lives in scripts/, not in src/. It does not ship to
   the deployed CRM. Add scripts/ to the build's exclude list if
   needed so Vite doesn't try to bundle it.

C. Image support
4. src/components/uploads/ImageUpload.jsx — reusable drag-drop
   uploader. Props: bucket, pathPrefix, onUploaded(path), maxSizeMB,
   acceptedTypes. Shows progress, validates size and MIME type.
   Built so it can be extended for Phase 3 credential document
   uploads (different bucket, signed-URL retrieval) without
   rewriting.
5. Default-placeholder rendering for missing logos/photos in list
   rows and detail headers — neutral, on-brand, no broken-image
   icons. Inline this in the page components or extract a tiny
   helper if it's used in 3+ places (per BUILD_PLAN §8 extraction
   rules).

D. GP modeler component
6. src/components/opportunities/GPModeler.jsx — interactive component
   on the opportunity detail page. Inputs split into:
   - Rate structure (read-only display from the opportunity row;
     all 6 bill + 5 pay dimensions + shift defaults + on-call window
     per BUILD_PLAN §4.1).
   - Utilization assumptions (user-adjustable form): defaults from
     docs/appsheet-schema-notes.md §E.2 — shifts/week, working
     days/shift, orientation days/placement, OT hours per working
     day, on-call nights/shift, call-back hours/call-night, adv.
     shift bonus days/shift, other bonus days/shift, weeks billable
     per year.
   Output: weekly / monthly / annual GP and GP margin computed per
   docs/appsheet-schema-notes.md §E.3, updated live as inputs
   change. Reuses currency/percent formatters from
   src/utils/formatters.js. Estimates rendered with the italic + ~
   prefix + text-warning treatment per the design system.

   Two actions:
   - "Save assumptions to opportunity" → writes the assumption
     blob to opportunities.modeling_assumptions (jsonb).
   - "Reset to defaults" → clears the local form back to the
     documented defaults (does not touch the database).

E. Pages
7. src/pages/Opportunities.jsx — dual view: kanban-by-stage AND
   table. Filters: stage, specialty, state, and source partner.
   The source-partner filter is a dropdown over partner
   organizations (type = 'locums_partner') with options "All" /
   "Direct (no partner)" / one entry per partner. When an
   opportunity row or kanban card has a source_partner_id, render
   a small "via [partner name]" badge near the hospital name. The
   same badge appears on the opportunity detail header and any
   other place opportunities show up as a list-row preview. "New
   opportunity" dialog. Row/card click → /opportunities/:id.

   Opportunity create/edit dialog: required "Hospital" picker —
   searchable combobox over organizations where type = 'hospital',
   with "+ Create new hospital" inline action. Optional "Source
   partner" picker — searchable combobox over organizations where
   type = 'locums_partner', with "+ Create new partner" inline
   action; defaults to "Direct (no partner)". Both pickers use the
   shadcn Command primitive.
8. src/pages/Opportunity.jsx — detail page. Edit core fields, edit
   the rate structure (collapsible section), set stage / probability
   / next_action_date, view associated activities and tasks,
   placeholder section for "Suggested providers" (Phase 4), and the
   GPModeler component. Logo of the parent organization rendered in
   the header, with the via-partner badge alongside the hospital
   name when source_partner_id is set.
9. src/pages/Providers.jsx — table with status filter, specialty
   filter, free-text search. Provider photo thumbnail in each row.
   "New provider" dialog.
10. src/pages/Provider.jsx — detail page. Edit provider info, view
    activities and tasks against this provider, list of placements
    (read-only for now — Phase 4 builds the create flow). Photo in
    header. Credentialing tab is a placeholder for Phase 3.
11. src/pages/Tasks.jsx — three views via shadcn Tabs: "My open",
    "All open", "Completed (last 30d)". Quick-complete checkbox on
    each row. New-task dialog.
12. Update src/pages/Home.jsx — replace Phase 1 placeholder KPIs with
    real ones: open opportunities by stage (small bar/sparkline or
    a row of small KPI cards), active providers, tasks due today,
    recent activity feed (already there from Phase 1, keep it).

F. Hooks
13. src/hooks/useOpportunities.js — same shape as the Phase 1 hooks.
14. src/hooks/useProviders.js
15. src/hooks/useTasks.js
16. src/hooks/usePlacements.js (read-only list for now; Phase 4
    extends to writes)

G. Navigation
17. Update src/components/brand/Navigation.jsx — add nav links for
    Opportunities, Providers, Tasks. Phase 1 links (Home,
    Organizations, Contacts) stay.

H. shadcn/ui primitives — add via CLI on top of Phase 1's set
- Phase 1 already installed: button, input, label, dialog,
  dropdown-menu, table, badge, sonner, select, textarea, tabs.
- Phase 2 additions:
    - popover, calendar (for date pickers on start_date / end_date /
      next_action_date / due_date)
    - switch (on_call_enabled, hours_guaranteed)
    - tooltip
    - separator
    - avatar (provider photo display)
    - command (searchable combobox for organization picker, etc.)
    - checkbox (filters, task quick-complete)
    - progress (image upload progress bar)
- If you decide a primitive in this list isn't needed, say so and
  skip it. If you want one not in this list, add it and say why.

CONFIGURATION I'LL PROVIDE
None for this phase. The Supabase URL and publishable key are
already in src/api/supabase.js (from Phase 1). The service role key
the import script needs is set by Jason as a local env var
(SUPABASE_SERVICE_ROLE_KEY) at run time only, never in the codebase
and never pasted into this chat.

CONSTRAINTS
- Plain JSX, no TypeScript. No .ts/.tsx files. No tsconfig.json.
- Tailwind utilities by default. shadcn/ui for primitives. Brand
  components in src/components/brand/ remain the same five from
  Phase 1 — do NOT add new brand components in this phase unless
  a genuinely distinctive new pattern emerges, in which case stop
  and ask first.
- Long Tailwind utility strings are NOT a reason to extract a
  component. Same extraction rules as Phase 1.
- Avoid dangerouslySetInnerHTML unless genuinely needed; comment why.
- Do NOT install @supabase/auth-helpers or @supabase/ssr. Bare
  @supabase/supabase-js + the existing AuthContext is the pattern.
- Do NOT install React Query, SWR, or any data-fetching library.
  Custom hooks per resource (matching Phase 1).
- Surface errors via sonner toast. No silent catches.
- ABSOLUTE: do not create, edit, or delete any file outside of
  ps-app-crm/. Reading from _reference/ is allowed (the AppSheet
  snapshot workbook and the image export folder both live there).
  If anything seems to require touching ps-app-dashboard/, .claude/,
  or .wrangler/, stop and ask first.

DO NOT RUN THE IMPORT SCRIPT
- Claude Code WRITES scripts/import-from-appsheet.js in this session.
- Claude Code does NOT run it. Not even with --dry-run.
- Jason runs it locally with the service role key in his env. After
  Jason runs it, he'll share the import log; if rows were flagged
  needs-review, that may produce a small follow-on commit to adjust
  the normalization map or fix data. That's expected.
- Do NOT put the service role key in any file. Do NOT ask Jason to
  paste it. Do NOT log it anywhere. Read it only from process.env
  at script run time.

WORKING STYLE
- Plan first, then build. Before writing any code:
  (a) confirm in writing that you've read BUILD_PLAN.md, CLAUDE.md,
      docs/appsheet-schema-notes.md, and the existing ps-app-crm/src
      from Phase 1.
  (b) show me the file plan — every file you intend to create or
      modify, grouped by deliverable section (A through H above).
  (c) show me the migration outline for 0002 (and 0003 if you split
      the buckets out) — table definitions in pseudo-DDL, RLS
      policies summary, the ALTER TABLE activities line.
  (d) show me the import script outline — file structure, the order
      of operations (load workbook → for each sheet → normalize →
      upsert → image upload → manifest write → log close), and the
      shape of the per-run log.
  (e) show me the GP modeler approach — component structure
      (rate display vs assumption form vs computed output), how
      live updates flow (useState? useReducer?), and the formula
      mapping to BUILD_PLAN §E.3.
  Wait for my "go" before writing any code.
- If the GP modeler starts feeling like a stretch goal mid-session,
  surface that BEFORE writing it, not midway through. It's OK to
  ship Phase 2 without the GP modeler if the alternative is rushed
  half-done UX, but only if we agree to defer it explicitly.
- Commit at logical checkpoints. Suggested commits:
  (a) 0002_pipelines.sql migration (includes the two storage buckets)
      + RLS policies + ALTER TABLE for activities. Apply with
      `supabase db push` (or local equivalent) before moving on.
  (b) scripts/import-from-appsheet.js + the dry-run code path.
      Stop here, summarize, wait for Jason to run --dry-run and
      share the log before continuing. That dry-run is the
      validation gate for the script.
  (c) ImageUpload component + storage bucket integration tested
      manually against a single org or provider.
  (d) Opportunities CRUD pages (list, detail, create dialog).
  (e) Providers CRUD pages + photos rendered.
  (f) Tasks page + new-task dialog + nav link added.
  (g) GP modeler.
  (h) Home dashboard KPI updates + final polish.
- After each commit, summarize what's done and what's next, then
  wait.
- If you hit something underspecified, stop and ask. Don't guess on
  schema, normalization mappings, RLS policy shape, or GP formula
  edge cases. The schema notes are detailed; the answer is probably
  in there — if not, ask.

START HERE
1. Read ps-app-crm/BUILD_PLAN.md and ps-app-crm/CLAUDE.md fully.
2. Read ps-app-crm/docs/appsheet-schema-notes.md fully.
3. Skim ps-app-crm/src/ to re-orient on Phase 1 patterns
   (AuthContext, RequireAuth, the existing pages, hooks shape,
   brand components).
4. Look at ps-app-crm/supabase/migrations/0001_initial.sql for the
   migration style to match.
5. Confirm in writing:
   - You understand Phase 2 scope per BUILD_PLAN.md §7 and the
     four major deliverable groups (database + import script +
     image support + GP modeler) on top of the Phase 2 pages.
   - You will not modify any file outside ps-app-crm/.
   - You will not run scripts/import-from-appsheet.js. Jason runs
     it locally with the service role key in env.
   - You will use plain JSX (no TypeScript), the existing brand
     components, and add only the listed shadcn primitives.
6. Propose the file plan, the migration outline, the import script
   outline, and the GP modeler approach.
7. Wait for my go-ahead before writing any code.
```

---

## After Phase 2 ships

Open a new Claude Code session for Phase 3 (credentialing) with a similarly scoped kickoff doc. Don't carry Phase 2 conversation state into Phase 3 — the repo + `BUILD_PLAN.md` + `CLAUDE.md` + `docs/appsheet-schema-notes.md` are the handoff. Phase 3 introduces `provider_licenses`, `credentials`, `facility_privileges`, the private `credentials` storage bucket, the cross-provider expiration dashboard, and the daily credential-alerts edge function. The `ImageUpload` component built in Phase 2 extends to credential document uploads.
