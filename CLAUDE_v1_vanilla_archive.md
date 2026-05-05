# Provider Solutions CRM

Internal CRM for Provider Solutions, LLC, a LOCUMs physician staffing company. Second app in a suite that already includes a live financial dashboard. See `BUILD_PLAN.md` for full design spec, data model, and phase plan.

## Project facts

- **URL**: Cloudflare Pages default subdomain (e.g., `provider-solutions-crm.pages.dev`). No custom domain. Whatever name is chosen when creating the Cloudflare Pages project becomes the URL.
- **Credential expiration alert recipient**: `all.provider.solutions@gmail.com` (used by the Phase 3 `credential-alerts` Edge Function)
- **Hosting**: Cloudflare Pages
- **Backend**: Supabase (single project, all environments share it for now)

## Suite context

This repo (`ps-app-crm/`) lives inside a `ps-apps-suite/` parent workspace alongside the existing financial dashboard. Claude Code is launched from the parent so it can read both apps. See `BUILD_PLAN.md` §5–§6 for full structure and integration model.

```
ps-apps-suite/                   ← claude code runs from here
├── .claude/                      ← Claude Code session state — never modify
├── .wrangler/                    ← Wrangler cache — never modify
├── _reference/                   ← archived v1 dashboard files — READ-ONLY
├── ps-app-dashboard/             ← existing dashboard — READ-ONLY when working on CRM
│   ├── styles_dark.css           ← primary style reference
│   ├── index.html                ← component pattern reference
│   └── ...
└── ps-app-crm/                   ← THIS repo (where all CRM work happens)
```

**Hard rules when working with the suite**:

- The CRM is the only app being built or modified in this repo. **Never edit, create, or delete files inside `../ps-app-dashboard/`, `../_reference/`, `../.claude/`, or `../.wrangler/`** under any circumstance. All write operations are scoped to `ps-app-crm/`.
- When building or styling CRM components, read `../ps-app-dashboard/styles_dark.css` and `../ps-app-dashboard/index.html` for reference. Replicate token values, class naming patterns, and component structures so the two apps look like one product.
- When CRM features need data that lives in the financial dashboard (QBO actuals, etc.), call the existing worker: `qbo-proxy.finance-providersolutions.workers.dev`. Do not duplicate that data into Supabase.
- Design tokens go in `ps-app-crm/public/assets/tokens.css` as a standalone file (not merged into `shared.css`) so they can later be extracted to a shared CDN location for use by all suite apps.
- Before making any file change, confirm the path begins with `ps-app-crm/`. If it doesn't, stop and surface the issue.

## How to work in this repo

- Read `BUILD_PLAN.md` before starting any new feature — it's the source of truth for the data model and phasing.
- Stay within the current phase. If a request implies cross-phase work, flag it before proceeding.
- Migrations are **immutable once shipped**. Never edit `0001_*.sql` after it has been applied. New changes → new migration file.
- Prefer small, focused commits with clear messages. Each session should produce something runnable.
- Surface real errors. No silent catches, no fake success states.
- Vanilla JS only. No frameworks, no bundlers, no build step. ES modules + import maps if needed.
- Multi-page architecture (file-per-page). Don't collapse pages into a single SPA.
- Per-page JS files; share via `assets/shared.js` and `assets/components.js`.

## Tech stack (locked — do not propose alternatives unless explicitly asked)

- **Backend**: Supabase (Postgres, Auth via magic link, Storage, Edge Functions)
- **Frontend**: Vanilla JS + multi-page HTML, served as static files
- **Hosting**: Cloudflare Pages
- **Charts**: Chart.js + chartjs-plugin-datalabels (CDN)
- **Tables/Export**: SheetJS (CDN)
- **Email** (credential alerts): Resend via Supabase Edge Function

## Repo layout

```
public/                      # served root
  index.html                 # auth-gated home / KPI dashboard
  login.html                 # magic-link sign-in
  organizations.html         # list/create
  organization.html          # ?id=... detail
  contacts.html
  opportunities.html, opportunity.html
  providers.html, provider.html
  credentialing.html         # cross-provider expiration view (phase 3)
  tasks.html
  matching.html              # phase 4
  assets/
    tokens.css               # design tokens — standalone for future extraction
    shared.css               # base components, layouts (imports tokens.css)
    shared.js                # supabase client, auth, helpers
    nav.js                   # top nav
    components.js            # toasts, modals, etc.
    pslogo.jpg
supabase/
  migrations/                # numbered SQL migrations
  functions/                 # edge functions (Deno/TypeScript)
  seed.sql                   # dev-only sample data
```

## Design system (must match financial dashboard)

```css
--bg:        #0b1c2e;
--surface:   #122540;
--surface-2: #18304f;
--accent:    #7ee8e8;   /* primary action / GP / teal */
--income:    #3ecf8e;   /* green — positive / active / won */
--warning:   #c8a840;   /* amber — estimates, soon-expiring (italic, ~ prefix for $ */
--danger:    #e25c5c;   /* red — expired / lost / COGS */
--text:      #e8eef5;
--text-dim:  #8aa1b8;
--border:    #1d3556;
```

Fonts: **DM Serif Display** (h1/h2 only) · **DM Sans** (body) · **DM Mono** (numbers, IDs). Load from Google Fonts.

## Conventions

- **Database**: `snake_case`; UUID PKs (`gen_random_uuid()`); audit cols (`created_at`, `updated_at`, `created_by`) on user-editable tables; CHECK constraints for enum-like text columns; RLS enabled on every table.
- **JS**: `camelCase`; ES modules; **never** use inline `onclick="..."` with quote-escaping — use `data-*` attributes + delegated listeners on a parent (this was a real bug in the financial dashboard).
- **Tables with frozen panes**: `border-collapse: separate` + `position: sticky; left: 0` + a small `box-shadow` for visual separation.
- **HTML pages**: each page is self-contained except for `assets/shared.*` and `assets/nav.js`. Don't share state between pages — pass via URL params and re-fetch.
- **Auth**: `shared.js` exposes a `requireAuth()` that redirects to `login.html` if no session. Every page (except `login.html`) calls it on load.
- **Errors**: catch at the call site, surface via `toast.error(message)` from `components.js`, log full object to console. Don't pretend an error didn't happen.
- **Money**: format with `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})`. Estimates: italic + `~` prefix + amber color.

## Supabase usage notes

- Client init in `shared.js`. URL + publishable key from environment (Cloudflare Pages env vars at build, or hardcoded for the publishable key — never the secret key). The publishable key (`sb_publishable_...`) is the new name for what used to be called the anon key; it's safe to ship to a browser as long as Row Level Security is enabled on every table (which it is, per BUILD_PLAN §4.5).
- All writes go through PostgREST via the JS client. No bespoke API routes.
- Storage bucket `credentials` is **private**. Always use signed URLs (5-min expiry) for downloads.
- Edge functions live under `supabase/functions/` and run on Deno. Import via `npm:` specifiers.

## What this app is NOT

- Not a replacement for the **financial dashboard** (separate repo, stays as-is on QBO+Sheets).
- Not a replacement for **AppSheet** yet — providers still log shifts there. The `providers.appsheet_id` column links the two for now; the eventual provider portal is a future, separate app.
- Not a scheduling system. Placements are the handoff point to the future scheduling app.

## When uncertain

Ask. Especially for:
- Anything touching credential verification logic (regulatory weight)
- Schema changes after Phase 1 ships
- Adding dependencies
- Cross-phase scope creep
