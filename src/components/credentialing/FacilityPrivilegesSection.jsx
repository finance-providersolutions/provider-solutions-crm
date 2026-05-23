import { useRef, useState } from 'react';
import { Ban, MinusCircle, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardKebab } from '@/components/ui/card-kebab';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import Thumb from '@/components/uploads/Thumb';
import FacilityPrivilegeFormDialog from '@/components/credentialing/FacilityPrivilegeFormDialog';
import { useFacilityPrivileges } from '@/hooks/useCredentialing';
import { getSignedUrl, initialsFor } from '@/utils/storage';
import {
  deriveCredentialingStatus,
  derivedStatusLabel,
  derivedStatusToneClass,
  statusForInsert,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';
import ExpirationCluster from '@/components/credentialing/ExpirationCluster';
import { cn } from '@/lib/utils';

export default function FacilityPrivilegesSection({ providerId }) {
  const { data, loading, error, create, update, remove } = useFacilityPrivileges(providerId);
  const [createOpen, setCreateOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef                = useRef(null);

  // Kebab actions specific to privileges: a row's stored status
  // column can be set to a terminal outcome ('denied' / 'withdrawn')
  // that overrides the date-derived display. "Clear outcome"
  // reverts to date-derived by writing the lifecycle status back.
  async function markStatus(row, next) {
    try {
      await update(row.id, { status: next });
      const label = next === 'denied' ? 'denied' : next === 'withdrawn' ? 'withdrawn' : 'updated';
      toast.success(`Privilege marked ${label}`);
    } catch (err) {
      console.error('mark status', err);
      toast.error(err?.message || 'Could not update');
    }
  }

  async function clearOutcome(row) {
    const lifecycle = deriveCredentialingStatus({
      applicationDate: row.application_date,
      grantingDate:    row.approval_date,
      expirationDate:  row.expiration_date,
    });
    try {
      await update(row.id, { status: statusForInsert(lifecycle) });
      toast.success('Outcome cleared');
    } catch (err) {
      console.error('clear outcome', err);
      toast.error(err?.message || 'Could not update');
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
          <Plus className="w-4 h-4 mr-1" /> Add privilege
        </Button>
      </div>

      {loading && <EmptyNote>Loading…</EmptyNote>}
      {!loading && error && <EmptyNote tone="danger">{error.message}</EmptyNote>}
      {!loading && !error && data.length === 0 && (
        <EmptyNote>No facility privileges on file yet.</EmptyNote>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.map(p => (
            <PrivilegeRow
              key={p.id}
              privilege={p}
              onEdit={() => setEditing(p)}
              onDelete={(triggerEl) => {
                deleteTriggerRef.current = triggerEl;
                setDeleteTarget(p);
              }}
              onMarkDenied={() => markStatus(p, 'denied')}
              onMarkWithdrawn={() => markStatus(p, 'withdrawn')}
              onClearOutcome={() => clearOutcome(p)}
            />
          ))}
        </div>
      )}

      <FacilityPrivilegeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(payload) => create(payload)}
      />

      <FacilityPrivilegeFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        privilege={editing}
        onSave={(payload) => update(editing.id, payload)}
        onDeleted={async (id) => { await remove(id); setEditing(null); }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget?.organization?.name
          ? `Delete privilege at ${deleteTarget.organization.name}?`
          : 'Delete privilege?'}
        description="This will also remove any uploaded document. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Privilege delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

function PrivilegeRow({
  privilege: p, onEdit, onDelete,
  onMarkDenied, onMarkWithdrawn, onClearOutcome,
}) {
  const [opening, setOpening] = useState(false);
  const hasDoc = Boolean(p.document_path);

  // Terminal outcomes (denied / withdrawn) on the stored status
  // override date-driven derivation. Pass terminalStatuses so the
  // helper applies the rule. A privilege the hospital denied must
  // never render as Pending / Active just because dates are set.
  const derived = deriveCredentialingStatus({
    applicationDate: p.application_date,
    grantingDate:    p.approval_date,
    expirationDate:  p.expiration_date,
    storedStatus:    p.status,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  });
  const isTerminal = PRIVILEGE_TERMINAL_STATUSES.includes(derived);

  const org  = p.organization;
  const hospitalName = org?.name || 'Unknown hospital';
  const location     = [org?.city, org?.state].filter(Boolean).join(', ');

  async function openDoc() {
    if (!hasDoc || opening) return;
    setOpening(true);
    try {
      const url = await getSignedUrl('credentials', p.document_path);
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

  // CardKebab extraItems — kebab carries the lifecycle "Mark"
  // actions plus a "Clear outcome" revert. Show Mark options only
  // when the row isn't already in that terminal state; show Clear
  // only when a terminal outcome is currently set.
  const kebabExtras = [];
  if (derived !== 'denied') {
    kebabExtras.push({
      label: 'Mark denied',
      icon: Ban,
      onSelect: onMarkDenied,
      destructive: true,
    });
  }
  if (derived !== 'withdrawn') {
    kebabExtras.push({
      label: 'Mark withdrawn',
      icon: MinusCircle,
      onSelect: onMarkWithdrawn,
    });
  }
  if (isTerminal) {
    kebabExtras.push({
      label: 'Clear outcome',
      icon: RotateCcw,
      onSelect: onClearOutcome,
    });
  }

  return (
    <div
      role={hasDoc ? 'button' : undefined}
      tabIndex={hasDoc ? 0 : undefined}
      onClick={hasDoc ? openDoc : undefined}
      onKeyDown={onKey}
      aria-label={hasDoc ? `Open document for privilege at ${hospitalName}` : undefined}
      className={cn(
        'bg-surface border border-border rounded p-3 md:px-4 md:py-3',
        hasDoc
          ? 'cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none'
          : 'cursor-default',
        opening && 'opacity-70',
      )}
    >
      {/* ── Mobile / narrow layout ────────────────────────────── */}
      <div className="md:hidden flex items-start gap-3">
        <Thumb
          path={org?.logo_path}
          bucket="organization-logos"
          alt={hospitalName}
          fallback={initialsFor(hospitalName)}
          size="md"
          shape="square"
          className="h-12 w-12 flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="flex-1 min-w-0 font-display text-[16px] text-accent leading-snug truncate">
              {hospitalName}
            </h4>
            <StatusBadge status={derived} />
            <CardKebab
              ariaLabel="Privilege actions"
              onEdit={onEdit}
              onDelete={onDelete}
              extraItems={kebabExtras}
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[11px] text-text-dim leading-none truncate">
              {location || ''}
            </p>
            <ExpirationCluster date={p.expiration_date} status={derived} />
          </div>
          {p.notes && (
            <p className="text-text-dim text-[12px] leading-snug truncate">
              {p.notes}
            </p>
          )}
        </div>
      </div>

      {/* ── Wide / horizontal layout ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-4">
        <Thumb
          path={org?.logo_path}
          bucket="organization-logos"
          alt={hospitalName}
          fallback={initialsFor(hospitalName)}
          size="md"
          shape="square"
          className="h-12 w-12 flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h4 className="font-display text-[18px] text-accent leading-snug truncate">
            {hospitalName}
          </h4>
          <p className="font-mono text-[11px] text-text-dim leading-none truncate">
            {location || <span className="text-text-muted">—</span>}
            {p.notes && <span className="text-text-dim">  ·  {p.notes}</span>}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <ExpirationCluster date={p.expiration_date} status={derived} />
          <div className="flex items-center gap-2">
            <StatusBadge status={derived} />
            <CardKebab
              ariaLabel="Privilege actions"
              onEdit={onEdit}
              onDelete={onDelete}
              extraItems={kebabExtras}
            />
          </div>
        </div>
      </div>
    </div>
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
