// Pure GP computation for the opportunity-detail modeler.
//
// The formula is a direct translation of
// docs/appsheet-schema-notes.md §E.3, extended with travel cost
// (added in 0003 / commit (h.5)):
//
//   per-shift bill =
//       bill_orientation_hourly        * regular_hours_per_day * orientation_days
//     + bill_regular_hourly            * regular_hours_per_day * working_days
//     + bill_ot_hourly                 * ot_hours_per_working_day * working_days
//     + bill_advanced_shift_bonus_daily* adv_shift_bonus_days
//     + bill_on_call_nightly           * on_call_nights
//     + bill_call_back_hourly          * call_back_hours_per_night * on_call_nights
//
//   per-shift pay =
//       pay_orientation_daily          * orientation_days
//     + pay_regular_daily              * working_days
//     + pay_advanced_shift_bonus_daily * adv_shift_bonus_days
//     + pay_on_call_nightly            * on_call_nights
//     + pay_other_bonus_daily          * other_bonus_days
//
//   per-shift travel =
//       travel_hotel_per_night_estimate * hotel_nights_per_shift
//     + travel_rental_per_day_estimate  * rental_days_per_shift
//     + travel_airfare_estimate         * airfare_trips_per_shift_block
//     ... but only when ps_covers_travel = true; otherwise zero.
//
//   per-shift GP     = bill − pay − travel
//   weekly  GP       = per-shift GP * shifts_per_week
//   monthly GP       = weekly GP    * (52 / 12)        ← finance convention,
//                                                       not 4 weeks/month
//   annual  GP       = weekly GP    * weeks_billable_per_year (default 48)
//   margin           = GP / bill (display as %)
//
// Edge cases (per the commit brief):
//   - on-call disabled → on-call rates contribute zero regardless of
//     on_call_nights value
//   - ps_covers_travel = false → travel cost is zero regardless of
//     assumption values (and the rate columns are null per the
//     0003 CHECK constraint anyway)
//   - any rate field null → coerced to 0 via num()
//   - working_days > 7 / shift_length > 7 → allowed
//   - on_call_nights > working_days → silently capped at
//     working_days during compute. The form layer is responsible
//     for keeping the input in sync.

export const INPATIENT_DEFAULTS = {
  shifts_per_week:                   1,
  shift_days_per_shift:              7,
  working_days_per_shift:            7,
  orientation_days_per_placement:    0,
  ot_hours_per_working_day:          0,
  on_call_nights_per_shift:          7,
  call_back_hours_per_call_night:    0,
  adv_shift_bonus_days_per_shift:    0,
  other_bonus_days_per_shift:        0,
  weeks_billable_per_year:          48,
  // Travel quantity defaults (commit h.5). Independent of inpatient
  // vs outpatient — both use shift_length + 1 for hotel/rental
  // (one extra night/day for arrival/departure travel buffer) and
  // a single round-trip airfare per assignment block. Local
  // outpatient cases override per-session.
  hotel_nights_per_shift:            8,   // 7 + 1
  rental_days_per_shift:             8,   // 7 + 1
  airfare_trips_per_shift_block:     1,
};

export const OUTPATIENT_DEFAULTS = {
  shifts_per_week:                   1,
  shift_days_per_shift:              4,
  working_days_per_shift:            4,
  orientation_days_per_placement:    0,
  ot_hours_per_working_day:          0,
  on_call_nights_per_shift:          0,
  call_back_hours_per_call_night:    0,
  adv_shift_bonus_days_per_shift:    0,
  other_bonus_days_per_shift:        0,
  weeks_billable_per_year:          48,
  hotel_nights_per_shift:            5,   // 4 + 1
  rental_days_per_shift:             5,   // 4 + 1
  airfare_trips_per_shift_block:     1,
};

// Setting-aware seed. Falls back to inpatient when setting is null
// or 'other' — see schema notes §E.2.
export function seedDefaults(setting) {
  if (setting === 'outpatient') return { ...OUTPATIENT_DEFAULTS };
  return { ...INPATIENT_DEFAULTS };
}

