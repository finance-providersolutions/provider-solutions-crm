# Phase 1 Kickoff Prompt for Claude Code

> Paste the prompt block at the bottom into Claude Code after completing the prerequisites. Edit the bracketed values first.

---

## Prerequisites (do these before pasting the prompt)

### A. Folder setup

The suite parent already exists at `C:\Users\jmcdavid\OneDrive\ps-apps-suite\`, with `ps-app-dashboard/` already inside it. You need to create the CRM folder and drop in the three docs.

1. Open `C:\Users\jmcdavid\OneDrive\ps-apps-suite\` in File Explorer.
2. Create a new folder inside it named `ps-app-crm` (full path: `ps-apps-suite\ps-app-crm\`).
3. Place these three files inside `ps-app-crm\`:
   - `BUILD_PLAN.md`
   - `CLAUDE.md`
   - `PHASE_1_KICKOFF.md` (this file)
4. Wait for OneDrive to finish syncing (cloud icon, not the spinning sync icon, on `ps-app-crm\`).

### B. Supabase

5. Create a Supabase project at https://supabase.com/dashboard. Name it something like `provider-solutions-crm`.
6. From the project dashboard, copy these two values — you'll paste them into the prompt below:
   - **Project URL** — the base URL of your Supabase project. Found at *Settings → Integrations → Data API → API URL*. The displayed value will end in `/rest/v1/` — strip that off; you only want the base, e.g. `https://abcdefghijk.supabase.co`.
   - **Publishable key** — found at *Settings → API Keys → Publishable and secret API keys → Publishable key*. Starts with `sb_publishable_...`. This is the new name for what Supabase used to call the "anon" key — it's safe to ship to a browser as long as Row Level Security is enabled on every table (which it will be). Do NOT use the secret key (`sb_secret_...`); that one never goes in frontend code.

### C. GitHub

7. Create a new empty GitHub repo named `provider-solutions-crm` (or whatever name you prefer). Do NOT initialize it with a README, license, or .gitignore — leave it completely empty so Claude Code can initialize from scratch.
8. Note the repo URL (e.g., `https://github.com/yourusername/provider-solutions-crm.git`).

### D. Claude Code session

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

Before writing any CSS, also read ps-app-dashboard/styles_dark.css and
skim ps-app-dashboard/index.html. The CRM should look like a sibling of
the dashboard — same color tokens, same component patterns, same typography
hierarchy.

PHASE 1 GOAL
Jason and Reed can sign in, create organizations (hospitals + LOCUMs partners)
and contacts, and log activities against them. Deployed to a Cloudflare Pages
preview URL.

DELIVERABLES FOR THIS PHASE (all paths relative to ps-apps-suite/)
1. Repo scaffolding inside ps-app-crm/ per BUILD_PLAN.md §5 (only the files
   Phase 1 needs; create empty placeholder pages for Phase 2+ if helpful,
   but no logic).
2. ps-app-crm/supabase/migrations/0001_initial.sql — organizations, contacts,
   activities, RLS policies, updated_at trigger. RLS: any authenticated user
   can do anything (per BUILD_PLAN §4.5 Phase 1 strategy). Match the schema
   in BUILD_PLAN.md §4.1 and §4.3 exactly.
3. ps-app-crm/public/assets/tokens.css — design tokens extracted into a
   standalone file (per BUILD_PLAN §6.1, this enables future shared-CDN
   extraction). Mirror values from ps-app-dashboard/styles_dark.css.
4. ps-app-crm/public/assets/shared.css — imports tokens.css; defines base
   typography, reusable component classes (.card, .btn, .btn-primary,
   .btn-ghost, .input, .table, .badge, .stack, .row, etc.). Component
   patterns mirror the dashboard.
5. ps-app-crm/public/assets/shared.js — Supabase client init, requireAuth()
   helper, format helpers (currency, date, phone), getCurrentUser().
6. ps-app-crm/public/assets/nav.js — top nav with links: Home, Organizations,
   Contacts. Highlights current page. Sign-out button.
7. ps-app-crm/public/assets/components.js — toast (success/error/info),
   confirm modal.
