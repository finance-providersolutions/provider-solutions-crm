import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { TASK_PRIORITIES, TASK_STATUSES, labelFor } from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';

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

const TAB_MY     = 'my-open';
const TAB_ALL    = 'all-open';
const TAB_DONE   = 'completed';

export default function Tasks() {
  const { user } = useAuth();
  const [tab, setTab] = useState(TAB_MY);
  const [search, setSearch]       = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]       = useState(null);

  // Each tab fetches its own slice via filter params. Filters change
  // → useTasks refetches. Three tabs, three live queries when active —
  // task volumes are small enough that running one query per tab
  // change is fine.
  const filters = useMemo(() => {
    if (tab === TAB_MY)   return { assigneeId: user?.id, status: 'open' };
    if (tab === TAB_ALL)  return { status: 'open' };
    return { status: 'completed', completedSinceDays: 30 };
  }, [tab, user?.id]);

  const tasks = useTasks(filters);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks.data;
    return tasks.data.filter(t => t.title?.toLowerCase().includes(q));
  }, [tasks.data, search]);

  async function handleQuickComplete(taskId) {
    try {
      await tasks.quickComplete(taskId);
      toast.success('Task completed');
    } catch (err) {
      console.error('quickComplete', err);
      toast.error(err?.message || 'Could not complete task');
    }
  }

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl text-text leading-none mb-2">Tasks</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Day-to-day follow-up
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New task
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <TabsList className="bg-surface border border-border">
              <TabsTrigger value={TAB_MY}>My open</TabsTrigger>
              <TabsTrigger value={TAB_ALL}>All open</TabsTrigger>
              <TabsTrigger value={TAB_DONE}>Completed (30d)</TabsTrigger>
            </TabsList>
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title…"
                className="bg-surface border-border text-text pl-9"
              />
            </div>
          </div>

          {[TAB_MY, TAB_ALL, TAB_DONE].map(t => (
            <TabsContent key={t} value={t}>
              <TaskTable
                rows={rows}
                loading={tasks.loading}
                error={tasks.error}
                tab={t}
                emptyText={emptyTextFor(t)}
                onEdit={(row) => setEditing(row)}
                onQuickComplete={handleQuickComplete}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(payload) => tasks.create(payload)}
      />

      <TaskFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        task={editing}
        onSave={async (payload) => {
          await tasks.update(editing.id, payload);
        }}
        onDeleted={async (id) => {
          await tasks.remove(id);
          setEditing(null);
        }}
      />
    </div>
  );
}

function TaskTable({ rows, loading, error, tab, emptyText, onEdit, onQuickComplete }) {
  const showQuickComplete = tab !== TAB_DONE;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  return (
    <div className="bg-surface border border-border rounded relative overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Title</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Due</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Priority</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Parent</TableHead>
            <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Status</TableHead>
            {showQuickComplete && <TableHead className="w-[60px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow><TableCell colSpan={showQuickComplete ? 6 : 5} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
          )}
          {!loading && error && (
            <TableRow><TableCell colSpan={showQuickComplete ? 6 : 5} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
          )}
          {!loading && !error && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showQuickComplete ? 6 : 5} className="text-center py-12 text-text-dim">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {!loading && !error && rows.map(t => {
            const overdue = t.status === 'open' && t.due_date && t.due_date < today;
            const parent = parentInfo(t);
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
                  {parent ? (
                    <div>
                      {parent.href ? (
                        <Link to={parent.href} className="text-text hover:text-accent" onClick={(e) => e.stopPropagation()}>
                          {parent.name}
                        </Link>
                      ) : (
                        <span className="text-text">{parent.name}</span>
                      )}
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        {parent.type}
                      </div>
                    </div>
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

function parentInfo(task) {
  if (task.opportunity) {
    const name = task.opportunity.title || task.opportunity.name || 'Untitled';
    return { type: 'OPPORTUNITY', name, href: `/opportunities/${task.opportunity.id}` };
  }
  if (task.organization) {
    return { type: 'ORGANIZATION', name: task.organization.name, href: `/organizations/${task.organization.id}` };
  }
  if (task.provider) {
    const name = [task.provider.first_name, task.provider.last_name].filter(Boolean).join(' ') || 'Unnamed';
    return { type: 'PROVIDER', name, href: `/providers/${task.provider.id}` };
  }
  return null;
}

function emptyTextFor(t) {
  if (t === TAB_MY)  return 'No open tasks assigned to you. All caught up.';
  if (t === TAB_ALL) return 'No open tasks across the team.';
  return 'No tasks completed in the last 30 days.';
}
