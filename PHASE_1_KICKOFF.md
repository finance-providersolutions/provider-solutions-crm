# Phase 1 Kickoff Prompt for Claude Code

> **Document version**: v2 (React + Vite + Tailwind + shadcn/ui).
> The original vanilla-JS multi-page kickoff is archived as
> `PHASE_1_KICKOFF_v1_vanilla_archive.md`.

> Paste the prompt block at the bottom into Claude Code after completing the prerequisites. Edit the bracketed values first.

---

## Prerequisites (do these before pasting the prompt)

### A. Folder setup

The suite parent already exists at `C:\Users\jmcdavid\OneDrive\ps-apps-suite\`, with `ps-app-dashboard/`, `_reference/`, and `ps-app-crm/` already inside it. The three CRM docs (`BUILD_PLAN.md`, `CLAUDE.md`, this file) plus the three v1 archive docs already live in `ps-app-crm/`. The CRM logo lives at `_reference/ps-crm-logo.png`.

1. Confirm the three current docs are present in `ps-app-crm/`:
   - `BUILD_PLAN.md`
   - `CLAUDE.md`
   - `PHASE_1_KICKOFF.md` (this file)
2. Confirm OneDrive has finished syncing (cloud icon, not the spinning sync icon, on `ps-app-crm/`).

### B. Supabase

3. Create a Supabase project at https://supabase.com/dashboard. Name it something like `provider-solutions-crm`.
4. From the project dashboard, copy these two values — you'll paste them into the prompt below:
   - **Project URL** — found at *Settings → Integrations → Data API → API URL*. The displayed value will end in `/rest/v1/` — strip that off; you only want the base, e.g. `https://abcdefghijk.supabase.co`.
   - **Publishable key** — found at *Settings → API Keys → Publishable and secret API keys → Publishable key*. Starts with `sb_publishable_…`. This is the new name for the old "anon" key — safe to ship to a browser as long as Row Level Security is enabled on every table (which it will be). Do NOT use the secret key (`sb_secret_…`); that one never goes in frontend code.

### C. GitHub

5. Create a new empty GitHub repo named `provider-solutions-crm` (or whatever name you prefer). Do NOT initialize it with a README, license, or .gitignore — leave it completely empty so Claude Code can initialize from scratch.
6. Note the repo URL (e.g., `https://github.com/yourusername/provider-solutions-crm.git`).

### D. Local prerequisites

7. **Node.js 20+** installed (Vite 5 requires Node 18+; 20 LTS recommended). Verify with `node -v`.
8. **Supabase CLI** installed (for local dev with `supabase start`). Install per https://supabase.com/docs/guides/local-development if not present.

### E. Claude Code session

9. Close any existing Claude Code session in this workspace.
10. Open a fresh terminal at the **parent folder** `ps-apps-suite\` (NOT at `ps-app-crm\`). On Windows, you can right-click the folder in File Explorer → "Open in Terminal."
11. Run `claude` to start a session.
12. Paste the prompt below (after editing the three `[PASTE HERE]` placeholders).

---

## The prompt

```
We're starting Phase 1 of the Provider Solutions CRM. The current working
directory is ps-apps-suite/, which is the suite-level parent. The CRM repo
will be built inside ps-app-crm/. The sibling folders — ps-app-dashboard/,
_reference/, .claude/, .wrangler/ — are READ-ONLY. Never modify, create,
or delete files outside of ps-app-crm/ for any reason.

Read ps-app-crm/BUILD_PLAN.md and ps-app-crm/CLAUDE.md first — they're the
source of truth for architecture, data model, conventions, and phasing.
Stay strictly within Phase 1 scope as defined in BUILD_PLAN.md §7.

Before scaffolding, also read ps-app-dashboard/src/index.css,
ps-app-dashboard/tailwind.config.js, and the brand reference components:
ps-app-dashboard/src/components/layout/{PageHeader,Navigation,SectionHeader,
ThemeToggle}.jsx and ps-app-dashboard/src/components/finance/KPICard.jsx.
The CRM should look like a sibling of the dashboard — same color tokens,
same fonts, same brand component patterns.

