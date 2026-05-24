import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import OrganizationCombobox from '@/components/opportunities/OrganizationCombobox';
import {
  OPPORTUNITY_SETTINGS, OPPORTUNITY_STAGES, POSITION_TYPES,
  REQUIREMENT_ITEMS, SPECIALTIES, US_STATES,
} from '@/utils/constants';
import { cn } from '@/lib/utils';
import { scrollToFirstError } from '@/utils/form';

// Schema-mirrored EMPTY. NOT NULL DEFAULT 0 columns
// (bill_orientation_hourly, bill_advanced_shift_bonus_daily,
// pay_orientation_daily, pay_advanced_shift_bonus_daily,
// pay_other_bonus_daily, ot_threshold_hours) start as '' here so
// the inputs render blank; numOrZero() converts blanks to 0 on
// save. Nullable rate columns start as '' and become null on save
// via numOrNull().
const EMPTY = {
  organization_id:                  '',
  source_partner_id:                null,
  title:                            '',
  name:                             '',
  position_type:                    '',
  specialty:                        '',
  setting:                          '',
  location_city:                    '',
  location_state:                   '',
  start_date:                       '',
  end_date:                         '',
  next_action_date:                 '',

  shift_time_in:                    '',
  shift_time_out:                   '',
  regular_hours_per_day:            '',
  hours_guaranteed:                 true,
  ot_threshold_hours:               '',

  bill_orientation_hourly:          '',
  bill_regular_hourly:              '',
  bill_ot_hourly:                   '',
  bill_advanced_shift_bonus_daily:  '',
  on_call_enabled:                  false,
  bill_on_call_nightly:             '',
  bill_call_back_hourly:            '',
  call_start_time:                  '',
  call_end_time:                    '',

  ps_covers_travel:                 false,
  travel_airfare_estimate:          '',
  travel_hotel_per_night_estimate:  '',
  travel_rental_per_day_estimate:   '',

  pay_orientation_daily:            '',
  pay_regular_daily:                '',
  pay_advanced_shift_bonus_daily:   '',
  pay_on_call_nightly:              '',
  pay_other_bonus_daily:            '',

  stage:                            '',
  probability:                      '',
  notes:                            '',

  // Credentialing requirements (0007). Tracked as a Set in form
  // state for O(1) toggle; serialized to a string[] on save.
  required_items:                   new Set(),
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
function intOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Same create-mode uuid pattern as OrganizationFormDialog /
// ProviderFormDialog: a uuid is generated when the dialog opens in
// create mode and used as the new row's `id` on insert. No image
// uploads on opportunities so the uuid is just for `id`.
export default function OpportunityFormDialog({ open, onOpenChange, opportunity, onSave }) {
  const isEdit = Boolean(opportunity);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [createId, setCreateId] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(opportunity
      ? hydrate(opportunity)
      : EMPTY);
    setCreateId(opportunity ? opportunity.id : crypto.randomUUID());
  }, [open, opportunity]);

  const set    = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));
  const setVal = (k) => (val) => setValues(v => ({ ...v, [k]: val }));

  function setOnCallEnabled(next) {
    setValues(v => ({
      ...v,
      on_call_enabled: next,
      // When toggling off, clear the on-call-only fields so a
      // disabled-but-stale value never reaches the database. The
      // CHECK constraint would reject inconsistency on save anyway.
      ...(next === false && {
        bill_on_call_nightly: '',
        bill_call_back_hourly: '',
        pay_on_call_nightly:  '',
        call_start_time:      '',
        call_end_time:        '',
      }),
    }));
  }

  function setPsCoversTravel(next) {
    setValues(v => ({
      ...v,
      ps_covers_travel: next,
      // The 0003 CHECK constraint requires travel rate columns to
      // be null when ps_covers_travel = false. Mirror the on-call
      // pattern: clear on disable.
      ...(next === false && {
        travel_airfare_estimate:         '',
        travel_hotel_per_night_estimate: '',
        travel_rental_per_day_estimate:  '',
      }),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.organization_id) {
      toast.error('Hospital is required');
      scrollToFirstError(formRef, ['organization_id']);
      return;
    }
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
        ...(isEdit ? {} : { id: createId }),
        organization_id:                values.organization_id,
        source_partner_id:              values.source_partner_id || null,
        title:                          strOrNull(values.title),
        name:                           strOrNull(values.name),
        position_type:                  strOrNull(values.position_type),
        specialty:                      strOrNull(values.specialty),
        setting:                        strOrNull(values.setting),
        location_city:                  strOrNull(values.location_city),
        location_state:                 strOrNull(values.location_state),
        start_date:                     strOrNull(values.start_date),
        end_date:                       strOrNull(values.end_date),
        next_action_date:               strOrNull(values.next_action_date),

        shift_time_in:                  strOrNull(values.shift_time_in),
        shift_time_out:                 strOrNull(values.shift_time_out),
        regular_hours_per_day:          numOrNull(values.regular_hours_per_day),
        hours_guaranteed:               Boolean(values.hours_guaranteed),
        ot_threshold_hours:             numOrZero(values.ot_threshold_hours),

        bill_orientation_hourly:         numOrZero(values.bill_orientation_hourly),
        bill_regular_hourly:             numOrNull(values.bill_regular_hourly),
        bill_ot_hourly:                  numOrNull(values.bill_ot_hourly),
        bill_advanced_shift_bonus_daily: numOrZero(values.bill_advanced_shift_bonus_daily),
        on_call_enabled:                 Boolean(values.on_call_enabled),
        bill_on_call_nightly:            values.on_call_enabled ? numOrNull(values.bill_on_call_nightly)  : null,
        bill_call_back_hourly:           values.on_call_enabled ? numOrNull(values.bill_call_back_hourly) : null,
        call_start_time:                 values.on_call_enabled ? strOrNull(values.call_start_time)       : null,
        call_end_time:                   values.on_call_enabled ? strOrNull(values.call_end_time)         : null,

        pay_orientation_daily:           numOrZero(values.pay_orientation_daily),
        pay_regular_daily:               numOrNull(values.pay_regular_daily),
        pay_advanced_shift_bonus_daily:  numOrZero(values.pay_advanced_shift_bonus_daily),
        pay_on_call_nightly:             values.on_call_enabled ? numOrNull(values.pay_on_call_nightly) : null,
        pay_other_bonus_daily:           numOrZero(values.pay_other_bonus_daily),

        ps_covers_travel:                Boolean(values.ps_covers_travel),
        travel_airfare_estimate:         values.ps_covers_travel ? numOrNull(values.travel_airfare_estimate)         : null,
        travel_hotel_per_night_estimate: values.ps_covers_travel ? numOrNull(values.travel_hotel_per_night_estimate) : null,
        travel_rental_per_day_estimate:  values.ps_covers_travel ? numOrNull(values.travel_rental_per_day_estimate)  : null,

        stage:                          strOrNull(values.stage),
        probability:                    intOrNull(values.probability),
        notes:                          strOrNull(values.notes),

        // Serialize Set → string[] in REQUIREMENT_ITEMS order so the
        // stored array reads predictably (rather than in toggle
        // order). Empty Set → empty array, which the readiness
        // helper treats the same as null (REQUIREMENTS_UNDEFINED).
        required_items:                 REQUIREMENT_ITEMS
          .map(r => r.value)
          .filter(v => values.required_items.has(v)),
      };
      await onSave(payload);
      toast.success(isEdit ? 'Opportunity updated' : 'Opportunity created');
      onOpenChange(false);
    } catch (err) {
      console.error('OpportunityFormDialog save failed', err);
      toast.error(err?.message || 'Could not save opportunity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit opportunity' : 'New opportunity'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Open position to fill — pick the hospital first.'}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">

          <Section title="Basics">
            <Field label="Hospital" required>
              <OrganizationCombobox
                type="hospital"
                name="organization_id"
                value={values.organization_id || null}
                onChange={(id) => setValues(v => ({ ...v, organization_id: id ?? '' }))}
                required
                allowCreateNew
                placeholder="Pick a hospital"
              />
            </Field>
            <Field label="Source partner">
              <OrganizationCombobox
                type="locums_partner"
                value={values.source_partner_id}
                onChange={(id) => setValues(v => ({ ...v, source_partner_id: id }))}
                emptyLabel="Direct (no partner)"
                allowCreateNew
                placeholder="Direct (no partner)"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Title">
                <Input value={values.title} onChange={set('title')} placeholder="GI MD — Memorial Hospital" className="bg-bg border-border text-text" />
              </Field>
              <Field label="Name (long display)">
                <Input value={values.name} onChange={set('name')} placeholder="Memorial Hospital — M.D./Gastro. (Inpatient)" className="bg-bg border-border text-text" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Position type">
                <Select value={values.position_type || undefined} onValueChange={setVal('position_type')}>
                  <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {POSITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Specialty">
                <Select value={values.specialty || undefined} onValueChange={setVal('specialty')}>
                  <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Setting">
                <Select value={values.setting || undefined} onValueChange={setVal('setting')}>
                  <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {OPPORTUNITY_SETTINGS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Location">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <Field label="City">
                <Input value={values.location_city} onChange={set('location_city')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="State">
                <Select value={values.location_state || undefined} onValueChange={setVal('location_state')}>
                  <SelectTrigger className="bg-bg border-border text-text w-full md:w-[110px]"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Dates">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Start date">
                <Input type="date" value={values.start_date} onChange={set('start_date')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="End date">
                <Input type="date" value={values.end_date} onChange={set('end_date')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Next action date">
                <Input type="date" value={values.next_action_date} onChange={set('next_action_date')} className="bg-bg border-border text-text" />
              </Field>
            </div>
          </Section>

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
              <>
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
              </>
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

          <Section title="Pipeline">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Stage">
                <Select value={values.stage || undefined} onValueChange={setVal('stage')}>
                  <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {OPPORTUNITY_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Probability (%)">
                <Input type="number" min="0" max="100" step="1" value={values.probability} onChange={set('probability')} className="bg-bg border-border text-text" />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={values.notes} onChange={set('notes')} rows={3} className="bg-bg border-border text-text" />
            </Field>
          </Section>

          <Section title="Requirements">
            <div className="font-mono text-[11px] text-text-dim -mt-1 mb-1">
              Credentialing items a provider must hold to work this opportunity. Drives readiness on the suggested-providers list.
            </div>
            <ul className="divide-y divide-border/40 border border-border/40 rounded">
              {REQUIREMENT_ITEMS.map(item => {
                const on = values.required_items.has(item.value);
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      onClick={() => setValues(v => {
                        const next = new Set(v.required_items);
                        if (next.has(item.value)) next.delete(item.value);
                        else next.add(item.value);
                        return { ...v, required_items: next };
                      })}
                      aria-pressed={on}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface2/40 transition-colors"
                    >
                      <span className={cn(
                        'w-7 h-7 inline-flex items-center justify-center rounded border transition-colors',
                        on
                          ? 'border-income text-income bg-income/10'
                          : 'border-border text-transparent',
                      )}>
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                      <span className={cn(
                        'font-mono text-[11px] uppercase tracking-[0.12em]',
                        on ? 'text-text' : 'text-text-dim',
                      )}>
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Phone: Cancel-above-Save full-width, sticky to dialog scroll bottom (decision #5).
              Desktop: inline-right, no stick. Canonical pattern from B4. */}
          <div className="
            flex flex-col gap-2
            sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:pt-2
            max-sm:sticky max-sm:bottom-0 max-sm:py-3
            max-sm:bg-surface max-sm:border-t max-sm:border-border
            max-sm:shadow-[0_-4px_8px_-2px_rgba(0,0,0,0.3)]
          ">
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
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function hydrate(o) {
  return {
    organization_id:                  o.organization_id ?? '',
    source_partner_id:                o.source_partner_id ?? null,
    title:                            o.title ?? '',
    name:                             o.name ?? '',
    position_type:                    o.position_type ?? '',
    specialty:                        o.specialty ?? '',
    setting:                          o.setting ?? '',
    location_city:                    o.location_city ?? '',
    location_state:                   o.location_state ?? '',
    start_date:                       o.start_date ?? '',
    end_date:                         o.end_date ?? '',
    next_action_date:                 o.next_action_date ?? '',

    shift_time_in:                    o.shift_time_in  ?? '',
    shift_time_out:                   o.shift_time_out ?? '',
    regular_hours_per_day:            o.regular_hours_per_day ?? '',
    hours_guaranteed:                 Boolean(o.hours_guaranteed),
    ot_threshold_hours:               o.ot_threshold_hours ?? '',

    bill_orientation_hourly:          o.bill_orientation_hourly ?? '',
    bill_regular_hourly:              o.bill_regular_hourly ?? '',
    bill_ot_hourly:                   o.bill_ot_hourly ?? '',
    bill_advanced_shift_bonus_daily:  o.bill_advanced_shift_bonus_daily ?? '',
    on_call_enabled:                  Boolean(o.on_call_enabled),
    bill_on_call_nightly:             o.bill_on_call_nightly  ?? '',
    bill_call_back_hourly:            o.bill_call_back_hourly ?? '',
    call_start_time:                  o.call_start_time ?? '',
    call_end_time:                    o.call_end_time ?? '',

    ps_covers_travel:                 Boolean(o.ps_covers_travel),
    travel_airfare_estimate:          o.travel_airfare_estimate         ?? '',
    travel_hotel_per_night_estimate:  o.travel_hotel_per_night_estimate ?? '',
    travel_rental_per_day_estimate:   o.travel_rental_per_day_estimate  ?? '',

    pay_orientation_daily:            o.pay_orientation_daily ?? '',
    pay_regular_daily:                o.pay_regular_daily ?? '',
    pay_advanced_shift_bonus_daily:   o.pay_advanced_shift_bonus_daily ?? '',
    pay_on_call_nightly:              o.pay_on_call_nightly ?? '',
    pay_other_bonus_daily:            o.pay_other_bonus_daily ?? '',

    stage:                            o.stage ?? '',
    probability:                      o.probability ?? '',
    notes:                            o.notes ?? '',

    required_items:                   new Set(Array.isArray(o.required_items) ? o.required_items : []),
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