// Authoritative source of "what fields should exist in the form
// state": seedDefaults(setting). Authoritative source of "what
// values to use when the user has saved before": savedBlob.
//
// When a column added later (e.g., the travel quantities added in
// commit h.5) is missing from an older blob, the merge fills it
// with the setting-aware default so the form renders the default
// value rather than a blank input. Saved keys win over defaults
// when both are present. Saved keys that aren't in seedDefaults
// pass through unchanged so we never silently drop user data.
//
// savedBlob = null returns pure defaults.
//
// This is the only function the GPModeler component calls to
// derive initial form state — both on first mount and on prop
// changes (a fresh opportunity loading, or a refetch returning
// updated saved values).
export function mergeAssumptions(setting, savedBlob) {
  const defaults = seedDefaults(setting);
  if (savedBlob == null) return defaults;
  return { ...defaults, ...savedBlob };
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function compute(opportunity, assumptions) {
  const o = opportunity ?? {};
  const a = assumptions ?? {};

  const onCallEnabled = Boolean(o.on_call_enabled);

  const shiftsPerWeek      = num(a.shifts_per_week);
  const workingDays        = num(a.working_days_per_shift);
  const orientationDays    = num(a.orientation_days_per_placement);
  const otHours            = num(a.ot_hours_per_working_day);
  const advBonusDays       = num(a.adv_shift_bonus_days_per_shift);
  const otherBonusDays     = num(a.other_bonus_days_per_shift);
  const callBackHours      = num(a.call_back_hours_per_call_night);
  const weeksPerYear       = num(a.weeks_billable_per_year);
  const regularHoursPerDay = num(o.regular_hours_per_day);

  // On-call gate: when disabled on the opportunity, both the input
  // nights and the bill/pay/call-back terms collapse to zero. When
  // enabled, cap nights at working_days per the brief.
  const requestedOnCallNights = num(a.on_call_nights_per_shift);
  const onCallNights = onCallEnabled
    ? Math.min(requestedOnCallNights, workingDays)
    : 0;
  const onCallCapApplied = onCallEnabled && requestedOnCallNights > workingDays;

  const billPerShift =
      num(o.bill_orientation_hourly)         * regularHoursPerDay * orientationDays
    + num(o.bill_regular_hourly)             * regularHoursPerDay * workingDays
    + num(o.bill_ot_hourly)                  * otHours            * workingDays
    + num(o.bill_advanced_shift_bonus_daily) * advBonusDays
    + num(o.bill_on_call_nightly)            * onCallNights
    + num(o.bill_call_back_hourly)           * callBackHours      * onCallNights;

  const payPerShift =
      num(o.pay_orientation_daily)           * orientationDays
    + num(o.pay_regular_daily)               * workingDays
    + num(o.pay_advanced_shift_bonus_daily)  * advBonusDays
    + num(o.pay_on_call_nightly)             * onCallNights
    + num(o.pay_other_bonus_daily)           * otherBonusDays;

  // Travel cost: zero unless the opportunity flag is set, regardless
  // of the assumption values. The 0003 CHECK ensures rates are null
  // when the flag is false; the gate below is defense in depth.
  const psCoversTravel = Boolean(o.ps_covers_travel);
  const hotelNights    = num(a.hotel_nights_per_shift);
  const rentalDays     = num(a.rental_days_per_shift);
  const airfareTrips   = num(a.airfare_trips_per_shift_block);

  const travelPerShift = psCoversTravel
    ? num(o.travel_hotel_per_night_estimate) * hotelNights
      + num(o.travel_rental_per_day_estimate)  * rentalDays
      + num(o.travel_airfare_estimate)         * airfareTrips
    : 0;

  const gpPerShift = billPerShift - payPerShift - travelPerShift;

  const billWeekly   = billPerShift   * shiftsPerWeek;
  const payWeekly    = payPerShift    * shiftsPerWeek;
  const travelWeekly = travelPerShift * shiftsPerWeek;
  const gpWeekly     = gpPerShift     * shiftsPerWeek;

  const monthFactor   = 52 / 12;
  const billMonthly   = billWeekly   * monthFactor;
  const payMonthly    = payWeekly    * monthFactor;
  const travelMonthly = travelWeekly * monthFactor;
  const gpMonthly     = gpWeekly     * monthFactor;

  const billAnnual   = billWeekly   * weeksPerYear;
  const payAnnual    = payWeekly    * weeksPerYear;
  const travelAnnual = travelWeekly * weeksPerYear;
  const gpAnnual     = gpWeekly     * weeksPerYear;

  const margin = (bill, gp) => (bill > 0 ? gp / bill : 0);

  return {
    perShift: { bill: billPerShift, pay: payPerShift, travel: travelPerShift, gp: gpPerShift, margin: margin(billPerShift, gpPerShift) },
    weekly:   { bill: billWeekly,   pay: payWeekly,   travel: travelWeekly,   gp: gpWeekly,   margin: margin(billWeekly,   gpWeekly)   },
    monthly:  { bill: billMonthly,  pay: payMonthly,  travel: travelMonthly,  gp: gpMonthly,  margin: margin(billMonthly,  gpMonthly)  },
    annual:   { bill: billAnnual,   pay: payAnnual,   travel: travelAnnual,   gp: gpAnnual,   margin: margin(billAnnual,   gpAnnual)   },
    onCallCapApplied,
    effectiveOnCallNights: onCallNights,
    psCoversTravel,
  };
}
