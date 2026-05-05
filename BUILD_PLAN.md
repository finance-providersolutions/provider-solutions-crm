# Provider Solutions CRM — Build Plan

> **Document version**: v2 (React + Vite + Tailwind + shadcn/ui).
> The original vanilla-JS multi-page plan is archived as
> `BUILD_PLAN_v1_vanilla_archive.md` in this folder for historical reference.

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
| Database / Auth / Storage | **Supabase** (Postgres, GoTrue auth, Storage, Edge Functions) | Flat $25/mo regardless of seat count; RLS for future role-based access; one stack for data, files, and auth |
| Frontend framework | **React 18** (plain JSX, no TypeScript) | Same as `ps-app-dashboard/`; consistent suite developer experience |
| Build tool | **Vite 5** | Same as the dashboard |
| Routing | **react-router-dom 6** (SPA, BrowserRouter) | Same as the dashboard |
| Styling | **Tailwind CSS 3** + design tokens via CSS variables | Utility-first; brand identity preserved through token mapping |
| Component primitives | **shadcn/ui** (installed via CLI into `src/components/ui/`) | Production-quality accessible primitives — dialog, dropdown, form, table, popover, sheet, tabs, command, sonner-toast, badge, etc. — for a wide-and-shallow CRM |
| Variant / class management | **clsx** + **tailwind-variants** | Conditional class composition + variant-driven components |
| Hosting | **Cloudflare Pages** (same as `ps-app-dashboard/`) | Suite consistency; `public/_redirects` with `/* /index.html 200` handles SPA fallback |
| Charts (when needed) | Chart.js + chartjs-plugin-datalabels (npm) | Same as the dashboard |
| Spreadsheet export | xlsx (npm) | Same as the dashboard |
| Edge functions / cron | Supabase Edge Functions | Daily credential-expiration alert emails (Phase 3) |
| Email | Resend (or Supabase SMTP) via Edge Function | Phase 3 |

**Not used**: TypeScript (the dashboard is plain JSX; the CRM matches), test framework (none in Phase 1), data-fetching libraries (no React Query / SWR — custom hooks per resource, mirroring the dashboard).

## 3. Design system

Brand identity is shared with the financial dashboard. The mechanism: a single set of design tokens (CSS variables) lives in `src/styles/tokens.css`; the Tailwind config maps utility class names onto those variables; components consume Tailwind utilities. Brand-distinctive components (KPI card, page header, nav drawer, etc.) get hand-mirrored from the dashboard so they are visually recognizable.

### 3.1 Tokens

`src/styles/tokens.css` defines two `:root` blocks — dark default, light override via `data-theme="light"`. Values mirror the dashboard's `src/index.css` exactly:

```css
:root {
  --bg:           #0b1c2e;
  --grid:         #0d2040;
  --surface:      #122540;
  --surface2:     #1a3050;
  --border:       #7ee8e860;
  --accent:       #7ee8e8;
  --accent-dim:   #7ee8e818;
  --accent2:      #b8f4f4;
  --accent-bright:#00e0ff;
  --text:         #dff4f4;
  --text-dim:     #7eb8c8;
  --text-muted:   #3a6a7a;
  --radius:       5px;
  --g:            #3ecf8e;   /* income / positive / won */
  --r:            #ff8080;   /* danger / lost / expired */
  --gp:           #7ee8e8;   /* gross profit / accent variant */
  --warning:      #c8a840;   /* CRM addition — amber for estimates / soon-expiring */
  --header-h:     58px;
  --footer-h:     52px;
}

:root[data-theme="light"] {
  --bg:           #f0f6fb;
  --grid:         #dceaf4;
  --surface:      #ffffff;
  --surface2:     #e8f2f9;
  --border:       #7ee8e840;
  --accent:       #0e8080;
  --accent-dim:   #0e808014;
  --accent2:      #0a6060;
  --accent-bright:#0099aa;
  --text:         #1a3048;
  --text-dim:     #2a5070;
  --text-muted:   #6090b0;
  --g:            #1a7a3a;
  --r:            #c03030;
  --gp:           #0e8080;
  --warning:      #8a6f1c;
}
```

