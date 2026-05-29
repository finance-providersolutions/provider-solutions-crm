-- =============================================================
-- Provider Solutions CRM — provider auto-link on auth.users INSERT
--
-- Builds on the 0011 identity layer (profiles + is_staff() +
-- current_provider_id()). 0011 seeded STAFF profiles by hand and
-- explicitly DEFERRED provider profiles to "the portal slice." This
-- is that slice's database half: it adds the mechanism that links a
-- new auth user to an existing providers row automatically, with no
-- manual seed per provider.
--
-- The model this establishes:
--   A provider's CONTACT EMAIL (providers.email, owned by the CRM)
--   IS their auth email. When that person logs into the portal for
--   the first time, an auth.users row is created; this trigger looks
--   up a providers row whose email matches (case-insensitive,
--   trimmed) and, if found, creates their profile with
--   role = 'provider' and provider_id pointing at that row. The
--   universal provider-scoping policies from 0011 then scope every
--   provider-facing table to that provider automatically.
--
-- What this migration does NOT do:
--   - It does NOT create or modify any providers row. The Sample
--     Provider test record (and Reed's eventual provider row) are
--     CRM-authored data, not migration data.
--   - It does NOT handle staff/admin profiles. Those are still seeded
--     by hand per 0011 §6 / RLS-PLAN §8. The trigger only ever
--     creates role = 'provider' profiles, and only when a providers
--     email match exists.
--
-- NICE CONSEQUENCE (worth knowing): Reed-as-provider needs no special
-- migration. The moment his personal email (reedhogan@mac.com) is set
-- on his providers row in the CRM, his next portal login auto-links
-- through this same trigger. Same for every future provider.
--
-- APPLY: run this in the Supabase SQL editor as the project owner
-- (same as 0011). Creating a trigger on auth.users requires the
-- elevated privilege the dashboard SQL editor runs with; the CLI
-- runner here has no DB connection.
--
-- Migrations are immutable once shipped. Never edit this file after
-- it has been applied — add a new numbered migration instead.
-- =============================================================

-- ─── 1. the auto-link function ───────────────────────────────────
-- SECURITY DEFINER so it can read public.providers and write
-- public.profiles regardless of the (none, at INSERT time) RLS
-- context of the brand-new user. set search_path = public, pg_temp
-- is the standard hardening so a shadow table in another schema
-- can't redirect the lookup.
--
-- CRITICAL — this function must NEVER raise. A trigger on auth.users
-- that throws would roll back the auth.users INSERT, which would
-- break sign-in for EVERY user, not just provider mismatches. Every
-- failure path therefore degrades to a RAISE WARNING (visible in the
-- Postgres logs) and a clean RETURN NEW, so a problem linking a
-- profile can never block authentication itself.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_provider_id uuid;
begin
  -- No email on the new auth row → nothing to match on.
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  -- Case-insensitive, trimmed match against providers.email.
  -- providers.email is nullable and NOT unique, so a deterministic
  -- ORDER BY + LIMIT 1 guards against the (data-quality) possibility
  -- of two providers sharing an email — we link the oldest record
  -- rather than erroring.
  select p.id
    into matched_provider_id
  from public.providers p
  where p.email is not null
    and lower(btrim(p.email)) = lower(btrim(new.email))
  order by p.created_at asc
  limit 1;

  -- No matching provider → authenticate, but create no profile. The
  -- portal detects the absent provider link and shows a friendly
  -- "not linked yet" screen rather than a broken empty checklist.
  if matched_provider_id is null then
    return new;
  end if;

  -- Create the provider profile. Both uniqueness constraints from
  -- 0011 can legitimately fire here:
  --   profiles_pkey            — this auth user already has a profile
  --   profiles_provider_id_uidx — that provider is already linked to
  --                               some other login
  -- In either case the desired end-state already exists, so swallow
  -- the violation. Any other unexpected error is also swallowed (with
  -- a warning) to honor the never-raise rule above.
  begin
    insert into public.profiles (id, email, role, provider_id)
    values (new.id, new.email, 'provider', matched_provider_id);
  exception
    when unique_violation then
      raise warning 'handle_new_auth_user: profile or provider link already exists for % (provider %)',
        new.email, matched_provider_id;
    when others then
      raise warning 'handle_new_auth_user: unexpected error linking % : %',
        new.email, sqlerrm;
  end;

  return new;
end;
$$;

-- ─── 2. the trigger ──────────────────────────────────────────────
-- AFTER INSERT so the auth.users row is already persisted when we
-- read NEW. FOR EACH ROW because we act per new user. Drop-then-
-- create makes this re-runnable if the migration is ever replayed
-- against an environment where a prior attempt created it.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- ─── 3. one-time backfill ────────────────────────────────────────
-- The trigger only fires on FUTURE inserts. Any auth.users row that
-- already exists and matches a providers.email — e.g. an email that
-- logged into the CRM or an earlier portal test before this trigger
-- existed — would otherwise never get linked. This backfill links
-- them once, idempotently:
--   - only users with no profile yet (left join is null)
--   - only providers not already linked to some other login
--   - oldest provider wins on the (unlikely) duplicate-email case
-- Safe to re-run: the WHERE clauses make it a no-op after the first
-- successful pass.
insert into public.profiles (id, email, role, provider_id)
select u.id, u.email, 'provider', m.provider_id
from auth.users u
join lateral (
  select p.id as provider_id
  from public.providers p
  where p.email is not null
    and lower(btrim(p.email)) = lower(btrim(u.email))
  order by p.created_at asc
  limit 1
) m on true
left join public.profiles existing_by_user on existing_by_user.id = u.id
where u.email is not null
  and btrim(u.email) <> ''
  and existing_by_user.id is null
  and not exists (
    select 1 from public.profiles pr where pr.provider_id = m.provider_id
  );
