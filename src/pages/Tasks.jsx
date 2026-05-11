import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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

const SORT_DEFAULT = 'default';
const SORT_NEWEST  = 'newest';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT, label: 'Due soonest'  },
  { value: SORT_NEWEST,  label: 'Newest first' },
];

// Chrome heights — bar 1 is owned by PageHeader (Slice 1, 58px).
// Bar 2 is the list subheader; bar 3 is the conditional search bar
// that appears below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

export default function Tasks() {
  const { user } = useAuth();
  const [tab, setTab] = useState(TAB_MY);
  const [search, setSearch]         = useState('');
  const [sort, setSort]             = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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

  // Tabs are a navigation/lens choice, not a filter — Clear leaves
  // them alone. Only sort + search reset.
  const filtersActive = sort !== SORT_DEFAULT;
  const searchActive  = search.trim().length > 0;
  const anyActive     = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setSort(SORT_DEFAULT);
  };

  useEffect(() => {
    if (!filterOpen && !searchOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (filterOpen) setFilterOpen(false);
      else if (searchOpen) setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterOpen, searchOpen]);

  const searchInputRef = useRef(null);
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? tasks.data.filter(t => t.title?.toLowerCase().includes(q))
      : tasks.data;
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [tasks.data, search, sort]);

  async function handleQuickComplete(taskId) {
    try {
      await tasks.quickComplete(taskId);
      toast.success('Task completed');
    } catch (err) {
      console.error('quickComplete', err);
      toast.error(err?.message || 'Could not complete task');
    }
  }

  const bodyPaddingTop =
    `calc(${BAR1_H + BAR2_H + (searchOpen ? BAR3_H : 0)}px + env(safe-area-inset-top))`;

  return (
    <>
      {/* Bar 2 — list subheader */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface"
        style={{ top: `calc(${BAR1_H}px + env(safe-area-inset-top))` }}
      >
        <div className="flex items-center justify-between gap-3 px-6 h-14">
          <div className="min-w-0">
            <h1 className="font-display text-[18px] sm:text-[22px] text-text leading-none truncate">
              Tasks
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Day-to-day follow-up
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {anyActive && (
              <button
                type="button"
                onClick={clearAll}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim hover:text-accent px-2 transition-colors"
              >
                Clear
              </button>
            )}
            <IconBtn
              onClick={() => setSearchOpen(o => !o)}
              active={searchOpen || searchActive}
              ariaLabel="Search"
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
            <IconBtn
              onClick={() => setFilterOpen(true)}
              active={filtersActive}
              ariaLabel="Filter"
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
            <IconBtn
              onClick={() => setCreateOpen(true)}
              ariaLabel="New task"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
          </div>
        </div>
      </div>

      {/* Bar 3 — conditional search bar */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface overflow-hidden transition-[height] duration-300 ease-out"
        style={{
          top: `calc(${BAR1_H + BAR2_H}px + env(safe-area-inset-top))`,
          height: searchOpen ? `${BAR3_H}px` : '0px',
          borderBottomWidth: searchOpen ? '1px' : '0px',
        }}
      >
        <div className="flex items-center gap-2 px-6 h-[52px]">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="bg-transparent border-0 text-text focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 px-0 h-9 shadow-none"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="text-text-dim hover:text-accent transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="min-h-full pb-12 px-6 transition-[padding] duration-300 ease-out"
        style={{ paddingTop: bodyPaddingTop }}
      >
        <div className="max-w-6xl mx-auto py-8">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-surface border border-border mb-4">
              <TabsTrigger value={TAB_MY}>My open</TabsTrigger>
              <TabsTrigger value={TAB_ALL}>All open</TabsTrigger>
              <TabsTrigger value={TAB_DONE}>Completed (30d)</TabsTrigger>
            </TabsList>

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
      </div>

      {/* Filter panel */}
      {createPortal(
        <>
          <div
            className={cn(
              'fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm transition-opacity',
              filterOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            onClick={() => setFilterOpen(false)}
          />
          <aside
            className="fixed top-0 h-full z-[400] flex flex-col border-l border-border bg-surface transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: FILTER_PANEL_W,
              right: filterOpen ? 0 : -FILTER_PANEL_W,
              paddingTop: 'calc(58px + env(safe-area-inset-top))',
            }}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-surface2">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
                Filters
              </span>
              <div className="flex items-center gap-3">
                {anyActive && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim hover:text-accent transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  aria-label="Close filters"
                  className="text-text-muted hover:text-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
              <FilterRow label="Sort">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
            </div>
          </aside>
        </>,
        document.body,
      )}

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
    </>
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

function IconBtn({ children, onClick, active = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex items-center justify-center w-9 h-9 border rounded cursor-pointer flex-shrink-0 transition-colors',
        active
          ? 'bg-accent-dim border-accent text-accent'
          : 'bg-surface border-border text-text-dim hover:border-accent hover:bg-accent-dim hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
