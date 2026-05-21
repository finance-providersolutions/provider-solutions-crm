import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import Thumb from '@/components/uploads/Thumb';
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useTasks } from '@/hooks/useTasks';
import {
  OPPORTUNITY_SETTINGS, OPPORTUNITY_STAGES, POSITION_TYPES, SPECIALTIES,
  US_STATES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Pipeline stages get distinct treatment per state. Lead/qualified
// are early accent; proposal/contracted are deeper accent; filled
// is income green; lost is danger. Same shape as Providers'
// STATUS_BADGE — re-exported for the detail page.
export const STAGE_BADGE = {
  lead:       'bg-accent-dim text-accent       border-accent/40',
  qualified:  'bg-accent-dim text-accent       border-accent/40',
  proposal:   'bg-accent-dim text-accent       border-accent/40',
  contracted: 'bg-accent-dim text-accent       border-accent/40',
  filled:     'bg-income/15  text-income       border-income/40',
  lost:       'bg-danger/15  text-danger       border-danger/40',
};

// Sentinel values for the source-partner filter dropdown so we can
// disambiguate "not filtering" from "filtering to direct".
const PARTNER_FILTER_ANY    = '__any__';
const PARTNER_FILTER_DIRECT = '__direct__';

// Sort options for the filter-panel sort row. Default mirrors the
// hook's order — next-action soonest, then most recently created.
// All non-default sorts run client-side in the rows useMemo against
// the already-fetched dataset, including the hospital sort that
// orders by a joined-table column — staying client-side avoids the
// extra round-trip and the PostgREST shape gymnastics that ordering
// on `organizations(name)` would otherwise require.
const SORT_DEFAULT  = 'default';
const SORT_NEWEST   = 'newest';
const SORT_HOSPITAL = 'hospital';
const SORT_TITLE    = 'title';
const SORT_LOCATION = 'location';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT,  label: 'Next action (soonest)'         },
  { value: SORT_NEWEST,   label: 'Newest first'                  },
  { value: SORT_HOSPITAL, label: 'Hospital (A→Z)'                },
  { value: SORT_TITLE,    label: 'Title (A→Z)'                   },
  { value: SORT_LOCATION, label: 'Location (state, then city)'   },
];

// Chrome heights — bar 1 is owned by PageHeader (58px). Bar 2 is the
// list subheader; bar 3 is the conditional search bar that appears
// below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

