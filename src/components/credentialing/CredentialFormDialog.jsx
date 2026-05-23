import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CREDENTIAL_TYPES } from '@/utils/constants';
import { scrollToFirstError } from '@/utils/form';
import {
  deriveCredentialingStatus, statusForInsert,
} from '@/components/credentialing/expiration';

const EMPTY = {
  credential_type:  '',
  label:            '',
  identifier:       '',
  application_date: '',
  issue_date:       '',
  expiration_date:  '',
  document_path:    null,
  notes:            '',
};

// The schema enforces (credential_type='other' → label is non-blank)
// via credentials_other_requires_label CHECK. This dialog conditionally
// reveals the Label field when type=other and treats it as required
// in that branch so the DB error never surfaces to the user.
//
// `identifier` stays separate from `label` — identifier is the
// DEA number / certificate number; label is the human-readable name
// of an `other` credential (e.g., "PALS"). Both can coexist on a
// row (a custom credential with a serial number).
export default function CredentialFormDialog({
  open, onOpenChange, credential, onSave, onDeleted,
}) {
  const isEdit = Boolean(credential);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setValues(credential
      ? {
          credential_type:  credential.credential_type  ?? '',
          label:            credential.label            ?? '',
          identifier:       credential.identifier       ?? '',
          application_date: credential.application_date ?? '',
          issue_date:       credential.issue_date       ?? '',
          expiration_date:  credential.expiration_date  ?? '',
          document_path:    credential.document_path    ?? null,
          notes:            credential.notes            ?? '',
        }
      : EMPTY);
    setParentId(credential ? credential.id : crypto.randomUUID());
  }, [open, credential]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  const isOther = values.credential_type === 'other';
  const identifierPlaceholder = useMemo(() => {
    switch (values.credential_type) {
      case 'dea':                 return 'DEA number';
      case 'board_certification': return 'Certificate number';
      case 'bls':
      case 'acls':                return 'Card / cert number';
      case 'malpractice':         return 'Policy number';
      default:                    return '';
    }
  }, [values.credential_type]);

  async function performDelete() {
    if (!credential || !onDeleted) return;
    setDeleting(true);
    try {
      await onDeleted(credential.id);
      toast.success('Credential deleted');
      onOpenChange(false);
    } catch (err) {
      console.error('CredentialFormDialog delete failed', err);
      toast.error(err?.message || 'Could not delete credential');
      throw err;
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.credential_type) {
      toast.error('Type is required');
      scrollToFirstError(formRef, ['credential_type']);
      return;
    }
    if (isOther && !values.label.trim()) {
      toast.error('Label is required when type is "Other"');
      scrollToFirstError(formRef, ['label']);
      return;
    }
    // Date ordering — application → issue → expiration when each
    // pair is populated. Mirrors the schema's existing CHECK and
    // the computed-status precedence.
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
      // Status is computed from dates. INSERT writes the mapped
      // value (applied → pending) to satisfy NOT NULL + CHECK;
      // UPDATE omits status entirely so the DB column rides.
      const derived = deriveCredentialingStatus({
        applicationDate: values.application_date || null,
        grantingDate:    values.issue_date       || null,
        expirationDate:  values.expiration_date  || null,
      });
      const payload = {
        ...(isEdit
          ? {}
          : { id: parentId, status: statusForInsert(derived) }),
        credential_type:  values.credential_type,
        // label is only meaningful for `other`; clear it on the
        // named types so the row doesn't carry stale text if the
        // user flipped type from 'other' to 'dea' before saving.
        label:            isOther ? values.label.trim() : null,
        identifier:       values.identifier       || null,
        application_date: values.application_date || null,
        issue_date:       values.issue_date       || null,
        expiration_date:  values.expiration_date  || null,
        document_path:    values.document_path    || null,
        notes:            values.notes            || null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Credential updated' : 'Credential added');
      onOpenChange(false);
    } catch (err) {
      console.error('CredentialFormDialog save failed', err);
      toast.error(err?.message || 'Could not save credential');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit credential' : 'New credential'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            Core credential (board cert, DEA, BLS/ACLS, malpractice, etc.). Not state- or facility-specific.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <Field label="Type" required>
            <Select value={values.credential_type || undefined} onValueChange={(v) => setValues(s => ({ ...s, credential_type: v }))}>
              <SelectTrigger name="credential_type" className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {isOther && (
            <Field label="Label" required>
              <Input
                name="label"
                value={values.label}
                onChange={set('label')}
                placeholder="e.g., PALS, ATLS, NRP"
                autoFocus
                className="bg-bg border-border text-text"
              />
            </Field>
          )}

          <Field label="Identifier">
            <Input
              value={values.identifier}
              onChange={set('identifier')}
              placeholder={identifierPlaceholder}
              className="bg-bg border-border text-text"
            />
          </Field>

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
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add credential'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteTriggerRef}
        title="Delete this credential?"
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
