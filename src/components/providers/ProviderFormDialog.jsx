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
import ImageUpload from '@/components/uploads/ImageUpload';
import {
  POSITION_TYPES, PROVIDER_SOURCES, PROVIDER_STATUSES,
  SPECIALTIES, US_STATES,
} from '@/utils/constants';
import { scrollToFirstError } from '@/utils/form';

const EMPTY = {
  first_name:        '',
  last_name:         '',
  middle_name:       '',
  suffix:            '',
  email:             '',
  phone:             '',
  npi:               '',
  specialty:         '',
  position_type:     '',
  home_city:         '',
  home_state:        '',
  status:            '',
  source:            '',
  archived:          false,
  notes:             '',
  photo_path:        null,
  aadvantage_number: '',
  flight_preference: '',
  shirt_size:        '',
};

// Same create-mode uuid pattern as OrganizationFormDialog: a uuid
// is generated when the dialog opens in create mode and used both
// as ImageUpload's `parentId` (so uploads land at
// provider-photos/<uuid>/...) AND as the new row's `id` on insert.
// Cancelled-create photo uploads orphan their bytes — accepted
// per the standing commit policy.
export default function ProviderFormDialog({ open, onOpenChange, provider, onSave }) {
  const isEdit = Boolean(provider);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [parentId, setParentId] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(provider
      ? {
          first_name:        provider.first_name        ?? '',
          last_name:         provider.last_name         ?? '',
          middle_name:       provider.middle_name       ?? '',
          suffix:            provider.suffix            ?? '',
          email:             provider.email             ?? '',
          phone:             provider.phone             ?? '',
          npi:               provider.npi               ?? '',
          specialty:         provider.specialty         ?? '',
          position_type:     provider.position_type     ?? '',
          home_city:         provider.home_city         ?? '',
          home_state:        provider.home_state        ?? '',
          status:            provider.status            ?? '',
          source:            provider.source            ?? '',
          archived:          Boolean(provider.archived),
          notes:             provider.notes             ?? '',
          photo_path:        provider.photo_path        ?? null,
          aadvantage_number: provider.aadvantage_number ?? '',
          flight_preference: provider.flight_preference ?? '',
          shirt_size:        provider.shirt_size        ?? '',
        }
      : EMPTY);
    setParentId(provider ? provider.id : crypto.randomUUID());
  }, [open, provider]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.first_name.trim() && !values.last_name.trim()) {
      toast.error('Please enter at least a first or last name');
      scrollToFirstError(formRef, ['first_name']);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...(isEdit ? {} : { id: parentId }),
        // first_name / last_name are NOT NULL in the schema — fall
        // back to 'Unknown' the same way the import script does so
        // a half-blank entry doesn't fail at the DB layer.
        first_name:        values.first_name.trim()  || 'Unknown',
        last_name:         values.last_name.trim()   || 'Unknown',
        middle_name:       values.middle_name        || null,
        suffix:            values.suffix             || null,
        email:             values.email              || null,
        phone:             values.phone              || null,
        npi:               values.npi                || null,
        specialty:         values.specialty          || null,
        position_type:     values.position_type      || null,
        home_city:         values.home_city          || null,
        home_state:        values.home_state         || null,
        status:            values.status             || null,
        source:            values.source             || null,
        archived:          Boolean(values.archived),
        notes:             values.notes              || null,
        photo_path:        values.photo_path         || null,
        aadvantage_number: values.aadvantage_number  || null,
        flight_preference: values.flight_preference  || null,
        shirt_size:        values.shirt_size         || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Provider updated' : 'Provider created');
      onOpenChange(false);
    } catch (err) {
      console.error('ProviderFormDialog save failed', err);
      toast.error(err?.message || 'Could not save provider');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit provider' : 'New provider'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Add a provider to the supply pipeline.'}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-start gap-6 md:flex-row">
            <div className="space-y-1.5">
              <Label className="block font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                Photo
              </Label>
              <ImageUpload
                bucket="provider-photos"
                parentId={parentId}
                currentPath={values.photo_path}
                onUploaded={(p) => setValues(v => ({ ...v, photo_path: p }))}
                onRemove={() => setValues(v => ({ ...v, photo_path: null }))}
                alt={`${values.first_name || 'Provider'} photo`}
                shape="circle"
                size="lg"
              />
            </div>
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 md:flex-1">
              <Field label="First name" required>
                <Input name="first_name" value={values.first_name} onChange={set('first_name')} autoFocus className="bg-bg border-border text-text" />
              </Field>
              <Field label="Last name" required>
                <Input name="last_name" value={values.last_name} onChange={set('last_name')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Middle name">
                <Input name="middle_name" value={values.middle_name} onChange={set('middle_name')} className="bg-bg border-border text-text" />
              </Field>
              <Field label="Suffix">
                <Input name="suffix" value={values.suffix} onChange={set('suffix')} placeholder="Jr., III, etc." className="bg-bg border-border text-text" />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={values.email} onChange={set('email')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={values.phone} onChange={set('phone')} placeholder="(212) 555-1234" className="bg-bg border-border text-text" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Position type">
              <Select value={values.position_type || undefined} onValueChange={(v) => setValues(s => ({ ...s, position_type: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {POSITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Specialty">
              <Select value={values.specialty || undefined} onValueChange={(v) => setValues(s => ({ ...s, specialty: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="NPI">
              <Input value={values.npi} onChange={set('npi')} className="bg-bg border-border text-text" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <Field label="Home city">
              <Input value={values.home_city} onChange={set('home_city')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Home state">
              <Select value={values.home_state || undefined} onValueChange={(v) => setValues(s => ({ ...s, home_state: v }))}>
                <SelectTrigger className="bg-bg border-border text-text w-full md:w-[110px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={values.status || undefined} onValueChange={(v) => setValues(s => ({ ...s, status: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={values.source || undefined} onValueChange={(v) => setValues(s => ({ ...s, source: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="AAdvantage #">
              <Input value={values.aadvantage_number} onChange={set('aadvantage_number')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Flight preference">
              <Input value={values.flight_preference} onChange={set('flight_preference')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Shirt size">
              <Input value={values.shirt_size} onChange={set('shirt_size')} placeholder="L, XL…" className="bg-bg border-border text-text" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea value={values.notes} onChange={set('notes')} rows={3} className="bg-bg border-border text-text" />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={values.archived}
              onChange={(e) => setValues(s => ({ ...s, archived: e.target.checked }))}
              className="w-4 h-4 accent-accent border-border rounded"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Archived (hidden from active lists)
            </span>
          </label>

          {/* Phone: Cancel-above-Save full-width, sticky to dialog scroll bottom (decision #5).
              Desktop: inline-right, no stick. Bypasses DialogFooter to control col-direction
              and to attach max-sm:sticky cleanly. Shadow gives elevation cue without depending
              on the dialog's exact padding. */}
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