export default function Opportunities() {
  const navigate = useNavigate();
  const { data, loading, error, create, update, remove } = useOpportunities();
  const orgs = useOrganizations();
  // Single batched fetch of all open tasks. Bucketed below into a
  // per-opportunity { count, hasOverdue } map so each card renders
  // its count from local state — no per-card query and no N+1.
  const openTasks = useTasks({ status: 'open' });

  const [search, setSearch]       = useState('');
  const [stageFilter, setStage]   = useState('all');
  const [specFilter, setSpec]     = useState('all');
  const [stateFilter, setState]   = useState('all');
  const [partnerFilter, setPartner] = useState(PARTNER_FILTER_ANY);
  const [sort, setSort] = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);     // opportunity row being edited
  const [deleteTarget, setDeleteTarget] = useState(null); // opportunity row pending delete confirm
  const deleteTriggerRef = useRef(null);                  // last-clicked kebab — focus restore after delete

  const filtersActive = stageFilter !== 'all'
    || specFilter !== 'all'
    || stateFilter !== 'all'
    || partnerFilter !== PARTNER_FILTER_ANY
    || sort !== SORT_DEFAULT;
  const searchActive = search.trim().length > 0;
  const anyActive = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setStage('all');
    setSpec('all');
    setState('all');
    setPartner(PARTNER_FILTER_ANY);
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

  const partners = useMemo(
    () => orgs.data.filter(o => o.type === 'locums_partner'),
    [orgs.data],
  );

  // Bucket open tasks by opportunity_id into a Map<id, {count,
  // hasOverdue}>. Overdue = due_date strictly before today (date-
  // only, no time component on the column). Computed once per
  // openTasks.data change, not per card render.
  const taskSummaryByOppId = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map();
    for (const t of openTasks.data) {
      if (!t.opportunity_id) continue;
      const prev = map.get(t.opportunity_id) || { count: 0, hasOverdue: false };
      prev.count += 1;
      if (t.due_date && t.due_date < today) prev.hasOverdue = true;
      map.set(t.opportunity_id, prev);
    }
    return map;
  }, [openTasks.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(o => {
      if (stageFilter !== 'all' && o.stage         !== stageFilter) return false;
      if (specFilter  !== 'all' && o.specialty     !== specFilter)  return false;
      if (stateFilter !== 'all' && o.location_state !== stateFilter
          && o.organization?.state !== stateFilter) return false;
      if (partnerFilter === PARTNER_FILTER_DIRECT && o.source_partner_id) return false;
      if (partnerFilter !== PARTNER_FILTER_ANY
          && partnerFilter !== PARTNER_FILTER_DIRECT
          && o.source_partner_id !== partnerFilter) return false;
      if (!q) return true;
      const haystack = [
        o.title, o.name,
        o.organization?.name,
        o.location_city, o.location_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });

    // Client-side sort. The hook fetches in default order, so when
    // sort === SORT_DEFAULT we don't need to re-sort.
    const cmpStr = (a, b) => (a || '').toLowerCase().localeCompare((b || '').toLowerCase());
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    if (sort === SORT_HOSPITAL) {
      return [...filtered].sort((a, b) =>
        cmpStr(a.organization?.name, b.organization?.name));
    }
    if (sort === SORT_TITLE) {
      return [...filtered].sort((a, b) =>
        cmpStr(a.title || a.name, b.title || b.name));
    }
    if (sort === SORT_LOCATION) {
      // State first, then city. Falls back to the parent org's state/
      // city when the opportunity-level fields are null (mirrors the
      // location_state filter logic above and the location string in
      // the card itself).
      const stateOf = (o) => o.location_state || o.organization?.state || '';
      const cityOf  = (o) => o.location_city  || o.organization?.city  || '';
      return [...filtered].sort((a, b) => {
        const s = cmpStr(stateOf(a), stateOf(b));
        return s !== 0 ? s : cmpStr(cityOf(a), cityOf(b));
      });
    }
    return filtered;
  }, [data, search, stageFilter, specFilter, stateFilter, partnerFilter, sort]);

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
              Opportunities
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Demand pipeline · Hospitals and partner-sourced positions
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
              ariaLabel="New opportunity"
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
            placeholder="Search by title, hospital, location…"
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
                {data.length === 0 ? 'No opportunities yet.' : 'No matches for current filters.'}
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
              {rows.map(o => (
                <OpportunityCard
                  key={o.id}
                  opportunity={o}
                  taskSummary={taskSummaryByOppId.get(o.id)}
                  onClick={() => navigate(`/opportunities/${o.id}`)}
                  onEdit={() => setEditTarget(o)}
                  onDelete={(triggerEl) => {
                    deleteTriggerRef.current = triggerEl;
                    setDeleteTarget(o);
                  }}
                />
              ))}
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {rows.length} {rows.length === 1 ? 'opportunity' : 'opportunities'}
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
              <FilterRow label="Stage">
                <Select value={stageFilter} onValueChange={setStage}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {OPPORTUNITY_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Specialty">
                <Select value={specFilter} onValueChange={setSpec}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All specialties</SelectItem>
                    {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="State">
                <Select value={stateFilter} onValueChange={setState}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="all">All states</SelectItem>
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Source partner">
                <Select value={partnerFilter} onValueChange={setPartner}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PARTNER_FILTER_ANY}>Any source</SelectItem>
                    <SelectItem value={PARTNER_FILTER_DIRECT}>Direct (no partner)</SelectItem>
                    {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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

      <OpportunityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/opportunities/${row.id}`);
        }}
      />

      {/* Edit dialog driven by the card kebab; same dialog as create
          mode, with `opportunity` prop flipping it to edit. */}
      <OpportunityFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(next) => { if (!next) setEditTarget(null); }}
        opportunity={editTarget}
        onSave={async (payload) => {
          try {
            await update(editTarget.id, payload);
            setEditTarget(null);
          } catch (err) {
            console.error('Opportunity update failed', err);
            toast.error(err?.message || 'Update failed.');
          }
        }}
      />

      {/* Delete confirm driven by the card kebab. Hard-delete cascades
          to activities, tasks, and placements per the schema; the
          confirm copy spells that out. */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete "${deleteTarget.title || deleteTarget.name || 'this opportunity'}"?`
          : 'Delete?'}
        description="This will also delete its activities, tasks, and placements. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Opportunity delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err; // keep ConfirmDeleteDialog open on error
          }
        }}
      />
    </>
  );
}