`shadcn/ui`'s expected token names (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`, `--popover`, `--muted`, `--destructive`, `--ring`, `--input`, etc.) are also defined in `tokens.css`, computed from the brand values above. This lets shadcn primitives Just Work while the brand tokens remain the single source of truth. Exact mapping is decided at scaffold time; the principle is one source.

### 3.2 Tailwind theme mapping

`tailwind.config.js` extends `theme.colors` so utilities resolve to the variables:

```js
colors: {
  bg:              'var(--bg)',
  surface:         'var(--surface)',
  surface2:        'var(--surface2)',
  border:          'var(--border)',
  accent:          'var(--accent)',
  'accent-dim':    'var(--accent-dim)',
  'accent-bright': 'var(--accent-bright)',
  text:            'var(--text)',
  'text-dim':      'var(--text-dim)',
  'text-muted':    'var(--text-muted)',
  income:          'var(--g)',
  danger:          'var(--r)',
  warning:         'var(--warning)',
  gp:              'var(--gp)',
},
fontFamily: {
  display: ['"DM Serif Display"', 'serif'],   // h1/h2 only
  sans:    ['"DM Sans"', 'sans-serif'],       // body
  mono:    ['"DM Mono"', 'monospace'],        // numbers, labels, IDs
},
borderRadius: {
  DEFAULT: 'var(--radius)',
},
```

Utilities like `bg-surface`, `text-accent`, `border-border`, `font-display`, `text-income`, `text-danger`, `bg-warning` then resolve to the dashboard's exact values.

### 3.3 Status color conventions

| State | Token | Tailwind utility |
|---|---|---|
| Active / current / won | `--g` | `text-income` / `bg-income` |
| In-progress / proposed | `--accent` | `text-accent` |
| Estimate / soon-expiring | `--warning` | `text-warning` (italic, `~` prefix when shown as $) |
| Expired / lost / COGS | `--r` | `text-danger` |

### 3.4 Fonts

Loaded via `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');` at the top of `src/index.css` (before tokens.css and Tailwind directives, per CSS spec).

- `font-display` → DM Serif Display (h1, h2 only)
- `font-sans` → DM Sans (body, default)
- `font-mono` → DM Mono (numbers, IDs, small-caps labels)

### 3.5 Brand components

`src/components/brand/` holds hand-mirrored brand-identity components from the dashboard. Implementation may use Tailwind utilities, `tailwind-variants`, or both. The point is structural and visual recognizability against the dashboard.

Phase 1 brand components: `PageHeader`, `Navigation` (top-bar nav button + drawer), `ThemeToggle`, `KPICard`, `SectionHeader`. Phase 2+ adds brand-distinctive components only when they emerge naturally. Non-brand UI (tables, forms, filters, list rows, detail panes) is built from Tailwind + shadcn — not constrained to dashboard class patterns.

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

**opportunities** — open positions to fill (Phase 2)

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

**providers** (Phase 2)

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

