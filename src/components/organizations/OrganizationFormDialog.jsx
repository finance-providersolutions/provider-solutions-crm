import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ORGANIZATION_TYPES, US_STATES } from '@/utils/constants';

const EMPTY = {
  name: '',
  type: '',
  website: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
};

// Used for both create and edit. Pass `org` to edit, omit to create.
// onSave is called with the form values (sans id) and must return a
// Promise — errors thrown are surfaced via toast.
export default function OrganizationFormDialog({ open, onOpenChange, org, onSave }) {
  const isEdit = Boolean(org);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(org
        ? {
            name:    org.name    ?? '',
            type:    org.type    ?? '',
            website: org.website ?? '',
            address: org.address ?? '',
            city:    org.city    ?? '',
            state:   org.state   ?? '',
            zip:     org.zip     ?? '',
            notes:   org.notes   ?? '',
          }
        : EMPTY);
    }
  }, [open, org]);

  const set = (key) => (e) => setValues(v => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name:    values.name.trim(),
        type:    values.type    || null,
        website: values.website || null,
        address: values.address || null,
        city:    values.city    || null,
        state:   values.state   || null,
        zip:     values.zip     || null,
        notes:   values.notes   || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Organization updated' : 'Organization created');
      onOpenChange(false);
    } catch (err) {
      console.error('OrganizationFormDialog save failed', err);
      toast.error(err?.message || 'Could not save organization');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit organization' : 'New organization'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Hospitals, LOCUMs partners, or other.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" required>
            <Input
              value={values.name}
              onChange={set('name')}
              placeholder="Memorial Hospital"
              required
              autoFocus
              className="bg-bg border-border text-text"
            />
          </Field>

          <Field label="Type">
            <Select value={values.type || undefined} onValueChange={(v) => setValues(s => ({ ...s, type: v }))}>
              <SelectTrigger className="bg-bg border-border text-text">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Website">
            <Input
              type="url"
              value={values.website}
              onChange={set('website')}
              placeholder="https://example.com"
              className="bg-bg border-border text-text"
            />
          </Field>

          <Field label="Address">
            <Input
              value={values.address}
              onChange={set('address')}
              placeholder="123 Main St"
              className="bg-bg border-border text-text"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
            <Field label="City">
              <Input value={values.city} onChange={set('city')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="State">
              <Select value={values.state || undefined} onValueChange={(v) => setValues(s => ({ ...s, state: v }))}>
                <SelectTrigger className="bg-bg border-border text-text w-[110px]">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ZIP">
              <Input value={values.zip} onChange={set('zip')} className="bg-bg border-border text-text w-[100px]" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              value={values.notes}
              onChange={set('notes')}
              rows={4}
              placeholder="Anything we should know"
              className="bg-bg border-border text-text"
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
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
