# STATE — Provider Solutions CRM

A snapshot of where this app is right now. Scope is the CRM only. Cross-app concerns live in the suite-level docs at ps-apps-suite/docs/.

## What this app is

Internal CRM for Provider Solutions, LLC (LOCUMs physician staffing). Second app in a suite that already includes a live financial dashboard. Targets demand (opportunities from hospitals and LOCUMs partners) and supply (recruiting, credentialing, and managing providers). Real auth from day one. Users at launch are Jason and Reed; designed to scale to admin staff within months.

## Current phase

Phase 1 is shipped. That covers organizations, contacts, activities, and a home dashboard with snapshot KPIs. Phase 2 (opportunities, providers, tasks, placements, AppSheet import, GP modeler) has not started. Phase 3 (credentialing) and Phase 4 (matching) are further out. See ROADMAP.md.

## Hosting and infrastructure

The app is hosted on Cloudflare as a static-assets deployment. The Cloudflare project is named provider-solutions-crm. The deploy config lives in wrangler.jsonc — the build runs vite, the dist/ folder is uploaded as assets, and Cloudflare's single-page-application not-found-handling serves index.html for any unmatched path so client-side routing works. The legacy public/_redirects file was removed once the wrangler config took over.

Backend is Supabase (single project, all environments share it for now). Supabase project ref is ztbadmaufcpkinnjztxy; the URL and publishable key are hardcoded in src/api/supabase.js, which is safe because Row Level Security is enabled on every table. The service role key never ships to the browser and lives only in the Supabase dashboard or in Jason's terminal env when running scripts.

The app is PWA-capable. index.html declares the manifest and Apple home-screen meta tags; public/manifest.webmanifest sets standalone display, dark theme color #0b1c2e, and uses pslogo.png as the icon. iOS safe-area-inset-top is respected on the fixed page header and on every page's top padding so the app sits below the status bar when installed.

When the CRM needs financial-dashboard data (QBO actuals against opportunities), the plan is to call the existing worker at qbo-proxy.finance-providersolutions.workers.dev rather than duplicating that data into Supabase. No CRM code calls that worker yet — that integration belongs to Phase 2.

## File and module inventory

Top-level config: package.json (locked stack — React 18, Vite 5, Tailwind 3, react-router-dom 6, shadcn/ui via Radix primitives, sonner for toasts, lucide-react for icons), tailwind.config.js (maps utility names to CSS variable tokens), components.json (shadcn config), jsconfig.json (the @ alias resolves to src/), vite.config.js, postcss.config.js, .env.example, wrangler.jsonc, .gitignore.

Reference docs in the repo root: BUILD_PLAN.md is the source of truth for data model and phasing. CLAUDE.md gives Claude Code session conventions. PHASE_1_KICKOFF.md and PHASE_2_KICKOFF.md are the historic Claude Code briefing prompts. README.md is the human onboarding doc. The v1 archives (BUILD_PLAN_v1_vanilla_archive.md, CLAUDE_v1_vanilla_archive.md, PHASE_1_KICKOFF_v1_vanilla_archive.md) capture the abandoned vanilla-JS multi-page version and are read-only history.

Public assets: public/pslogo.png is the brand mark, public/manifest.webmanifest is the PWA manifest.

Source tree under src/. main.jsx mounts ReactDOM. App.jsx wires ThemeProvider, then AuthProvider, then BrowserRouter, then five routes (login, home, organizations list, organization detail, contacts list) — every protected route is wrapped in RequireAuth and rendered inside an AppShell that draws the fixed PageHeader. index.css imports Google Fonts (DM Serif Display, DM Sans, DM Mono), then styles/tokens.css, then the three Tailwind directives.

styles/tokens.css holds every CSS variable the app uses, in two blocks — dark default and light override under data-theme="light". It is the single source of truth for color and radius. shadcn's expected token aliases (background, foreground, primary, card, popover, muted, destructive, ring) are computed from the brand values so primitives Just Work.

api/supabase.js exports a singleton supabase client configured with persistSession, autoRefreshToken, and detectSessionInUrl turned on.

context/AuthContext.jsx wraps supabase.auth and exposes session, user, requestEmailOtp, verifyEmailOtp, signOut, loading. context/ThemeContext.jsx persists the theme to localStorage under the ps-crm-theme key.

components/auth/RequireAuth.jsx redirects to /login when there is no session and shows a brief loading indicator while the listener attaches.

components/brand/ contains the hand-mirrored brand components: PageHeader (fixed top bar with logo, title, subtitle, nav button), Navigation (slide-in drawer with route links and ThemeToggle), ThemeToggle, KPICard, SectionHeader. Visual structure is mirrored from the dashboard at ../ps-app-dashboard/src/components/.

components/ui/ is the shadcn primitives folder: badge, button, dialog, dropdown-menu, input, label, select, sonner, table, tabs, textarea.

Feature-scoped components: components/organizations/OrganizationFormDialog.jsx, components/contacts/ContactFormDialog.jsx, components/activities/ActivityFeed.jsx and LogActivityForm.jsx.

Hooks under hooks/ — one per resource. useAuth.js exposes the auth context. useOrganizations.js owns list and per-record fetch with create, update, remove. useContacts.js takes an optional organizationId to scope and selects the parent organization eagerly. useActivities.js takes optional organizationId, contactId, sinceDays, and limit filters and selects parent organization and contact eagerly. None of these use React Query — each owns its own loading, error, data, refetch.

