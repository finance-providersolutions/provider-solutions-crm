# Role-based RLS — applied plan

This document is the plan-of-record for migration `0011_role_based_rls.sql`. The migration file is written and ready to apply; this doc explains the intent, the table-by-table policy set, and the apply/verify/rollback steps. **The user applies the SQL via the Supabase dashboard** — this slice does not apply it itself.

This slice ships the **identity foundation only**. It does NOT include provider login, invites, or portal screens — those come in the next slice.

## Confirmed decisions (Phase 2 inputs)

- **Staff seats seeded as `admin`:** `finance.providersolutions@gmail.com` (Jason) and `exec.providersolutions@gmail.com` (Reed). The seed uses `WHERE email IN (...)` against `auth.users` and silently skips any address that has not logged in yet. If Reed's exec account has never logged into the CRM, verification step A will show only one row — that's the signal to have Reed log in once, then run the one-line follow-up insert (provided in §8).
- **`recruiter` is reserved in the enum** for future team members who should NOT also be able to manage other accounts. Both seats are admin today and behave identically.
- **`viewer` is deferred** — no current need, no policy surface area maintained for nobody.
- **Providers cannot DELETE their own `onboarding_items`** — the portal "uncomplete" flow updates `done = false`, matching the CRM's existing toggle semantics.
- **Reed-as-provider is DEFERRED to the portal slice.** Reed is also a practicing physician who takes shifts. He will need a SECOND, separate profile under his personal email (`reedhogan@mac.com`) with `role = 'provider'` linked to his `providers` row via `provider_id`. That seat does not ship in this slice because (a) the personal email has not logged into the CRM, (b) his `providers` row id needs to be identified, and (c) provider-scoping can only be honestly verified end-to-end against a real provider login. Reed-as-provider will therefore be the first real provider-login test case in the portal slice.

---

## 1. What today looks like

Auth is Supabase email OTP. There is no `profiles` table. Every CRM table has the same Phase-1 policy:

```sql
create policy "authenticated all access on <table>"
  on public.<table> for all to authenticated
  using (true) with check (true);
```

Any authenticated user can do anything on any row in any table. This is the policy set this migration replaces.

## 2. Table inventory and target policy class

Twelve tables exist today. They fall into four classes:

| Table | Class | Why |
|---|---|---|
| `organizations` | **Reference-readable** | Providers need to read the hospital name attached to their own privileges/placements. Writes stay staff-only. |
| `onboarding_item_types` | **Reference-readable** | The portal renders the same checklist catalog the CRM does. Writes stay staff-only. |
| `contacts` | **Staff-only** | Internal contacts at hospitals/partners. Not provider-facing. |
| `activities` | **Staff-only** | Internal touch log (recruiter notes). Not provider-facing even when `provider_id` points at them. |
| `opportunities` | **Staff-only** | Recruiting/demand-side data. The portal does NOT expose opportunities directly — providers only see what they've been selected for via `placements`. |
| `tasks` | **Staff-only** | Internal staff todos. A task `provider_id = X` is a recruiter's todo *about* the provider, not for them. |
| `providers` | **Provider-own-row** | Special case: the row IS the provider. Staff full access; provider can SELECT only their own row. |
| `provider_licenses` | **Provider-own-records** | Staff full access; provider can SELECT only rows where `provider_id = their own`. |
| `credentials` | **Provider-own-records** | Same. |
| `facility_privileges` | **Provider-own-records** | Same. |
| `placements` | **Provider-own-records** | Same. Read-only for provider — selection is recruiter-authored; future Scheduler will write rates/dates. |
| `onboarding_items` | **Provider-own-records, RW** | Staff full access; provider can SELECT / INSERT / UPDATE rows where `provider_id = their own` (the portal contributes by toggling done, attaching docs). DELETE stays staff-only. |

**Out of scope for this slice (flagged, not fixed):** the `credentials` storage bucket today allows any authenticated user to read every object in it. Once a provider can log in, that's a leak — but path-scoped storage policies depend on the portal's chosen path convention, so they belong with the portal slice, not this one. Reference-bucket policies on `organization-logos` and `provider-photos` are public-read and remain fine.

## 3. The `profiles` table

This is the single suite-wide identity table. Same Supabase project, used by the CRM today and the future portal / Scheduler.

```sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'recruiter', 'provider')),
  provider_id uuid references public.providers(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A provider profile MUST link to a providers row; non-provider
  -- profiles MUST NOT carry one. Enforced at the schema level so a
  -- mis-seeded row can't quietly become a security hole.
  constraint profiles_provider_link check (
    (role =  'provider' and provider_id is not null)
    or
    (role <> 'provider' and provider_id is null)
  )
);

create unique index profiles_provider_id_uidx
  on public.profiles(provider_id)
  where provider_id is not null;
```

**Role recommendation: `admin | recruiter | provider`.** Both Jason and Reed are `admin` today. `recruiter` is in the enum but behaves identically to `admin` under these policies for now — kept so the column already supports the split when you later want a recruiter who can't grant admin to others. `viewer` is **deferred** — not needed today and adds policy surface area you'd have to maintain for nobody. Easy to add later.

