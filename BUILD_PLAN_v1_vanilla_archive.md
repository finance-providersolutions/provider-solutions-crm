# Provider Solutions CRM — Build Plan

## 1. Project identity

**Provider Solutions CRM** is the second app in the Provider Solutions internal app suite. It supports growth of the LOCUMs physician staffing business along two axes:

- **Demand**: tracking opportunities from LOCUMs partners (Medicus, etc.) and direct hospital relationships
- **Supply**: recruiting, credentialing, and managing providers (GI MDs initially; NPs, CRNAs, etc. later)

It complements (does not replace) the existing **Financial Dashboard** (live, Cloudflare Pages, QBO + Sheets) and **AppSheet** (live, used by providers for shift activity logging). Future apps in the suite — scheduling/shift management and a provider portal that eventually replaces AppSheet — will share this CRM's backend.

**Users at launch**: Jason + Reed. Designed to scale to admin staff within months. Auth is real from day one.

**Volume target (year 1)**: 4 → 8 active opportunities; tens of provider leads in the pipeline at any time. Optimize for clarity and data integrity over high-volume throughput.

## 2. Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Database / Auth / Storage | **Supabase** (Postgres, GoTrue auth, Storage, Edge Functions) | Flat $25/mo regardless of seat count (vs. AppSheet per-user); RLS for future role-based access; one stack for data, files, and auth |
| Frontend | **Vanilla JS + multi-page HTML** | Same model as the financial dashboard; per-page files keep changes isolated |
| Hosting | **Cloudflare Pages** | Same as the financial dashboard; trivial custom-domain setup |
| Charts (when needed) | Chart.js + chartjs-plugin-datalabels | Match dashboard conventions |
| Spreadsheet export | SheetJS (CDN) | Match dashboard conventions |
| Edge functions / cron | Supabase Edge Functions | Daily credential-expiration alert emails |
| Email | Resend (or Supabase SMTP) via Edge Function | Cheap, simple, good deliverability |

**Not used**: build tooling (no Vite/webpack), frameworks (no React), bundlers. Files served as-is.

## 3. Design system (matches financial dashboard)

```css
--bg:        #0b1c2e;
--surface:   #122540;
--surface-2: #18304f;
--accent:    #7ee8e8;   /* teal — primary action / GP */
--income:    #3ecf8e;   /* green — revenue / positive */
--warning:   #c8a840;   /* amber — estimates, soon-to-expire */
--danger:    #e25c5c;   /* red — expired, COGS, lost */
--text:      #e8eef5;
--text-dim:  #8aa1b8;
--border:    #1d3556;
```

Fonts: **DM Serif Display** (h1/h2 only), **DM Sans** (body), **DM Mono** (numbers, IDs).

Status color conventions:
- Active / current / won → `--income`
- In-progress / proposed → `--accent`
- Estimate / soon-expiring → `--warning` (italic, `~` prefix when shown as $)
- Expired / lost / COGS → `--danger`

## 4. Data model

> All tables live in the `public` schema. UUIDs everywhere. `created_at`, `updated_at`, `created_by` audit columns on user-editable tables. RLS enabled on all tables.

### 4.1 Core entities

**organizations** — both hospitals and LOCUMs partners

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | |
| type | text | `hospital` \| `locums_partner` \| `other` |
| website | text | |
| address, city, state, zip | text | |
| notes | text | freeform |
| created_at, updated_at, created_by | | |

**contacts** — people at organizations

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk → organizations | |
| first_name, last_name | text | |
| title | text | |
| role | text | `decision_maker` \| `scheduler` \| `credentialing` \| `billing` \| `clinical` \| `other` |
| email, phone | text | |
| notes | text | |

