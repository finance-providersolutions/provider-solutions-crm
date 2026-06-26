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
import { CREDENTIAL_TYPES, US_STATES } from '@/utils/constants';
import { scrollToFirstError } from '@/utils/form';
import { useCredentialTypes } from '@/hooks/useCredentialing';

const EMPTY = {
  type_key:         '',
  label:            '',
  identifier:       '',
  state:            '',
  ps_provided:      false,
  issue_date:       '',
  expiration_date:  '',
  document_path:    null,
  notes:            '',
};

// type_keys that carry a US-state jurisdiction (the state medical
// license and the state controlled-substance registration). The
// state field is revealed and required for these.
const STATE_SCOPED_TYPES = ['state_medical_license', 'state_csr'];

// For `other` rows the label is the only identity the credential has,
// so this dialog reveals the Label field when type_key='other' and
// treats it as required in that branch. State-scoped types
// (state_medical_license / state_csr) additionally require a state.
//
// `identifier` stays separate from `label` — identifier is the
// DEA number / certificate number; label is the human-readable name
// of an `other` credential (e.g., "PALS"). Both can coexist on a
// row (a custom credential with a serial number).
export default function CredentialFormDialog({
  open, onOpenChange, credential, onSave, onDeleted,
}) {
  const isEdit = Boolean(credential);
  const { types: catalog } = useCredentialTypes();
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
          type_key:         credential.type_key         ?? '',
          label:            credential.label            ?? '',
          identifier:       credential.identifier       ?? '',
          state:            credential.state            ?? '',
          ps_provided:      Boolean(credential.ps_provided),
          issue_date:       credential.issue_date       ?? '',
          expiration_date:  credential.expiration_date  ?? '',
          document_path:    credential.document_path    ?? null,
          notes:            credential.notes            ?? '',
        }
      : EMPTY);
    setParentId(credential ? credential.id : crypto.randomUUID());
  }, [open, credential]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  const isOther       = values.type_key === 'other';
  const needsState    = STATE_SCOPED_TYPES.includes(values.type_key);
  const isMalpractice = values.type_key === 'malpractice';

  // Type options come from the credential_types catalog (0013) so the
  // new state-scoped types surface alongside the migrated five. While
  // the catalog loads, fall back to the CREDENTIAL_TYPES constant so
  // the picker is never empty.
  const typeOptions = useMemo(() => {
    const rows = (catalog ?? [])
      .map(t => ({ value: t.key, label: t.label ?? t.name ?? t.key }))
      .filter(o => o.value);
    if (!rows.length) return CREDENTIAL_TYPES;
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);

  const identifierPlaceholder = useMemo(() => {
    switch (values.type_key) {
      case 'dea':                   return 'DEA number';
      case 'board_certification':   return 'Certificate number';
      case 'bls':
      case 'acls':                  return 'Card / cert number';
      case 'malpractice':           return 'Policy number';
      case 'state_medical_license': return 'License number';
      case 'state_csr':             return 'CSR / CDS number';
      default:                      return '';
    }
  }, [values.type_key]);

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
    if (!values.type_key) {
      toast.error('Type is required');
      scrollToFirstError(formRef, ['type_key']);
      return;
    }
    if (isOther && !values.label.trim()) {
      toast.error('Label is required when type is "Other"');
      scrollToFirstError(formRef, ['label']);
      return;
    }
    if (needsState && !values.state) {
      toast.error('State is required for this credential type');
      scrollToFirstError(formRef, ['state']);
      return;
    }
    // Date ordering — issue → expiration when both are populated.
    // Mirrors the provider_credentials_dates_ordered CHECK.
    if (values.issue_date && values.expiration_date
        && values.expiration_date < values.issue_date) {
      toast.error('Expiration date must be on or after issue date');
      scrollToFirstError(formRef, ['expiration_date']);
      return;
    }
    setSubmitting(true);
    try {
      // No lifecycle `status` on provider_credentials — the wallet's
      // gate is verification_status, which this form NEVER sets: new
      // rows are born unverified ('provider_attested') by the create
      // hook, and verification only ever happens through the explicit
      // staff verify() action. So this payload deliberately omits
      // verification_status on both create and edit — editing a row
      // must not silently flip it. The display lifecycle (Active/
      // Expired/…) is still derived from the dates at render time.
      const payload = {
        ...(isEdit ? {} : { id: parentId }),
        type_key:         values.type_key,
        // label is only meaningful for `other`; clear it on the
        // named types so the row doesn't carry stale text if the
        // user flipped type from 'other' to 'dea' before saving.
        label:            isOther ? values.label.trim() : null,
        identifier:       values.identifier       || null,
        // state is type-scoped and nullable — cleared to null on types
        // that don't carry it so a flip doesn't leave stale values.
        state:            needsState ? (values.state || null) : null,
        // ps_provided is NOT NULL DEFAULT false in the DB, so it must
        // ALWAYS go out as a real boolean — false when the malpractice
        // checkbox doesn't apply. Sending null (the old behavior) over-
        // rode the default and violated the not-null constraint on
        // every non-malpractice save. Covers create and update alike,
        // since this one payload feeds both.
        ps_provided:      isMalpractice ? Boolean(values.ps_provided) : false,
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
      <DialogContent className="bg-surface border-border text-text max-w-xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit credential' : 'New credential'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            Core credential (board cert, DEA, BLS/ACLS, malpractice, etc.). Not state- or facility-specific.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <Field label="Type" required>
            <Select value={values.type_key || undefined} onValueChange={(v) => setValues(s => ({ ...s, type_key: v }))}>
              <SelectTrigger name="type_key" className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {typeOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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

          {needsState && (
            <Field label="State" required>
              <Select value={values.state || undefined} onValueChange={(v) => setValues(s => ({ ...s, state: v }))}>
                <SelectTrigger name="state" className="bg-bg border-border text-text"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
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

          {isMalpractice && (
            <Field label="Malpractice coverage">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(values.ps_provided)}
                  onChange={(e) => setValues(v => ({ ...v, ps_provided: e.target.checked }))}
                  className="w-4 h-4 accent-accent"
                />
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                  Provided by Provider Solutions
                </span>
              </label>
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          </div>

          <div className="flex-shrink-0 flex flex-col gap-2 pt-3 mt-4 border-t border-border
                          sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
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
