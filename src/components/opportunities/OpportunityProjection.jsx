import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useOpportunities } from '@/hooks/useOpportunities';
import { compute, mergeAssumptions, seedDefaults } from '@/utils/gp-modeler';
import { fmtCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Opportunity Projection (formerly GP Modeler) — the financial
// projection section on the opportunity detail page.
//
// Hybrid interaction model (piece 2 of the maturation arc):
//
//   • Always-visible SUMMARY at top reads from the SAVED
//     modeling_assumptions blob (or setting-aware defaults when the
//     blob is null). Reflects the persisted state. Leads with
//     profit-per-shift as the hero metric; revenue and the per-month
//     / per-year figures contextualize it. Cadence line at the
//     bottom shows derived shift days and target shifts per year.
//
//   • CollapsibleSection (default-collapsed) holds the LIVE
//     calculator. Inputs edit local state; compute() runs live; Save
//     persists the assumption blob via useOpportunities.update.
//
//   • Summary above keeps showing SAVED state while local edits
//     diverge in the open body; they reconverge on Save (which
//     numerifies local and writes through) or on Discard (which
//     reverts local to saved).
//
// Both summary and live body call the SAME compute() — single math,
// two presentations. Internal identifiers (gp-modeler.js, compute,
// seedDefaults, mergeAssumptions, modeling_assumptions) keep their
// accurate-to-the-math names; only the user-facing section name
// and component file renamed.
//
// Dirty-state protection: when local !== saved, an inline "Unsaved
// changes" indicator appears under the controls and the Save button
// enables/emphasizes; a Discard button appears alongside Save. If
// the user tries to collapse the section while dirty, a confirm
// strip surfaces inline (Save & close / Discard / Keep editing) —
// the section refuses to silently close on a dirty body.

export default function OpportunityProjection({ opportunity, onSaved }) {
  const { update } = useOpportunities();

  // Saved hydrated assumptions — drives the always-visible summary.
  const savedAssumptions = useMemo(
    () => mergeAssumptions(opportunity?.setting, opportunity?.modeling_assumptions),
    [opportunity?.setting, opportunity?.modeling_assumptions],
  );

  // Local in-progress assumptions — driven by the live inputs.
  const [assumptions, setAssumptions] = useState(savedAssumptions);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Re-hydrate when the opportunity prop changes (another opp loads
  // or a parent refetch returns a fresh saved blob). Clears any
  // pending close confirmation since the underlying data shifted.
  useEffect(() => {
    setAssumptions(savedAssumptions);
    setConfirmClose(false);
  }, [opportunity?.id, savedAssumptions]);

  // Saved-state projection — drives the summary.
  const savedResult = useMemo(
    () => compute(opportunity, savedAssumptions),
    [opportunity, savedAssumptions],
  );

  // Live-state projection — drives the calculator body grid.
  const liveResult = useMemo(
    () => compute(opportunity, assumptions),
    [opportunity, assumptions],
  );

  // Dirty: local diverges from saved. Coerce both to numbers — HTML
  // number inputs return strings, savedAssumptions holds numbers, so
  // string-vs-number comparison would always read dirty.
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(savedAssumptions), ...Object.keys(assumptions)]);
    for (const k of keys) {
      const a = Number(assumptions[k] ?? 0);
      const b = Number(savedAssumptions[k] ?? 0);
      if (a !== b) return true;
    }
    return false;
  }, [assumptions, savedAssumptions]);

  const onCallEnabled  = Boolean(opportunity?.on_call_enabled);
  const psCoversTravel = Boolean(opportunity?.ps_covers_travel);

  function setField(key, value) {
    setAssumptions(a => ({ ...a, [key]: value }));
  }

  // When working days drops, cap on-call nights to match so the
  // input doesn't disagree with what compute() will use.
  function setWorkingDays(value) {
    const wd = numFromInput(value);
    setAssumptions(a => ({
      ...a,
      working_days_per_shift: value,
      on_call_nights_per_shift: Math.min(numFromInput(a.on_call_nights_per_shift), wd),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Coerce all values to numbers so the jsonb blob round-trips
      // cleanly (HTML number inputs return strings).
      const payload = Object.fromEntries(
        Object.entries(assumptions).map(([k, v]) => [k, numFromInput(v)]),
      );
      await update(opportunity.id, { modeling_assumptions: payload });
      setAssumptions(payload);
      setConfirmClose(false);
      toast.success('Projection assumptions saved');
      if (onSaved) await onSaved();
    } catch (err) {
      console.error('OpportunityProjection save failed', err);
      toast.error(err?.message || 'Could not save assumptions');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setAssumptions(seedDefaults(opportunity?.setting));
    toast.info('Reset to defaults — click Save to persist');
  }

  function handleDiscard() {
    setAssumptions(savedAssumptions);
    setConfirmClose(false);
  }

  function handleSaveAndClose() {
    handleSave().then(() => {
      setOpen(false);
    });
  }

  function handleDiscardAndClose() {
    setAssumptions(savedAssumptions);
    setConfirmClose(false);
    setOpen(false);
  }

  function handleToggle(next) {
    // Intercept close while dirty — show the inline confirm and
    // keep the section open. Open + clean toggles freely; close +
    // dirty surfaces the confirm; close + clean closes normally.
    if (next === false && isDirty) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    setOpen(next);
  }

  // Cadence display — derived from the saved assumption set, not
  // new input knobs. Adding "annual shifts" as its own input would
  // create a third number entangled with shifts_per_week and
  // weeks_billable_per_year (three values, one equation = pain).
  const shiftDays = numFromInput(savedAssumptions.shift_days_per_shift);
  const shiftsPerYear = Math.round(
    numFromInput(savedAssumptions.shifts_per_week) *
    numFromInput(savedAssumptions.weeks_billable_per_year),
  );

  // Profit color is sign-driven (teal-when-positive, red-in-parens
  // when underwater). Margin moves with profit — same color rule.
  // Italic across the summary signals "projected estimate" — color
  // is spoken for by sign+category, so amber is no longer the
  // estimate marker on this section.
  const heroProfitNeg = savedResult.perShift.gp < 0;

  // ── Per-shift figures derived from saved assumptions ──
  // Variable billed: bill_call_back_hourly × call-back hours per
  // shift = bill_call_back × call_back_hrs_per_call_night × on_call_nights.
  // Hidden on $0 so opps without call-back hours don't carry an
  // empty income row.
  const callBackHoursPerShift =
    numFromInput(savedAssumptions.call_back_hours_per_call_night) *
    numFromInput(savedAssumptions.on_call_nights_per_shift);
  const variableBilledPerShift =
    onCallEnabled
      ? numFromInput(opportunity?.bill_call_back_hourly) * callBackHoursPerShift
      : 0;
  // Standard bill = total bill − variable billed (the call-back
  // slice). Both rows sum back to the full bill compute() emits.
  // Labelled "Bill" rather than "Regular billed" because the
  // "regular" qualifier would mislead — this includes on-call
  // billed nightly + OT + bonuses, not just regular hourly.
  const billPerShiftStandard = savedResult.perShift.bill - variableBilledPerShift;

  // Travel per-category daily averages — only meaningful when PS
  // covers travel; otherwise we render a single neutral "Hospital
  // covers" line with a footnote at the bottom. Total-for-shift ÷
  // days-in-shift = the daily average displayed; the calc note
  // exposes the components so the user can audit the figure.
  const safeShiftDays = Math.max(shiftDays, 1); // avoid /0; shiftDays=0 displays as no daily avg anyway
  const hotelNightsPerShift  = numFromInput(savedAssumptions.hotel_nights_per_shift);
  const rentalDaysPerShift   = numFromInput(savedAssumptions.rental_days_per_shift);
  const airfareTripsPerShift = numFromInput(savedAssumptions.airfare_trips_per_shift_block);
  const hotelPerNight   = numFromInput(opportunity?.travel_hotel_per_night_estimate);
  const rentalPerDay    = numFromInput(opportunity?.travel_rental_per_day_estimate);
  const airfarePerTrip  = numFromInput(opportunity?.travel_airfare_estimate);
  const hotelDailyAvg   = (hotelPerNight * hotelNightsPerShift) / safeShiftDays;
  const rentalDailyAvg  = (rentalPerDay * rentalDaysPerShift) / safeShiftDays;
  const airfareDailyAvg = (airfarePerTrip * airfareTripsPerShift) / safeShiftDays;

  return (
    <div className="space-y-5">
      {/* ── Always-visible summary ─────────────────────────────── */}
      {/* Per-shift financial table is the spine of the summary —
          income / expenses / gross profit. Reads from SAVED
          modeling_assumptions (not the live in-progress edit
          state) so it doesn't thrash while someone edits inputs in
          the collapsed body below. Summary = saved; collapsed
          inputs = live; reconverge on Save. */}
      <div className="space-y-4 mx-auto max-w-md sm:max-w-lg">
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted border-b border-border/40 pb-2">
          <span>Per shift</span>
          <span className="text-text-dim normal-case">({shiftDays} {shiftDays === 1 ? 'day' : 'days'})</span>
        </div>

        {/* INCOME rows — display split, GP math unchanged.
            "Guaranteed Billable Amt." = compute() bill − the
            variable-billed (est. call-back) slice. Variable Billed
            (est.) sits as a sibling row at the same caption level
            when > 0. Both row values sum to compute().perShift.bill,
            which is what GP uses; GP and GP% are unaffected by
            this split (a real opp with call-back > 0 would still
            project the same profit, just labelled across two
            income rows instead of one). */}
        <div className="space-y-2.5">
          <SummaryRow
            label="Guaranteed Billable Amt."
            value={fmtCurrency(savedResult.perShift.bill - variableBilledPerShift)}
            tone="income"
          />
          {variableBilledPerShift > 0 && (
            <SummaryRow
              label={
                <>
                  Variable billed (est.)
                  <CalcNote className="hidden sm:inline ml-1">
                    (${fmtNum(numFromInput(opportunity?.bill_call_back_hourly))}/hr × {fmtNum(callBackHoursPerShift)} call-back hrs)
                  </CalcNote>
                </>
              }
              value={fmtCurrency(variableBilledPerShift)}
              tone="income"
            />
          )}
        </div>

        {/* EXPENSE rows — pay + (per-category travel when PS
            covers, otherwise a single "Hospital covers" neutral
            line with a footnote at the bottom). The pay-side
            call-back row is pending Part A approval on schema
            (pay_call_back_hourly column doesn't exist today). */}
        <div className="space-y-2.5 pt-2">
          <SummaryRow
            label="Pay to provider"
            value={fmtExpense(savedResult.perShift.pay)}
            tone="expense"
          />
          {psCoversTravel && (
            <>
              <SummaryRow
                label={<>Hotel <CalcNote>(${fmtNum(hotelPerNight)}/night × {fmtNum(hotelNightsPerShift)} {hotelNightsPerShift === 1 ? 'night' : 'nights'})</CalcNote></>}
                value={fmtExpense(hotelDailyAvg * safeShiftDays)}
                tone="expense"
              />
              <SummaryRow
                label={<>Rental <CalcNote>(${fmtNum(rentalPerDay)}/day × {fmtNum(rentalDaysPerShift)} {rentalDaysPerShift === 1 ? 'day' : 'days'})</CalcNote></>}
                value={fmtExpense(rentalDailyAvg * safeShiftDays)}
                tone="expense"
              />
              <SummaryRow
                label={<>Airfare <CalcNote>(${fmtNum(airfarePerTrip)}/trip × {fmtNum(airfareTripsPerShift)} {airfareTripsPerShift === 1 ? 'trip' : 'trips'})</CalcNote></>}
                value={fmtExpense(airfareDailyAvg * safeShiftDays)}
                tone="expense"
              />
            </>
          )}
        </div>

        {/* Travel-covers footnote — only when hospital covers
            travel. No "Hospital covers" row above (dropped this
            pass); just this muted note explaining why the travel
            expense block is empty. */}
        {!psCoversTravel && (
          <div className="font-mono text-[9px] text-text-muted/50 normal-case pl-1">
            Hospital provides travel — not a PS cash cost.
          </div>
        )}

        {/* GP hero — the per-shift profit + GP% gets the size and
            color the standalone hero used to carry. Both move with
            sign: teal positive, red-in-parens underwater. */}
        <div className="border-t border-border/40 pt-4 flex flex-col items-center text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            Gross profit
          </div>
          <div className={cn(
            'font-display italic text-4xl sm:text-5xl leading-tight mt-1',
            heroProfitNeg ? 'text-danger' : 'text-[var(--profit)]',
          )}>
            {fmtProfit(savedResult.perShift.gp)}
          </div>
          <div className={cn(
            'font-mono italic text-sm tracking-tight mt-1',
            heroProfitNeg ? 'text-danger' : 'text-[var(--profit)]',
          )}>
            {fmtMargin(savedResult.perShift.margin)} GP
          </div>
        </div>

        {/* Per-month / per-year support — same sign-driven
            color rule. Italic for the estimate signal. */}
        <div className="grid grid-cols-2 gap-x-4 border-t border-border/40 pt-3">
          <SupportingCell
            label="Per month"
            profit={savedResult.monthly.gp}
            revenue={savedResult.monthly.bill}
          />
          <SupportingCell
            label="Per year"
            profit={savedResult.annual.gp}
            revenue={savedResult.annual.bill}
          />
        </div>

        {/* Cadence — derived display, not new knobs. */}
        <div className="border-t border-border/40 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted text-center">
          {shiftDays} days / shift · {shiftsPerYear} shifts / year
        </div>
      </div>

      {/* ── Collapsible Details: assumption inputs only. The
            per-shift table moved UP into the always-visible
            summary, so this body now holds JUST the inputs +
            Save/Discard/Reset. Live recompute is invisible from
            the user's perspective (they see numbers update when
            they Save), but the engine still runs under the hood. */}
      <CollapsibleSection
        label={isDirty
          ? <>Projection Calculation Inputs <span className="ml-2 text-warning">● Unsaved</span></>
          : 'Projection Calculation Inputs'}
        open={open}
        onOpenChange={handleToggle}
      >
        <div className="mt-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-3 border-b border-border/40 pb-1.5">
              Utilization assumptions
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Shifts / week"           value={assumptions.shifts_per_week}                 step="0.25" min="0" onChange={(v) => setField('shifts_per_week', v)} />
              <NumField label="Shift days / shift"      value={assumptions.shift_days_per_shift}            step="1"    min="0" onChange={(v) => setField('shift_days_per_shift', v)} />
              <NumField label="Working days / shift"    value={assumptions.working_days_per_shift}          step="1"    min="0" onChange={setWorkingDays} />
              <NumField label="Orientation days"        value={assumptions.orientation_days_per_placement}  step="1"    min="0" onChange={(v) => setField('orientation_days_per_placement', v)} />
              <NumField label="OT hrs / working day"    value={assumptions.ot_hours_per_working_day}        step="0.25" min="0" onChange={(v) => setField('ot_hours_per_working_day', v)} />
              <NumField label="Adv. shift bonus days"   value={assumptions.adv_shift_bonus_days_per_shift}  step="1"    min="0" onChange={(v) => setField('adv_shift_bonus_days_per_shift', v)} />
              <NumField label="Other bonus days"        value={assumptions.other_bonus_days_per_shift}      step="1"    min="0" onChange={(v) => setField('other_bonus_days_per_shift', v)} />
              <NumField label="Weeks billable / year"   value={assumptions.weeks_billable_per_year}         step="1"    min="0" max="52" onChange={(v) => setField('weeks_billable_per_year', v)} />
              {onCallEnabled && (
                <>
                  <NumField
                    label="On-call nights / shift"
                    value={assumptions.on_call_nights_per_shift}
                    step="1" min="0"
                    max={numFromInput(assumptions.working_days_per_shift)}
                    onChange={(v) => setField('on_call_nights_per_shift', v)}
                  />
                  <NumField
                    label="Call-back hrs / call night"
                    value={assumptions.call_back_hours_per_call_night}
                    step="0.25" min="0"
                    onChange={(v) => setField('call_back_hours_per_call_night', v)}
                  />
                </>
              )}
              {psCoversTravel && (
                <>
                  <NumField label="Hotel nights / shift"    value={assumptions.hotel_nights_per_shift}        step="1" min="0" onChange={(v) => setField('hotel_nights_per_shift', v)} />
                  <NumField label="Rental days / shift"     value={assumptions.rental_days_per_shift}         step="1" min="0" onChange={(v) => setField('rental_days_per_shift', v)} />
                  <NumField label="Airfare trips / block"   value={assumptions.airfare_trips_per_shift_block} step="1" min="0" onChange={(v) => setField('airfare_trips_per_shift_block', v)} />
                </>
              )}
            </div>

            {liveResult.onCallCapApplied && (
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
                Note: on-call nights capped at working days for projection
              </div>
            )}
            {!onCallEnabled && (
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                On-call disabled on this opportunity — call rates contribute zero
              </div>
            )}
            {!psCoversTravel && (
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Hospital covers travel — travel cost = $0
              </div>
            )}

            {/* Dirty pill — quiet when not in confirm-close mode. */}
            {isDirty && !confirmClose && (
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
                ● Unsaved changes
              </div>
            )}

            {/* Confirm-close strip — fires when user tries to
                collapse the section with unsaved changes. Section
                stays open until the user commits to save / discard
                / keep editing. */}
            {confirmClose && isDirty && (
              <div className="mt-4 p-3 rounded border border-warning/40 bg-warning/5 space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
                  Unsaved changes — save, discard, or keep editing
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveAndClose}
                    disabled={saving}
                    className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
                  >
                    Save &amp; close
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDiscardAndClose}
                    disabled={saving}
                    className="font-mono uppercase tracking-[0.1em] text-xs text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    Discard
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmClose(false)}
                    disabled={saving}
                    className="font-mono uppercase tracking-[0.1em] text-xs"
                  >
                    Keep editing
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-5">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className={cn(
                  'bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs',
                )}
              >
                {saving ? 'Saving…' : 'Save assumptions'}
              </Button>
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDiscard}
                  disabled={saving}
                  className="font-mono uppercase tracking-[0.1em] text-xs"
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={saving}
                className="font-mono uppercase tracking-[0.1em] text-xs"
              >
                Reset to defaults
              </Button>
            </div>
          </div>

        </div>
      </CollapsibleSection>
    </div>
  );
}

