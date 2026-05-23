import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import DocumentUpload from '@/components/uploads/DocumentUpload';
import { US_STATES } from '@/utils/constants';
import { scrollToFirstError } from '@/utils/form';
import {
  deriveCredentialingStatus, statusForInsert,
} from '@/components/credentialing/expiration';

const EMPTY = {
  state:            '',
  license_number:   '',
  application_date: '',
  issue_date:       '',
  expiration_date:  '',
  document_path:    null,
  notes:            '',
};

// Mirrors ProviderFormDialog's shape: create-mode UUID generated on
// open so the DocumentUpload's parentId prefix matches the eventual
// row id, sticky save bar on phone, in-dialog Delete (edit mode
// only) routed through ConfirmDeleteDialog. The 0004 schema enforces
// expiration_date >= issue_date when both are populated; the
// submit handler surfaces the same rule client-side so the user
// gets a toast instead of a raw constraint error.
export default function LicenseFormDialog({
  open, onOpenChange, license, onSave, onDeleted,
}) {
  const isEdit = Boolean(license);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(license
      ? {
          state:            license.state            ?? '',
          license_number:   license.license_number   ?? '',
          application_date: license.application_date ?? '',
          issue_date:       license.issue_date       ?? '',
          expiration_date:  license.expiration_date  ?? '',
          document_path:    license.document_path    ?? null,
          notes:            license.notes            ?? '',
        }
      : EMPTY);
    setParentId(license ? license.id : crypto.randomUUID());
  }, [open, license]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  async function performDelete() {
    if (!license || !onDeleted) return;
    setDeleting(true);
    try {
      await onDeleted(license.id);
      toast.success('License deleted');
      onOpenChange(false);
    } catch (err) {
      console.error('LicenseFormDialog delete failed', err);
      toast.error(err?.message || 'Could not delete license');
      throw err;
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.state) {
      toast.error('State is required');
      scrollToFirstError(formRef, ['state']);
      return;
    }
    // Date ordering — application → issue → expiration when each
    // pair is populated. Mirrors the schema's date-ordered CHECK
    // (issue ≤ expiration) plus the new "applied" sequencing the
    // computed-status helper relies on.
    if (values.application_date && values.issue_date
        && values.issue_date < values.application_date) {
      toast.error('Issue date must be on or after application date');
      scrollToFirstError(formRef, ['issue_date']);
      return;
    }
    if (values.issue_date && values.expiration_date
        && values.expiration_date < values.issue_date) {
      toast.error('Expiration date must be on or after issue date');
      scrollToFirstError(formRef, ['expiration_date']);
      return;
    }
    setSubmitting(true);
    try {
      // Status is computed from dates, not user-picked. On INSERT
      // the schema's NOT NULL CHECK forces us to write a value; we
      // map the computed display value to a CHECK-allowed one via
      // statusForInsert (applied → pending). On UPDATE we omit
      // status entirely so the DB column rides — kebab actions
      // are the only writes to status on edit.
      const derived = deriveCredentialingStatus({
        applicationDate: values.application_date || null,
        grantingDate:    values.issue_date       || null,
        expirationDate:  values.expiration_date  || null,
      });
      const payload = {
        ...(isEdit
          ? {}
          : { id: parentId, status: statusForInsert(derived) }),
        state:            values.state,
        license_number:   values.license_number   || null,
        application_date: values.application_date || null,
        issue_date:       values.issue_date       || null,
        expiration_date:  values.expiration_date  || null,
        document_path:    values.document_path    || null,
        notes:            values.notes            || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'License updated' : 'License added');
      onOpenChange(false);
    } catch (err) {
      console.error('LicenseFormDialog save failed', err);
      toast.error(err?.message || 'Could not save license');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit license' : 'New license'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            State medical license. Status is computed from the dates — fill the application date when you start the application, the issue date when it's granted.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
            <Field label="State" required>
              <Select value={values.state || undefined} onValueChange={(v) => setValues(s => ({ ...s, state: v }))}>
                <SelectTrigger name="state" className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="License number">
              <Input value={values.license_number} onChange={set('license_number')} className="bg-bg border-border text-text" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Application date">
              <Input name="application_date" type="date" value={values.application_date} onChange={set('application_date')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Issue date">
              <Input name="issue_date" type="date" value={values.issue_date} onChange={set('issue_date')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Expiration date">
              <Input name="expiration_date" type="date" value={values.expiration_date} onChange={set('expiration_date')} className="bg-bg border-border text-text" />
            </Field>
          </div>

          <Field label="Document">
            <div>
              <DocumentUpload
                bucket="credentials"
                parentId={parentId}
                currentPath={values.document_path}
                onUploaded={(p) => setValues(v => ({ ...v, document_path: p }))}
                onRemove={() => setValues(v => ({ ...v, document_path: null }))}
              />
            </div>
          </Field>

          <Field label="Notes">
            <Textarea value={values.notes} onChange={set('notes')} rows={3} className="bg-bg border-border text-text" />
          </Field>

          {/* Phone: Delete top, Cancel/Save below. Desktop: Delete left, Cancel/Save inline right.
              Same shape as TaskFormDialog. */}
          <div className="pt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isEdit && onDeleted && (
                <Button
                  ref={deleteTriggerRef}
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={submitting || deleting}
                  className="w-full sm:w-auto text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2
                            max-sm:sticky max-sm:bottom-0 max-sm:py-3
                            max-sm:bg-surface max-sm:border-t max-sm:border-border
                            max-sm:shadow-[0_-4px_8px_-2px_rgba(0,0,0,0.3)]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting || deleting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || deleting}
                className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add license'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteTriggerRef}
        title="Delete this license?"
        description="This will also remove any uploaded document. This cannot be undone."
        onConfirm={performDelete}
      />
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