8. ps-app-crm/public/login.html — email magic-link sign-in. Clean, on-brand.
   Show "check your email" state after submit.
9. ps-app-crm/public/index.html — auth-gated home. KPI cards: # organizations,
   # contacts, # activities (last 7 days). Recent activity feed (last 10).
10. ps-app-crm/public/organizations.html — searchable filterable table;
    "New organization" modal; click row -> organization.html?id=...
11. ps-app-crm/public/organization.html — detail page: edit org info;
    contacts list (add contact inline); activity feed; "Log activity" form
    (type, subject, body, occurred_at).
12. ps-app-crm/public/contacts.html — cross-org list; filter by organization;
    create modal that requires picking an org.
13. ps-app-crm/README.md — local dev (supabase start), env vars, deploy to
    Cloudflare Pages, link Supabase project.
14. ps-app-crm/.env.example — SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for
    documentation.
15. ps-app-crm/_redirects — Cloudflare Pages config so /organizations works
    without .html.
16. ps-app-crm/.gitignore — standard Node/Supabase ignores plus .env.

CONFIGURATION I'LL PROVIDE
- Supabase URL: [PASTE HERE]
- Supabase publishable key: [PASTE HERE]
- GitHub repo URL: [PASTE HERE]
  (Hardcode the Supabase URL and publishable key in shared.js for now — the
  publishable key (sb_publishable_...) is the new name for the old anon key
  and is safe to ship to the browser when RLS is enabled on every table,
  which it is. The secret key (sb_secret_...) never goes in the frontend.)

CONSTRAINTS
- Vanilla JS, ES modules, no build step. Pages load Supabase JS from
  https://esm.sh/@supabase/supabase-js@2 via import map.
- Multi-page. Each HTML file is self-contained except for shared assets.
- No inline onclick — data-attributes + delegated listeners only.
- Surface errors via toast. No silent catches.
- Match the design tokens and font rules in CLAUDE.md exactly.
- ABSOLUTE: do not create, edit, or delete any file outside of ps-app-crm/.
  If anything seems to require touching ps-app-dashboard/, _reference/,
  .claude/, or .wrangler/, stop and ask first.

WORKING STYLE
- Plan first, then build. Before writing any code:
  (a) confirm in writing that you understand ps-app-dashboard/ and the
      other sibling folders are READ-ONLY,
  (b) show me the file list,
  (c) show me the migration outline,
  (d) show me a brief summary of the dashboard style patterns you intend
      to mirror.
  Wait for my "go" before writing any code.
- Initialize git inside ps-app-crm/ as the first step. Connect to the
  GitHub remote I provide. Make the first commit ".gitignore + initial
  scaffolding" so we have a clean starting point on GitHub.
- Commit at logical checkpoints. Suggested commits after the initial one:
  (a) tokens.css + shared assets,
  (b) migration + auth flow + login,
  (c) organizations CRUD,
  (d) contacts + activities + home dashboard,
  (e) README + deploy config.
- After each commit, summarize what's done and what's next, then wait.
- If you hit something underspecified, stop and ask. Don't guess on schema
  or auth behavior.

START HERE
1. Read ps-app-crm/BUILD_PLAN.md and ps-app-crm/CLAUDE.md fully.
2. Read ps-app-dashboard/styles_dark.css and skim ps-app-dashboard/index.html
   for component patterns.
3. Confirm in writing:
   - You understand Phase 1 scope per BUILD_PLAN.md §7.
   - You understand the open decision in BUILD_PLAN.md §9 (existing provider
     data import is deferred to Phase 2 kickoff, not Phase 1).
   - You will not modify any file outside ps-app-crm/.
4. Propose the file plan, the migration outline, and a brief
   style-mirroring summary.
5. Wait for my go-ahead before writing any code.
```

---

## After Phase 1 ships

Open a new Claude Code session for Phase 2 with a similarly scoped prompt. Don't carry Phase 1 conversation state into Phase 2 — the repo + `BUILD_PLAN.md` + `CLAUDE.md` are the handoff.