Pages under pages/. Login.jsx is a two-step OTP form (email step, then code step). Home.jsx renders three KPI cards (organizations count, contacts count, activities in last 7 days) and a recent-activity feed (last 10). Organizations.jsx is a searchable, type-filterable table with a create dialog. Organization.jsx is the detail page — edit, contacts list with inline add, activity feed, log-activity form, and a destructive delete at the bottom that cascades to contacts and activities. Contacts.jsx is the cross-org contact list with org filter and a create dialog that requires picking an org.

Utility files: lib/utils.js exports cn() for clsx + tailwind-merge. utils/constants.js holds ORGANIZATION_TYPES, CONTACT_ROLES, ACTIVITY_TYPES, US_STATES, and the labelFor helper. utils/formatters.js holds Intl-based currency, date, and phone helpers plus fmtName.

Database: supabase/migrations/0001_initial.sql is the only migration so far. It creates organizations, contacts, and activities; sets up the shared updated_at trigger function; defines three CHECK constraints (organization type, contact role, activity type); and turns on RLS with permissive policies for any authenticated user. Migrations are immutable once applied — never edit this file again, ever; new changes require new numbered files.

## Data model and integrations

Three tables today. organizations has name, type (hospital, locums_partner, or other), website, address fields, and notes. contacts hangs off organization_id with name, title, role, email, phone, notes. activities is the polymorphic touch log with all four FK columns from day one (organization_id, contact_id, opportunity_id, provider_id) but only the first two carry REFERENCES — Phase 2 adds the rest when those parents exist. A CHECK constraint enforces that exactly one parent is set on every activity.

Audit columns (created_at, updated_at, created_by referencing auth.users) appear on every user-editable table. UUIDs everywhere. No soft-delete in Phase 1 — hard delete with cascade.

External integration today: only Supabase auth and Postgres. The QBO proxy at qbo-proxy.finance-providersolutions.workers.dev is the planned cross-app data source for Phase 2 but is not wired up yet. AppSheet is the legacy system providers still use for shift logs; the appsheet_id column is reserved on organizations, providers, and opportunities for stable matching during the eventual import. There is no two-way sync, will never be one — AppSheet is being retired, not synchronized.

Phase 3 will introduce a credential-alerts edge function that emails a daily expiration digest to all.provider.solutions@gmail.com via Resend.

## Auth and core domain rules

Auth is email OTP — Supabase emails a 6-to-10 digit code (length is configurable in the Supabase dashboard; the input accepts the full range so a project-side change does not lock anyone out). The login flow used to be magic link; recent commits switched it to OTP because the code flow stays inside the installed PWA without bouncing through Mail.

RLS Phase 1 strategy is simple and intentional: any authenticated user can SELECT, INSERT, UPDATE, and DELETE everything. Anonymous access is blocked. Phase 2-plus will introduce a profiles table and role-based policies (admin, recruiter, viewer) when admin staff are added.

Once Phase 2 ships, every new provider, organization, and opportunity goes into the CRM exclusively — AppSheet is frozen for those record types. AppSheet still receives shift logs from providers until the future provider portal replaces that workflow.

Migrations are immutable once shipped. Errors must surface via sonner toast with the full error logged to console — never silently caught. Money is rendered with Intl currency formatting; estimates are italic with a leading tilde and the warning color. localStorage keys are prefixed ps-crm-. Routes are one per page; detail pages take their parent id as a URL param. Plain JSX, no TypeScript.

## Known issues and latent risks

Phase 1 RLS is permissive by design — any authenticated user can delete any record. Acceptable for two users, not acceptable once admin staff arrive. Add profiles + role policies before granting accounts beyond the founders.

Organization deletion cascades to contacts and activities through the schema, gated only by a window.confirm in the UI. There is no soft-delete and no undo. A misclick on a populated organization is destructive.

Activity type sms is in the schema and ACTIVITY_TYPES list but has no UI optimizations beyond the icon. There is no way to add an activity that is logged against a contact directly today — the LogActivityForm currently only attaches to organizations.

The Login.jsx OTP code step has a length minimum of 6 digits; if Supabase project settings ever drop below 6 the form will reject all valid codes. The pattern is set wide (6 to 10 digits) to absorb the documented configurable range, but a 4-digit setting would silently break login.

Token drift between this CRM and ps-app-dashboard is a manual sync today. tokens.css here mirrors the dashboard's index.css by hand. When a third app joins the suite, tokens extract to a shared package; until then, dashboard token edits must be ported to CRM by hand or visual divergence creeps in.

The detail-page top padding hard-codes the header height as 58px plus safe-area-inset-top in inline styles. If the header height changes, every page needs an edit. A CSS variable would centralize this.

## Design system at a glance

Dark default. Background #0b1c2e (deep navy), surface #122540 raised one level, surface2 #1a3050 raised two levels. Accent is teal #7ee8e8 with a brighter hover variant #00e0ff and a near-transparent fill accent-dim. Income green #3ecf8e for active, current, won states. Danger red #ff8080 for lost, expired, COGS. Warning amber #c8a840 is CRM-only — used for estimates (italic with tilde prefix) and soon-expiring credentials in Phase 3. Light theme is a separate :root block under data-theme="light"; ThemeToggle persists the choice to localStorage.

Three fonts. DM Serif Display for h1 and h2 only (font-display utility). DM Sans for body (font-sans, default). DM Mono for numbers, IDs, and small-caps labels (font-mono). Mono uppercase with wide letter-spacing is the recurring label and metadata treatment throughout.

Radius is 5px globally via the --radius variable.

Brand components are hand-mirrored from the financial dashboard for visual recognizability. Non-brand UI (tables, forms, dialogs, lists, detail panes) uses Tailwind utilities and shadcn/ui primitives freely with no dashboard-class-pattern constraint.
