import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CardKebab } from '@/components/ui/card-kebab';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { TASK_PRIORITIES, TASK_STATUSES, labelFor } from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Slice 4 card swap. Same two-layout responsive shape as the
// Opportunities card with one deliberate per-page variation: no
// left-anchored logo slot, because tasks carry no identity image
// and forcing a parent thumb or typed icon adds chrome without
// payoff. Meta block claims full card width on both layouts.
//
// Per-card affordances:
//   - quick-complete checkbox (open tabs only), 36×36 hit area
//   - kebab → Edit / Delete (list-context, dialog Delete remains)
//   - whole card → /tasks/:id detail page
//
// Priority is mono text (not a badge); high gets text-warning for
// visual emphasis. Status keeps the badge treatment as the
// state-shaped attribute. No tasks-pill equivalent — tasks ARE
// the content, no parent-scoped count.

const PRIORITY_TEXT = {
  low:    'text-text-muted',
  normal: 'text-text-dim',
  high:   'text-warning',
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
  const navigate = useNavigate();
  const [tab, setTab] = useState(TAB_MY);
  const [search, setSearch]         = useState('');
  const [sort, setSort]             = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef = useRef(null);
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
                <TaskCardList
                  rows={rows}
                  loading={tasks.loading}
                  error={tasks.error}
                  tab={t}
                  emptyText={emptyTextFor(t)}
                  onOpen={(row) => navigate(`/tasks/${row.id}`)}
                  onEdit={(row) => setEditing(row)}
                  onDelete={(row, triggerEl) => {
                    deleteTriggerRef.current = triggerEl;
                    setDeleteTarget(row);
                  }}
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
              'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity',
              filterOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            onClick={() => setFilterOpen(false)}
          />
          <aside
            className="fixed top-0 h-full z-50 flex flex-col border-l border-border bg-surface transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
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

      {/* Edit dialog driven by the card kebab. Opened from a list
          context — dialog Delete stays visible (no
          hideDeleteAction). */}
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

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete "${deleteTarget.title || 'this task'}"?`
          : 'Delete?'}
        onConfirm={async () => {
          try {
            await tasks.remove(deleteTarget.id);
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

function TaskCardList({ rows, loading, error, tab, emptyText, onOpen, onEdit, onDelete, onQuickComplete }) {
  const showQuickComplete = tab !== TAB_DONE;

  if (loading) {
    return (
      <EmptyContainer>
        <div className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">Loading…</div>
      </EmptyContainer>
    );
  }
  if (error) {
    return (
      <EmptyContainer>
        <div className="text-danger font-mono text-xs">{error.message}</div>
      </EmptyContainer>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyContainer>
        <div className="text-text-dim font-mono text-xs uppercase tracking-[0.1em]">{emptyText}</div>
      </EmptyContainer>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map(t => (
        <TaskCard
          key={t.id}
          task={t}
          showQuickComplete={showQuickComplete}
          onOpen={() => onOpen(t)}
          onEdit={() => onEdit(t)}
          onDelete={(triggerEl) => onDelete(t, triggerEl)}
          onQuickComplete={() => onQuickComplete(t.id)}
        />
      ))}
      <div className="mt-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  );
}

// Two-layout responsive card, no logo slot (per-page variation —
// tasks have no identity image). Same asymmetric vertical rhythm
// pattern as Opportunities cards (negative top margin on the
// font-display title, leading-none compensations).
//
// Mobile (below md): four rows full-width.
//   row 1 — priority (mono text, conditional color) + quick-complete
//           + kebab, right-aligned
//   row 2 — title (accent teal, font-display, primary)
//   row 3 — parent type + name (white sans), "No parent" muted when null
//   row 4 — due date (overdue/completed treatments) + status badge
//
// Wide (md+): single horizontal row.
//   left cluster   — parent type mono cap-label / parent name
//   center cluster — priority text / title (accent teal, larger)
//   right cluster  — quick-complete + kebab on top / due + status badge below
function TaskCard({ task: t, showQuickComplete, onOpen, onEdit, onDelete, onQuickComplete }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdue = t.status === 'open' && t.due_date && t.due_date < today;
  const parent = parentInfo(t);

  const priorityNode = t.priority ? (
    <span className={cn(
      'font-mono text-[11px] uppercase tracking-[0.12em]',
      PRIORITY_TEXT[t.priority] || 'text-text-dim',
    )}>
      {labelFor(TASK_PRIORITIES, t.priority)} priority
    </span>
  ) : null;

  const statusBadge = t.status ? (
    <Badge variant="outline" className={cn('flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[t.status])}>
      {labelFor(TASK_STATUSES, t.status)}
    </Badge>
  ) : null;

  const dueText = t.due_date ? fmtDate(t.due_date) : null;
  const dueClass = overdue
    ? 'text-danger font-medium'
    : t.status === 'completed'
      ? 'text-text-muted'
      : 'text-text-dim';

  const actionsCluster = (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {showQuickComplete && (
        <QuickCompleteButton onClick={onQuickComplete} />
      )}
      <CardKebab ariaLabel="Task actions" onEdit={onEdit} onDelete={onDelete} />
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="relative bg-surface border border-border rounded p-3 md:p-5 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex flex-col">
        {/* Row 1 — priority mono text + quick-complete + kebab */}
        <div className="flex items-center gap-2 min-w-0">
          <p className="flex-1 min-w-0 leading-none truncate">
            {priorityNode || <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">—</span>}
          </p>
          {actionsCluster}
        </div>
        {/* Row 2 — title (accent teal, primary). Negative top margin
            compensates for DM Serif Display's intrinsic line-box
            padding above the cap-height (matches Opportunities). */}
        <h3 className="-mt-1 font-display text-[18px] text-accent leading-none break-words">
          {t.title || '—'}
        </h3>
        {/* Row 3 — parent identification block. mt-3 creates the
            disproportionate title-to-parent break — visibly the
            largest gap on the card. Three sub-rows:
              3a — parent type label (mono cap) on its own line
              3b — parent name (white sans)
              3c — "at {hospital}" sub-line, opportunity parents
                   only, in muted mono. The opportunity title alone
                   rarely identifies which hospital the task belongs
                   to, so the hospital surfaces as contextual depth.
            Parentless tasks render a single italic "— No parent". */}
        <div className="mt-3 min-w-0">
          {parent ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted leading-none truncate">
                {parent.type}
              </p>
              <p className="mt-1 text-text text-[15px] font-medium leading-none truncate">
                {parent.name}
              </p>
              {parent.hospital && (
                <p className="mt-1 font-mono text-[11px] text-text-dim leading-none truncate">
                  at {parent.hospital}
                </p>
              )}
            </>
          ) : (
            <p className="text-text-muted text-[14px] italic leading-none">
              — No parent
            </p>
          )}
        </div>
        {/* Row 4 — due date + status badge. mt-1 keeps tight under row 3. */}
        <div className="mt-1 flex items-center gap-2 min-w-0">
          <p className={cn('flex-1 min-w-0 font-mono text-[13px] leading-none truncate', dueClass)}>
            {dueText ? (overdue ? `Due ${dueText} · Overdue` : `Due ${dueText}`) : 'No due date'}
          </p>
          {statusBadge}
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-center gap-5">
        {/* Left cluster — parent type / parent name / optional
            "at {hospital}" sub-line for opportunity parents. Three
            stacked lines matching the mobile parent block above. */}
        <div className="min-w-0 basis-1/3 flex flex-col gap-0.5">
          {parent ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted leading-snug truncate">
                {parent.type}
              </p>
              <p className="text-text text-[16px] lg:text-[17px] font-medium leading-tight truncate">
                {parent.name}
              </p>
              {parent.hospital && (
                <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-snug truncate">
                  at {parent.hospital}
                </p>
              )}
            </>
          ) : (
            <p className="text-text-muted text-[15px] italic leading-snug">
              — No parent
            </p>
          )}
        </div>

        {/* Center cluster — priority mono text + title */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {priorityNode && (
            <p className="leading-snug truncate">{priorityNode}</p>
          )}
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {t.title || '—'}
          </h3>
        </div>

        {/* Right indicator cluster — actions on top, due + status below */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {actionsCluster}
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[12px]', dueClass)}>
              {dueText ? (overdue ? `Due ${dueText} · Overdue` : `Due ${dueText}`) : 'No due date'}
            </span>
            {statusBadge}
          </div>
        </div>
      </div>
    </div>
  );
}

// 36×36 hit area to match the chrome-strip floor inherited from
// Slice 1. The visible check tile inside is 28×28, but the button
// itself fills the larger box so thumb taps on phones reliably hit
// it. Stops propagation so the card's onClick doesn't fire under
// the tap.
function QuickCompleteButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="Mark complete"
      className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded text-text-muted hover:text-income hover:bg-income/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-income"
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded border border-border">
        <Check className="w-4 h-4" strokeWidth={2.5} />
      </span>
    </button>
  );
}

function EmptyContainer({ children }) {
  return (
    <div className="bg-surface border border-border rounded flex flex-col items-center justify-center text-center px-6 py-20 min-h-[240px]">
      {children}
    </div>
  );
}

function parentInfo(task) {
  if (task.opportunity) {
    const name = task.opportunity.title || task.opportunity.name || 'Untitled';
    // hospital surfaces only when the parent is an opportunity —
    // organization parents ARE the hospital, provider parents have
    // no hospital concept.
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
