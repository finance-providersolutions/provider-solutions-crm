import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scrollToFirstError } from '@/utils/form';

// Focused edit-on-detail input window for the opportunity's rate
// structure — lifted out of OpportunityFormDialog so create stays
// minimal and rate entry happens on the detail page once the basics
// exist. Opens in "set" (empty) and "edit" (populated) mode against
// the same opportunity row. On-call gating, travel gating, and the
// clear-on-disable behavior are preserved verbatim from the former
// home in OpportunityFormDialog (see the 0003 travel CHECK constraint
// and the on-call required-pair validation).
const EMPTY = {
  shift_time_in:                    '',
  shift_time_out:                   '',
  regular_hours_per_day:            '',
  hours_guaranteed:                 true,
  ot_threshold_hours:               '',

  bill_orientation_hourly:          '',
  bill_regular_hourly:              '',
  bill_ot_hourly:                   '',
  bill_advanced_shift_bonus_daily:  '',

  pay_orientation_daily:            '',
  pay_regular_daily:                '',
  pay_advanced_shift_bonus_daily:   '',
  pay_other_bonus_daily:            '',

  on_call_enabled:                  false,
  bill_on_call_nightly:             '',
  pay_on_call_nightly:              '',
  bill_call_back_hourly:            '',
  call_start_time:                  '',
  call_end_time:                    '',

  ps_covers_travel:                 false,
  travel_airfare_estimate:          '',
  travel_hotel_per_night_estimate:  '',
  travel_rental_per_day_estimate:   '',
};

