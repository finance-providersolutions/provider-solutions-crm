import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardKebab } from '@/components/ui/card-kebab';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import LicenseFormDialog from '@/components/credentialing/LicenseFormDialog';
import ExpirationCluster from '@/components/credentialing/ExpirationCluster';
import { useProviderLicenses } from '@/hooks/useCredentialing';
import { getSignedUrl } from '@/utils/storage';
import {
  deriveCredentialingStatus,
  derivedStatusLabel,
  derivedStatusToneClass,
} from '@/components/credentialing/expiration';
import { cn } from '@/lib/utils';

export default function LicensesSection({ providerId }) {
  const { data, loading, error, create, update, remove } = useProviderLicenses(providerId);
  const [createOpen, setCreateOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef                = useRef(null);

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          variant="outline"
          className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
        >
          <Plus className="w-4 h-4 mr-1" /> Add license
        </Button>
      </div>

      {loading && <EmptyNote>Loading…</EmptyNote>}
      {!loading && error && <EmptyNote tone="danger">{error.message}</EmptyNote>}
      {!loading && !error && data.length === 0 && (
        <EmptyNote>No licenses on file yet.</EmptyNote>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.map(l => (
            <LicenseRow
              key={l.id}
              license={l}
              onEdit={() => setEditing(l)}
              onDelete={(triggerEl) => {
                deleteTriggerRef.current = triggerEl;
                setDeleteTarget(l);
              }}
            />
          ))}
        </div>
      )}

      <LicenseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(payload) => create(payload)}
      />

      <LicenseFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        license={editing}
        onSave={(payload) => update(editing.id, payload)}
        onDeleted={async (id) => { await remove(id); setEditing(null); }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget ? `Delete ${deleteTarget.state} license?` : 'Delete?'}
        description="This will also remove any uploaded document. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('License delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

// Row interaction model (applies to all three credentialing sections):
//   - Row WITH a document attached    → click opens the document
//     (signed URL fetched fresh on each click, opens in new tab).
//   - Row WITHOUT a document          → row is not clickable; no
//     hover/cursor affordance. Edit / Delete remain in the kebab.
//
// Computed status is derived from dates at render time — the row's
// DB status column is ignored for display on licenses.
//
// Expiration cluster sits inline:
//   - Wide: in the right cluster, immediately left of the status badge.
//   - Mobile: on row 2, right-hand side of the secondary content line.
// Reference shape across all three sections — see ExpirationCluster
// below for the shared rule set.
function LicenseRow({ license: l, onEdit, onDelete }) {
  const [opening, setOpening] = useState(false);
  const hasDoc = Boolean(l.document_path);

  const derived = deriveCredentialingStatus({
    applicationDate: l.application_date,
    grantingDate:    l.issue_date,
    expirationDate:  l.expiration_date,
  });

  async function openDoc() {
    if (!hasDoc || opening) return;
    setOpening(true);
    try {
      const url = await getSignedUrl('credentials', l.document_path);
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
      aria-label={hasDoc ? `Open document for ${l.state} license` : undefined}
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
          <h4 className="flex-1 min-w-0 font-display text-[20px] text-accent leading-none truncate">
            {l.state}
          </h4>
          <StatusBadge status={derived} />
          <CardKebab ariaLabel="License actions" onEdit={onEdit} onDelete={onDelete} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <p className="flex-1 min-w-0 font-mono text-[11px] text-text-dim leading-snug truncate">
            {l.license_number || <span className="text-text-muted">No license #</span>}
          </p>
          <ExpirationCluster date={l.expiration_date} status={derived} />
        </div>
        {l.notes && (
          <p className="text-text-dim text-[12px] leading-snug truncate">
            {l.notes}
          </p>
        )}
      </div>

      {/* ── Wide / horizontal layout ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex-shrink-0 w-[64px]">
          <h4 className="font-display text-[22px] text-accent leading-none">
            {l.state}
          </h4>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <p className="font-mono text-[12px] text-text leading-none truncate">
            {l.license_number || <span className="text-text-muted">No license number</span>}
          </p>
          {l.notes && (
            <p className="text-text-dim text-[12px] leading-snug truncate">
              {l.notes}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <ExpirationCluster date={l.expiration_date} status={derived} />
          <div className="flex items-center gap-2">
            <StatusBadge status={derived} />
            <CardKebab ariaLabel="License actions" onEdit={onEdit} onDelete={onDelete} />
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
