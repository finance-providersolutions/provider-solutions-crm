import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import SectionHeader from '@/components/brand/SectionHeader';
import Thumb from '@/components/uploads/Thumb';
import ExpirationCluster, {
  ExpirationPill,
} from '@/components/credentialing/ExpirationCluster';
import { useExpirations, bucketExpirations } from '@/hooks/useExpirations';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Cross-provider expiration roll-up — read-only monitoring view at
// /expirations. Uses the same two-tier fixed-header pattern as the
// other list pages (Opportunities, Tasks, Contacts, Providers,
// Organizations): primary header from AppShell, then bar-2 with
// title + description + Search/Filter/Refresh icons, then a
// conditional bar-3 with the search input. Filter sheet slides in
// from the right via the portal pattern.
//
// The page applies search/sort/type-filter to the flat items list
// from useExpirations, then groups via bucketExpirations into
// 30/60/90/past windows. The buckets are presentational — filters
// operate on the full set and the bucket structure follows the
// resulting subset.
//
// Reuses the ExpirationCluster visual language (full date + pill)
// on every row at every width — this view's date is load-bearing
// (it's the entire point of the view), unlike the provider-detail
// card grammar where the row's surrounding context provides it.

// Chrome heights — bar 1 is owned by PageHeader (Slice 1, 58px).
// Bar 2 is the list subheader; bar 3 is the conditional search bar
// that appears below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

const SORT_DEFAULT      = 'exp_asc';
const SORT_EXP_DESC     = 'exp_desc';
const SORT_PROVIDER_AZ  = 'provider_az';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT,     label: 'Expiring soonest' },
  { value: SORT_EXP_DESC,    label: 'Expiring latest'  },
  { value: SORT_PROVIDER_AZ, label: 'Provider (A→Z)'   },
];

const TYPE_OPTIONS = [
  { value: 'all',        label: 'All types'   },
  { value: 'license',    label: 'Licenses'    },
  { value: 'credential', label: 'Credentials' },
  { value: 'privilege',  label: 'Privileges'  },
];

const BUCKETS = [
  { key: 'past', title: 'Past expiration', emptyHidden: true  },
  { key: '30',   title: 'Next 30 days',    emptyHidden: false },
  { key: '60',   title: '31–60 days',      emptyHidden: false },
  { key: '90',   title: '61–90 days',      emptyHidden: false },
];