// Tune-up: two-layout responsive card. Below md the card is a
// stacked block; at md and above it switches to a single horizontal
// row. Same content in both shapes, arranged differently.
//
// Below md (stacked):
//   Logo (80x80) on the left, anchored at top, spans the right
//   meta-block's height. The meta-block to its right stacks four
//   rows:
//     row 1 — position * specialty * setting (white mono) + tasks
//             count + kebab, right-aligned on the same row
//     row 2 — opportunity title (accent teal, font-display, primary)
//     row 3 — hospital name (white sans)
//     row 4 — city, ST (brighter muted blue) + stage badge right
//
// At md and above (horizontal row):
//   Logo (~56-60px) on far left, vertically centered. To its right,
//   two text clusters side by side and one right-anchored indicator
//   cluster:
//     left cluster   — hospital name on top / city ST below
//     center cluster — position * specialty * setting on top /
//                      title (accent teal, larger) below
//     right cluster  — tasks count + kebab on top / stage badge below
//
// Source channel still off the card. Open task count source
// unchanged (useTasks bucketed at page level). Whole-card tap and
// kebab behavior unchanged.
function OpportunityCard({ opportunity: o, taskSummary, onClick, onEdit, onDelete }) {
  const orgName = o.organization?.name ?? '—';
  const titleLine = o.title || o.name || '—';
  const locationParts = [o.location_city, o.location_state].filter(Boolean);
  const orgLocationParts = [o.organization?.city, o.organization?.state].filter(Boolean);
  const location = locationParts.length
    ? locationParts.join(', ')
    : orgLocationParts.join(', ');
  const positionSpecSetting = [
    o.position_type ? labelFor(POSITION_TYPES, o.position_type) : null,
    o.specialty ? specialtyAbbrFor(o.specialty) : null,
    o.setting ? labelFor(OPPORTUNITY_SETTINGS, o.setting) : null,
  ].filter(Boolean).join(' · ');

  // Tasks-count badge — outlined pill mirroring the stage badge's
  // visual language. Mobile shows just the digit (compact circle);
  // md+ adds the word "task" / "tasks" so the pill widens to match
  // the wider layout's available space. Numeral renders in accent
  // teal normally; switches to danger red with medium weight when
  // at least one open task linked to this opportunity is overdue.
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

  // Tasks badge + kebab pair, used in row 1 of mobile and the top
  // of the right cluster on wide. Same node in both layouts; gap
  // is tighter on mobile (badge has only a digit, so the kebab can
  // sit closer) and roomier at md+ where the badge widens to "N
  // tasks" and benefits from extra breathing room.
  const tasksAndKebab = (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {tasksBadge}
      <CardKebab onEdit={onEdit} onDelete={onDelete} />
    </div>
  );

  const stageBadge = o.stage ? (
    <Badge
      variant="outline"
      className={cn(
        'flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]',
        STAGE_BADGE[o.stage],
      )}
    >
      {labelFor(OPPORTUNITY_STAGES, o.stage)}
    </Badge>
  ) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="relative bg-surface border border-border rounded p-3 md:p-5 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      {/* items-center vertically balances the four-row text block
          against the 80x80 logo so the card height is set by the
          logo with even top/bottom padding. Explicit per-row margins
          drive the asymmetric rhythm: tight from row 1 to row 2,
          larger from row 2 to row 3 (title-to-hospital is the
          identity break), tight from row 3 to row 4. */}
      <div className="md:hidden flex items-center gap-3">
        <Thumb
          path={o.organization?.logo_path}
          bucket="organization-logos"
          alt={orgName}
          fallback={initialsFor(orgName)}
          size="lg"
          shape="square"
          className="h-20 w-20 text-base flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Row 1 — position · spec · setting + tasks/kebab.
              tracking-tight compresses the mono letter-spacing on
              mobile so "M.D. · Gastro · Inpatient" takes less
              horizontal real estate — gives row 1 more breathing
              room next to the tasks pill and kebab. */}
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[11px] tracking-tight text-text leading-none truncate">
              {positionSpecSetting || ''}
            </p>
            {tasksAndKebab}
          </div>
          {/* Row 2 — title (accent teal, primary). Negative top
              margin compensates for DM Serif Display's intrinsic
              line-box padding above the cap-height — even with
              leading-none the font reserves ~5-6px of whitespace
              above the visible glyph. -mt-1 pulls the title's line
              box up so the cap-height sits visually flush against
              row 1's baseline. */}
          <h3 className="-mt-1 font-display text-[18px] text-accent leading-none truncate">
            {titleLine}
          </h3>
          {/* Row 3 — hospital name (white sans). mt-3 creates the
              disproportionate title-to-hospital break — visibly
              the largest gap on the card. */}
          <p className="mt-3 text-text text-[15px] font-medium leading-none truncate">
            {orgName}
          </p>
          {/* Row 4 — city/ST (brighter muted blue) + stage badge.
              mt-1 keeps city tight under hospital. */}
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[13px] text-text-dim leading-none truncate">
              {location || ''}
            </p>
            {stageBadge}
          </div>
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-center gap-5">
        <Thumb
          path={o.organization?.logo_path}
          bucket="organization-logos"
          alt={orgName}
          fallback={initialsFor(orgName)}
          size="md"
          shape="square"
          className="h-14 w-14 lg:h-16 lg:w-16 text-sm flex-shrink-0"
        />

        {/* Left text cluster — hospital + city/ST */}
        <div className="min-w-0 basis-1/3 flex flex-col gap-0.5">
          <p className="text-text text-[16px] lg:text-[17px] font-medium leading-tight truncate">
            {orgName}
          </p>
          <p className="font-mono text-[12px] lg:text-[13px] text-text-dim leading-snug truncate">
            {location || ''}
          </p>
        </div>

        {/* Center text cluster — position·spec·setting + title */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {positionSpecSetting && (
            <p className="font-mono text-[12px] text-text leading-snug truncate">
              {positionSpecSetting}
            </p>
          )}
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {titleLine}
          </h3>
        </div>

        {/* Right indicator cluster — tasks/kebab on top, stage below */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {tasksAndKebab}
          {stageBadge}
        </div>
      </div>
    </div>
  );
}

// Small wrapper around DropdownMenu so the trigger stops propagation
// and the menu items also call stopPropagation — keyboard and click
// events on the kebab must not bubble up into the card's onClick
// (which would navigate to the detail page mid-action). The button
// itself is inline in normal flow now (both variants place it
// inline with the title row or in a right-anchored indicator
// cluster) — no absolute positioning.
function CardKebab({ onEdit, onDelete }) {
  const triggerRef = useRef(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Opportunity actions"
          className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded text-text-dim hover:text-accent hover:bg-accent-dim transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <MoreVertical className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-border"
      >
        <DropdownMenuItem
          onSelect={() => onEdit?.()}
          className="cursor-pointer focus:bg-accent-dim focus:text-accent"
        >
          <Pencil className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDelete?.(triggerRef.current)}
          className="cursor-pointer text-danger focus:bg-danger/15 focus:text-danger"
        >
          <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