PHASE 1 GOAL
Jason and Reed can sign in, create organizations (hospitals + LOCUMs partners)
and contacts, and log activities against them. Running locally with `npm run
dev`, then deployed to a Cloudflare Pages preview URL (same hosting as
ps-app-dashboard/, per BUILD_PLAN §9 #1).

DELIVERABLES FOR THIS PHASE (all paths relative to ps-app-crm/)

A. Scaffolding
1. `npm create vite@latest .` (React + JavaScript template — NOT TypeScript)
2. Install Tailwind v3: `npm install -D tailwindcss@3 postcss autoprefixer`
   then `npx tailwindcss init -p`
3. Install shadcn/ui: `npx shadcn@latest init` (configure for JSX, default
   style, base color slate or zinc — pick whatever maps cleanest to our
   tokens; we override colors via CSS variables anyway). Do NOT enable
   TypeScript when prompted.
4. Add path aliases in jsconfig.json (e.g. `@/components/ui/button`).
5. Install runtime deps: react-router-dom, @supabase/supabase-js, clsx,
   tailwind-variants, tailwind-merge, lucide-react (for icons), sonner.
6. Add shadcn primitives via CLI: `npx shadcn@latest add button input label
   dialog dropdown-menu table badge sonner select textarea tabs`
7. Copy `_reference/ps-crm-logo.png` to `public/pslogo.png`.

B. Configuration
8. tailwind.config.js — extend theme.colors and theme.fontFamily mapped to
   the CSS variables in src/styles/tokens.css per BUILD_PLAN §3.2. Set
   darkMode to ['selector', '[data-theme="dark"]'] like the dashboard.
   Set the content array to scan src/**/*.{js,jsx} and index.html.
9. src/styles/tokens.css — CSS variables (dark + light) per BUILD_PLAN §3.1,
   plus the shadcn-expected token aliases (--background, --foreground,
   --primary, --card, --popover, --muted, --destructive, --ring, etc.)
   computed from the brand values.
10. src/index.css — top-of-file Google Fonts @import for DM Serif Display,
    DM Sans, DM Mono; then `@import './styles/tokens.css';`; then the three
    @tailwind directives.
11. src/lib/utils.js — `cn()` helper (clsx + tailwind-merge), as required
    by shadcn.

C. Database
12. supabase/migrations/0001_initial.sql — organizations, contacts,
    activities (all 4 fk columns per BUILD_PLAN §4.3, with REFERENCES only
    on organization_id and contact_id), RLS policies (Phase 1 strategy
    per §4.5: any authenticated user, all CRUD), updated_at trigger.
    Match the schema in BUILD_PLAN §4.1 and §4.3 exactly.

D. Auth + theme + brand
13. src/api/supabase.js — singleton client; URL + publishable key hardcoded
    (safe with RLS).
14. src/context/AuthContext.jsx — wraps supabase.auth.onAuthStateChange();
    exposes { session, user, signInWithMagicLink, signOut, loading }.
15. src/components/auth/RequireAuth.jsx — redirects to /login when no
    session; shows brief loading state while session is being checked.
16. src/context/ThemeContext.jsx — mirror dashboard's ThemeContext;
    storage key `ps-crm-theme`.
17. src/components/brand/PageHeader.jsx — mirror dashboard pattern.
18. src/components/brand/Navigation.jsx — top-bar nav button + drawer.
    Links: Home, Organizations, Contacts. Highlights current page.
    Sign-out at the bottom.
19. src/components/brand/ThemeToggle.jsx — mirror dashboard.
20. src/components/brand/KPICard.jsx — mirror dashboard's KPICard.jsx.
21. src/components/brand/SectionHeader.jsx — mirror dashboard.

E. Pages
22. src/App.jsx — AuthProvider → ThemeProvider → BrowserRouter → Routes:
    /login, / (RequireAuth → Home), /organizations, /organizations/:id,
    /contacts. Wildcard → /.
23. src/main.jsx — ReactDOM.createRoot.
24. src/pages/Login.jsx — magic-link sign-in. Clean, on-brand. Show
    "check your email" state after submit.
25. src/pages/Home.jsx — auth-gated. KPI cards: # organizations, # contacts,
    # activities (last 7 days). Recent activity feed (last 10).
26. src/pages/Organizations.jsx — searchable filterable shadcn Table;
    "New organization" Dialog; row click → /organizations/:id.
27. src/pages/Organization.jsx — detail page: edit org info; contacts list
    (add contact inline); activity feed; "Log activity" form (type,
    subject, body, occurred_at).
28. src/pages/Contacts.jsx — cross-org list; filter by organization;
    create dialog that requires picking an org.

F. Data hooks
29. src/hooks/useAuth.js — exposes session/user/etc. from AuthContext.
30. src/hooks/useOrganizations.js
31. src/hooks/useContacts.js
32. src/hooks/useActivities.js
    Each hook owns loading/error/data/refetch. No React Query.

G. Utils
33. src/utils/constants.js
34. src/utils/formatters.js — currency (Intl.NumberFormat), date
    (Intl.DateTimeFormat), phone — modeled on dashboard's formatters.js.

H. Repo + deploy config
35. README.md — local dev (`npm install`, `npm run dev`, `supabase start`),
    env vars, and Cloudflare Pages deploy instructions (`npm run build`
    produces `dist/`; connect the GitHub repo to a new Cloudflare Pages
    project with build command `npm run build` and output dir `dist`).
36. .env.example — SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for
    documentation. Note: keys are also hardcoded in src/api/supabase.js.
37. public/_redirects — `/* /index.html 200` for SPA routing fallback.
    Works on Netlify and Cloudflare without changes.
38. .gitignore — standard Node + Vite + Supabase ignores plus .env.

CONFIGURATION I'LL PROVIDE
- Supabase URL: [PASTE HERE]
- Supabase publishable key: [PASTE HERE]
- GitHub repo URL: [PASTE HERE]
  (Hardcode the Supabase URL and publishable key in src/api/supabase.js
  for now — the publishable key is safe to ship to the browser when RLS
  is enabled on every table, which it is. The secret key never goes in
  the frontend.)

CONSTRAINTS
- Plain JSX, no TypeScript anywhere. No .ts/.tsx files. No tsconfig.json.
- Tailwind utilities by default. shadcn/ui for primitives. Brand
  components in src/components/brand/ for the five listed visual
  identity components only — everything else is utilities + shadcn.
- Long Tailwind utility strings are NOT a reason to extract a component.
  Extract only when (a) reused, (b) section has distinct semantic name,
  or (c) parent file grows past ~300 lines.
- Avoid dangerouslySetInnerHTML unless genuinely needed; comment why.
- Do NOT install @supabase/auth-helpers or @supabase/ssr — bare
  @supabase/supabase-js + custom AuthContext per BUILD_PLAN §6.3.
- Do NOT install React Query, SWR, or any data-fetching library.
  Custom hooks per resource per BUILD_PLAN §8.
- Surface errors via sonner toast. No silent catches.
- Match the design tokens and font rules in BUILD_PLAN.md §3 exactly.
- ABSOLUTE: do not create, edit, or delete any file outside of
  ps-app-crm/. If anything seems to require touching ps-app-dashboard/,
  _reference/, .claude/, or .wrangler/, stop and ask first.
- Reading from _reference/ is allowed. Copying _reference/ps-crm-logo.png
  into ps-app-crm/public/pslogo.png is allowed (it's a write to
  ps-app-crm/, the read source is read-only).

WORKING STYLE
- Plan first, then build. Before writing any code:
  (a) confirm in writing that you understand ps-app-dashboard/ and the
      other sibling folders are READ-ONLY,
  (b) show me the file list,
  (c) show me the migration outline,
  (d) show me a brief summary of the dashboard style patterns you intend
      to mirror in src/components/brand/.
  Wait for my "go" before writing any code.
- Initialize git inside ps-app-crm/ as the first step after my "go".
  Connect to the GitHub remote I provide. Make the first commit
  ".gitignore + scaffolding" so we have a clean starting point on GitHub.
- Commit at logical checkpoints. Suggested commits after the initial
  scaffolding one:
  (a) tokens.css + tailwind config + shadcn primitives + brand components,
  (b) migration + Supabase client + AuthContext + login,
  (c) organizations CRUD,
  (d) contacts + activities + home dashboard,
  (e) README + final polish.
- After each commit, summarize what's done and what's next, then wait.
- If you hit something underspecified, stop and ask. Don't guess on
  schema, auth behavior, or brand component visuals.

START HERE
1. Read ps-app-crm/BUILD_PLAN.md and ps-app-crm/CLAUDE.md fully.
2. Read ps-app-dashboard/src/index.css and ps-app-dashboard/tailwind.config.js
   for token + theme patterns.
3. Read ps-app-dashboard/src/components/layout/{PageHeader,Navigation,
   SectionHeader,ThemeToggle}.jsx and src/components/finance/KPICard.jsx
   for brand component patterns.
4. Confirm in writing:
   - You understand Phase 1 scope per BUILD_PLAN.md §7.
   - You understand the open decision in BUILD_PLAN.md §9 #7 (existing
     provider data import is deferred to Phase 2 kickoff, not Phase 1).
   - You will not modify any file outside ps-app-crm/.
   - You will use plain JSX (no TypeScript), Tailwind utilities, shadcn/ui,
     and only the five listed brand components in src/components/brand/.
5. Propose the file plan, the migration outline, and a brief
   style-mirroring summary (which dashboard tokens / components you'll
   replicate, and how).
6. Wait for my go-ahead before writing any code.
```

---

## After Phase 1 ships

Open a new Claude Code session for Phase 2 with a similarly scoped prompt. Don't carry Phase 1 conversation state into Phase 2 — the repo + `BUILD_PLAN.md` + `CLAUDE.md` are the handoff. The Phase 2 deliverable list in `BUILD_PLAN.md` §7 is currently expressed at the page-level (e.g., `src/pages/Opportunities.jsx`); a fresh kickoff doc with a translated file checklist should be written when Phase 2 starts.
