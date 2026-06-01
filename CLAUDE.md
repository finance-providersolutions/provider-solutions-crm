# Provider Solutions CRM

Internal CRM for Provider Solutions, LLC, a LOCUMs physician staffing company. Second app in a suite that already includes a live financial dashboard. See `BUILD_PLAN.md` for full design spec, data model, and phase plan.

> **Document version**: v2 (React + Vite + Tailwind + shadcn/ui).
> The original vanilla-JS multi-page version is archived as
> `CLAUDE_v1_vanilla_archive.md` for historical reference.

## Project facts

- **Hosting**: Cloudflare Pages, same as `ps-app-dashboard/`. Each app keeps its own Pages project. SPA fallback via `public/_redirects` (`/* /index.html 200`).
- **Credential expiration alert recipient**: `all.provider.solutions@gmail.com` (used by the Phase 3 `credential-alerts` Edge Function)
- **Backend**: Supabase (single project, all environments share it for now)
- **Legacy AppSheet linkage**: tables that may have legacy AppSheet records use an `appsheet_id` text column for stable matching during the transition. Currently: `providers`, `organizations`, `opportunities`.

## Suite context

This repo (`ps-app-crm/`) lives inside a `ps-apps-suite/` parent workspace alongside the existing financial dashboard. Claude Code is launched from the parent so it can read both apps. See `BUILD_PLAN.md` §5–§6 for full structure and integration model, and `BUILD_PLAN.md` §10 for the suite migration roadmap (end state, transition rules, AppSheet retirement).

```
ps-apps-suite/                   ← claude code runs from here
├── .claude/                      ← Claude Code session state — never modify
├── .wrangler/                    ← Wrangler cache — never modify
├── _reference/                   ← archived v1 vanilla dashboard files — READ-ONLY
├── ps-app-dashboard/             ← current dashboard (React + Vite + Tailwind) — READ-ONLY when working on CRM
│   ├── src/
│   │   ├── index.css             ← primary styling reference (CSS variables, fonts)
│   │   ├── tailwind.config.js    ← (in repo root) reference for theme.colors mapping
│   │   ├── components/layout/    ← brand reference: PageHeader, Navigation, ThemeToggle, SectionHeader
│   │   ├── components/finance/KPICard.jsx  ← brand reference: KPI card pattern
│   │   └── ...
│   └── ...
└── ps-app-crm/                   ← THIS repo (where all CRM work happens)
```

**Hard rules when working with the suite**:

- The CRM is the only app being built or modified in this repo. **Never edit, create, or delete files inside `../ps-app-dashboard/`, `../_reference/`, `../.claude/`, or `../.wrangler/`** under any circumstance. All write operations are scoped to `ps-app-crm/`.
- When building or styling CRM **brand** components, read `../ps-app-dashboard/src/index.css` and `../ps-app-dashboard/src/components/layout/*` and `.../components/finance/KPICard.jsx` for visual reference. Mirror token values and component structure. Implementation goes in `src/components/brand/` using Tailwind utilities.
- For non-brand UI (tables, forms, filters, modals, list views, detail panes), use Tailwind utilities + shadcn/ui primitives freely. The CRM is not constrained to the dashboard's class patterns for these.
- When CRM features need data that lives in the financial dashboard (QBO actuals, etc.), call the existing worker: `qbo-proxy.finance-providersolutions.workers.dev`. Do not duplicate that data into Supabase.
- Design tokens go in `ps-app-crm/src/styles/tokens.css` as a standalone file (not merged into `index.css`) so they can later be extracted to a shared package for use by all suite apps.
- Before making any file change, confirm the path begins with `ps-app-crm/`. If it doesn't, stop and surface the issue.

## How to work in this repo

- Read `BUILD_PLAN.md` before starting any new feature — it's the source of truth for the data model and phasing.
- Stay within the current phase. If a request implies cross-phase work, flag it before proceeding.
- Migrations are **immutable once shipped**. Never edit `0001_*.sql` after it has been applied. New changes → new migration file.
- Prefer small, focused commits with clear messages. Each session should produce something runnable.
- Surface real errors via `sonner` toast (`toast.error(...)`). No silent catches, no fake success states.
- React + Vite + plain JSX (no TypeScript). Tailwind utilities by default, shadcn/ui for primitives, brand components in `src/components/brand/`.
- SPA architecture (react-router-dom 6, BrowserRouter). Pages live in `src/pages/`; components by feature in `src/components/<feature>/`; hooks in `src/hooks/`.