**opportunities** — open positions to fill

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk → organizations | the hospital |
| source_partner_id | uuid fk → organizations, nullable | e.g., Medicus; null for direct |
| title | text | short label, e.g. "GI MD — Memorial Hospital" |
| specialty | text | `GI`, `CRNA`, `NP`, etc. |
| position_type | text | `MD` \| `DO` \| `NP` \| `CRNA` \| `PA` |
| location_city, location_state | text | |
| start_date, end_date | date | nullable until contracted |
| hourly_rate | numeric(10,2) | bill rate to client |
| pay_rate | numeric(10,2) | what we pay the provider |
| estimated_gp | numeric(12,2) | computed-or-stored, see notes |
| stage | text | see §4.4 |
| probability | int | 0–100 |
| next_action_date | date | drives "what's hot" view |
| notes | text | |

**providers**

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| first_name, last_name | text not null | |
| email, phone | text | |
| npi | text | |
| specialty | text | |
| position_type | text | |
| status | text | see §4.4 |
| source | text | how we found them — `referral`, `inbound`, `partner`, `recruiting`, `other` |
| appsheet_id | text | link to existing AppSheet record (e.g. `c0f9294c` for Reed B. Hogan III) — nullable, populated for active providers |
| notes | text | |

### 4.2 Credentialing tables

**provider_licenses** — state medical licenses

| col | type |
|---|---|
| id, provider_id | uuid |
| state | text (2-letter) |
| license_number | text |
| issued_date, expiration_date | date |
| document_path | text — Supabase Storage path |
| verified_at | timestamptz |
| verified_by | uuid → auth.users |
| verification_source | text — e.g. "FSMB lookup 2025-01-15" |
| notes | text |

**credentials** — everything else expirable/verifiable

| col | type |
|---|---|
| id, provider_id | uuid |
| credential_type | text — `dea`, `board_cert`, `malpractice_coi`, `bls`, `acls`, `pals`, `cv`, `references`, `immunizations_tdap`, `immunizations_flu`, `immunizations_mmr`, `tb_test`, `oig_sam`, `background_check`, `drug_screen`, `npi_verification`, `work_history`, `dl`, `passport`, `other` |
| identifier | text — DEA #, cert #, etc. |
| issued_date, expiration_date | date |
| document_path | text |
| verified_at, verified_by, verification_source | |
| notes | text |

