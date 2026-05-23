import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ProviderCard from '@/components/providers/ProviderCard';
import { useProviders } from '@/hooks/useProviders';
import { useTasks } from '@/hooks/useTasks';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import { PROVIDER_STATUSES, labelFor } from '@/utils/constants';
import { cn } from '@/lib/utils';

// Active recruiting funnel — Target through Active. The chip strip
// only shows these; off-pipeline stages are reachable by scrolling
// or by their own section headers.
const ACTIVE_STAGES = ['target', 'lead', 'contacted', 'interested', 'interviewing', 'onboarding', 'active'];

// Off-pipeline stages — rendered below the active funnel under a
// muted group header. Each only renders when count > 0.
const OFF_STAGES = ['inactive', 'declined', 'disqualified'];

// Default-open map. Active recruiting stages (Target → Onboarding)
// open so the page reads as the live pipeline; Active is collapsed
// because at 18 of 26 it would dominate the page; off-pipeline
// stages stay collapsed for the same reason.
const DEFAULT_OPEN = {
  target: true, lead: true, contacted: true, interested: true,
  interviewing: true, onboarding: true,
  active: false,
  inactive: false, declined: false, disqualified: false,
  __unbucketed: false,
};

// Chrome heights — bar 1 (PageHeader, 58), bar 2 (Funnel title +
// actions), bar 3 (stage-count chip strip — always visible on this
// page), bar 4 (conditional search input below the chip strip).
const BAR1_H = 58;
const BAR2_H = 56;
const CHIP_H = 44;
const SEARCH_H = 52;