// Summary table row — label-left / value-right, mono, italic
// (these are projections from the saved assumption blob). Tone
// drives color per the page-wide grammar: income green for
// revenue, danger red for expenses, dim for neutral. Optional
// `note` renders a small muted caption below the label (used for
// per-category travel calc notes and call-back est. derivations).
function SummaryRow({ label, value, tone, note, indent = false }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', indent && 'pl-4')}>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
        {note && (
          <div className="font-mono text-[9px] text-text-muted/80 normal-case mt-0.5">{note}</div>
        )}
      </div>
      <span className={cn('font-mono italic text-sm flex-shrink-0', SUMMARY_TONE[tone] ?? '')}>{value}</span>
    </div>
  );
}

// Compact number formatter for calc notes — drops cents if whole,
// keeps up to 2 if not. Used only for the parenthetical
// derivations next to / beneath SummaryRow labels.
function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0';
  const x = Number(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
}

// Inline calc-note span inside a SummaryRow label — opts OUT of
// the parent's uppercase + tracking so the parenthetical (e.g.
// "$150/night × 8 nights") reads as natural text rather than
// SHOUTED LETTERS NEXT TO THE CAPTION. Still mono and slightly
// muted so it visually defers to the main caption. Optional
// className lets callers add responsive visibility (e.g.
// "hidden sm:inline" so mobile drops the helper calc entirely).
function CalcNote({ className, children }) {
  return (
    <span className={cn('normal-case tracking-normal text-text-muted/80 font-normal', className)}>
      {children}
    </span>
  );
}

