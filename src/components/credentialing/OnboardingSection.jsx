import { useRef, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import DocumentUpload from '@/components/uploads/DocumentUpload';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Progress } from '@/components/ui/progress';
import { useOnboarding } from '@/hooks/useOnboarding';
import { cn } from '@/lib/utils';

// Provider onboarding — intake checklist only. Derived license/DEA
// rows were removed in the Phase-3b polish pass; that information
// now lives in the Credentialing status summary above the
// credentialing collapsible. Showing it on both sections would
// duplicate the same fact twice on one screen.
//
// Two row behaviors today:
//   • single-persisted (cv, background_check) — one row per provider,
//     toggled in place (the first toggle creates the row already-done
//     in a single round-trip).
//   • repeatable-persisted (references) — zero-to-many rows per
//     provider, each with its own toggle + optional document + delete.
//
// The whole checklist body sits inside a shared CollapsibleSection
// (default-collapsed). An always-visible "N of 3 complete" status
// line + thin progress bar render OUTSIDE the collapsible so the
// glance-state is available without expanding. Denominator is 3 —
// CV, references (satisfied = ≥1 reference row done), background
// check. License/DEA are NOT counted here.

export default function OnboardingSection({ providerId }) {
  const { catalog, items, loading, error, create, update, remove, toggle } = useOnboarding(providerId);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef = useRef(null);

  if (error) {
    return (
      <div className="font-mono text-[11px] text-danger uppercase tracking-[0.12em]">
        {error.message}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="font-mono text-[11px] text-text-dim uppercase tracking-[0.12em]">
        Loading…
      </div>
    );
  }

  // Group persisted items by item_key for the Checklist rendering.
  const itemsByKey = items.reduce((acc, it) => {
    (acc[it.item_key] = acc[it.item_key] || []).push(it);
    return acc;
  }, {});

  const completion = computeCompletion(itemsByKey);

  async function handleToggle(row) {
    try {
      await toggle(row);
    } catch (err) {
      console.error('onboarding toggle', err);
      toast.error(err?.message || 'Could not update');
    }
  }

  async function handleEnsureRowThenToggle(itemKey) {
    // Single-persisted convenience: if no row exists yet, create one
    // already-done in a single round-trip. Toggle on an existing row
    // flips between done/not-done.
    const existing = itemsByKey[itemKey]?.[0];
    if (existing) return handleToggle(existing);
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      await create({ item_key: itemKey, done: true, completed_date: todayIso });
    } catch (err) {
      console.error('onboarding create+toggle', err);
      toast.error(err?.message || 'Could not update');
    }
  }

  async function handleAddRepeatable(itemKey) {
    try {
      await create({ item_key: itemKey, done: false });
    } catch (err) {
      console.error('onboarding add repeatable', err);
      toast.error(err?.message || 'Could not add');
    }
  }

  async function handleDocUploaded(row, path) {
    try {
      await update(row.id, { document_path: path });
    } catch (err) {
      console.error('onboarding doc patch', err);
      toast.error(err?.message || 'Could not attach document');
    }
  }

  async function handleDocRemove(row) {
    try {
      await update(row.id, { document_path: null });
      toast.success('Document removed');
    } catch (err) {
      console.error('onboarding doc remove', err);
      toast.error(err?.message || 'Could not remove document');
    }
  }

  async function performDelete() {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      toast.success('Item removed');
    } catch (err) {
      console.error('onboarding delete', err);
      toast.error(err?.message || 'Could not remove');
      throw err;
    }
  }

  return (
    <>
      {/* Status line — always visible, calm/factual even at 0 of 3. */}
      <CompletionStatus complete={completion.complete} total={completion.total} />

      {/* Collapsed body — the actual checklist. */}
      <CollapsibleSection label="Onboarding Checklist">
        {catalog.length === 0 ? (
          <div className="font-mono text-[11px] text-text-muted uppercase tracking-[0.12em] py-3">
            Catalog is empty. Seed onboarding_item_types to populate this list.
          </div>
        ) : (
          <div className="bg-surface border border-border rounded divide-y divide-border/40">
            {catalog.map(item => {
              const rows = itemsByKey[item.key] ?? [];
              if (item.repeatable) {
                return (
                  <RepeatableGroup
                    key={item.key}
                    item={item}
                    rows={rows}
                    onToggle={handleToggle}
                    onAdd={() => handleAddRepeatable(item.key)}
                    onAskDelete={(r, el) => { deleteTriggerRef.current = el ?? null; setDeleteTarget(r); }}
                    onDocUploaded={handleDocUploaded}
                    onDocRemove={handleDocRemove}
                  />
                );
              }
              const row = rows[0];
              return (
                <PersistedRow
                  key={item.key}
                  label={item.label}
                  row={row}
                  onToggle={row ? () => handleToggle(row) : () => handleEnsureRowThenToggle(item.key)}
                  onDocUploaded={(path) => row && handleDocUploaded(row, path)}
                  onDocRemove={() => row && handleDocRemove(row)}
                />
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title="Remove this checklist row?"
        description="The attached document (if any) stays in storage but is no longer linked from this row."
        onConfirm={performDelete}
      />
    </>
  );
}

// Counts toward "N of 3 complete":
//   • cv               — satisfied if a cv row exists with done=true
//   • references       — satisfied if at least one references row is done
//   • background_check — satisfied if a background_check row exists with done=true
// License/DEA are NOT counted here (those live in the credentialing summary).
function computeCompletion(itemsByKey) {
  const cv  = (itemsByKey.cv  ?? []).some(r => r.done);
  const bg  = (itemsByKey.background_check ?? []).some(r => r.done);
  const ref = (itemsByKey.references ?? []).some(r => r.done);
  return { complete: [cv, bg, ref].filter(Boolean).length, total: 3 };
}

// Calm/factual completion line — no alarm tone at 0 of 3, no
// celebration tone at 3 of 3. Bar fills proportionally; same colour
// throughout because the meaning is "how far through the list," not
// "is anything wrong."
function CompletionStatus({ complete, total }) {
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);
  return (
    <div className="flex flex-col items-center mb-4">
      <Progress value={pct} className="h-1 w-full max-w-[200px]" />
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim mt-2">
        {complete} of {total} complete
      </div>
    </div>
  );
}

// Single-persisted row — toggle + optional document control. The
// document UI is collapsed by default and revealed via an "+ Attach"
// button when no document is on file, to keep the row compact (the
// full DocumentUpload dropzone is ~112px tall).
function PersistedRow({ label, row, onToggle, onDocUploaded, onDocRemove }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const done = Boolean(row?.done);
  const hasDoc = Boolean(row?.document_path);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        className={cn(
          'w-7 h-7 inline-flex items-center justify-center rounded border flex-shrink-0 transition-colors mt-0.5',
          done
            ? 'border-income text-income bg-income/10'
            : 'border-border text-transparent hover:border-accent',
        )}
      >
        <Check className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn(
          'font-mono text-[11px] uppercase tracking-[0.12em]',
          done ? 'text-text' : 'text-text-dim',
        )}>
          {label}
        </div>
        {row && (
          <div className="mt-1.5">
            {hasDoc || uploadOpen ? (
              <DocumentUpload
                bucket="credentials"
                parentId={row.id}
                currentPath={row.document_path}
                onUploaded={(path) => { onDocUploaded(path); setUploadOpen(false); }}
                onRemove={() => { onDocRemove(); setUploadOpen(false); }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent transition-colors"
              >
                + Attach document
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Repeatable-item group — header row (catalog label) plus zero-to-many
// PersistedRow-like entries, plus an "+ Add another" button. Per-row
// delete is the trash icon on the right; ConfirmDeleteDialog is hoisted
// to the parent so a single instance handles every repeatable.
function RepeatableGroup({ item, rows, onToggle, onAdd, onAskDelete, onDocUploaded, onDocRemove }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-dim">
          {item.label}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent hover:text-accent-bright transition-colors"
        >
          <Plus className="w-3 h-3" strokeWidth={2} /> Add
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-2">
          None yet
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/30 border border-border/40 rounded">
          {rows.map((r, idx) => (
            <RepeatableRow
              key={r.id}
              row={r}
              indexLabel={`#${idx + 1}`}
              onToggle={() => onToggle(r)}
              onDocUploaded={(path) => onDocUploaded(r, path)}
              onDocRemove={() => onDocRemove(r)}
              onAskDelete={(el) => onAskDelete(r, el)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepeatableRow({ row, indexLabel, onToggle, onDocUploaded, onDocRemove, onAskDelete }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const done = Boolean(row.done);
  const hasDoc = Boolean(row.document_path);
  const deleteBtnRef = useRef(null);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        className={cn(
          'w-6 h-6 inline-flex items-center justify-center rounded border flex-shrink-0 transition-colors mt-0.5',
          done
            ? 'border-income text-income bg-income/10'
            : 'border-border text-transparent hover:border-accent',
        )}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn(
          'font-mono text-[10px] uppercase tracking-[0.12em]',
          done ? 'text-text' : 'text-text-dim',
        )}>
          {indexLabel}
        </div>
        <div className="mt-1.5">
          {hasDoc || uploadOpen ? (
            <DocumentUpload
              bucket="credentials"
              parentId={row.id}
              currentPath={row.document_path}
              onUploaded={(path) => { onDocUploaded(path); setUploadOpen(false); }}
              onRemove={() => { onDocRemove(); setUploadOpen(false); }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent transition-colors"
            >
              + Attach document
            </button>
          )}
        </div>
      </div>
      <button
        ref={deleteBtnRef}
        type="button"
        onClick={() => onAskDelete(deleteBtnRef.current)}
        aria-label="Remove row"
        className="text-text-muted hover:text-danger transition-colors flex-shrink-0 mt-0.5"
      >
        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </li>
  );
}