### 4.2 Credentialing tables (Phase 3)

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
| organization_id | uuid, nullable | `REFERENCES organizations(id)` from Phase 1 |
| contact_id | uuid, nullable | `REFERENCES contacts(id)` from Phase 1 |
| opportunity_id | uuid, nullable | **Phase 1**: plain `uuid`, no `REFERENCES` (parent table doesn't exist yet). **Phase 2**: `ALTER TABLE` adds the fk constraint. |
| provider_id | uuid, nullable | **Phase 1**: plain `uuid`, no `REFERENCES`. **Phase 2**: `ALTER TABLE` adds the fk constraint. |
| created_at, created_by | | |

CHECK constraint: exactly one of `organization_id`, `contact_id`, `opportunity_id`, `provider_id` is non-null. The CHECK covers all four columns from day one even though only the first two have parent tables in Phase 1 — no migration churn when Phase 2 introduces the parent tables.

**tasks** — follow-ups (Phase 2)

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

**placements** — bridge between provider and opportunity (Phase 2; the eventual handoff to the scheduling app)

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

The CRM lives inside a **suite-level workspace** at `ps-apps-suite/` so it sits alongside the existing dashboard. Each app is its own git repo with its own deployment.

```
ps-apps-suite/                         # local workspace (NOT a git repo itself)
├── .claude/                           # Claude Code session state — leave alone
├── .wrangler/                         # Wrangler cache — leave alone
├── _reference/                        # archived v1 vanilla dashboard files — read-only
├── ps-app-dashboard/                  # current dashboard (React + Vite + Tailwind) — READ-ONLY
└── ps-app-crm/                        # THIS BUILD — own git repo
    ├── README.md
    ├── BUILD_PLAN.md
    ├── CLAUDE.md
    ├── PHASE_1_KICKOFF.md
    ├── BUILD_PLAN_v1_vanilla_archive.md     # archived v1 plan (vanilla JS multi-page)
    ├── CLAUDE_v1_vanilla_archive.md
    ├── PHASE_1_KICKOFF_v1_vanilla_archive.md
    ├── .gitignore
    ├── .env.example
    ├── index.html                     # Vite entry (single mount point)
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── components.json                # shadcn/ui config (created by `npx shadcn init`)
    ├── jsconfig.json                  # path aliases (e.g., `@/components/ui/button`)
    ├── public/
    │   ├── _redirects                 # SPA fallback ("/*  /index.html  200") — Netlify and Cloudflare both honor this
    │   └── pslogo.png                 # CRM logo (copied at scaffold time from _reference/ps-crm-logo.png)
    ├── src/
    │   ├── main.jsx                   # ReactDOM.createRoot
    │   ├── App.jsx                    # AuthProvider → ThemeProvider → BrowserRouter → Routes
    │   ├── index.css                  # @import DM fonts, @import tokens.css, @tailwind base/components/utilities
    │   ├── styles/
    │   │   └── tokens.css             # CSS variables — single source of truth
    │   ├── api/
    │   │   └── supabase.js            # createClient() — singleton client; URL + publishable key live here
    │   ├── components/
    │   │   ├── brand/                 # hand-mirrored brand components (PageHeader, Navigation, KPICard, SectionHeader, ThemeToggle)
    │   │   ├── ui/                    # shadcn/ui primitives (button, dialog, input, label, table, badge, dropdown-menu, sonner, select, textarea, tabs)
    │   │   ├── auth/                  # RequireAuth route wrapper
    │   │   ├── organizations/         # feature-scoped components (OrganizationFormDialog, OrganizationFilterBar, …)
    │   │   ├── contacts/
    │   │   └── activities/
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   └── ThemeContext.jsx
    │   ├── hooks/                     # one per resource
    │   │   ├── useAuth.js             # exposes session/user from context
    │   │   ├── useOrganizations.js
    │   │   ├── useContacts.js
    │   │   └── useActivities.js
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Home.jsx               # auth-gated dashboard (KPIs + recent activity)
    │   │   ├── Organizations.jsx      # list / search / filter / create
    │   │   ├── Organization.jsx       # detail (edit, contacts, activities)
    │   │   └── Contacts.jsx           # cross-org list
    │   ├── lib/
    │   │   └── utils.js               # `cn()` helper (clsx + tailwind-merge), required by shadcn
    │   └── utils/
    │       ├── constants.js
    │       └── formatters.js          # currency, date, phone — modeled on dashboard's formatters.js
    └── supabase/
        ├── config.toml
        ├── migrations/
        │   └── 0001_initial.sql
        └── functions/                 # Phase 3 (credential-alerts)
```

**Why `tokens.css` is its own file**: tokens are the future shared-suite asset. When a third app joins, `tokens.css` extracts to a small npm package or workspace folder and every app imports it. Brand components and Tailwind config are NOT shared at extraction — only tokens. Keeping tokens isolated from Tailwind directives, fonts, and component CSS makes that future move a one-line change.

## 6. Suite architecture & cross-app integration

The CRM is one of an eventual 3–4 apps in the Provider Solutions suite. The design respects this:

### 6.1 Style consistency

- **Source of truth (today)**: the dashboard's CSS variables in `ps-app-dashboard/src/index.css`. The CRM's `src/styles/tokens.css` mirrors them exactly. Token changes in the dashboard get manually synced to the CRM until tokens are extracted into a shared package.
- **Brand component mirroring**: when building or editing a CRM brand component in `src/components/brand/`, read the corresponding dashboard component (`ps-app-dashboard/src/components/finance/KPICard.jsx`, `src/components/layout/{PageHeader,Navigation,SectionHeader,ThemeToggle}.jsx`) for visual structure, then implement using Tailwind utilities. The result should be visually indistinguishable from the dashboard's version. Phase 1 brand components: `PageHeader`, `Navigation` (drawer), `ThemeToggle`, `KPICard`, `SectionHeader`.
- **Non-brand components are independent**: tables, forms, filters, list views, detail panes, modals — built from Tailwind utilities + shadcn/ui primitives. The CRM is NOT constrained to the dashboard's class patterns for these.
- **Future**: tokens.css extracts to a shared npm package or workspace folder. Both apps import it at build time. Dashboard's hand-written component classes stay dashboard-only.

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

- The CRM has real auth via Supabase magic links. The dashboard has none (URL obscurity).
- **Pattern**: bare `@supabase/supabase-js` v2 + a small `AuthContext` wrapping `supabase.auth.onAuthStateChange()`, exposing `{ session, user, signInWithMagicLink, signOut, loading }`. A `<RequireAuth>` route element in `src/components/auth/` redirects to `/login` when no session, and shows a brief "checking session…" while the auth listener attaches.
- Do NOT use `@supabase/auth-helpers` or `@supabase/ssr` — those target Next.js / SSR contexts; we have neither.
- Session persistence: `supabase-js` handles localStorage automatically. No custom code.
- No attempt is made in this build to unify auth across apps. When a future app needs to consume CRM data on behalf of a logged-in user, it will adopt the same Supabase auth pattern.

### 6.4 Deferred decisions

- **Shared `tokens.css` extraction** — done when a third app joins the suite, or when token drift becomes painful, whichever comes first. Will become a small npm package or workspace folder.
- **Shared component library** — never. Each app owns its components. shadcn/ui copies primitives into the repo by design (it's not a runtime dep), so suite consistency comes from pinning the same Tailwind config + tokens, not from shared components.
- **AppSheet replacement (provider portal)** — separate app, separate build, will share the CRM's Supabase backend.
- **Hosting platform** — Cloudflare Pages, same as `ps-app-dashboard/`. Each app remains its own Pages project.

## 7. Phased build plan

### Phase 1 — Foundation (target: 1–2 Claude Code sessions)

Goal: Jason and Reed can log in, create organizations and contacts, and log activities against them.

- Supabase project provisioning (Jason does this once via dashboard; CLI links repo)
- Vite + React + Tailwind + shadcn/ui scaffolding (`npm create vite@latest` → React/JSX template; `npm install -D tailwindcss postcss autoprefixer`; `npx tailwindcss init -p`; `npx shadcn@latest init`)
- shadcn primitives installed via CLI: `button`, `input`, `label`, `dialog`, `dropdown-menu`, `table`, `badge`, `sonner` (toast), `select`, `textarea`, `tabs`
- `0001_initial.sql`: organizations, contacts, activities (all 4 fk columns per §4.3), RLS policies, audit triggers for `updated_at`
- `src/styles/tokens.css`: CSS variables (dark + light) + shadcn token aliases
- `tailwind.config.js`: theme.colors + theme.fontFamily + theme.borderRadius mapped to tokens
- `src/index.css`: Google Fonts `@import` + `@import './styles/tokens.css'` + `@tailwind base/components/utilities`
- `src/api/supabase.js`: client init (URL + publishable key hardcoded — safe with RLS on every table)
- `src/context/AuthContext.jsx` + `src/components/auth/RequireAuth.jsx`
- `src/context/ThemeContext.jsx` (mirror dashboard's; storage key `ps-crm-theme`)
- `src/components/brand/`: `PageHeader`, `Navigation`, `ThemeToggle`, `KPICard`, `SectionHeader`
- `src/utils/formatters.js`: currency, date, phone
- `src/lib/utils.js`: `cn()` helper for clsx + tailwind-merge
- `src/pages/Login.jsx`: magic-link sign-in with "check your email" state
- `src/pages/Home.jsx`: auth-gated. KPI cards (# orgs, # contacts, # activities last 7d). Recent activity feed (last 10).
- `src/pages/Organizations.jsx`: searchable / filterable table; "New organization" dialog; row click → `/organizations/:id`
- `src/pages/Organization.jsx`: detail page — edit org, contacts list (add inline), activity feed, log-activity form (type, subject, body, occurred_at)
- `src/pages/Contacts.jsx`: cross-org list; filter by organization; create dialog requires picking an org
- `README.md`: local dev (`npm install`, `npm run dev`, `supabase start`), env vars, deploy instructions, Supabase project link
- `.env.example`, `.gitignore`, `_redirects`, `public/pslogo.png` (copied at scaffold time from `_reference/ps-crm-logo.png`)

**Exit criteria**: app runs locally; can sign in, create a hospital + a Medicus record + contacts at each, log a call. Deployed to a preview URL on whichever host is selected when Phase 1 wraps.

### Phase 2 — Demand & supply pipelines (target: 2–3 sessions)

Goal: opportunities and providers have real pipeline visibility; tasks drive day-to-day work.

- `0002_pipelines.sql`: opportunities, providers, tasks, placements (skeleton); `ALTER TABLE activities` to add `REFERENCES` for `opportunity_id` and `provider_id`
- `src/pages/Opportunities.jsx`: dual view — kanban by stage AND table; filters (stage, specialty, source partner, state); create/edit
- `src/pages/Opportunity.jsx`: detail with associated activities, tasks, suggested providers (placeholder for Phase 4)
- `src/pages/Providers.jsx`: table with status filter, specialty filter, search; create/edit
- `src/pages/Provider.jsx`: detail with activities, tasks, placements; credentialing tab (placeholder for Phase 3)
- `src/pages/Tasks.jsx`: "my open tasks", "all open tasks", "completed (last 30d)"; quick-complete
- Update `src/pages/Home.jsx` with real KPIs: open opportunities by stage, active providers, tasks due today, recent activity
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
- `src/pages/Credentialing.jsx`: cross-provider expiration dashboard — 30/60/90-day color-coded buckets, sortable, filterable by credential type and provider
- Edge function `credential-alerts`: daily cron, queries expirations in 30/60/90 days, emails team digest via Resend
- Pre-loaded credential checklist templates per position type (MD vs CRNA vs NP)

**Exit criteria**: a complete provider file can be assembled, stored, and verified in the app; a hospital MSO request "send us Dr. X's full credentialing packet" can be fulfilled by exporting a zip of signed URLs.

### Phase 4 — Matching & placement (target: 1–2 sessions)

Goal: close the loop between supply and demand inside the app.

- `src/pages/Matching.jsx`: filter UI — given an opportunity, find providers matching specialty, licensed in state, with current DEA + malpractice + active board cert
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

- **Database**: `snake_case` table and column names; UUIDs as PKs; audit cols (`created_at`, `updated_at`, `created_by`) on user-editable tables; CHECK constraints for enum-like text columns; never delete — soft-delete with `deleted_at` only if needed (Phase 1: hard delete is fine).
- **Migrations**: numbered, immutable once applied. New changes → new migration file. Never edit `0001_*.sql` after it ships.
- **JavaScript / JSX**: plain JSX, no TypeScript. `camelCase` for variables/functions. One default-exported component per file; filename = component name (`KPICard.jsx` → `KPICard`). No prop-types; rely on clear prop names + sparse JSDoc when shape is non-obvious.
- **Styling**: Tailwind utilities by default; shadcn/ui for primitives; brand components in `src/components/brand/` for distinctive shared identity. `clsx` + `tailwind-variants` for variant management. Long utility strings are NOT, by themselves, a reason to extract a component.
- **Component extraction**: extract a child component when (a) reused, (b) the section has distinct semantic meaning that earns its own name (e.g., `OrganizationFilterBar` inside `Organizations.jsx`), or (c) the parent grows past ~300 lines. Otherwise inline.
- **Form state**: `useState` for simple forms (≤3–4 fields, no cross-field validation). `useReducer` for complex forms (validation, dependent fields, multi-step). React Hook Form is acceptable but not required for Phase 1.
- **Data fetching**: custom hooks per resource (`useOrganizations`, `useContacts`, `useActivities`). Each hook owns `loading` / `error` / `data` / `refetch`. No React Query / SWR.
- **State management**: page-level `useState` for view state (filters, modal open/closed); `Context` only for tree-spanning concerns (auth, theme). No Redux / Zustand / Jotai.
- **Errors**: surface to the user via `sonner` toast (`toast.error(message)`); log full error object to console; never swallow silently.
- **Money / dates**: `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})` and `Intl.DateTimeFormat`. Helpers in `src/utils/formatters.js`. Estimates: italic + `~` prefix + `text-warning`.
- **HTML safety**: avoid `dangerouslySetInnerHTML` unless genuinely needed (e.g., a label that requires `<br/>`); when used, comment why.
- **localStorage keys**: prefix with `ps-crm-` (e.g., `ps-crm-theme`).
- **Routes**: one route per page in `src/pages/`. Detail pages route via `:id` param (`/organizations/:id`).
- **Secrets**: only the publishable key (`sb_publishable_…`) ships in client code; safe with RLS on every table. Secret keys (`sb_secret_…`) live only in Supabase dashboard env or Edge Function env. `.env.example` documents required keys.

## 9. Project decisions

Confirmed:

1. **Hosting** — Cloudflare Pages, same as `ps-app-dashboard/`. `public/_redirects` with `/* /index.html 200` handles SPA fallback so client-side routing works for any path. Each app keeps its own Pages project; no shared deployment.
2. **Opportunity stages** — per §4.4.
3. **Provider statuses** — per §4.4.
4. **Credential alert recipient** — `all.provider.solutions@gmail.com` (Phase 3).
5. **Activities table fk columns** — Option A: all four uuid columns exist in `0001_initial.sql`; only `organization_id` and `contact_id` carry `REFERENCES` clauses in Phase 1; Phase 2's migration adds `REFERENCES` for `opportunity_id` and `provider_id`. The CHECK constraint covers all four from day one.
6. **Tailwind usage** — utility-first; shadcn/ui for primitives; brand components in `src/components/brand/` for distinctive shared identity. Hand-written CSS limited to tokens, font imports, and global resets that don't fit Tailwind utilities.

Still open:

7. **Existing provider data** — any list to bulk-import in Phase 2 (e.g., providers currently active in AppSheet), or starting fresh and adding manually? [Confirm at Phase 2 kickoff.]
