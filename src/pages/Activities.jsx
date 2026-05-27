import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import KPICard from '@/components/brand/KPICard';
import { ACTIVITY_ICON } from '@/components/activities/LogActivityForm';
import { useActivities } from '@/hooks/useActivities';
import { useProviders } from '@/hooks/useProviders';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import { ACTIVITY_TYPES, labelFor } from '@/utils/constants';
import { fmtDateTime, fmtRelative, fmtName } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// /activities — conceptual-shell global archive of every logged
// touch across the CRM. Designed for "looks right when sparse,
// scales when dense" — Jason expects to revisit and rework once
// real activity has accumulated (DESIGN-NOTES "Known issues to
// address in upcoming sub-arcs").
//
// Composition:
//   - Bar 2 (list subheader): page title + description + Search +
//     Filter icons. No Plus — activities aren't created from a
//     global page; they're logged against an entity.
//   - Bar 3 (conditional search): same pattern as /tasks, /providers.
//   - KPI strip: two coverage cards. "Quiet providers" (active
//     providers with no activity in 30+ days) and "Quiet hospitals"
//     (org.type='hospital' with no activity in 30+ days). The third
//     intended card — Quiet opportunities — is deferred until the
//     Opportunity sub-arc settles its stage active-set definition
//     (DESIGN-NOTES). Coverage framing, not velocity — answers "who
//     am I neglecting" rather than "how busy was I."
//   - Bucketed feed: Today / This Week / Last Week / This Month /
//     Older. Reverse chronological within each bucket. Empty
//     buckets are suppressed.
//   - Per-row parent column is VISIBLE (unlike the section-on-detail
//     ActivityFeed which shows parent only when showParent=true) —
//     the whole point of the global archive is to see what each
//     touch belonged to.

const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

const PARENT_TYPE_OPTIONS = [
  { value: 'all',          label: 'All parent types' },
  { value: 'organization', label: 'Organization'     },
  { value: 'contact',      label: 'Contact'          },
  { value: 'opportunity',  label: 'Opportunity'      },
  { value: 'provider',     label: 'Provider'         },
];

const DATE_RANGE_OPTIONS = [
  { value: 'all',  label: 'All time'    },
  { value: '7',    label: 'Last 7 days' },
  { value: '30',   label: 'Last 30 days'},
  { value: '90',   label: 'Last 90 days'},
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent first' },
  { value: 'oldest', label: 'Oldest first'      },
];