## Tech stack (locked — do not propose alternatives unless explicitly asked)

- **Backend**: Supabase (Postgres, Auth via magic link, Storage, Edge Functions)
- **Frontend**: React 18 (plain JSX, no TypeScript) + Vite 5 + react-router-dom 6
- **Styling**: Tailwind CSS 3 + design tokens via CSS variables (in `src/styles/tokens.css`)
- **Component primitives**: shadcn/ui (installed via CLI into `src/components/ui/`)
- **Variant / class management**: clsx + tailwind-variants
- **Charts** (when needed): chart.js + chartjs-plugin-datalabels (npm)
- **Tables / Export**: xlsx (npm)
- **Email** (credential alerts): Resend via Supabase Edge Function

## Repo layout

```
index.html                       # Vite entry, single mount point
package.json
vite.config.js
tailwind.config.js
postcss.config.js
components.json                  # shadcn/ui config
jsconfig.json                    # path aliases (@/components/ui/button, etc.)
public/
  _redirects                     # SPA fallback
  pslogo.png
src/
  main.jsx                       # ReactDOM.createRoot
  App.jsx                        # AuthProvider → ThemeProvider → BrowserRouter → Routes
  index.css                      # @import DM fonts + tokens.css; @tailwind base/components/utilities
  styles/
    tokens.css                   # CSS variables — single source of truth (dark + light)
  api/
    supabase.js                  # createClient() singleton
  components/
    brand/                       # PageHeader, Navigation, KPICard, SectionHeader, ThemeToggle
    ui/                          # shadcn/ui primitives
    auth/                        # RequireAuth route wrapper
    organizations/, contacts/, activities/  # feature-scoped
  context/
    AuthContext.jsx
    ThemeContext.jsx
  hooks/                         # one hook per resource
    useAuth.js
    useOrganizations.js, useContacts.js, useActivities.js
  pages/
    Login.jsx
    Home.jsx
    Organizations.jsx, Organization.jsx
    Contacts.jsx
  lib/
    utils.js                     # cn() helper for clsx + tailwind-merge
  utils/
    constants.js
    formatters.js                # currency, date, phone
supabase/
  migrations/                    # numbered SQL migrations (immutable once shipped)
  functions/                     # edge functions (Deno/TypeScript) — Phase 3
```

## Design system (must match financial dashboard)

Tokens are CSS variables in `src/styles/tokens.css`, mirroring the dashboard:

```css
--bg:           #0b1c2e;
--surface:      #122540;
--surface2:     #1a3050;
--border:       #7ee8e860;     /* translucent teal — note: NOT the slate value the v1 plan listed */
--accent:       #7ee8e8;
--accent-dim:   #7ee8e818;
--accent2:      #b8f4f4;
--accent-bright:#00e0ff;
--text:         #dff4f4;
--text-dim:     #7eb8c8;
--text-muted:   #3a6a7a;
--g:            #3ecf8e;        /* income / positive / won */
--r:            #ff8080;        /* danger / lost / expired */
--gp:           #7ee8e8;        /* gross profit / accent variant */
--warning:      #c8a840;        /* CRM-only — amber for estimates / soon-expiring */
--radius:       5px;
```

Tailwind config (`tailwind.config.js`) maps utility names to these variables. Utilities like `bg-surface`, `text-accent`, `border-border`, `font-display`, `text-income`, `text-danger` resolve to the values above.

shadcn/ui's expected token names (`--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--muted`, `--destructive`, `--ring`, etc.) are also defined in `tokens.css`, computed from the brand values above. One source of truth.

Fonts (loaded via `@import` at the top of `src/index.css`):
- **DM Serif Display** → `font-display` → h1, h2 only
- **DM Sans** → `font-sans` → body
- **DM Mono** → `font-mono` → numbers, IDs, small-caps labels

Status colors:
- Active / current / won → `text-income`
- In-progress / proposed → `text-accent`
- Estimate / soon-expiring → `text-warning` (italic, `~` prefix when shown as $)
- Expired / lost / COGS → `text-danger`

## Conventions

