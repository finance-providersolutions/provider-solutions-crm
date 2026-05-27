import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import TaskCard from '@/components/tasks/TaskCard';
import { useTasks } from '@/hooks/useTasks';

// Reusable parent-scoped task list for embedding in detail pages.
//
// Props:
//   parentColumn   — 'organization_id' | 'opportunity_id' | 'provider_id'
//   parentId       — UUID of the current record
//   parentLabel    — display string used in the locked TaskFormDialog
//                    create flow (e.g., "Birmingham Grandview")
//
// Renders open tasks for the parent by default. A "Show completed"
// toggle reveals the last-30-days completed tasks for the same parent
// below a separator. Open and completed are two independent useTasks
// instances; both run on mount but the completed query's results are
// only rendered when the toggle is on.
//
// CARD LAYOUT (cluster-A universal): uses the shared TaskCard with
// hideParent={true}. The parent column collapses because the parent
// IS the page — we already know whose tasks these are. Mobile becomes
// three rows (priority+actions / title / due+status); the wide layout
// drops the left cluster and the center cluster reclaims that space.
// Replaced the table-based TaskMiniTable that lived here previously.
//
// "+ New task" opens TaskFormDialog with the parent locked to the
// current resource type and record. The locked display in the dialog
// removes the radio + picker entirely — the user can't change parent
// type or record from this entry point. Editing existing tasks goes
// through the same dialog without the lock so re-parenting works.
//
// "View all tasks" routes to /tasks, the global list. Lives in the
// same control row as "+ New task" — same outline-treatment Button.
// Cluster-A universal: every detail-page Tasks section carries a
// "View all" affordance routing to its global archive.
export default function TasksSection({ parentColumn, parentId, parentLabel }) {
  const navigate = useNavigate();
  const filterKey = parentColumnToFilterKey(parentColumn);
  const [showCompleted, setShowCompleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef = useRef(null);

  const openFilter = useMemo(
    () => ({ [filterKey]: parentId, status: 'open' }),
    [filterKey, parentId],
  );
  const completedFilter = useMemo(
    () => ({ [filterKey]: parentId, status: 'completed', completedSinceDays: 30 }),
    [filterKey, parentId],
  );

  const openTasks      = useTasks(openFilter);
  const completedTasks = useTasks(completedFilter);

  // Sort by due_date ascending (overdue first → today → future →
  // null), preserving the hook's tiebreaker on created_at desc.
  const sortedOpen = useMemo(() => {
    const rows = [...openTasks.data];
    rows.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    return rows;
  }, [openTasks.data]);

  async function handleQuickComplete(taskId) {
    try {
      await openTasks.quickComplete(taskId);
      toast.success('Task completed');
    } catch (err) {
      console.error('quickComplete', err);
      toast.error(err?.message || 'Could not complete task');
    }
  }

  return (
    <>
      {/* Control row — "Show completed" toggle on the left, action
          cluster (View all + New task) on the right. ml-auto on the
          action cluster keeps it right-aligned even when the row
          wraps on narrow viewports (justify-between would left-align
          the cluster on its own wrapped row). Both buttons share the
          same outline treatment to read as a peer pair. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button
          type="button"
          onClick={() => setShowCompleted(s => !s)}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent transition-colors"
        >
          {showCompleted ? 'Hide completed' : 'Show completed (30d)'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            onClick={() => navigate('/tasks')}
            variant="outline"
            className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
          >
            View all <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            variant="outline"
            className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New task
          </Button>
        </div>
      </div>

      <TaskCardStack
        rows={sortedOpen}
        loading={openTasks.loading}
        error={openTasks.error}
        emptyText={emptyOpenTextFor(parentColumn)}
        showQuickComplete
        onOpen={(row) => navigate(`/tasks/${row.id}`)}
        onEdit={setEditing}
        onDelete={(row, triggerEl) => {
          deleteTriggerRef.current = triggerEl ?? null;
          setDeleteTarget(row);
        }}
        onQuickComplete={handleQuickComplete}
      />

      {showCompleted && (
        <div className="mt-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-2 border-t border-border/40 pt-4">
            Completed in last 30 days
          </div>
          <TaskCardStack
            rows={completedTasks.data}
            loading={completedTasks.loading}
            error={completedTasks.error}
            emptyText="None completed in the last 30 days."
            showQuickComplete={false}
            onOpen={(row) => navigate(`/tasks/${row.id}`)}
            onEdit={setEditing}
            onDelete={(row, triggerEl) => {
              deleteTriggerRef.current = triggerEl ?? null;
              setDeleteTarget(row);
            }}
            onQuickComplete={handleQuickComplete}
          />
        </div>
      )}

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockedParentColumn={parentColumn}
        lockedParentId={parentId}
        lockedParentLabel={parentLabel}
        onSave={(payload) => openTasks.create(payload)}
      />

      <TaskFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        task={editing}
        onSave={async (payload) => {
          await openTasks.update(editing.id, payload);
        }}
        onDeleted={async (id) => {
          // Two parallel useTasks instances — remove via one,
          // then refetch the other so a deleted completed-task
          // disappears from the toggle-on view too.
          await openTasks.remove(id);
          await completedTasks.refetch();
          setEditing(null);
        }}
      />

      {/* List-context Delete from the card kebab. The Edit dialog
          continues to carry its own in-dialog Delete; this confirm
          dialog handles direct kebab-delete without opening Edit. */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete "${deleteTarget.title || 'this task'}"?`
          : 'Delete?'}
        onConfirm={async () => {
          try {
            await openTasks.remove(deleteTarget.id);
            await completedTasks.refetch();
            setDeleteTarget(null);
          } catch (err) {
            console.error('Task delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

// Card stack renderer — replaces the table-based TaskMiniTable that
// lived here previously. Loading / error / empty states keep the
// plain-text shape (no card wrapper) that the cluster-A empty-state
// universal already established. Only the populated case changes:
// stacked TaskCards (hideParent={true}) instead of table rows.
function TaskCardStack({
  rows, loading, error, emptyText, showQuickComplete,
  onOpen, onEdit, onDelete, onQuickComplete,
}) {
  if (loading) {
    return (
      <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-danger">
        {error.message}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map(t => (
        <TaskCard
          key={t.id}
          task={t}
          hideParent
          showQuickComplete={showQuickComplete}
          onOpen={() => onOpen(t)}
          onEdit={() => onEdit(t)}
          onDelete={(triggerEl) => onDelete(t, triggerEl)}
          onQuickComplete={() => onQuickComplete(t.id)}
        />
      ))}
    </div>
  );
}

function parentColumnToFilterKey(parentColumn) {
  if (parentColumn === 'organization_id') return 'organizationId';
  if (parentColumn === 'opportunity_id')  return 'opportunityId';
  if (parentColumn === 'provider_id')     return 'providerId';
  throw new Error(`TasksSection: unsupported parentColumn '${parentColumn}'`);
}

function emptyOpenTextFor(parentColumn) {
  if (parentColumn === 'organization_id') return 'No open tasks for this organization.';
  if (parentColumn === 'opportunity_id')  return 'No open tasks for this opportunity.';
  return 'No open tasks for this provider.';
}
