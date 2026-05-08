import { useEffect, useState } from 'react';
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
import { CONTACT_ROLES } from '@/utils/constants';

const EMPTY = {
  organization_id: '',
  first_name: '',
  last_name: '',
  title: '',
  role: '',
  email: '',
  phone: '',
  notes: '',
};

// Used for both create and edit. If `organizationId` is provided,
// the org selector is hidden (we already know which org we're under);
// otherwise the caller must pass `organizations` so the user can pick.
export default function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  organizationId,
  organizations,
  onSave,
}) {
  const isEdit = Boolean(contact);
  const lockOrg = Boolean(organizationId);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(contact
        ? {
            organization_id: contact.organization_id ?? organizationId ?? '',
            first_name: contact.first_name ?? '',
            last_name:  contact.last_name  ?? '',
            title:      contact.title      ?? '',
            role:       contact.role       ?? '',
            email:      contact.email      ?? '',
            phone:      contact.phone      ?? '',
            notes:      contact.notes      ?? '',
          }
        : { ...EMPTY, organization_id: organizationId ?? '' });
    }
  }, [open, contact, organizationId]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.organization_id) {
      toast.error('Please pick an organization');
      return;
    }
    if (!values.first_name.trim() && !values.last_name.trim()) {
      toast.error('Please enter at least a first or last name');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        organization_id: values.organization_id,
        first_name: values.first_name.trim() || null,
        last_name:  values.last_name.trim()  || null,
        title:      values.title    || null,
        role:       values.role     || null,
        email:      values.email    || null,
        phone:      values.phone    || null,
        notes:      values.notes    || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Contact updated' : 'Contact created');
      onOpenChange(false);
    } catch (err) {
      console.error('ContactFormDialog save failed', err);
      toast.error(err?.message || 'Could not save contact');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit contact' : 'New contact'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {lockOrg ? 'Add a person at this organization.' : 'Pick an organization, then enter their details.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!lockOrg && (
            <Field label="Organization" required>
              <Select
                value={values.organization_id || undefined}
                onValueChange={(v) => setValues(s => ({ ...s, organization_id: v }))}
              >
                <SelectTrigger className="bg-bg border-border text-text">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {(organizations ?? []).map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="First name" required>
              <Input value={values.first_name} onChange={set('first_name')} autoFocus className="bg-bg border-border text-text" />
            </Field>
            <Field label="Last name" required>
              <Input value={values.last_name} onChange={set('last_name')} className="bg-bg border-border text-text" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Title">
              <Input value={values.title} onChange={set('title')} placeholder="VP Operations" className="bg-bg border-border text-text" />
            </Field>
            <Field label="Role">
              <Select
                value={values.role || undefined}
                onValueChange={(v) => setValues(s => ({ ...s, role: v }))}
              >
                <SelectTrigger className="bg-bg border-border text-text">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={values.email} onChange={set('email')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={values.phone} onChange={set('phone')} placeholder="(212) 555-1234" className="bg-bg border-border text-text" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea value={values.notes} onChange={set('notes')} rows={3} className="bg-bg border-border text-text" />
          </Field>

          {/* Phone: Cancel (top, full-width) → Save (bottom, closest to thumb).
              Desktop: Cancel + Save inline right. Bypasses DialogFooter
              because its flex-col-reverse default would place Save above Cancel on phone. */}
          <div className="pt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="ghost"
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
