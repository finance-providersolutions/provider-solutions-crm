import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOpportunities } from '@/hooks/useOpportunities';
import { compute, mergeAssumptions, seedDefaults } from '@/utils/gp-modeler';
import { fmtCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Interactive GP modeler. Lives as a section on the opportunity
// detail page. The opportunity's rate-structure columns drive the
// projection; the user adjusts the utilization assumptions live.
//
// Persistence model:
//   - opportunity.modeling_assumptions (jsonb) holds the saved blob
//   - on mount, hydrate from saved blob if present, else seed
//     setting-aware defaults
//   - "Save assumptions" persists current local state to the column
//   - "Reset to defaults" reverts local state to the setting-aware
//     seed values; does NOT touch the database. The user can then
//     either click Save (to persist defaults) or leave the saved
//     blob untouched and continue tweaking from defaults locally.
//     Documented choice: reset is local-only, save is explicit.
//
// On-call cap policy:
//   - When working_days_per_shift changes, on_call_nights_per_shift
//     is clamped down to match if it was higher.
//   - The compute helper also caps at use time (defense in depth)
//     and surfaces `onCallCapApplied` so the UI can show a small
//     advisory when working_days < on_call_nights.
export default function GPModeler({ opportunity, onSaved }) {
  const { update } = useOpportunities();
  const [assumptions, setAssumptions] = useState(() =>
    mergeAssumptions(opportunity?.setting, opportunity?.modeling_assumptions),
  );
  const [saving, setSaving] = useState(false);

  // Re-hydrate when the opportunity prop changes (e.g., another
  // detail page loads, or the parent's refetch returns a fresh
  // saved blob after we hit Save). mergeAssumptions backfills any
  // keys missing from older saved blobs with their setting-aware
  // defaults — fixes the blank-input bug for blobs persisted
  // before commit h.5 added the travel quantity fields.
  useEffect(() => {
    setAssumptions(mergeAssumptions(opportunity?.setting, opportunity?.modeling_assumptions));
  }, [opportunity?.id, opportunity?.modeling_assumptions, opportunity?.setting]);

  const result = useMemo(
    () => compute(opportunity, assumptions),
    [opportunity, assumptions],
  );

  const onCallEnabled  = Boolean(opportunity?.on_call_enabled);
  const psCoversTravel = Boolean(opportunity?.ps_covers_travel);

  function setField(key, value) {
    setAssumptions(a => ({ ...a, [key]: value }));
  }

  // When working days drops, mirror the cap into the input so
  // displayed on_call_nights doesn't disagree with the math.
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
      // Coerce all values to numbers before persisting so the jsonb
      // blob round-trips cleanly (HTML number inputs return strings).
      const payload = Object.fromEntries(
        Object.entries(assumptions).map(([k, v]) => [k, numFromInput(v)]),
      );
      await update(opportunity.id, { modeling_assumptions: payload });
      setAssumptions(payload);
      toast.success('Modeler assumptions saved');
      if (onSaved) await onSaved();
    } catch (err) {
      console.error('GPModeler save failed', err);
      toast.error(err?.message || 'Could not save assumptions');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setAssumptions(seedDefaults(opportunity?.setting));
    toast.info('Reset to defaults — click Save to persist');
  }

  return (
    <div className="bg-surface border border-border rounded p-6 mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Assumptions ──────────────────────────────────────── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-3 border-b border-border/40 pb-1.5">
            Utilization assumptions
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Shifts / week"
              value={assumptions.shifts_per_week}
              step="0.25" min="0"
              onChange={(v) => setField('shifts_per_week', v)}
            />
            <NumField
              label="Shift days / shift"
              value={assumptions.shift_days_per_shift}
              step="1" min="0"
              onChange={(v) => setField('shift_days_per_shift', v)}
            />
            <NumField
              label="Working days / shift"
              value={assumptions.working_days_per_shift}
              step="1" min="0"
              onChange={setWorkingDays}
            />
            <NumField
              label="Orientation days"
              value={assumptions.orientation_days_per_placement}
              step="1" min="0"
              onChange={(v) => setField('orientation_days_per_placement', v)}
            />
            <NumField
              label="OT hrs / working day"
              value={assumptions.ot_hours_per_working_day}
              step="0.25" min="0"
              onChange={(v) => setField('ot_hours_per_working_day', v)}
            />
            <NumField
              label="Adv. shift bonus days"
              value={assumptions.adv_shift_bonus_days_per_shift}
              step="1" min="0"
              onChange={(v) => setField('adv_shift_bonus_days_per_shift', v)}
            />
            <NumField
              label="Other bonus days"
              value={assumptions.other_bonus_days_per_shift}
              step="1" min="0"
              onChange={(v) => setField('other_bonus_days_per_shift', v)}
            />
            <NumField
              label="Weeks billable / year"
              value={assumptions.weeks_billable_per_year}
              step="1" min="0" max="52"
              onChange={(v) => setField('weeks_billable_per_year', v)}
            />
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
                <NumField
                  label="Hotel nights / shift"
                  value={assumptions.hotel_nights_per_shift}
                  step="1" min="0"
                  onChange={(v) => setField('hotel_nights_per_shift', v)}
                />
                <NumField
                  label="Rental days / shift"
                  value={assumptions.rental_days_per_shift}
                  step="1" min="0"
                  onChange={(v) => setField('rental_days_per_shift', v)}
                />
                <NumField
                  label="Airfare trips / block"
                  value={assumptions.airfare_trips_per_shift_block}
                  step="1" min="0"
                  onChange={(v) => setField('airfare_trips_per_shift_block', v)}
                />
              </>
            )}
          </div>

          {result.onCallCapApplied && (
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

          <div className="flex gap-2 mt-5">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              {saving ? 'Saving…' : 'Save assumptions'}
            </Button>
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

        {/* ── Output ───────────────────────────────────────────── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-3 border-b border-border/40 pb-1.5">
            Projected gross profit
          </div>
          <div className="space-y-4">
            <PeriodRow label="Per shift" data={result.perShift} psCoversTravel={psCoversTravel} />
            <PeriodRow label="Per week"  data={result.weekly}   psCoversTravel={psCoversTravel} />
            <PeriodRow label="Per month" data={result.monthly}  psCoversTravel={psCoversTravel} />
            <PeriodRow label="Per year"  data={result.annual}   psCoversTravel={psCoversTravel} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodRow({ label, data, psCoversTravel }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1.5">{label}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Bill"   value={fmtCurrency(data.bill)} />
        <Metric label="Pay"    value={fmtCurrency(data.pay)}  />
        <TravelMetric value={data.travel} psCoversTravel={psCoversTravel} />
        <Metric label="GP"     value={fmtCurrency(data.gp)}   />
        <Metric label="Margin" value={fmtPercent(data.margin)} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted mb-0.5">{label}</div>
      <div className="font-mono text-sm italic text-warning">~{value}</div>
    </div>
  );
}

// Travel is a deduction from GP. When PS covers travel, render the
// magnitude in parentheses — accounting standard for negative dollars
// — keeping the italic-tilde-warning treatment consistent with the
// other estimate cells. When the hospital covers travel, render
// "$0" in muted gray (NOT amber-italic): it's a fact on the
// opportunity record, not a projection.
function TravelMetric({ value, psCoversTravel }) {
  const label = (
    <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted mb-0.5">
      Travel
    </div>
  );
  if (!psCoversTravel) {
    return (
      <div>
        {label}
        <div className="font-mono text-sm text-text-muted">$0</div>
      </div>
    );
  }
  return (
    <div>
      {label}
      <div className="font-mono text-sm italic text-warning">~({fmtCurrency(value)})</div>
    </div>
  );
}

function NumField({ label, value, onChange, step = '1', min, max }) {
  return (
    <div className="space-y-1">
      <Label className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
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

function fmtPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '0%';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function numFromInput(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