const SUMMARY_TONE = {
  income:  'text-income',
  expense: 'text-danger',
  neutral: 'text-text-dim',
};

// Supporting cell — per-month / per-year context under the GP
// hero. Income green for revenue, profit teal (sign-driven) for
// profit. Italic across both — these are projections. Uses an
// arbitrary-value class for the profit color so the new --profit
// token works without the Tailwind JIT cache stale-utility issue
// that affected the named text-profit class.
function SupportingCell({ label, profit, revenue }) {
  const neg = profit < 0;
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-0.5">{label}</div>
      <div className={cn(
        'font-mono italic text-sm',
        neg ? 'text-danger' : 'text-[var(--profit)]',
      )}>
        {fmtProfit(profit)} GP
      </div>
      <div className="font-mono italic text-[10px] text-income">
        {fmtCurrency(revenue)} revenue
      </div>
    </div>
  );
}

// Profit formatter — sign-aware. Negative gets wrapped in parens
// (accounting convention) and rendered without a leading minus.
// Caller applies the color class based on sign.
function fmtProfit(value) {
  if (value == null || !Number.isFinite(Number(value))) return '$0';
  const n = Number(value);
  if (n < 0) return `(${fmtCurrency(Math.abs(n))})`;
  return fmtCurrency(n);
}

// Expense formatter — wraps in parens always (expenses are cash
// outflows, accounting convention denotes the negative). Zero
// renders as "$0" without parens since it's "nothing went out".
function fmtExpense(value) {
  if (value == null || !Number.isFinite(Number(value))) return '$0';
  const n = Number(value);
  if (n === 0) return '$0';
  return `(${fmtCurrency(Math.abs(n))})`;
}

// Margin formatter — percent with 1 decimal. Negative renders with
// a leading minus rather than parens (it's already a percentage,
// the parens convention is for cash amounts).
function fmtMargin(value) {
  if (value == null || !Number.isFinite(Number(value))) return '0.0%';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

// NumField — label-on-top + input-below. The label is given a fixed
// min-height of 2 lines (32px at the current 10px font + leading-snug)
// so single-line labels reserve the same vertical room as two-line
// labels. Result: inputs line up at the same y across rows AND
// across the two columns, no matter how long each label is.
function NumField({ label, value, onChange, step = '1', min, max }) {
  return (
    <div className="flex flex-col">
      <Label className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim leading-snug min-h-[32px] flex items-start mb-1">
        {label}
      </Label>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn('bg-bg border-border text-text font-mono')}
      />
    </div>
  );
}

function numFromInput(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