function numOrZero(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export default function RateStructureFormDialog({ open, onOpenChange, opportunity, onSave }) {
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(opportunity ? hydrate(opportunity) : EMPTY);
  }, [open, opportunity]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  function setOnCallEnabled(next) {
    setValues(v => ({
      ...v,
      on_call_enabled: next,
      ...(next === false && {
        bill_on_call_nightly:  '',
        bill_call_back_hourly: '',
        pay_on_call_nightly:   '',
        call_start_time:       '',
        call_end_time:         '',
      }),
    }));
  }

  function setPsCoversTravel(next) {
    setValues(v => ({
      ...v,
      ps_covers_travel: next,
      ...(next === false && {
        travel_airfare_estimate:         '',
        travel_hotel_per_night_estimate: '',
        travel_rental_per_day_estimate:  '',
      }),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (values.on_call_enabled) {
      const missing = [];
      if (numOrNull(values.bill_on_call_nightly) === null) missing.push('bill_on_call_nightly');
      if (numOrNull(values.pay_on_call_nightly)  === null) missing.push('pay_on_call_nightly');
      if (missing.length > 0) {
        toast.error('On-call is enabled — bill and pay nightly rates are required');
        scrollToFirstError(formRef, missing);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        shift_time_in:                   strOrNull(values.shift_time_in),
        shift_time_out:                  strOrNull(values.shift_time_out),
        regular_hours_per_day:           numOrNull(values.regular_hours_per_day),
        hours_guaranteed:                Boolean(values.hours_guaranteed),
        ot_threshold_hours:              numOrZero(values.ot_threshold_hours),

        bill_orientation_hourly:         numOrZero(values.bill_orientation_hourly),
        bill_regular_hourly:             numOrNull(values.bill_regular_hourly),
        bill_ot_hourly:                  numOrNull(values.bill_ot_hourly),
        bill_advanced_shift_bonus_daily: numOrZero(values.bill_advanced_shift_bonus_daily),

        pay_orientation_daily:           numOrZero(values.pay_orientation_daily),
        pay_regular_daily:               numOrNull(values.pay_regular_daily),
        pay_advanced_shift_bonus_daily:  numOrZero(values.pay_advanced_shift_bonus_daily),
        pay_other_bonus_daily:           numOrZero(values.pay_other_bonus_daily),

        on_call_enabled:                 Boolean(values.on_call_enabled),
        bill_on_call_nightly:            values.on_call_enabled ? numOrNull(values.bill_on_call_nightly)  : null,
        pay_on_call_nightly:             values.on_call_enabled ? numOrNull(values.pay_on_call_nightly)   : null,
        bill_call_back_hourly:           values.on_call_enabled ? numOrNull(values.bill_call_back_hourly) : null,
        call_start_time:                 values.on_call_enabled ? strOrNull(values.call_start_time)       : null,
        call_end_time:                   values.on_call_enabled ? strOrNull(values.call_end_time)         : null,

        ps_covers_travel:                Boolean(values.ps_covers_travel),
        travel_airfare_estimate:         values.ps_covers_travel ? numOrNull(values.travel_airfare_estimate)         : null,
        travel_hotel_per_night_estimate: values.ps_covers_travel ? numOrNull(values.travel_hotel_per_night_estimate) : null,
        travel_rental_per_day_estimate:  values.ps_covers_travel ? numOrNull(values.travel_rental_per_day_estimate)  : null,
      };
      await onSave(payload);
      toast.success('Rate structure saved');
      onOpenChange(false);
    } catch (err) {
      console.error('RateStructureFormDialog save failed', err);
      toast.error(err?.message || 'Could not save rate structure');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Primitive owns maxHeight (clamps to 100dvh - chrome - 2rem)
          and overflow-hidden on the outer box. Body scrolls; footer
          is a flex sibling pinned outside the scroll region. */}
      <DialogContent className="bg-surface border-border text-text max-w-3xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">Rate structure</DialogTitle>
          <DialogDescription className="text-text-dim">
            Shift defaults, bill and pay rates, on-call coverage, and travel costs for this opportunity.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
          <Section title="Shift defaults">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Time in">
                <Input type="time" value={values.shift_time_in} onChange={set('shift_time_in')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Time out">
                <Input type="time" value={values.shift_time_out} onChange={set('shift_time_out')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Regular hrs/day">
                <Input type="number" step="0.25" min="0" max="24" value={values.regular_hours_per_day} onChange={set('regular_hours_per_day')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="OT threshold hrs">
                <Input type="number" step="0.25" min="0" value={values.ot_threshold_hours} onChange={set('ot_threshold_hours')} className="bg-bg border-border text-text" />
              </Field>
            </div>
            <Checkbox
              label="Hours guaranteed (bill regardless of actual hours)"
              checked={values.hours_guaranteed}
              onChange={(checked) => setValues(v => ({ ...v, hours_guaranteed: checked }))}
            />
          </Section>

          <Section title="Bill rates ($)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Orientation hourly">
                <Input type="number" step="0.01" min="0" value={values.bill_orientation_hourly} onChange={set('bill_orientation_hourly')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Regular hourly">
                <Input type="number" step="0.01" min="0" value={values.bill_regular_hourly} onChange={set('bill_regular_hourly')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="OT hourly">
                <Input type="number" step="0.01" min="0" value={values.bill_ot_hourly} onChange={set('bill_ot_hourly')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Advanced shift bonus / day">
                <Input type="number" step="0.01" min="0" value={values.bill_advanced_shift_bonus_daily} onChange={set('bill_advanced_shift_bonus_daily')} className="bg-bg border-border text-text" />
              </Field>
            </div>
          </Section>

          <Section title="Pay rates ($)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Orientation / day">
                <Input type="number" step="0.01" min="0" value={values.pay_orientation_daily} onChange={set('pay_orientation_daily')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Regular / day">
                <Input type="number" step="0.01" min="0" value={values.pay_regular_daily} onChange={set('pay_regular_daily')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Advanced shift bonus / day">
                <Input type="number" step="0.01" min="0" value={values.pay_advanced_shift_bonus_daily} onChange={set('pay_advanced_shift_bonus_daily')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Other bonus / day">
                <Input type="number" step="0.01" min="0" value={values.pay_other_bonus_daily} onChange={set('pay_other_bonus_daily')} className="bg-bg border-border text-text" />
              </Field>
            </div>
          </Section>

          <Section title="On-call">
            <Checkbox
              label="On-call coverage included"
              checked={values.on_call_enabled}
              onChange={setOnCallEnabled}
            />
            {values.on_call_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Bill on-call / night ($)" required>
                  <Input name="bill_on_call_nightly" type="number" step="0.01" min="0" value={values.bill_on_call_nightly} onChange={set('bill_on_call_nightly')} className="bg-bg border-border text-text" />
                </Field>
                <Field label="Pay on-call / night ($)" required>
                  <Input name="pay_on_call_nightly" type="number" step="0.01" min="0" value={values.pay_on_call_nightly} onChange={set('pay_on_call_nightly')} className="bg-bg border-border text-text" />
                </Field>
                <Field label="Bill call-back hourly ($)">
                  <Input type="number" step="0.01" min="0" value={values.bill_call_back_hourly} onChange={set('bill_call_back_hourly')} className="bg-bg border-border text-text" />
                </Field>
                <Field label="Call window">
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="time" value={values.call_start_time} onChange={set('call_start_time')} className="bg-bg border-border text-text" />
                    <Input type="time" value={values.call_end_time}   onChange={set('call_end_time')}   className="bg-bg border-border text-text" />
                  </div>
                </Field>
              </div>
            )}
          </Section>

          <Section title="Travel costs">
            <Checkbox
              label="PS covers provider travel"
              checked={values.ps_covers_travel}
              onChange={setPsCoversTravel}
            />
            {values.ps_covers_travel && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Airfare ($ / round-trip)">
                  <Input type="number" step="0.01" min="0" value={values.travel_airfare_estimate} onChange={set('travel_airfare_estimate')} className="bg-bg border-border text-text" />
                </Field>
                <Field label="Hotel ($ / night)">
                  <Input type="number" step="0.01" min="0" value={values.travel_hotel_per_night_estimate} onChange={set('travel_hotel_per_night_estimate')} className="bg-bg border-border text-text" />
                </Field>
                <Field label="Rental ($ / day)">
                  <Input type="number" step="0.01" min="0" value={values.travel_rental_per_day_estimate} onChange={set('travel_rental_per_day_estimate')} className="bg-bg border-border text-text" />
                </Field>
              </div>
            )}
          </Section>
          </div>

          {/* Footer — flex sibling of the scroll region, pinned by
              layout. No sticky/shadow needed; the primitive's
              flex-col + maxHeight makes this a real footer that
              can't be perturbed by content height. */}
          <div className="flex-shrink-0 flex flex-col gap-2 pt-3 mt-4 border-t border-border
                          sm:flex-row sm:items-center sm:justify-end sm:gap-2">
            <Button
              type="button" variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              {submitting ? 'Saving…' : 'Save rate structure'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function hydrate(o) {
  return {
    shift_time_in:                   o.shift_time_in  ?? '',
    shift_time_out:                  o.shift_time_out ?? '',
    regular_hours_per_day:           o.regular_hours_per_day ?? '',
    hours_guaranteed:                Boolean(o.hours_guaranteed),
    ot_threshold_hours:              o.ot_threshold_hours ?? '',

    bill_orientation_hourly:         o.bill_orientation_hourly ?? '',
    bill_regular_hourly:             o.bill_regular_hourly ?? '',
    bill_ot_hourly:                  o.bill_ot_hourly ?? '',
    bill_advanced_shift_bonus_daily: o.bill_advanced_shift_bonus_daily ?? '',

    pay_orientation_daily:           o.pay_orientation_daily ?? '',
    pay_regular_daily:               o.pay_regular_daily ?? '',
    pay_advanced_shift_bonus_daily:  o.pay_advanced_shift_bonus_daily ?? '',
    pay_other_bonus_daily:           o.pay_other_bonus_daily ?? '',

    on_call_enabled:                 Boolean(o.on_call_enabled),
    bill_on_call_nightly:            o.bill_on_call_nightly  ?? '',
    pay_on_call_nightly:             o.pay_on_call_nightly   ?? '',
    bill_call_back_hourly:           o.bill_call_back_hourly ?? '',
    call_start_time:                 o.call_start_time ?? '',
    call_end_time:                   o.call_end_time ?? '',

    ps_covers_travel:                Boolean(o.ps_covers_travel),
    travel_airfare_estimate:         o.travel_airfare_estimate         ?? '',
    travel_hotel_per_night_estimate: o.travel_hotel_per_night_estimate ?? '',
    travel_rental_per_day_estimate:  o.travel_rental_per_day_estimate  ?? '',
  };
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted border-b border-border/40 pb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
        {label}{required && <span className="text-danger ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-accent"
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
        {label}
      </span>
    </label>
  );
}
