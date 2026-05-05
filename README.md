# Provider Solutions CRM

Internal CRM for Provider Solutions, LLC — a LOCUMs physician staffing company. Second app in the Provider Solutions internal suite, alongside the financial dashboard.

> Looking for the architecture, data model, or phase plan? See [`BUILD_PLAN.md`](./BUILD_PLAN.md). For coding conventions and Claude Code session notes, see [`CLAUDE.md`](./CLAUDE.md).

## Tech stack

- **React 18** + **Vite 5** (plain JSX — no TypeScript)
- **Tailwind CSS 3** + design tokens via CSS variables in `src/styles/tokens.css`
- **shadcn/ui** primitives in `src/components/ui/`, brand components in `src/components/brand/`
- **react-router-dom 6** (BrowserRouter SPA)
- **Supabase** for Postgres, auth (magic link), Storage, and Edge Functions
- **sonner** for toasts; **lucide-react** for icons; **clsx** + **tailwind-merge** for class composition

No data-fetching library — custom hooks per resource (`useOrganizations`, `useContacts`, `useActivities`).

## Local development

### Prerequisites

- **Node 18+** and **npm**
- A **Supabase project** with the migration applied (see below)
- Your dev URL allowlisted in the Supabase auth settings (see below)

### Setup

```bash
git clone https://github.com/finance-providersolutions/provider-solutions-crm.git
cd provider-solutions-crm
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` (or `:5174` if `:5173` is taken). Hot reload is on.

The Supabase URL and publishable key are hardcoded in `src/api/supabase.js`. The publishable key is safe in the browser because RLS is enabled on every table.

### Apply the database migration

The schema lives in [`supabase/migrations/0001_initial.sql`](./supabase/migrations/0001_initial.sql) — three tables (`organizations`, `contacts`, `activities`), an `updated_at` trigger, and Phase 1 RLS policies (any authenticated user can read/write everything).

Two ways to apply it:

**Option A — Supabase dashboard (no CLI needed):**
1. Open your project at https://supabase.com/dashboard.
2. Click **SQL Editor** → **New query**.
3. Paste the entire contents of `supabase/migrations/0001_initial.sql`.
4. Click **Run** (or Ctrl+Enter). Expect "Success. No rows returned".
5. Confirm in **Table Editor** that `organizations`, `contacts`, and `activities` all show up.

**Option B — Supabase CLI:**
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

> **Migrations are immutable once applied.** Never edit `0001_initial.sql` after it has been run on any environment — add a new numbered file (e.g. `0002_pipelines.sql`) instead.

### Allowlist your dev URL for magic-link auth

Magic-link emails contain a redirect URL pointing back to the app. Supabase blocks any redirect URL that isn't on the allowlist.

1. Supabase dashboard → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add `http://localhost:5173/**` (and `http://localhost:5174/**` if your dev server fell back to that port).
3. Save.

### Sign in

1. Open `http://localhost:5173/login`.
2. Type your email → **Send Magic Link**.
3. Click the link in your inbox (it opens a new tab pointed at your dev server).
4. You should land on the **Home** page with the session persisted.

If the email doesn't arrive, check spam. First emails from a new Supabase project sometimes land there.

## Deploying to Cloudflare Pages

The CRM uses the same hosting as `ps-app-dashboard` — Cloudflare Pages. Each app keeps its own Pages project.

1. **In Cloudflare:** dashboard → Workers & Pages → Create → Pages → **Connect to Git**.
2. Pick the `provider-solutions-crm` GitHub repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 18 (or newer; set via `NODE_VERSION` env var if needed)
4. **Environment variables:** none required for now (URL and publishable key are hardcoded in source). Reserve names for future use only if you migrate off the hardcode.
5. Click **Save and Deploy**. The first build takes ~1–2 minutes.
6. Once deployed, you'll get a `*.pages.dev` URL. **Copy it.**
7. **Allowlist the production URL in Supabase auth:** dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**, add `https://<your-pages-url>/**` and (optionally) set the Site URL to the same. Without this, magic links from production will silently fail.

`public/_redirects` contains `/* /index.html 200` so client-side routing works for any path. Cloudflare Pages and Netlify both honor that file.

## Project layout

```
ps-app-crm/
├── public/
│   ├── _redirects             # SPA fallback — /*  /index.html  200
│   └── pslogo.png
├── src/
│   ├── main.jsx               # ReactDOM.createRoot
│   ├── App.jsx                # AuthProvider → ThemeProvider → BrowserRouter
│   ├── index.css              # Google Fonts + tokens + @tailwind directives
│   ├── styles/tokens.css      # CSS variables (single source of truth)
│   ├── api/supabase.js        # createClient singleton
│   ├── components/
│   │   ├── auth/RequireAuth.jsx
│   │   ├── brand/             # PageHeader, Navigation, ThemeToggle, KPICard, SectionHeader
│   │   ├── ui/                # shadcn/ui primitives (button, dialog, input, …)
│   │   ├── organizations/
│   │   ├── contacts/
│   │   └── activities/
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── ThemeContext.jsx
│   ├── hooks/                 # one per resource — no React Query
│   │   ├── useAuth.js
│   │   ├── useOrganizations.js
│   │   ├── useContacts.js
│   │   └── useActivities.js
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Home.jsx
│   │   ├── Organizations.jsx
│   │   ├── Organization.jsx
│   │   └── Contacts.jsx
│   ├── lib/utils.js           # cn() helper for clsx + tailwind-merge
│   └── utils/
│       ├── constants.js
│       └── formatters.js
├── supabase/
│   └── migrations/0001_initial.sql
├── tailwind.config.js
├── postcss.config.js
├── components.json            # shadcn/ui config
├── jsconfig.json              # @ → src path alias
├── vite.config.js
├── package.json
├── index.html
├── BUILD_PLAN.md
├── CLAUDE.md
└── README.md
```

## Phase 1 scope (this build)

- Magic-link auth + session persistence
- Organizations CRUD (hospitals + LOCUMs partners + other) with search + type filter
- Contacts CRUD scoped to organizations, plus a cross-org list with org filter
- Activities log (call / email / meeting / note / sms) on the org detail page
- Home dashboard: organizations / contacts / activities-last-7d KPIs + recent activity feed

What's **not** in Phase 1 (intentionally deferred — see [`BUILD_PLAN.md`](./BUILD_PLAN.md) §7):
- Opportunities + providers + pipeline (Phase 2)
- Tasks + placements (Phase 2)
- Credentialing tables, document storage, expiration alerts (Phase 3)
- Provider-opportunity matching (Phase 4)

## Conventions (highlights)

See [`CLAUDE.md`](./CLAUDE.md) for the full list.

- **Plain JSX** — no TypeScript, no `.tsx`, no `tsconfig.json`.
- **Tailwind utilities by default**, shadcn/ui primitives for forms/dialogs/tables, brand components only in `src/components/brand/`.
- **Custom hooks per resource** — no React Query / SWR.
- **Surface errors via `sonner` toast** — never silently caught.
- **localStorage keys** prefixed `ps-crm-` (e.g. `ps-crm-theme`).
- **Money / dates** via `Intl` helpers in `src/utils/formatters.js`.

## Suite context

This repo is one app in the `ps-apps-suite/` workspace — the financial dashboard at `ps-app-dashboard/` is the sibling. Brand identity is shared via tokens that mirror the dashboard's CSS variables exactly. Tokens will eventually extract to a shared package when a third app joins; until then, token changes in the dashboard get manually synced to the CRM.

Each app has its own backend, its own Cloudflare Pages project, and its own deployment. There is no shared component library.