**facility_privileges** — per-hospital privileging (separate because it's facility-specific)

| col | type |
|---|---|
| id, provider_id, organization_id | uuid |
| status | text — `not_started`, `application_submitted`, `under_review`, `granted`, `expired`, `revoked`, `denied` |
| application_date, granted_date, expiration_date | date |
| privileges_document_path | text |
| delineation_document_path | text |
| notes | text |

### 4.3 Activity & workflow tables

**activities** — polymorphic log of touches (calls, emails, meetings, notes)

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| activity_type | text | `call`, `email`, `meeting`, `note`, `sms` |
| subject | text | |
| body | text | |
| occurred_at | timestamptz | |
| organization_id, contact_id, opportunity_id, provider_id | uuid, all nullable | exactly one populated; CHECK constraint enforces |
| created_at, created_by | | |

**tasks** — follow-ups

| col | type |
|---|---|
| id | uuid |
| title, description | text |
| due_date | date |
| status | text — `open`, `completed`, `cancelled` |
| priority | text — `low`, `normal`, `high` |
| assignee_id | uuid → auth.users |
| organization_id, opportunity_id, provider_id | uuid, nullable |
| completed_at | timestamptz |

**placements** — bridge between provider and opportunity (the eventual handoff to the scheduling app)

| col | type |
|---|---|
| id | uuid |
| provider_id, opportunity_id | uuid |
| start_date, end_date | date |
| status | text — `proposed`, `accepted`, `active`, `completed`, `cancelled` |
| pay_rate, bill_rate | numeric(10,2) |
| notes | text |

### 4.4 Pipeline stages (confirmed — can revise later as the sales motion evolves)

**Opportunity stages**:
1. `lead` — surfaced, not yet qualified
2. `qualified` — confirmed real position, gathering details
3. `proposal` — terms / providers submitted
4. `contracted` — agreement signed, pre-fill
5. `filled` — provider placed and active
6. `lost` — closed without fill (capture reason in notes)

**Provider status**:
1. `lead` — identified, not yet contacted
2. `contacted` — outreach made
3. `interested` — replied, willing to engage
4. `interviewing` — under evaluation
5. `onboarding` — agreed, collecting credentials
6. `credentialed` — file complete, ready to be placed
7. `active` — currently placed
8. `inactive` — past provider, not currently placed
9. `disqualified` — won't proceed (capture reason in notes)

### 4.5 RLS strategy

**Phase 1**: any authenticated user can SELECT/INSERT/UPDATE/DELETE all rows. Simple. No anonymous access.

**Phase 2+ (when admin staff added)**: introduce a `profiles` table keyed to `auth.users.id` with a `role` column (`admin`, `recruiter`, `viewer`). Update policies to restrict by role. Don't build this until needed — but design tables so it slots in cleanly.

### 4.6 Storage

Bucket: `credentials` (private). Path convention: `{provider_id}/{credential_type_or_license}/{uuid}.{ext}`. RLS: authenticated users only. Signed URLs for downloads (5-minute expiry).

## 5. Repository layout

The CRM lives inside a **suite-level workspace** at `ps-apps-suite/` so it sits alongside the existing financial dashboard. This keeps both apps visible to Claude Code during development (for style reference and cross-app integration work) without merging them into a single deployment. Each app remains its own git repo and its own Cloudflare Pages project.

```
ps-apps-suite/                         # local workspace (NOT a git repo itself)
│                                      # full path: C:\Users\jmcdavid\OneDrive\ps-apps-suite\
├── .claude/                           # Claude Code session state — leave alone
├── .wrangler/                         # Wrangler cache — leave alone
├── _reference/                        # archived v1 dashboard files — read-only
├── ps-app-dashboard/                  # existing dashboard — READ-ONLY when working on CRM
│   ├── index.html                     # component pattern reference
│   ├── styles_dark.css                # primary style reference for the CRM
│   ├── styles_light.css
│   ├── app.js
│   └── ...                            # all dashboard files; never modify from CRM session
└── ps-app-crm/                        # THIS BUILD — own git repo, own Pages project
    ├── CLAUDE.md
    ├── BUILD_PLAN.md
    ├── PHASE_1_KICKOFF.md
    ├── README.md
    ├── _redirects
    ├── public/                        # served root for Cloudflare Pages
    │   ├── index.html                 # auth-gated home / KPI dashboard
    │   ├── login.html
    │   ├── organizations.html
    │   ├── organization.html          # ?id=... detail
    │   ├── contacts.html
    │   ├── opportunities.html
    │   ├── opportunity.html
    │   ├── providers.html
    │   ├── provider.html              # detail w/ credentialing tab
    │   ├── credentialing.html         # cross-provider expiration view (phase 3)
    │   ├── tasks.html
    │   ├── matching.html              # phase 4
    │   └── assets/
    │       ├── tokens.css             # design tokens — own file for future extraction
    │       ├── shared.css             # base components, layouts (imports tokens)
    │       ├── shared.js              # supabase client, auth, helpers
    │       ├── nav.js
    │       ├── components.js
    │       └── pslogo.jpg
    ├── supabase/
    │   ├── config.toml
    │   ├── migrations/
    │   ├── functions/
    │   │   └── credential-alerts/
    │   └── seed.sql
    ├── .env.example
    └── package.json
```

**Why `tokens.css` is its own file**: when there are 3+ apps in the suite, design tokens get extracted to a shared CDN location (Cloudflare R2 or a shared `assets` Pages project) and every app links to it. Keeping tokens isolated from the start makes that future extraction a one-line change.

## 6. Suite architecture & cross-app integration

The CRM is one of an eventual 3–4 apps in the Provider Solutions suite. The design respects this:

### 6.1 Style consistency

- **Source of truth (today)**: the financial dashboard's `styles_dark.css` (at `../ps-app-dashboard/styles_dark.css`). The CRM's `tokens.css` mirrors its color, spacing, and typography variables exactly.
- **Working pattern**: when building or editing CRM components, Claude Code reads `../ps-app-dashboard/styles_dark.css` and `../ps-app-dashboard/index.html` as reference for component patterns (cards, tables, modals, badges) and replicates them into the CRM with consistent class names and structure.
- **Future**: extract `tokens.css` to a shared location and have both apps link to it, so a token change updates everywhere at once.

### 6.2 Data sharing

Each app keeps its own backend. Cross-app data flow happens via HTTP at the frontend layer:

| Direction | Mechanism | Use case |
|---|---|---|
| CRM → financial dashboard data | CRM calls `qbo-proxy.finance-providersolutions.workers.dev` | Pull actual GP per opportunity from QBO; show on opportunity detail alongside `estimated_gp` |
| Dashboard → CRM data | Dashboard calls Supabase REST endpoint with publishable key | Show pipeline counts, upcoming placements, providers credentialed, on the home dashboard |
| AppSheet → CRM | Manual link via `providers.appsheet_id`; no live sync | Active providers point back to their AppSheet record |
| Future scheduling app → CRM | Reads `placements` table via Supabase | Placements are the contract between CRM and scheduler |

For both directions, CORS must be configured. The CRM's Supabase project should allow the dashboard's deployed origin; the QBO proxy worker should allow the CRM's deployed origin.

### 6.3 Auth

The CRM has real auth (Supabase magic links). The financial dashboard does not currently — it's protected by URL obscurity and the QBO Worker's own token handling. **No attempt is made in this build to unify auth across apps.** When a future app needs to consume CRM data on behalf of a logged-in user, it will use Supabase auth too.

### 6.4 Deferred decisions

- **Shared `tokens.css` extraction** — done when a third app joins the suite, or when token drift becomes painful, whichever comes first.
- **Shared component library** — currently each app has its own copy of buttons/cards/etc. When patterns stabilize across two apps, extract to a shared file.
- **AppSheet replacement (provider portal)** — separate app, separate build, will share the CRM's Supabase backend.

## 7. Phased build plan

### Phase 1 — Foundation (target: 1–2 Claude Code sessions)

Goal: Jason and Reed can log in, create organizations and contacts, and log activities against them.

- Supabase project provisioning (Jason does this once via dashboard; CLI links repo)
- `0001_initial.sql`: organizations, contacts, activities, RLS policies, audit triggers for updated_at
- `assets/shared.css`: design tokens, base typography, common components (cards, tables, buttons, form inputs, toasts)
- `assets/shared.js`: Supabase client init, auth guard, format helpers (currency, date, phone), error toast
- `assets/nav.js`: top nav with current-page highlighting + sign-out
- `login.html`: email magic link sign-in
- `index.html`: auth-gated home with placeholder KPI cards (counts of orgs, contacts, recent activities)
- `organizations.html`: searchable/filterable table; create modal; click-through to detail
- `organization.html`: single-org view; edit; contacts list; activity feed; "log activity" form
- `contacts.html`: cross-org list; create modal
- README with local dev + deploy instructions

**Exit criteria**: deployed to a Cloudflare Pages preview URL; can sign in, create a hospital + a Medicus record + contacts at each, log a call.

### Phase 2 — Demand & supply pipelines (target: 2–3 sessions)

Goal: opportunities and providers have real pipeline visibility; tasks drive day-to-day work.

- `0002_pipelines.sql`: opportunities, providers, tasks, placements (skeleton)
- `opportunities.html`: dual view — kanban by stage AND table; filters (stage, specialty, source partner, state); create/edit
- `opportunity.html`: detail with associated activities, tasks, suggested providers (placeholder for Phase 4)
- `providers.html`: table with status filter, specialty filter, search; create/edit
- `provider.html`: detail with activities, tasks, placements; credentialing tab (placeholder for Phase 3)
- `tasks.html`: "my open tasks", "all open tasks", "completed (last 30d)"; quick-complete
- Update `index.html` home with real KPIs: open opportunities by stage, active providers, tasks due today, recent activity
- Bulk import helper (CSV → providers) for migrating any existing list

**Exit criteria**: full sales motion runnable in the app — opportunity from `lead` → `filled`, provider from `lead` → `credentialed`, all activities/tasks captured.

### Phase 3 — Credentialing (target: 2–3 sessions)

Goal: full self-managed credentialing capability — defensible to a hospital MSO audit.

- `0003_credentialing.sql`: provider_licenses, credentials, facility_privileges, storage bucket policies
- Storage bucket `credentials` configured with RLS
- Provider detail credentialing tab: licenses table, credentials table grouped by type, facility privileges by hospital
- Document upload UI (drag-drop, progress, file size/type validation)
- Signed-URL viewer for documents
- Primary source verification log: "verified by [user] on [date] via [source]" stored on each credential row
- `credentialing.html`: cross-provider expiration dashboard — 30/60/90-day color-coded buckets, sortable, filterable by credential type and provider
- Edge function `credential-alerts`: daily cron, queries expirations in 30/60/90 days, emails team digest via Resend
- Pre-loaded credential checklist templates per position type (MD vs CRNA vs NP)

**Exit criteria**: a complete provider file can be assembled, stored, and verified in the app; a hospital MSO request "send us Dr. X's full credentialing packet" can be fulfilled by exporting a zip of signed URLs.

### Phase 4 — Matching & placement (target: 1–2 sessions)

Goal: close the loop between supply and demand inside the app.

- `matching.html`: filter UI — given an opportunity, find providers matching specialty, licensed in state, with current DEA + malpractice + active board cert
- "Suggested providers" section on opportunity detail
- Placement creation flow: provider + opportunity → placement record with rates and dates
- Placement status transitions
- Update home dashboard: placements active, ending soon, GP-at-risk

**Exit criteria**: from an open opportunity, can identify and propose a credentialed provider in under a minute; placement record is the contract for the future scheduling app to consume.

### Out of scope (intentionally deferred)

- Provider portal (replaces AppSheet) — separate app, after Phase 4
- Scheduling / shift calendar — separate app
- Direct ingestion of QBO actuals into CRM views — financial dashboard stays the source of truth for actuals
- Two-way sync with AppSheet — read-only `appsheet_id` link is enough for now

## 8. Conventions

- **Database**: `snake_case` table and column names; UUIDs as PKs; `created_at`/`updated_at`/`created_by` on user-editable tables; CHECK constraints for enum-like text columns; never delete — soft-delete with `deleted_at` only if needed (Phase 1: hard delete is fine)
- **JavaScript**: `camelCase`; one ES module per page (`<script type="module" src="...">`); no inline event handlers — use `data-*` attributes + delegated listeners (lesson from financial dashboard)
- **CSS**: variables defined once in `shared.css`; per-page styles only when truly page-specific; `border-collapse:separate` + `position:sticky` for frozen panes (lesson from financial dashboard)
- **Errors**: surface to user via toast component; log full error to console; never swallow silently
- **Files**: one HTML page per major workflow; sub-pages for detail views (e.g., `provider.html?id=...`)
- **Migrations**: numbered, immutable once shipped; new changes go in new migrations
- **Secrets**: only in Supabase dashboard env / Cloudflare Pages env; never committed; `.env.example` documents required keys

## 9. Project decisions

Confirmed:

1. **URL**: Cloudflare Pages default subdomain (e.g., `provider-solutions-crm.pages.dev`, determined by the project name chosen when the Cloudflare Pages project is created). No custom domain required; can be added later if desired.
2. **Opportunity stages**: per §4.4 above
3. **Provider statuses**: per §4.4 above
4. **Credential alert recipient**: `all.provider.solutions@gmail.com` (used by the Phase 3 daily expiration digest)

Still open:

5. **Existing provider data** — any list to bulk-import in Phase 2 (e.g., the providers currently active in AppSheet), or starting fresh and adding manually? [TO CONFIRM]