The unique index on `provider_id` enforces "one profile per provider" — no two logins can share a provider row.

## 4. Helper functions (the reusable pattern for future apps)

Three SECURITY DEFINER helpers do all the heavy lifting. The Scheduler reuses them verbatim.

```sql
create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','recruiter') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_provider_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select provider_id from public.profiles where id = auth.uid();
$$;
```

**Why SECURITY DEFINER, not `auth.jwt()` claims.** Custom JWT claims would mean maintaining a Supabase Auth Hook that re-issues tokens whenever a profile changes — extra moving part for no win today. SECURITY DEFINER functions run as the function owner (the migration owner, typically `postgres`) and bypass RLS, so calling `is_staff()` *inside* a `profiles` policy does NOT recurse — the helper reads `profiles` directly without engaging policy evaluation. This is the standard Supabase-recommended pattern. The `set search_path = public` line is the standard hardening so a future shadowing of `profiles` in another schema can't redirect the helper.

**The reusable rule for the Scheduler.** Any provider-scoped table in any future app applies this template:

```sql
create policy "staff_full" on <table>
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "provider_own" on <table>
  for select to authenticated
  using (provider_id = public.current_provider_id());
```

That's it. Two policies per table, both helpers identical across apps, no app-specific reimplementation.

## 5. Policy set per table — proposed SQL

The ordering inside the migration is **create-new-then-drop-old per table, in one transaction**, so the admin user never loses access mid-migration.

### profiles itself

```sql
alter table public.profiles enable row level security;

create policy "profiles staff full" on public.profiles
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "profiles own read" on public.profiles
  for select to authenticated
  using (id = auth.uid());
```

A user can always read their own profile (no helper call needed — `auth.uid()` is built-in). Staff can read/write everyone. No recursion: `is_staff()` is SECURITY DEFINER.

### Reference-readable tables (`organizations`, `onboarding_item_types`)

```sql
-- 1. Add new policies first.
create policy "<table> read all auth" on public.<table>
  for select to authenticated
  using (true);

create policy "<table> staff write" on public.<table>
  for insert to authenticated with check (public.is_staff());
create policy "<table> staff update" on public.<table>
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "<table> staff delete" on public.<table>
  for delete to authenticated
  using (public.is_staff());

-- 2. Then drop the permissive policy.
drop policy "authenticated all access on <table>" on public.<table>;
```

### Staff-only tables (`contacts`, `activities`, `opportunities`, `tasks`)

```sql
create policy "<table> staff full" on public.<table>
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy "authenticated all access on <table>" on public.<table>;
```

### Provider-own-row table (`providers`)

```sql
create policy "providers staff full" on public.providers
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "providers own row read" on public.providers
  for select to authenticated
  using (id = public.current_provider_id());

drop policy "authenticated all access on providers" on public.providers;
```

### Provider-own-records read-only tables (`provider_licenses`, `credentials`, `facility_privileges`, `placements`)

```sql
create policy "<table> staff full" on public.<table>
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "<table> provider own read" on public.<table>
  for select to authenticated
  using (provider_id = public.current_provider_id());

drop policy "authenticated all access on <table>" on public.<table>;
```

### Provider-own-records read-write table (`onboarding_items`)

```sql
create policy "onboarding_items staff full" on public.onboarding_items
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "onboarding_items provider own select" on public.onboarding_items
  for select to authenticated
  using (provider_id = public.current_provider_id());

create policy "onboarding_items provider own insert" on public.onboarding_items
  for insert to authenticated
  with check (provider_id = public.current_provider_id());

create policy "onboarding_items provider own update" on public.onboarding_items
  for update to authenticated
  using (provider_id = public.current_provider_id())
  with check (provider_id = public.current_provider_id());

drop policy "authenticated all access on onboarding_items" on public.onboarding_items;
```

Provider DELETE on own onboarding rows is intentionally NOT granted — the portal "uncomplete" flow updates `done = false` instead of deleting rows, matching the CRM's existing toggle semantics.

## 6. Seeding the admin rows

```sql
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email in (
  'finance.providersolutions@gmail.com',
  'exec.providersolutions@gmail.com'
)
on conflict (id) do nothing;
```

This pulls real `auth.users.id` values at apply time — no hardcoded UUIDs. If either email has not yet logged into the CRM (no row in `auth.users`), the insert silently skips that one address and proceeds with whichever exists. The verification step (§8) reports exactly which rows ended up in `profiles` so the gap, if any, is visible.

**Pre-apply existence check (optional but recommended).** Before applying the migration, you can run this one-liner in the Supabase SQL editor to confirm which staff accounts already exist. The CLI runner here has no direct Supabase connection, so this check has to happen from the dashboard:

```sql
select email
from auth.users
where email in (
  'finance.providersolutions@gmail.com',
  'exec.providersolutions@gmail.com'
)
order by email;
```