export default function Funnel() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useProviders();
  const openTasks = useTasks({ status: 'open' });

  const [search, setSearch]         = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stageOpen, setStageOpen]   = useState(DEFAULT_OPEN);

  // Total fixed chrome — PageHeader + bar-2 + chip strip + (search
  // when open). Published via useChromeBottom so dialogs opened
  // from this page anchor below ALL four bars including the chip
  // strip.
  useChromeBottom(BAR1_H + BAR2_H + CHIP_H + (searchOpen ? SEARCH_H : 0));

  const searchActive = search.trim().length > 0;

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const searchInputRef = useRef(null);
  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  // Bucket open tasks by provider_id — verbatim shape from
  // Providers.jsx / Opportunities.jsx (same useMemo, same overdue
  // predicate). The ProviderCard component renders the pill from
  // this { count, hasOverdue } payload.
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

  // Filter (archived excluded; search across name/email/NPI/city)
  // then bucket by status. Within each bucket, sort by updated_at
  // desc so the freshest movement bubbles up.
  const byStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(p => {
      if (p.archived) return false;
      if (!q) return true;
      const haystack = [
        p.first_name, p.middle_name, p.last_name, p.suffix,
        p.email, p.npi, p.home_city, p.home_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    const map = new Map();
    for (const p of filtered) {
      const key = p.status || '__unbucketed';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }
    return map;
  }, [data, search]);

  // Rows with status values not in either bucket list (e.g., live
  // 'credentialed' rows grandfathered by 0005). Surface them as a
  // muted "Unbucketed" section so they're not invisible.
  const unbucketed = useMemo(() => {
    const known = new Set([...ACTIVE_STAGES, ...OFF_STAGES]);
    const out = [];
    for (const [status, list] of byStatus.entries()) {
      if (status === '__unbucketed' || !known.has(status)) out.push(...list);
    }
    return out;
  }, [byStatus]);

  const totalActive = ACTIVE_STAGES.reduce((n, s) => n + (byStatus.get(s)?.length ?? 0), 0);

  // Chip click — open the section if collapsed, then jump-scroll
  // to it. Chips never close a section; only the section header
  // toggles collapse. Scroll waits a frame so the expanded content
  // is in the layout before scrolling (otherwise we'd land short).
  const jumpToStage = (stage) => {
    setStageOpen(s => (s[stage] ? s : { ...s, [stage]: true }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`stage-${stage}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const toggleStage = (stage) => setStageOpen(s => ({ ...s, [stage]: !s[stage] }));

  // Scroll-margin so jumping to a section clears all fixed chrome.
  const scrollMarginTop = BAR1_H + BAR2_H + CHIP_H + (searchOpen ? SEARCH_H : 0) + 8;

  const bodyPaddingTop =
    `calc(${BAR1_H + BAR2_H + CHIP_H + (searchOpen ? SEARCH_H : 0)}px + env(safe-area-inset-top))`;

  return (
    <>
      {/* Bar 2 — page title + actions */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface"
        style={{ top: `calc(${BAR1_H}px + env(safe-area-inset-top))` }}
      >
        <div className="flex items-center justify-between gap-3 px-6 h-14">
          <div className="min-w-0">
            <h1 className="font-display text-[18px] sm:text-[22px] text-text leading-none truncate">
              Funnel
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Supply pipeline · Providers grouped by stage
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {searchActive && (
              <button
                type="button"
                onClick={() => setSearch('')}
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
              onClick={() => { refetch(); openTasks.refetch?.(); }}
              ariaLabel="Refresh"
            >
              <RefreshCw className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
          </div>
        </div>
      </div>

      {/* Bar 3 — stage-count chip strip (always visible). Horizontal
          scroll on overflow; one chip per active recruiting stage. */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface"
        style={{
          top: `calc(${BAR1_H + BAR2_H}px + env(safe-area-inset-top))`,
          height: `${CHIP_H}px`,
        }}
      >
        <div
          className="h-full overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="h-full flex items-center gap-2 px-6 whitespace-nowrap">
            {ACTIVE_STAGES.map(stage => {
              const count = byStatus.get(stage)?.length ?? 0;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => jumpToStage(stage)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 border border-border rounded-full bg-surface hover:border-accent hover:bg-accent-dim hover:text-accent transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text leading-none">
                    {labelFor(PROVIDER_STATUSES, stage)}
                  </span>
                  <span className="font-mono text-[11px] text-text-dim leading-none">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bar 4 — conditional search bar (slides in below chip strip) */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface overflow-hidden transition-[height] duration-300 ease-out"
        style={{
          top: `calc(${BAR1_H + BAR2_H + CHIP_H}px + env(safe-area-inset-top))`,
          height: searchOpen ? `${SEARCH_H}px` : '0px',
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
        <div className="max-w-6xl mx-auto py-6">
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

          {!loading && !error && (
            <>
              <GroupHeader>Active pipeline · {totalActive}</GroupHeader>
              <div className="flex flex-col gap-1">
                {ACTIVE_STAGES.map(stage => (
                  <StageCollapsible
                    key={stage}
                    stage={stage}
                    providers={byStatus.get(stage) ?? []}
                    taskSummaryByProviderId={taskSummaryByProviderId}
                    onCardClick={(id) => navigate(`/providers/${id}`)}
                    open={stageOpen[stage]}
                    onToggle={() => toggleStage(stage)}
                    tone="active"
                    scrollMarginTop={scrollMarginTop}
                  />
                ))}
              </div>

              {(OFF_STAGES.some(s => (byStatus.get(s)?.length ?? 0) > 0) || unbucketed.length > 0) && (
                <>
                  <GroupHeader muted className="mt-8">Off pipeline</GroupHeader>
                  <div className="flex flex-col gap-1">
                    {OFF_STAGES.map(stage => {
                      const list = byStatus.get(stage) ?? [];
                      if (list.length === 0) return null;
                      return (
                        <StageCollapsible
                          key={stage}
                          stage={stage}
                          providers={list}
                          taskSummaryByProviderId={taskSummaryByProviderId}
                          onCardClick={(id) => navigate(`/providers/${id}`)}
                          open={stageOpen[stage]}
                          onToggle={() => toggleStage(stage)}
                          tone="muted"
                          scrollMarginTop={scrollMarginTop}
                        />
                      );
                    })}
                    {unbucketed.length > 0 && (
                      <StageCollapsible
                        key="__unbucketed"
                        stage="__unbucketed"
                        label="Unbucketed"
                        providers={unbucketed}
                        taskSummaryByProviderId={taskSummaryByProviderId}
                        onCardClick={(id) => navigate(`/providers/${id}`)}
                        open={stageOpen.__unbucketed}
                        onToggle={() => toggleStage('__unbucketed')}
                        tone="muted"
                        scrollMarginTop={scrollMarginTop}
                      />
                    )}
                  </div>
                </>
              )}

              {data.length === 0 && (
                <EmptyContainer>
                  <div className="text-text-dim font-mono text-xs uppercase tracking-[0.1em]">
                    No providers yet.
                  </div>
                </EmptyContainer>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Group divider (Active pipeline vs Off pipeline) ─────────────
function GroupHeader({ children, muted = false, className = '' }) {
  return (
    <div className={cn(
      'flex items-center gap-3 mb-3 pb-2 border-b',
      muted ? 'border-surface2' : 'border-border',
      className,
    )}>
      <span className={cn(
        'font-mono text-[10px] uppercase tracking-[0.18em]',
        muted ? 'text-text-muted' : 'text-text-dim',
      )}>
        {children}
      </span>
    </div>
  );
}

// ─── Collapsible stage section (used for both active and off) ────
// `tone="active"` renders the stage label in accent teal; `muted`
// renders it in text-dim. Empty active stages are still rendered
// (the funnel shape is structural information); empty off-stages
// are filtered out by the caller.
function StageCollapsible({
  stage, label: labelOverride, providers, taskSummaryByProviderId,
  onCardClick, open, onToggle, tone, scrollMarginTop,
}) {
  const label = labelOverride ?? labelFor(PROVIDER_STATUSES, stage);
  const count = providers.length;
  return (
    <section
      id={`stage-${stage}`}
      style={{ scrollMarginTop: `${scrollMarginTop}px` }}
    >
      {/* Plain-text header — chevron + label + middot + count, all
          in one cluster. The pill/circle treatment is reserved for
          things that earn it (the task pill's overdue signal); the
          chip-strip chips above remain tappable nav and keep their
          outlined oval. Empty header right-side keeps the row
          left-anchored. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 py-2 px-1 cursor-pointer transition-colors hover:text-accent group"
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 flex-shrink-0 text-text-muted transition-transform group-hover:text-accent',
            open ? 'rotate-0' : '-rotate-90',
          )}
          strokeWidth={1.5}
        />
        <span className={cn(
          'font-display leading-none',
          tone === 'muted' ? 'text-[16px] text-text-dim' : 'text-[18px] text-accent',
        )}>
          {label}
        </span>
        <span className={cn(
          'font-mono text-[12px] leading-none',
          tone === 'muted' ? 'text-text-muted' : 'text-text-dim',
        )}>
          <span className="mx-1">·</span>
          {count}
          <span className="hidden md:inline ml-1">
            provider{count === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      {open && (
        count === 0 ? (
          <div className="font-mono text-[11px] text-text-muted italic px-6 pt-1 pb-3">
            —
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-2 mb-3">
            {providers.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                taskSummary={taskSummaryByProviderId.get(p.id)}
                onClick={() => onCardClick(p.id)}
                showStatus={false}
              />
            ))}
          </div>
        )
      )}
    </section>
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
