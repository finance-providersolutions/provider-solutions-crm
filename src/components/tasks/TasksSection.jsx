import { useMemo, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { useTasks } from '@/hooks/useTasks';
import { TASK_PRIORITIES, TASK_STATUSES, labelFor } from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Same badge palettes as Tasks.jsx — duplicated rather than lifted
// to constants because two consumers don't earn the extraction yet
// (per BUILD_PLAN §8).
const PRIORITY_BADGE = {
  low:    'bg-surface2   text-text-muted border-border',
  normal: 'bg-surface2   text-text-dim   border-border',
  high:   'bg-warning/15 text-warning    border-warning/40',
};
const STATUS_BADGE = {
  open:      'bg-accent-dim text-accent      border-accent/40',
  completed: 'bg-income/15  text-income      border-income/40',
  cancelled: 'bg-surface2   text-text-muted  border-border',
};

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
// "+ New task" opens TaskFormDialog with the parent locked to the
// current resource type and record. The locked display in the dialog
// removes the radio + picker entirely — the user can't change parent
// type or record from this entry point. Editing existing tasks goes
// through the same dialog without the lock so re-parenting works.
export default function TasksSection({ parentColumn, parentId, parentLabel }) {
  const filterKey = parentColumnToFilterKey(parentColumn);
  const [showCompleted, setShowCompleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setShowCompleted(s => !s)}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent transition-colors"
        >
          {showCompleted ? 'Hide completed' : 'Show completed (30d)'}
        </button>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          variant="outline"
          className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
        >
          <Plus className="w-4 h-4 mr-1" /> New task
        </Button>
      </div>

      <TaskMiniTable
        rows={sortedOpen}
        loading={openTasks.loading}
        error={openTasks.error}
        emptyText={emptyOpenTextFor(parentColumn)}
        showQuickComplete
        onEdit={setEditing}
        onQuickComplete={handleQuickComplete}
      />

      {showCompleted && (
        <div className="mt-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-2 border-t border-border/40 pt-4">
            Completed in last 30 days
          </div>
          <TaskMiniTable
            rows={completedTasks.data}
            loading={completedTasks.loading}
            error={completedTasks.error}
            emptyText="None completed in the last 30 days."
            showQuickComplete={false}
            onEdit={setEditing}
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
    </>
  );
}

function TaskMiniTable({ rows, loading, error, emptyText, showQuickComplete, onEdit, onQuickComplete }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  return (
    <div className="bg-surface border border-border rounded relative overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Title</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Due</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Priority</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Status</TableHead>
            {showQuickComplete && <TableHead className="w-[60px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow><TableCell colSpan={showQuickComplete ? 5 : 4} className="text-center text-text-muted py-8 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
          )}
          {!loading && error && (
            <TableRow><TableCell colSpan={showQuickComplete ? 5 : 4} className="text-center text-danger py-8 font-mono text-xs">{error.message}</TableCell></TableRow>
          )}
          {!loading && !error && rows.length === 0 && (
            <TableRow><TableCell colSpan={showQuickComplete ? 5 : 4} className="text-center py-8 text-text-dim">{emptyText}</TableCell></TableRow>
          )}
          {!loading && !error && rows.map(t => {
            const overdue = t.status === 'open' && t.due_date && t.due_date < today;
            return (
              <TableRow key={t.id} className="border-border hover:bg-surface2 transition-colors">
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    className="text-text font-medium text-left hover:text-accent transition-colors"
                  >
                    {t.title}
                  </button>
                </TableCell>
                <TableCell className={cn(
                  'font-mono text-xs',
                  overdue ? 'text-danger' : t.status === 'completed' ? 'text-text-muted' : 'text-text-dim',
                )}>
                  {t.due_date ? fmtDate(t.due_date) : <span className="text-text-muted">—</span>}
                </TableCell>
                <TableCell>
                  {t.priority ? (
                    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', PRIORITY_BADGE[t.priority])}>
                      {labelFor(TASK_PRIORITIES, t.priority)}
                    </Badge>
                  ) : <span className="text-text-muted">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[t.status])}>
                    {labelFor(TASK_STATUSES, t.status)}
                  </Badge>
                </TableCell>
                {showQuickComplete && (
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onQuickComplete(t.id)}
                      aria-label="Mark complete"
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-border text-text-muted hover:border-income hover:text-income transition-colors"
                    >
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
  // Per the brief's stopping point: "If TasksSection's empty state
  // copy needs different wording for organization vs opportunity vs
  // provider parents, pick natural copy per parentColumn." Going
  // generic-by-resource ('organization') rather than type-specific
  // ('hospital'), since organizations.type can be hospital, partner,
  // or other and the section isn't filtered by type.
  if (parentColumn === 'organization_id') return 'No open tasks for this organization.';
  if (parentColumn === 'opportunity_id')  return 'No open tasks for this opportunity.';
  return 'No open tasks for this provider.';
}