- Two rows back → both accounts are present, the migration's seed will land both admins in one pass.
- One row back (just `finance.providersolutions@gmail.com`) → migration seeds only Jason. Reed needs to log in once at the CRM `/login` (just request the OTP and verify it) to create his `auth.users` row, then run the one-line follow-up in §8.
- Zero rows → STOP. Something is wrong with the project or email values; do not apply the migration. Verification step A would then return an empty `profiles` and the next step would fail to find any admin row.

## 7. Ordering — why this is safe in one transaction

The whole migration runs as one transaction. Within it, the order is:

1. Create `profiles` table.
2. Seed the admin row(s).
3. Create the three helper functions.
4. For each table: enable RLS (already enabled — no-op), create the new staff-full policy first, then drop the old permissive policy.

At no point during the transaction is the admin user denied access:
- Before the transaction: permissive policy grants access.
- During the transaction: the new staff-full policy is in place *before* the permissive one is dropped, and `is_staff()` returns true for the seeded admin row.
- After the transaction: the new policy set is the only one in force.

If anything in the transaction fails, the entire migration rolls back — RLS state is unchanged, the user keeps permissive access.

## 8. Verification — after applying

Run each block in the Supabase SQL editor *while signed in as `finance.providersolutions@gmail.com`* (the SQL editor honors the logged-in JWT).

**A. Profiles are seeded:**
```sql
select email, role, provider_id from public.profiles order by email;
-- Expect: one row per staff email that existed in auth.users at apply time.
-- Both admin if both had logged in; just finance.* if exec.* hadn't.
-- All rows: role = 'admin', provider_id = null.
```

**A-bis. Late-seed Reed if his exec.* account had not logged in at apply time:**
```sql
-- Run AFTER Reed logs in at /login at least once.
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'exec.providersolutions@gmail.com'
on conflict (id) do nothing;
```

**B. Helper returns true for you:**
```sql
select public.is_staff(), public.current_user_role(), public.current_provider_id();
-- Expect: true, 'admin', null
```

**C. Each previously-accessible table still selects:**
```sql
select count(*) from public.organizations;
select count(*) from public.contacts;
select count(*) from public.activities;
select count(*) from public.providers;
select count(*) from public.opportunities;
select count(*) from public.tasks;
select count(*) from public.placements;
select count(*) from public.provider_licenses;
select count(*) from public.credentials;
select count(*) from public.facility_privileges;
select count(*) from public.onboarding_item_types;
select count(*) from public.onboarding_items;
-- Expect: every query returns a count, no permission errors.
```

**D. Smoke-test the CRM in the browser** — load Home, open an Opportunity detail, open a Provider detail, open Expirations. Everything should render as before.

**Provider-scoping verification is deferred to the next slice.** Without a real provider account, you'd have to simulate one with a synthetic JWT, and the simulation is brittle enough that a clean test against a real provider login in the next slice is the honest verification. The shape of the policies is straightforward enough that staff-side verification (A–D above) is the load-bearing check for this slice.

**What success looks like:** A, B, and C all pass; the app loads normally; the `profiles` table exists with at least the `finance.providersolutions@gmail.com` admin row.

**What "stop and roll back" looks like:** A returns 0 rows (seed didn't find your email — likely a wrong project), OR B returns `false` for the Jason account (the helper can't find his profile), OR any query in C errors with a permission denial, OR the app shows a sudden wall of toast errors after refresh. Roll back per §9.

**A note about the Reed gap.** If A shows only one row (Jason seeded, Reed not), that is NOT a rollback condition — it's the expected outcome when Reed's exec account hasn't logged in yet. He continues to access the CRM using whichever logged-in account he uses today; once he runs the OTP flow under `exec.providersolutions@gmail.com`, the one-line A-bis insert completes the seat. The slice is still a success.

## 9. Rollback — escape hatch

The migration ends with a clearly-marked `-- ROLLBACK` comment block holding the exact SQL to revert to permissive Phase-1 policies. The body of the rollback is run by hand if verification fails:

```sql
-- Re-create the old permissive policies first, then drop the new ones,
-- then drop helpers and the profiles table. Same ordering principle:
-- never leave the user without access in between.

create policy "authenticated all access on organizations"
  on public.organizations for all to authenticated using (true) with check (true);
-- ... (one block per table — full set spelled out in the migration file) ...

drop policy "organizations read all auth"  on public.organizations;
drop policy "organizations staff write"    on public.organizations;
drop policy "organizations staff update"   on public.organizations;
drop policy "organizations staff delete"   on public.organizations;
-- ... etc per table ...

drop function if exists public.is_staff();
drop function if exists public.current_user_role();
drop function if exists public.current_provider_id();
drop table if exists public.profiles;
```

The rollback block is comment-only by default — uncomment and run as a separate SQL editor pass if needed.

## 10. What changes in the CRM app code? Nothing.

This slice is migration-only. The CRM app continues to work because the admin policy grants the same access the permissive policy did. The portal slice will add: provider login, profile-seed UI / invites, and any storage path-scoping for the `credentials` bucket.

## 11. Status — resolved questions and migration ready

All three open questions are answered (see §1, "Confirmed decisions"). The migration file `supabase/migrations/0011_role_based_rls.sql` is written and matches this plan exactly. Apply per §7 ordering and verify per §8.
