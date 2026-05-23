import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CardKebab } from '@/components/ui/card-kebab';
import Thumb from '@/components/uploads/Thumb';
import ProviderFormDialog from '@/components/providers/ProviderFormDialog';
import { useProviders } from '@/hooks/useProviders';
import { useTasks } from '@/hooks/useTasks';
import {
  POSITION_TYPES, PROVIDER_STATUSES, SPECIALTIES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { fmtName } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Status pill colors. Target is pre-engagement (muted); the in-funnel
// stages share the accent treatment; active is the only "currently
// in revenue" green; inactive and declined both mute (declined =
// they walked on their own, not a failure state); disqualified is
// the only danger tone (we screened them out). The visual split
// between declined and disqualified is load-bearing — both render
// in lists, cards, and the detail header, and at-a-glance read is
// the point. Same shape and tokens as Organizations.jsx TYPE_BADGE.
export const STATUS_BADGE = {
  target:       'bg-surface2   text-text-muted border-border',
  lead:         'bg-accent-dim text-accent border-accent/40',
  contacted:    'bg-accent-dim text-accent border-accent/40',
  interested:   'bg-accent-dim text-accent border-accent/40',
  interviewing: 'bg-accent-dim text-accent border-accent/40',
  onboarding:   'bg-accent-dim text-accent border-accent/40',
  active:       'bg-income/15  text-income border-income/40',
  inactive:     'bg-surface2   text-text-dim border-border',
  declined:     'bg-surface2   text-text-dim border-border',
  disqualified: 'bg-danger/15  text-danger border-danger/40',
};

// Safety net for any status value not present in STATUS_BADGE —
// covers two cases: (1) live rows still holding the removed
// `credentialed` value until the reassignment SQL runs, and
// (2) future schema drift if a new status is added to the constant
// without a matching badge entry. The neutral surface tone keeps
// the row readable without inventing semantic meaning.
export const STATUS_BADGE_FALLBACK = 'bg-surface2 text-text-muted border-border';

const SORT_DEFAULT = 'default';
const SORT_NEWEST  = 'newest';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT, label: 'Name (A→Z)' },
  { value: SORT_NEWEST,  label: 'Newest first'    },
];

// Chrome heights — bar 1 is owned by PageHeader (Slice 1, 58px).
// Bar 2 is the list subheader; bar 3 is the conditional search bar
// that appears below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

