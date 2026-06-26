import { useRef, useState } from 'react';
import { Plus, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardKebab } from '@/components/ui/card-kebab';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import CredentialFormDialog from '@/components/credentialing/CredentialFormDialog';
import { useCredentials, useCredentialTypes, credentialLabel } from '@/hooks/useCredentialing';
import { getSignedUrl } from '@/utils/storage';
import {
  deriveCredentialingStatus,
  derivedStatusLabel,
  derivedStatusToneClass,
} from '@/components/credentialing/expiration';
import ExpirationCluster from '@/components/credentialing/ExpirationCluster';
import { cn } from '@/lib/utils';

export default function CredentialsSection({ providerId }) {
  const { data, loading, error, create, update, remove, verify } = useCredentials(providerId);
  const { labelByKey, allowsValueByKey } = useCredentialTypes();
  const [createOpen, setCreateOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef                = useRef(null);

  async function handleVerify(c) {
    try {
      await verify(c);
      toast.success(
        c.type_key === 'state_medical_license'
          ? 'Verified — state license promoted'
          : 'Credential verified',
      );
    } catch (err) {
      console.error('Credential verify failed', err);
      toast.error(err?.message || 'Could not verify credential');
    }
  }

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          variant="outline"
          className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
        >
          <Plus className="w-4 h-4 mr-1" /> Add credential
        </Button>
      </div>

      {loading && <EmptyNote>Loading…</EmptyNote>}
      {!loading && error && <EmptyNote tone="danger">{error.message}</EmptyNote>}
      {!loading && !error && data.length === 0 && (
        <EmptyNote>No credentials on file yet.</EmptyNote>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.map(c => (
            <CredentialRow
              key={c.id}
              credential={c}
              labelByKey={labelByKey}
              allowsValueByKey={allowsValueByKey}
              onEdit={() => setEditing(c)}
              onVerify={() => handleVerify(c)}
              onDelete={(triggerEl) => {
                deleteTriggerRef.current = triggerEl;
                setDeleteTarget(c);
              }}
            />
          ))}
        </div>
      )}

      <CredentialFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(payload) => create(payload)}
      />

      <CredentialFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        credential={editing}
        onSave={(payload) => update(editing.id, payload)}
        onDeleted={async (id) => { await remove(id); setEditing(null); }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget ? `Delete ${credentialLabel(deleteTarget, labelByKey)}?` : 'Delete?'}
        description="This will also remove any uploaded document. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Credential delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

function CredentialRow({ credential: c, labelByKey, allowsValueByKey, onEdit, onVerify, onDelete }) {
  const [opening, setOpening] = useState(false);
  const hasDoc = Boolean(c.document_path);

  const derived = deriveCredentialingStatus({
    applicationDate: c.application_date,
    grantingDate:    c.issue_date,
    expirationDate:  c.expiration_date,
  });

  const name = credentialLabel(c, labelByKey);

  // Only show the identifier line for types that actually carry one
  // (DEA number, certificate number, …). For value-less certs like
  // BLS/ACLS the catalog's allows_value is false, so the line is
  // omitted entirely rather than rendered as a greyed "No identifier"
  // that reads like a missing field. Default to SHOWING unless the
  // catalog explicitly says false, so an unloaded catalog never hides
  // a real identifier; the "no identifier yet" treatment for value-
  // bearing types the provider hasn't filled in is unchanged.
  const showIdentifier = allowsValueByKey?.get(c.type_key) !== false;

  // Staff "Verify" sits between Edit and Delete in the kebab; it
  // disappears once the instance is already staff_verified.
  const extraItems = c.verification_status !== 'staff_verified'
    ? [{ label: 'Verify', icon: BadgeCheck, onSelect: () => onVerify?.() }]
    : [];

  async function openDoc() {
    if (!hasDoc || opening) return;
    setOpening(true);
    try {
      const url = await getSignedUrl('credentials', c.document_path);
      if (!url) { toast.error('Could not load document'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  }

  function onKey(e) {
    if (!hasDoc) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(); }
  }

  return (
    <div
      role={hasDoc ? 'button' : undefined}
      tabIndex={hasDoc ? 0 : undefined}
      onClick={hasDoc ? openDoc : undefined}
      onKeyDown={onKey}
      aria-label={hasDoc ? `Open document for ${name}` : undefined}
      className={cn(
        'bg-surface border border-border rounded p-3 md:px-4 md:py-3',
        hasDoc
          ? 'cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none'
          : 'cursor-default',
        opening && 'opacity-70',
      )}
    >
      {/* ── Mobile / narrow layout ────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="flex-1 min-w-0 font-display text-[18px] text-accent leading-none truncate">
            {name}
          </h4>
          <VerificationBadge status={c.verification_status} />
          <StatusBadge status={derived} />
          <CardKebab ariaLabel="Credential actions" extraItems={extraItems} onEdit={onEdit} onDelete={onDelete} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {showIdentifier ? (
            <p className="flex-1 min-w-0 font-mono text-[11px] text-text-dim leading-snug truncate">
              {c.identifier || <span className="text-text-muted">No identifier</span>}
            </p>
          ) : (
            <div className="flex-1" />
          )}
          <ExpirationCluster date={c.expiration_date} status={derived} />
        </div>
        {c.notes && (
          <p className="text-text-dim text-[12px] leading-snug truncate">
            {c.notes}
          </p>
        )}
      </div>

      {/* ── Wide / horizontal layout ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex-shrink-0 min-w-[160px] max-w-[260px]">
          <h4 className="font-display text-[18px] text-accent leading-none truncate">
            {name}
          </h4>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {showIdentifier && (
            <p className="font-mono text-[12px] text-text leading-none truncate">
              {c.identifier || <span className="text-text-muted">No identifier</span>}
            </p>
          )}
          {c.notes && (
            <p className="text-text-dim text-[12px] leading-snug truncate">
              {c.notes}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <ExpirationCluster date={c.expiration_date} status={derived} />
          <div className="flex items-center gap-2">
            <VerificationBadge status={c.verification_status} />
            <StatusBadge status={derived} />
            <CardKebab ariaLabel="Credential actions" extraItems={extraItems} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Verification gate (migration 0013) — orthogonal to the date-derived
// lifecycle StatusBadge. provider_attested → amber (claimed, not yet
// confirmed), staff_verified → green (staff confirmed), rejected →
// red. Unknown/missing renders nothing.
const VERIFICATION_BADGE = {
  provider_attested: { label: 'Attested', cls: 'bg-warning/15 text-warning border-warning/40' },
  staff_verified:    { label: 'Verified', cls: 'bg-income/15  text-income  border-income/40' },
  rejected:          { label: 'Rejected', cls: 'bg-danger/15  text-danger  border-danger/40' },
};

function VerificationBadge({ status }) {
  const v = VERIFICATION_BADGE[status];
  if (!v) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]',
        v.cls,
      )}
    >
      {v.label}
    </Badge>
  );
}

function StatusBadge({ status }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]',
        derivedStatusToneClass(status),
      )}
    >
      {derivedStatusLabel(status)}
    </Badge>
  );
}

function EmptyNote({ children, tone }) {
  return (
    <div className={cn(
      'px-6 py-6 text-center font-mono text-[11px] uppercase tracking-[0.1em]',
      tone === 'danger' ? 'text-danger' : 'text-text-muted',
    )}>
      {children}
    </div>
  );
}
