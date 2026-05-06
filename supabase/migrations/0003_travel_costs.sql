-- =============================================================
-- Provider Solutions CRM — travel cost columns on opportunities
--
-- Travel cost is a structural input to GP, not polish: when PS
-- covers provider travel, GP = Bill − Pay − Travel. Without these
-- columns the GP modeler is optimistic on every PS-covers-travel
-- opportunity. See BUILD_PLAN.md §4.1 (data model) and §7 Phase 2.
--
-- Adds four columns to opportunities:
--   ps_covers_travel             — boolean, default false. Whether
--                                  the contract obligates PS to
--                                  cover provider travel.
--   travel_airfare_estimate      — numeric, nullable. Round-trip
--                                  cost per assignment block.
--   travel_hotel_per_night_estimate — numeric, nullable.
--   travel_rental_per_day_estimate  — numeric, nullable.
--
-- Constraint shape note (intentional divergence from
-- opportunities_on_call_consistent in 0002): the on-call constraint
-- requires rates to be NOT NULL when on_call_enabled = true. The
-- travel constraint goes the other way — when ps_covers_travel is
-- false, rates MUST be null. Matches the daily-use case where the
-- flag flips true before specific rates are priced out.
--
-- Migrations are immutable once shipped. Never edit this file
-- after it has been applied to a Supabase environment — add a
-- new numbered migration instead.
-- =============================================================

alter table public.opportunities
  add column ps_covers_travel                  boolean       not null default false,
  add column travel_airfare_estimate           numeric(10,2),
  add column travel_hotel_per_night_estimate   numeric(10,2),
  add column travel_rental_per_day_estimate    numeric(10,2);

-- Travel rate columns can only be populated when ps_covers_travel
-- is true. When the flag flips back to false, the form clears the
-- rates; this CHECK is the safety net.
alter table public.opportunities
  add constraint opportunities_travel_consistent check (
    ps_covers_travel = true
    or (travel_airfare_estimate           is null
        and travel_hotel_per_night_estimate   is null
        and travel_rental_per_day_estimate    is null)
  );

-- Non-negative when populated. Mirrors the
-- opportunities_rates_nonneg pattern in 0002.
alter table public.opportunities
  add constraint opportunities_travel_rates_nonneg check (
    (travel_airfare_estimate         is null or travel_airfare_estimate         >= 0)
    and (travel_hotel_per_night_estimate is null or travel_hotel_per_night_estimate >= 0)
    and (travel_rental_per_day_estimate  is null or travel_rental_per_day_estimate  >= 0)
  );