export default function Providers() {
  const navigate = useNavigate();
  const { data, loading, error, create, update, remove } = useProviders();
  // Single batched fetch of all open tasks (same pattern as
  // Opportunities). Bucketed below into a per-provider
  // {count, hasOverdue} map so each card reads its count from local
  // state — no per-card query, no N+1.
  const openTasks = useTasks({ status: 'open' });

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatus]         = useState('all');
  const [specialtyFilter, setSpecialty]   = useState('all');
  const [showArchived, setShowArchived]   = useState(false);
  const [sort, setSort]                   = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen]       = useState(false);
  const [editTarget, setEditTarget]       = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const deleteTriggerRef                  = useRef(null);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [filterOpen, setFilterOpen]       = useState(false);

  const filtersActive = statusFilter !== 'all'
    || specialtyFilter !== 'all'
    || showArchived
    || sort !== SORT_DEFAULT;
  const searchActive = search.trim().length > 0;
  const anyActive    = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setStatus('all');
    setSpecialty('all');
    setShowArchived(false);
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

  // Bucket open tasks by provider_id into Map<id, {count, hasOverdue}>.
  // Overdue = due_date strictly before today (date-only). Computed
  // once per openTasks.data change, not per card render.
  const taskSummaryByProviderId = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map();
    for (const t of openTasks.data) {
      if (!t.provider_id) continue;
      const prev = map.get(t.provider_id) || { count: 0, hasOverdue: false };
      prev.count += 1;
      if (t.due_date && t.due_date < today) prev.hasOverdue = true;
      map.set(t.provider_id, prev);
    }
    return map;
  }, [openTasks.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(p => {
      if (!showArchived && p.archived) return false;
      if (statusFilter    !== 'all' && p.status    !== statusFilter)    return false;
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (!q) return true;
      const haystack = [
        p.first_name, p.middle_name, p.last_name, p.suffix,
        p.email, p.npi, p.home_city, p.home_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [data, search, statusFilter, specialtyFilter, showArchived, sort]);

  async function handleArchiveToggle(p) {
    try {
      await update(p.id, { archived: !p.archived });
      toast.success(p.archived ? 'Provider unarchived' : 'Provider archived');
    } catch (err) {
      console.error('archive toggle', err);
      toast.error(err?.message || 'Could not update');
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
              Providers
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Supply pipeline · Recruiting through credentialed
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
              ariaLabel="New provider"
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
            placeholder="Search by name, email, NPI, city…"
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
          {loading && (
            <EmptyContainer>
              <div className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
                Loading…
              </div>
            </EmptyContainer>
          )}
          {!loading && error && (
            <EmptyContainer>
              <div className="text-danger font-mono text-xs">{error.message}</div>
            </EmptyContainer>
          )}
          {!loading && !error && rows.length === 0 && (
            <EmptyContainer>
              <div className="text-text-dim mb-3 font-mono text-xs uppercase tracking-[0.1em]">
                {data.length === 0 ? 'No providers yet.' : 'No matches for current filters.'}
              </div>
              {data.length === 0 && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent-dim font-mono uppercase tracking-[0.1em] text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add the first one
                </Button>
              )}
            </EmptyContainer>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="flex flex-col gap-3">
              {rows.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  taskSummary={taskSummaryByProviderId.get(p.id)}
                  onClick={() => navigate(`/providers/${p.id}`)}
                  onEdit={() => setEditTarget(p)}
                  onArchiveToggle={() => handleArchiveToggle(p)}
                  onDelete={(triggerEl) => {
                    deleteTriggerRef.current = triggerEl;
                    setDeleteTarget(p);
                  }}
                />
              ))}
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {rows.length} {rows.length === 1 ? 'provider' : 'providers'}
              {rows.length !== data.length && ` · ${data.length} total`}
            </div>
          )}
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
              <FilterRow label="Status">
                <Select value={statusFilter} onValueChange={setStatus}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {PROVIDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Specialty">
                <Select value={specialtyFilter} onValueChange={setSpecialty}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All specialties</SelectItem>
                    {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Archived">
                <label className="flex items-center gap-2 cursor-pointer select-none h-9">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="font-sans text-sm text-text">
                    Show archived
                  </span>
                </label>
              </FilterRow>
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

      <ProviderFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/providers/${row.id}`);
        }}
      />

      {/* Edit dialog driven by the card kebab. List context — the
          ProviderFormDialog has no in-dialog Delete, so no
          hideDeleteAction prop conflict. */}
      <ProviderFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        provider={editTarget}
        onSave={async (payload) => {
          try {
            await update(editTarget.id, payload);
            setEditTarget(null);
          } catch (err) {
            console.error('Provider update failed', err);
            toast.error(err?.message || 'Update failed.');
          }
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete "${fmtName(deleteTarget)}"?`
          : 'Delete?'}
        description="This will also delete their activities, tasks, and placements. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Provider delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

// Three-row mobile / single-content-cluster wide layout. Providers
// ARE the leaf record (no parent identifier to surface), so the
// 4-row Opportunities/Tasks/Contacts pattern compresses to 3. Photo
// is the strongest logo-slot case in the suite — provider's own
// image, with initials fallback.
//
// Per-page card variations:
//   - Logo: provider photo, circle shape (matches the detail page's
//     xl-circle treatment), 80×80 mobile, 56-64px wide.
//   - Archive lives in the kebab (Edit → Archive/Unarchive → Delete).
//     The shared CardKebab now takes extraItems for lifecycle actions
//     that sit between primary and destructive.
//   - Archived state: opacity-60 on the whole card (the user
//     explicitly toggled "Show archived" to see these, so the
//     opacity is confirmation, not the only signal). No inline
//     "ARCHIVED" label — it would compete for row 1 space without
//     adding information.
//
// Mobile rows (3 total):
//   1 — position · specialty (mono cap) + tasks pill + kebab
//   2 — provider name (accent teal, font-display, primary)
//   3 — home city, ST (mono dim, left) + status badge (right)
//
// Wide layout:
//   photo (left, circle, vertical-centered)
//   content cluster (flex-1, three stacked rows):
//     position · spec mono
//     name (accent teal, font-display, larger)
//     home city, ST (mono dim)
//   right cluster (shrink-0, items-end, justify-between):
//     tasks pill + kebab on top
//     status badge on bottom
function ProviderCard({ provider: p, taskSummary, onClick, onEdit, onArchiveToggle, onDelete }) {
  const name = fmtName(p);
  const location = [p.home_city, p.home_state].filter(Boolean).join(', ');
  const positionSpec = [
    p.position_type ? labelFor(POSITION_TYPES, p.position_type) : null,
    p.specialty ? specialtyAbbrFor(p.specialty) : null,
  ].filter(Boolean).join(' · ');

  // Tasks-count pill — same shape as Opportunities. Mobile shows
  // just the digit (compact circle); md+ adds the word. Numeral
  // accent teal normally; danger red with medium weight when at
  // least one linked open task is overdue. The danger-red token
  // is chosen so it still reads against the parent card's
  // opacity-60 wash when archived (visual check on render).
  const tasksBadge = taskSummary?.count > 0 ? (
    <span className="inline-flex items-center justify-center h-6 px-2 min-w-[24px] border border-border rounded-full font-mono text-[11px] leading-none whitespace-nowrap">
      <span className={cn(taskSummary.hasOverdue ? 'text-danger font-medium' : 'text-accent')}>
        {taskSummary.count}
      </span>
      <span className="hidden md:inline ml-1 text-text-dim">
        task{taskSummary.count === 1 ? '' : 's'}
      </span>
    </span>
  ) : null;

  // Kebab's extra item: Archive when archived=false, Unarchive when
  // true. Sits between Edit and Delete per the CardKebab order
  // contract. Non-destructive (toggle, reversible).
  const kebabExtras = [
    {
      label: p.archived ? 'Unarchive' : 'Archive',
      icon: p.archived ? ArchiveRestore : Archive,
      onSelect: onArchiveToggle,
    },
  ];

  const tasksAndKebab = (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {tasksBadge}
      <CardKebab
        ariaLabel="Provider actions"
        onEdit={onEdit}
        onDelete={onDelete}
        extraItems={kebabExtras}
      />
    </div>
  );

  const statusBadge = p.status ? (
    <Badge variant="outline" className={cn(
      'flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]',
      STATUS_BADGE[p.status] ?? STATUS_BADGE_FALLBACK,
    )}>
      {labelFor(PROVIDER_STATUSES, p.status)}
    </Badge>
  ) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'relative bg-surface border border-border rounded p-3 md:px-5 md:py-3 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none',
        p.archived && 'opacity-50',
      )}
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex items-center gap-3">
        <Thumb
          path={p.photo_path}
          bucket="provider-photos"
          alt={name}
          fallback={initialsFor(p)}
          size="lg"
          shape="circle"
          className="h-20 w-20 text-base flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Row 1 — position · specialty + tasks pill + kebab. */}
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[11px] tracking-tight text-text leading-none truncate">
              {positionSpec || ''}
            </p>
            {tasksAndKebab}
          </div>
          {/* Row 2 — provider name (primary). Negative top margin
              compensates for DM Serif Display's intrinsic line-box
              padding (same trick as Opportunities/Tasks cards). */}
          <h3 className="-mt-1 font-display text-[18px] text-accent leading-none truncate">
            {name}
          </h3>
          {/* Row 3 — city, ST + status badge. mt-3 creates the
              dominant name-to-context break (matches the other
              cards' rhythm). */}
          <div className="mt-3 flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[12px] text-text-dim leading-none truncate">
              {location || ''}
            </p>
            {statusBadge}
          </div>
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-stretch gap-5">
        <div className="flex-shrink-0 flex items-center">
          <Thumb
            path={p.photo_path}
            bucket="provider-photos"
            alt={name}
            fallback={initialsFor(p)}
            size="md"
            shape="circle"
            className="h-12 w-12 lg:h-14 lg:w-14 text-sm"
          />
        </div>

        {/* Single content cluster — position/spec / name / city ST.
            Tight gap matches Contacts' wide-layout density. */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          {positionSpec && (
            <p className="font-mono text-[12px] text-text leading-none truncate">
              {positionSpec}
            </p>
          )}
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {name}
          </h3>
          <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-none truncate">
            {location || <span className="text-text-muted">—</span>}
          </p>
        </div>

        {/* Right cluster — tasks pill + kebab on top / status badge
            pinned bottom. justify-between aligns the two against
            the card's stretched height. */}
        <div className="flex-shrink-0 flex flex-col justify-between items-end gap-2">
          {tasksAndKebab}
          {statusBadge || <span aria-hidden className="h-[20px] leading-none" />}
        </div>
      </div>
    </div>
  );
}

function EmptyContainer({ children }) {
  return (
    <div className="bg-surface border border-border rounded flex flex-col items-center justify-center text-center px-6 py-20 min-h-[280px]">
      {children}
    </div>
  );
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
