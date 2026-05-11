import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useOrganizations } from '@/hooks/useOrganizations';
import {
  OPPORTUNITY_STAGES, SPECIALTIES, US_STATES, labelFor,
} from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
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

const SORT_DEFAULT = 'default';
const SORT_NEWEST  = 'newest';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT, label: 'Next action (soonest)' },
  { value: SORT_NEWEST,  label: 'Newest first'          },
];

// Chrome heights — bar 1 is owned by PageHeader (Slice 1, 58px).
// Bar 2 is the list subheader; bar 3 is the conditional search bar
// that appears below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

export default function Opportunities() {
  const navigate = useNavigate();
  const { data, loading, error, create } = useOpportunities();
  const orgs = useOrganizations();

  const [search, setSearch]       = useState('');
  const [stageFilter, setStage]   = useState('all');
  const [specFilter, setSpec]     = useState('all');
  const [stateFilter, setState]   = useState('all');
  const [partnerFilter, setPartner] = useState(PARTNER_FILTER_ANY);
  const [sort, setSort]           = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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

    // Client-side sort. The hook fetches in default order
    // (next_action_date asc, created_at desc tiebreak), so when
    // sort === SORT_DEFAULT we don't need to re-sort.
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
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
          <div className="bg-surface border border-border rounded relative overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Hospital</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Title</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Specialty</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Location</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Stage</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Source</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
                )}
                {!loading && error && (
                  <TableRow><TableCell colSpan={7} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
                )}
                {!loading && !error && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="text-text-dim mb-3">
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
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && rows.map(o => (
                  <TableRow
                    key={o.id}
                    onClick={() => navigate(`/opportunities/${o.id}`)}
                    className="border-border cursor-pointer hover:bg-surface2 transition-colors"
                  >
                    <TableCell className="text-text font-medium">{o.organization?.name ?? '—'}</TableCell>
                    <TableCell className="text-text-dim">{o.title || o.name || '—'}</TableCell>
                    <TableCell className="text-text-dim">
                      {o.specialty ? labelFor(SPECIALTIES, o.specialty) : <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell className="text-text-dim">
                      {[o.location_city, o.location_state].filter(Boolean).join(', ')
                        || [o.organization?.city, o.organization?.state].filter(Boolean).join(', ')
                        || <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell>
                      {o.stage ? (
                        <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STAGE_BADGE[o.stage])}>
                          {labelFor(OPPORTUNITY_STAGES, o.stage)}
                        </Badge>
                      ) : <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell className="text-text-dim text-sm">
                      {o.source_partner?.name || <span className="text-text-muted">Direct</span>}
                    </TableCell>
                    <TableCell className="text-text-dim font-mono text-xs">
                      {o.next_action_date ? fmtDate(o.next_action_date) : <span className="text-text-muted">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
    </>
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