- **Database**: `snake_case`; UUID PKs (`gen_random_uuid()`); audit cols (`created_at`, `updated_at`, `created_by`) on user-editable tables; CHECK constraints for enum-like text columns; RLS enabled on every table.
- **JSX**: plain JSX (no TypeScript). `camelCase`. One default export per file; filename = component name. No prop-types.
- **Styling**: Tailwind utilities by default; shadcn/ui for primitives; brand components in `src/components/brand/`. Use `clsx` for conditional classes; `tailwind-variants` for variant-driven components. Long utility strings are NOT, by themselves, a reason to extract.
- **Component extraction**: extract a child component when (a) reused, (b) the section has distinct semantic meaning that earns its own name, or (c) parent grows past ~300 lines. Otherwise inline.
- **Form state**: `useState` for simple forms (≤3–4 fields, no cross-field validation); `useReducer` when validation / dependent fields / multi-step enter the picture.
- **Data fetching**: custom hooks per resource (`useOrganizations`, `useContacts`, `useActivities`). Each hook owns `loading` / `error` / `data` / `refetch`. No React Query / SWR.
- **State**: page-level `useState` for view state; `Context` only for tree-spanning concerns (auth, theme). No Redux / Zustand.
- **HTML safety**: avoid `dangerouslySetInnerHTML` unless genuinely needed; comment why when used.
- **HTML pages**: each route is self-contained except for shared providers and `src/components/brand/`. Don't share state between pages — pass via URL params and re-fetch.
- **Auth**: `AuthContext` wraps `supabase.auth.onAuthStateChange()`; `<RequireAuth>` route element redirects to `/login` if no session. Every protected route is wrapped in `<RequireAuth>`.
- **Errors**: catch at the call site, surface via `sonner` toast (`toast.error(message)`), log full error object to console. Never pretend an error didn't happen.
- **Money**: format with `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})`. Estimates: italic + `~` prefix + `text-warning`.
- **localStorage keys**: prefix with `ps-crm-` (e.g., `ps-crm-theme`).

## Supabase usage notes

- Client init in `src/api/supabase.js` (singleton). URL + publishable key hardcoded for now — never the secret key. The publishable key (`sb_publishable_...`) is the new name for what used to be called the anon key; safe to ship to a browser as long as Row Level Security is enabled on every table (which it is, per BUILD_PLAN §4.5).
- All writes go through PostgREST via the JS client. No bespoke API routes.
- Auth uses bare `@supabase/supabase-js`. **Do NOT** install `@supabase/auth-helpers` or `@supabase/ssr` — those target Next.js / SSR; we have neither. The custom `AuthContext` is enough.
- Storage bucket `credentials` (Phase 3) is **private**. Always use signed URLs (5-min expiry) for downloads.
- Edge functions live under `supabase/functions/` and run on Deno. Import via `npm:` specifiers.

## What this app is NOT

- Not a replacement for the **financial dashboard** (separate repo, stays as-is on its own host).
- Not a replacement for **AppSheet** yet — providers still log shifts there. The `providers.appsheet_id` column links the two for now; the eventual provider portal is a future, separate app.
- Not a two-way sync layer with AppSheet. AppSheet is being retired, not synchronized. See `BUILD_PLAN.md` §10.4.
- Not a scheduling system. Placements are the handoff point to the future scheduling app.
- Not TypeScript. The dashboard is plain JSX; the CRM matches.

## When uncertain

Ask. Especially for:
- Anything touching credential verification logic (regulatory weight)
- Schema changes after Phase 1 ships
- Adding dependencies (any addition to `package.json` outside the locked stack)
- Cross-phase scope creep

## End-of-session documentation protocol

Two mobile-readable docs live at `docs/CRM-STATE.md` (architectural snapshot) and `docs/CRM-ROADMAP.md` (in-flight, next up, parked). They exist so that brainstorming sessions in claude.ai chat — typically on a phone, away from the codebase — start with accurate situational awareness. They are NOT code documentation.

At the end of any session that materially changes architecture, integrations, core domain rules, or roadmap state (work started, completed, parked, or unparked), update `docs/CRM-STATE.md` and/or `docs/CRM-ROADMAP.md` per the rules in `docs/MAINTENANCE.md` **before considering the session complete**. Trivial code changes — typo fixes, copy edits, a single bug fix that does not change the model — do not require an update.

If the change affects cross-app integration (how this CRM talks to `ps-app-dashboard`, the QBO proxy worker, the future scheduling app, or the future provider portal), also flag the suite-level docs at `/ps-apps-suite/docs/` for update. Do NOT edit suite-level docs from this repo — `ps-app-crm/` is the only path with write access — but call out the needed update in your end-of-session summary so it can be made from the parent workspace.
