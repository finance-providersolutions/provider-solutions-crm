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
import Thumb from '@/components/uploads/Thumb';
import ProviderFormDialog from '@/components/providers/ProviderFormDialog';
import { useProviders } from '@/hooks/useProviders';
import {
  POSITION_TYPES, PROVIDER_STATUSES, SPECIALTIES, labelFor,
} from '@/utils/constants';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Status pill colors. In-process stages share the accent treatment;
// active is the only "currently in revenue" green; inactive /
// disqualified mute and warn respectively. Same shape and tokens
// as Organizations.jsx TYPE_BADGE.
export const STATUS_BADGE = {
  lead:         'bg-accent-dim text-accent border-accent/40',
  contacted:    'bg-accent-dim text-accent border-accent/40',
  interested:   'bg-accent-dim text-accent border-accent/40',
  interviewing: 'bg-accent-dim text-accent border-accent/40',
  onboarding:   'bg-accent-dim text-accent border-accent/40',
  credentialed: 'bg-accent-dim text-accent border-accent/40',
  active:       'bg-income/15  text-income border-income/40',
  inactive:     'bg-surface2   text-text-dim border-border',
  disqualified: 'bg-danger/15  text-danger border-danger/40',
};

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
  const { data, loading, error, create } = useProviders();
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatus]         = useState('all');
  const [specialtyFilter, setSpecialty]   = useState('all');
  const [showArchived, setShowArchived]   = useState(false);
  const [sort, setSort]                   = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen]       = useState(false);
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(p => {
      if (!showArchived && p.archived) return false;
      if (statusFilter    !== 'all' && p.status    !== statusFilter)    return false;
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (!q) return true;
      const haystack = [
        p.first_name, p.last_name, p.email, p.npi,
        p.home_city, p.home_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [data, search, statusFilter, specialtyFilter, showArchived, sort]);

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
          <div className="bg-surface border border-border rounded relative overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em] w-[60px]"></TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Name</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Specialty</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Type</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Home</TableHead>
                  <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
                )}
                {!loading && error && (
                  <TableRow><TableCell colSpan={6} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
                )}
                {!loading && !error && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="text-text-dim mb-3">
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
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && rows.map(p => (
                  <TableRow
                    key={p.id}
                    onClick={() => navigate(`/providers/${p.id}`)}
                    className={cn(
                      'border-border cursor-pointer hover:bg-surface2 transition-colors',
                      p.archived && 'opacity-60',
                    )}
                  >
                    <TableCell>
                      <Thumb
                        path={p.photo_path}
                        bucket="provider-photos"
                        alt={`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()}
                        fallback={initialsFor(p)}
                        size="sm"
                        shape="circle"
                      />
                    </TableCell>
                    <TableCell className="text-text font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                        {p.archived && (
                          <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.1em] bg-surface2 text-text-muted border-border">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-text-dim">
                      {p.specialty ? labelFor(SPECIALTIES, p.specialty) : <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell className="text-text-dim font-mono text-xs">
                      {p.position_type ? labelFor(POSITION_TYPES, p.position_type) : <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell className="text-text-dim">
                      {[p.home_city, p.home_state].filter(Boolean).join(', ') || <span className="text-text-muted">—</span>}
                    </TableCell>
                    <TableCell>
                      {p.status ? (
                        <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[p.status])}>
                          {labelFor(PROVIDER_STATUSES, p.status)}
                        </Badge>
                      ) : <span className="text-text-muted">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
