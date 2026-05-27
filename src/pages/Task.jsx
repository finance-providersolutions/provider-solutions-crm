import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTask, useTasks } from '@/hooks/useTasks';
import { TASK_PRIORITIES, TASK_STATUSES, labelFor } from '@/utils/constants';
import { fmtDate, fmtDateTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Slice 4 minimal-mirror-Provider detail page for tasks.
// Header has no thumb (tasks carry no image). Two delete paths
// would be a UX bug, so TaskFormDialog opened from here gets
// `hideDeleteAction` and the page-level Delete at the bottom is
// the sole affordance.

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

export default function Task() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: task, loading, error, refetch } = useTask(id);
  const { update, remove } = useTasks();

  const [editOpen, setEditOpen]                 = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteTaskTriggerRef = useRef(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function performDelete() {
    if (!task) return;
    try {
      await remove(task.id);
      toast.success('Task deleted');
      navigate('/tasks');
    } catch (err) {
      console.error('delete task', err);
      toast.error(err?.message || 'Could not delete');
      throw err;
    }
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (error)   return <Centered tone="danger">{error.message}</Centered>;
  if (!task)   return <Centered>Task not found.</Centered>;

  const overdue = task.status === 'open' && task.due_date && task.due_date < today;
  const parent  = parentInfo(task);
  const assigneeLabel =
    task.assignee_id == null
      ? 'Unassigned'
      : task.assignee_id === user?.id
        ? 'Assigned to you'
        : 'Other user';

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All tasks
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <h1 className="font-display text-4xl text-text leading-tight mb-2 break-words">
              {task.title || '—'}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {task.priority && (
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', PRIORITY_BADGE[task.priority])}>
                  {labelFor(TASK_PRIORITIES, task.priority)}
                </Badge>
              )}
              {task.status && (
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[task.status])}>
                  {labelFor(TASK_STATUSES, task.status)}
                </Badge>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Created {fmtDateTime(task.created_at)}
              </span>
            </div>
          </div>
          <Button
            onClick={() => setEditOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>

        <SectionHeader text="Details" first />
        <div className="bg-surface border border-border rounded p-6 mb-10
                        relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                        after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
          <DetailGrid>
            <DetailField label="Due">
              {task.due_date ? (
                <span className={cn(
                  overdue
                    ? 'text-danger'
                    : task.status === 'completed'
                      ? 'text-text-muted'
                      : 'text-text',
                )}>
                  {fmtDate(task.due_date)}
                  {overdue && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em]">Overdue</span>}
                </span>
              ) : <Empty />}
            </DetailField>
            <DetailField label="Assignee">
              <span className={cn(assigneeLabel === 'Unassigned' ? 'text-text-muted' : 'text-text')}>
                {assigneeLabel}
              </span>
            </DetailField>
            <DetailField label="Parent" full>
              {parent ? (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1">
                    {parent.type}
                  </div>
                  {parent.href
                    ? <Link to={parent.href} className="text-accent hover:text-accent-bright">{parent.name}</Link>
                    : <span className="text-text">{parent.name}</span>}
                  {parent.hospital && (
                    <div className="mt-1 font-mono text-[11px] text-text-dim">
                      at {parent.hospital}
                    </div>
                  )}
                </div>
              ) : <Empty />}
            </DetailField>
            <DetailField label="Notes" full>
              {task.description
                ? <p className="text-text whitespace-pre-wrap">{task.description}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        </div>

        <div className="border-t border-border/50 pt-6">
          <Button
            ref={deleteTaskTriggerRef}
            onClick={() => setConfirmDeleteOpen(true)}
            variant="ghost"
            className="text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete task
          </Button>
        </div>
      </div>

      {/* Edit dialog. hideDeleteAction suppresses the in-dialog Delete
          because the page-level Delete below is the canonical
          affordance from this entry point. */}
      <TaskFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        task={task}
        hideDeleteAction
        onSave={async (payload) => {
          await update(task.id, payload);
          await refetch();
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteTaskTriggerRef}
        title={task ? `Delete "${task.title || 'this task'}"?` : 'Delete?'}
        onConfirm={performDelete}
      />
    </div>
  );
}

function parentInfo(task) {
  if (task.opportunity) {
    const name = task.opportunity.title || task.opportunity.name || 'Untitled';
    const hospital = task.opportunity.organization?.name || null;
    return { type: 'OPPORTUNITY', name, hospital, href: `/opportunities/${task.opportunity.id}` };
  }
  if (task.organization) {
    return { type: 'ORGANIZATION', name: task.organization.name, hospital: null, href: `/organizations/${task.organization.id}` };
  }
  if (task.provider) {
    const name = [task.provider.first_name, task.provider.last_name].filter(Boolean).join(' ') || 'Unnamed';
    return { type: 'PROVIDER', name, hospital: null, href: `/providers/${task.provider.id}` };
  }
  return null;
}

// Horizontal label-value Details grid — matches Provider / Org /
// Opp / Contact. Task's Details still sits inside the older
// bg-surface card wrapper + SectionHeader (the
// DetailsCollapsibleHeader migration is a separate cluster-A
// decision). The DetailGrid shape inside the wrapper is the same
// horizontal pattern.
function DetailGrid({ children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
      {children}
    </div>
  );
}

function DetailField({ label, full = false, children }) {
  return (
    <div className={cn(
      'flex items-baseline gap-3 min-w-0',
      full && 'md:col-span-2',
    )}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted w-32 flex-shrink-0 leading-snug">
        {label}
      </div>
      <div className="text-text text-sm leading-snug flex-1 min-w-0 break-words">
        {children}
      </div>
    </div>
  );
}

function Empty() { return <span className="text-text-muted">—</span>; }

function Centered({ children, tone }) {
  return (
    <div className="min-h-full flex items-center justify-center" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className={cn(
        'font-mono text-sm uppercase tracking-[0.12em]',
        tone === 'danger' ? 'text-danger' : 'text-text-dim',
      )}>
        {children}
      </div>
    </div>
  );
}
