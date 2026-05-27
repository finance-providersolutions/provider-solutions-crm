import { useEffect, useRef, useState } from 'react';
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
  SPECIALTIES, US_STATES,
} from '@/utils/constants';
import { scrollToFirstError } from '@/utils/form';

// Basics / Location / Dates / Pipeline only. Rate structure (shift
// defaults, bill, pay, on-call, travel) lives in
// RateStructureFormDialog and is edited on the detail page; the
// Requirements picker is gated behind its own future section. Removed
// from BOTH create and edit modes so the dialog stays the single
// surface for the basics+pipeline edit path — no parallel writers
// for the rate columns.
const EMPTY = {
  organization_id:    '',
  source_partner_id:  null,
  title:              '',
  name:               '',
  position_type:      '',
  specialty:          '',
  setting:            '',
  location_city:      '',
  location_state:     '',
  start_date:         '',
  end_date:           '',
  next_action_date:   '',
  // Default new opps to the first/most-logical stage so the pipeline
  // KPI counts them and SuggestedProviders has a real stage to read
  // from on day zero. Edit mode hydrates from the saved value via
  // hydrate() below, so this default never overwrites existing data.
  stage:              'lead',
  probability:        '',
  notes:              '',
};

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

export default function OpportunityFormDialog({ open, onOpenChange, opportunity, onSave }) {
  const isEdit = Boolean(opportunity);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [createId, setCreateId] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(opportunity ? hydrate(opportunity) : EMPTY);
    setCreateId(opportunity ? opportunity.id : crypto.randomUUID());
  }, [open, opportunity]);

  const set    = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));
  const setVal = (k) => (val) => setValues(v => ({ ...v, [k]: val }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.organization_id) {
      toast.error('Hospital is required');
      scrollToFirstError(formRef, ['organization_id']);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...(isEdit ? {} : { id: createId }),
        organization_id:   values.organization_id,
        source_partner_id: values.source_partner_id || null,
        title:             strOrNull(values.title),
        name:              strOrNull(values.name),
        position_type:     strOrNull(values.position_type),
        specialty:         strOrNull(values.specialty),
        setting:           strOrNull(values.setting),
        location_city:     strOrNull(values.location_city),
        location_state:    strOrNull(values.location_state),
        start_date:        strOrNull(values.start_date),
        end_date:          strOrNull(values.end_date),
        next_action_date:  strOrNull(values.next_action_date),
        stage:             strOrNull(values.stage),
        probability:       intOrNull(values.probability),
        notes:             strOrNull(values.notes),
        // On create, seed required_items with the universal hard
        // filter (state license) so SuggestedProviders' license
        // requirement is active immediately — deriveShiftReadiness
        // would otherwise see an empty array and short-circuit
        // every row to "Incomplete." On edit, omit the key entirely
        // so existing values aren't overwritten by this form (the
        // Requirements editor will be its own surface).
        ...(isEdit ? {} : { required_items: ['license'] }),
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
      <DialogContent className="bg-surface border-border text-text max-w-3xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit opportunity' : 'New opportunity'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Open position to fill — pick the hospital first.'}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">

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
          </div>

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
    organization_id:   o.organization_id ?? '',
    source_partner_id: o.source_partner_id ?? null,
    title:             o.title ?? '',
    name:              o.name ?? '',
    position_type:     o.position_type ?? '',
    specialty:         o.specialty ?? '',
    setting:           o.setting ?? '',
    location_city:     o.location_city ?? '',
    location_state:    o.location_state ?? '',
    start_date:        o.start_date ?? '',
    end_date:          o.end_date ?? '',
    next_action_date:  o.next_action_date ?? '',
    stage:             o.stage ?? '',
    probability:       o.probability ?? '',
    notes:             o.notes ?? '',
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
