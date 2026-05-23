import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import OrganizationCombobox from '@/components/opportunities/OrganizationCombobox';
import DocumentUpload from '@/components/uploads/DocumentUpload';
import { scrollToFirstError } from '@/utils/form';
import {
  deriveCredentialingStatus, statusForInsert,
} from '@/components/credentialing/expiration';

const EMPTY = {
  organization_id:  null,
  application_date: '',
  approval_date:    '',
  expiration_date:  '',
  document_path:    null,
  notes:            '',
};

// Hospital picker reuses OrganizationCombobox with type='hospital'
// (same component opportunity creation uses for its hospital field).
// allowCreateNew=true so a user mid-flow can spin up a new hospital
// without context-switching to the Organizations page.
//
// Schema enforces a chain: application_date → approval_date →
// expiration_date when each pair is populated. Submit-side
// validation surfaces friendlier toasts than the raw CHECK error.
export default function FacilityPrivilegeFormDialog({
  open, onOpenChange, privilege, onSave, onDeleted,
}) {
  const isEdit = Boolean(privilege);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(privilege
      ? {
          organization_id:  privilege.organization_id  ?? null,
          application_date: privilege.application_date ?? '',
          approval_date:    privilege.approval_date    ?? '',
          expiration_date:  privilege.expiration_date  ?? '',
          document_path:    privilege.document_path    ?? null,
          notes:            privilege.notes            ?? '',
        }
      : EMPTY);
    setParentId(privilege ? privilege.id : crypto.randomUUID());
  }, [open, privilege]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  async function performDelete() {
    if (!privilege || !onDeleted) return;
    setDeleting(true);
    try {
      await onDeleted(privilege.id);
      toast.success('Privilege deleted');
      onOpenChange(false);
    } catch (err) {
      console.error('FacilityPrivilegeFormDialog delete failed', err);
      toast.error(err?.message || 'Could not delete privilege');
      throw err;
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.organization_id) {
      toast.error('Hospital is required');
      scrollToFirstError(formRef, ['organization_id']);
      return;
    }
    if (values.application_date && values.approval_date
        && values.approval_date < values.application_date) {
      toast.error('Approval date must be on or after application date');
      scrollToFirstError(formRef, ['approval_date']);
      return;
    }
    if (values.approval_date && values.expiration_date
        && values.expiration_date < values.approval_date) {
      toast.error('Expiration date must be on or after approval date');
      scrollToFirstError(formRef, ['expiration_date']);
      return;
    }
    setSubmitting(true);
    try {
      // Lifecycle status is computed from dates. INSERT writes the
      // mapped value to satisfy NOT NULL + CHECK; UPDATE omits
      // status entirely so terminal outcomes (denied / withdrawn)
      // set via the section's kebab actions are preserved when
      // the user edits other fields.
      const derived = deriveCredentialingStatus({
        applicationDate: values.application_date || null,
        grantingDate:    values.approval_date    || null,
        expirationDate:  values.expiration_date  || null,
      });
      const payload = {
        ...(isEdit
          ? {}
          : { id: parentId, status: statusForInsert(derived) }),
        organization_id:  values.organization_id,
        application_date: values.application_date || null,
        approval_date:    values.approval_date    || null,
        expiration_date:  values.expiration_date  || null,
        document_path:    values.document_path    || null,
        notes:            values.notes            || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Privilege updated' : 'Privilege added');
      onOpenChange(false);
    } catch (err) {
      console.error('FacilityPrivilegeFormDialog save failed', err);
      toast.error(err?.message || 'Could not save privilege');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit facility privilege' : 'New facility privilege'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            Privileges at a specific hospital. The per-placement gate — readiness for an opportunity requires privileges at its hospital.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <Field label="Hospital" required>
            <OrganizationCombobox
              type="hospital"
              name="organization_id"
              value={values.organization_id}
              onChange={(id) => setValues(s => ({ ...s, organization_id: id }))}
              required
              allowCreateNew
              placeholder="Select hospital"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Application date">
              <Input type="date" value={values.application_date} onChange={set('application_date')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="Approval date">
              <Input name="approval_date" type="date" value={values.approval_date} onChange={set('approval_date')} className="bg-bg border-border text-text" />
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
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add privilege'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteTriggerRef}
        title="Delete this privilege?"
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