export default function Activities() {
  // Fetch full activity stream (no sinceDays cap — the page is
  // an archive). The hook already orders by occurred_at desc.
  const activities = useActivities();
  const providers     = useProviders();
  const organizations = useOrganizations();
  const opportunities = useOpportunities();

  const [search, setSearch]               = useState('');
  const [parentTypeFilter, setParentType] = useState('all');
  const [activityTypeFilter, setActivityType] = useState('all');
  const [dateRange, setDateRange]         = useState('all');
  const [sort, setSort]                   = useState('recent');
  const [searchOpen, setSearchOpen]       = useState(false);
  const [filterOpen, setFilterOpen]       = useState(false);

  useChromeBottom(BAR1_H + BAR2_H + (searchOpen ? BAR3_H : 0));

  const filtersActive = parentTypeFilter !== 'all'
    || activityTypeFilter !== 'all'
    || dateRange !== 'all'
    || sort !== 'recent';
  const searchActive = search.trim().length > 0;
  const anyActive    = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setParentType('all');
    setActivityType('all');
    setDateRange('all');
    setSort('recent');
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

  // Provider + opportunity lookup maps. The activities hook joins
  // organization and contact natively (those carry FK relationships
  // in Phase 1); provider_id and opportunity_id are columns without
  // PostgREST FK metadata, so we resolve them in memory from the
  // separate list hooks. Same approach used elsewhere when joining
  // across the pre-Phase-2 schema gap.
  const providersById = useMemo(
    () => new Map(providers.data.map(p => [p.id, p])),
    [providers.data],
  );
  const opportunitiesById = useMemo(
    () => new Map(opportunities.data.map(o => [o.id, o])),
    [opportunities.data],
  );

  // Resolve each activity into { row, parent } so downstream
  // filtering / bucketing / rendering doesn't re-derive the parent
  // four times. parent has { type, name, href, hospital? }.
  const resolved = useMemo(() => {
    return activities.data.map(a => {
      const parent = resolveParent(a, { providersById, opportunitiesById });
      return { row: a, parent };
    });
  }, [activities.data, providersById, opportunitiesById]);

  // ── KPI strip — two coverage cards ──
  // Quiet providers: archived=false, no activity in last 30 days.
  // Quiet hospitals: org.type='hospital', no activity in last 30 days.
  // Activity attribution for "quiet" follows whichever FK column is
  // populated — we don't transitively count opp-activity toward the
  // opp's hospital, because activity logged against an opportunity
  // is opportunity-grain by intent. Hospital-grain coverage means
  // "did we touch this hospital directly."
  const kpis = useMemo(() => {
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const touchedProviderIds = new Set();
    const touchedOrgIds = new Set();
    for (const a of activities.data) {
      const occurredMs = new Date(a.occurred_at).getTime();
      if (Number.isNaN(occurredMs) || occurredMs < cutoffMs) continue;
      if (a.provider_id)     touchedProviderIds.add(a.provider_id);
      if (a.organization_id) touchedOrgIds.add(a.organization_id);
    }
    let quietProviders = 0;
    for (const p of providers.data) {
      if (p.archived) continue;
      if (!touchedProviderIds.has(p.id)) quietProviders += 1;
    }
    let quietHospitals = 0;
    for (const o of organizations.data) {
      if (o.type !== 'hospital') continue;
      if (!touchedOrgIds.has(o.id)) quietHospitals += 1;
    }
    return { quietProviders, quietHospitals };
  }, [activities.data, providers.data, organizations.data]);

  // ── Filter + sort the resolved list ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoffMs = dateRange === 'all'
      ? null
      : Date.now() - parseInt(dateRange, 10) * 24 * 60 * 60 * 1000;

    const rows = resolved.filter(({ row, parent }) => {
      if (activityTypeFilter !== 'all' && row.activity_type !== activityTypeFilter) return false;
      if (parentTypeFilter !== 'all' && (parent?.type?.toLowerCase() !== parentTypeFilter)) return false;
      if (cutoffMs != null) {
        const ms = new Date(row.occurred_at).getTime();
        if (Number.isNaN(ms) || ms < cutoffMs) return false;
      }
      if (q) {
        const haystack = [
          row.subject, row.body,
          parent?.name,
          labelFor(ACTIVITY_TYPES, row.activity_type),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sort === 'oldest') {
      return [...rows].sort((a, b) =>
        (a.row.occurred_at || '').localeCompare(b.row.occurred_at || ''));
    }
    // 'recent' — already sorted desc by the hook
    return rows;
  }, [resolved, search, activityTypeFilter, parentTypeFilter, dateRange, sort]);

  // ── Bucket by occurred_at relative to today ──
  // Today / This Week (Mon–today, excluding today) / Last Week
  // (previous Mon–Sun) / This Month (older than last week, same
  // calendar month) / Older. Buckets honor whatever sort is active —
  // the within-bucket order is the same as the filtered list, so
  // 'recent' yields newest-first within each bucket and 'oldest'
  // yields oldest-first. Empty buckets are suppressed.
  const buckets = useMemo(() => bucketize(filtered), [filtered]);

  const totalCount = filtered.length;
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
              Activities
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Every logged touch across the CRM
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
            placeholder="Search subject, note, parent name…"
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

          {/* KPI strip — two coverage cards. Sparse-data honest:
              counts read as 0 when nothing's quiet, "—" while
              underlying lists load. Third intended card (quiet
              opportunities) deferred until Opp sub-arc settles
              stage active-set. */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-8">
            <KPICard
              label="Quiet providers"
              value={providers.loading || activities.loading ? '—' : kpis.quietProviders}
              sub="active, no touch in 30+ days"
              color={kpis.quietProviders > 0 ? 'warning' : 'green'}
            />
            <KPICard
              label="Quiet hospitals"
              value={organizations.loading || activities.loading ? '—' : kpis.quietHospitals}
              sub="hospitals, no touch in 30+ days"
              color={kpis.quietHospitals > 0 ? 'warning' : 'green'}
            />
          </div>

          {/* Feed — bucketed by occurred_at. Loading / error /
              empty render in the cluster-A agreed shape: plain
              text, text-text-muted, font-mono text-xs uppercase
              tracking-[0.1em], centered py-6, no card wrapper. */}
          {activities.loading && (
            <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
              Loading…
            </div>
          )}
          {!activities.loading && activities.error && (
            <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-danger">
              {activities.error.message}
            </div>
          )}
          {!activities.loading && !activities.error && totalCount === 0 && (
            <div className="px-6 py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
              {resolved.length === 0
                ? 'No activity logged yet.'
                : 'No activity matches the current filters.'}
            </div>
          )}

          {!activities.loading && !activities.error && totalCount > 0 && (
            <div className="flex flex-col gap-8">
              {buckets.map(b => (
                <Bucket key={b.key} label={b.label} rows={b.rows} />
              ))}
            </div>
          )}

          {!activities.loading && totalCount > 0 && (
            <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {totalCount} {totalCount === 1 ? 'activity' : 'activities'}
              {totalCount !== resolved.length && ` · ${resolved.length} total`}
            </div>
          )}
        </div>
      </div>

      {/* Filter panel — matches the /tasks, /providers pattern. */}
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
              <FilterRow label="Parent type">
                <Select value={parentTypeFilter} onValueChange={setParentType}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARENT_TYPE_OPTIONS.map(o =>
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Activity type">
                <Select value={activityTypeFilter} onValueChange={setActivityType}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All activity types</SelectItem>
                    {ACTIVITY_TYPES.map(t =>
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Date range">
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATE_RANGE_OPTIONS.map(o =>
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Sort">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(s =>
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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

// ── Helpers ────────────────────────────────────────────────────

// Build parent block for an activity row. Mirrors the per-card
// parent resolution in TaskCard but with parents specific to the
// activities schema (organization / contact natively joined;
// provider / opportunity resolved from list-hook maps).
function resolveParent(a, { providersById, opportunitiesById }) {
  if (a.opportunity_id) {
    const opp = opportunitiesById.get(a.opportunity_id);
    if (opp) {
      const name = opp.title || opp.name || 'Untitled';
      const hospital = opp.organization?.name || null;
      return { type: 'Opportunity', name, hospital, href: `/opportunities/${opp.id}` };
    }
    return { type: 'Opportunity', name: 'Unknown', hospital: null, href: null };
  }
  if (a.provider_id) {
    const p = providersById.get(a.provider_id);
    const name = p ? (fmtName(p) || 'Unnamed') : 'Unknown';
    return { type: 'Provider', name, hospital: null, href: p ? `/providers/${p.id}` : null };
  }
  if (a.organization) {
    return { type: 'Organization', name: a.organization.name, hospital: null, href: `/organizations/${a.organization.id}` };
  }
  if (a.contact) {
    return { type: 'Contact', name: fmtName(a.contact) || 'Unnamed', hospital: null, href: `/contacts/${a.contact.id}` };
  }
  return null;
}

// Bucket activities by occurred_at into Today / This Week (Mon→
// yesterday) / Last Week / This Month (older than last week, same
// calendar month) / Older. Pure pass over the already-sorted
// filtered list — preserves within-bucket order.
function bucketize(rows) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMs = startOfToday.getTime();
  // Monday-start week. JS Sunday=0, so shift so Monday=0.
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeekMs = todayMs - dayOfWeek * 86400000;
  const startOfLastWeekMs = startOfWeekMs - 7 * 86400000;
  const startOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const groups = {
    today:     [],
    thisWeek:  [],
    lastWeek:  [],
    thisMonth: [],
    older:     [],
  };

  for (const r of rows) {
    const ms = new Date(r.row.occurred_at).getTime();
    if (Number.isNaN(ms)) { groups.older.push(r); continue; }
    if (ms >= todayMs)               groups.today.push(r);
    else if (ms >= startOfWeekMs)    groups.thisWeek.push(r);
    else if (ms >= startOfLastWeekMs) groups.lastWeek.push(r);
    else if (ms >= startOfMonthMs)   groups.thisMonth.push(r);
    else                              groups.older.push(r);
  }

  const order = [
    { key: 'today',     label: 'Today',      rows: groups.today     },
    { key: 'thisWeek',  label: 'This week',  rows: groups.thisWeek  },
    { key: 'lastWeek',  label: 'Last week',  rows: groups.lastWeek  },
    { key: 'thisMonth', label: 'This month', rows: groups.thisMonth },
    { key: 'older',     label: 'Older',      rows: groups.older     },
  ];
  return order.filter(b => b.rows.length > 0);
}

function Bucket({ label, rows }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-accent opacity-90">
          {label}
        </span>
        <div className="flex-1 h-px opacity-35 bg-gradient-to-r from-accent to-transparent" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {rows.length}
        </span>
      </div>
      <ol className="bg-surface border border-border rounded divide-y divide-border/40 overflow-hidden">
        {rows.map(({ row, parent }) => (
          <ActivityRow key={row.id} row={row} parent={parent} />
        ))}
      </ol>
    </section>
  );
}

// One row in the global feed. Mirrors ActivityFeed's rhythm where it
// makes sense (icon disc, mono cap activity type, subject as primary,
// body below, timestamp at the bottom) but the parent block is
// ALWAYS visible — that's the global page's job. Per-row Delete is
// suppressed here; deletion happens from the parent detail page
// where context for the touch lives.
function ActivityRow({ row, parent }) {
  const Icon = ACTIVITY_ICON[row.activity_type] ?? ACTIVITY_ICON.note;
  return (
    <li className="p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/40 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-accent" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-text">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
            {labelFor(ACTIVITY_TYPES, row.activity_type)}
          </span>
          {row.subject && <span className="font-medium">{row.subject}</span>}
        </div>

        {/* Parent line — always visible on the global archive. Two
            sub-lines for opportunity parents (the opp title alone
            often doesn't identify which hospital it's at). */}
        {parent && (
          <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {parent.type}
            </span>
            {parent.href
              ? <Link to={parent.href} className="text-accent hover:text-accent-bright text-sm truncate max-w-full">
                  {parent.name}
                </Link>
              : <span className="text-text-dim text-sm truncate max-w-full">{parent.name}</span>}
            {parent.hospital && (
              <span className="font-mono text-[11px] text-text-dim truncate max-w-full">
                at {parent.hospital}
              </span>
            )}
          </div>
        )}

        {row.body && (
          <p className="text-text-dim text-sm mt-1 whitespace-pre-wrap">
            {row.body}
          </p>
        )}

        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
          <span title={fmtDateTime(row.occurred_at)}>{fmtRelative(row.occurred_at)}</span>
        </div>
      </div>
    </li>
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