export default function Expirations() {
  const navigate = useNavigate();
  const { items, loading, error, refetch } = useExpirations();

  const [search, setSearch]         = useState('');
  const [typeFilter, setType]       = useState('all');
  const [sort, setSort]             = useState(SORT_DEFAULT);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtersActive = typeFilter !== 'all' || sort !== SORT_DEFAULT;
  const searchActive  = search.trim().length > 0;
  const anyActive     = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setType('all');
    setSort(SORT_DEFAULT);
  };

  // Esc closes whichever panel is open. Mirrors Providers.jsx.
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

  // Apply search → type filter → sort, then bucket. The bucketing
  // helper preserves input order within each bucket, so sorting
  // once globally before bucketing is sufficient.
  const buckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = items;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(it => it.sourceType === typeFilter);
    }
    if (q) {
      filtered = filtered.filter(it =>
        it.providerName && it.providerName.toLowerCase().includes(q));
    }
    const sorted = [...filtered];
    if (sort === SORT_DEFAULT) {
      sorted.sort((a, b) =>
        (a.expirationDate || '').localeCompare(b.expirationDate || ''));
    } else if (sort === SORT_EXP_DESC) {
      sorted.sort((a, b) =>
        (b.expirationDate || '').localeCompare(a.expirationDate || ''));
    } else if (sort === SORT_PROVIDER_AZ) {
      sorted.sort((a, b) => {
        const an = (a.providerName || '').toLowerCase();
        const bn = (b.providerName || '').toLowerCase();
        return an.localeCompare(bn);
      });
    }
    return bucketExpirations(sorted);
  }, [items, search, typeFilter, sort]);

  const total = buckets.past.length + buckets['30'].length
              + buckets['60'].length + buckets['90'].length;

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
              Expirations
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Credentialing renewals · 30 / 60 / 90 day windows
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
              onClick={refetch}
              disabled={loading}
              ariaLabel="Refresh"
            >
              <RefreshCw
                className={cn('w-[18px] h-[18px]', loading && 'animate-spin')}
                strokeWidth={1.5}
              />
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
            placeholder="Search by provider name…"
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
            <Centered>Loading…</Centered>
          )}
          {!loading && error && (
            <Centered tone="danger">{error.message}</Centered>
          )}
          {!loading && !error && total === 0 && (
            <Centered>
              {anyActive
                ? 'No matches for current filters.'
                : 'Nothing expiring in the next 90 days.'}
            </Centered>
          )}

          {!loading && !error && total > 0 && BUCKETS.map((b, idx) => {
            const list = buckets[b.key];
            if (list.length === 0 && b.emptyHidden) return null;
            return (
              <section key={b.key} className={cn(idx === 0 ? '' : 'mt-8')}>
                <SectionHeader text={b.title} first={idx === 0} />
                {list.length === 0 ? (
                  <div className="px-6 py-4 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted">
                    Nothing in this window.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {list.map(item => (
                      <ExpirationRow
                        key={item.id}
                        item={item}
                        onClick={() => navigate(`/providers/${item.providerId}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* Filter panel — same portal/slide pattern as Providers etc. */}
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
              <FilterRow label="Type">
                <Select value={typeFilter} onValueChange={setType}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Sort">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}

// Row layout — provider name is the accent-teal primary identifier
// (clicking the card navigates into that provider's detail page);
// the type + item label sits as a mono-cap secondary line.
//
// Expiration handling differs by width:
//   - Mobile: just the amber countdown pill, sitting INLINE at the
//     right of the secondary line. The 30/60/90 bucket grouping
//     plus the pill carry urgency; the literal date is redundant
//     on phone. Inline (not absolute) so the row stays SHORT — no
//     reserved bottom padding for a floating chip.
//   - Wide: the full inline ExpirationCluster (pill + "Exp [date]")
//     in the right cluster — there's room and the exact date is
//     useful for scanning.
//
// ExpirationPill returns null when the date is missing, in the
// past, or more than 90 days out, so the inline placement is
// safe — no empty wrapper to deal with.
function ExpirationRow({ item, onClick }) {
  const providerName = item.providerName || 'Unknown provider';
  const secondary = `${item.typeLabel} · ${item.itemLabel}`;

  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKey}
      aria-label={`Open ${providerName} · ${secondary}`}
      className="bg-surface border border-border rounded p-3 md:px-4 md:py-3 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout ────────────────────────────── */}
      <div className="md:hidden flex items-start gap-3">
        <Thumb
          path={item.provider?.photo_path}
          bucket="provider-photos"
          alt={providerName}
          fallback={initialsFor(item.provider)}
          size="md"
          shape="circle"
          className="h-12 w-12 flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h4 className="font-display text-[16px] text-accent leading-snug truncate">
            {providerName}
          </h4>
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[11px] text-text-dim leading-snug truncate">
              {secondary}
            </p>
            <ExpirationPill date={item.expirationDate} />
          </div>
        </div>
      </div>

      {/* ── Wide / horizontal layout ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-4">
        <Thumb
          path={item.provider?.photo_path}
          bucket="provider-photos"
          alt={providerName}
          fallback={initialsFor(item.provider)}
          size="md"
          shape="circle"
          className="h-12 w-12 flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h4 className="font-display text-[18px] text-accent leading-snug truncate">
            {providerName}
          </h4>
          <p className="font-mono text-[12px] text-text-dim leading-none truncate">
            {secondary}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <ExpirationCluster date={item.expirationDate} />
        </div>
      </div>
    </div>
  );
}

function Centered({ children, tone }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className={cn(
        'font-mono text-sm uppercase tracking-[0.12em]',
        tone === 'danger' ? 'text-danger' : 'text-text-dim',
      )}>
        {children}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, active = false, disabled = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex items-center justify-center w-9 h-9 border rounded cursor-pointer flex-shrink-0 transition-colors',
        active
          ? 'bg-accent-dim border-accent text-accent'
          : 'bg-surface border-border text-text-dim hover:border-accent hover:bg-accent-dim hover:text-accent',
        disabled && 'opacity-50 cursor-not-allowed',
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
