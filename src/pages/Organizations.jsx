import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CardKebab } from '@/components/ui/card-kebab';
import Thumb from '@/components/uploads/Thumb';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import { ACTIVE_OPPORTUNITY_STAGES, ORGANIZATION_TYPES, labelFor } from '@/utils/constants';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Set-form of ACTIVE_OPPORTUNITY_STAGES for O(1) membership checks
// in the per-card bucketing loop. The array form lives in constants
// as the suite-wide source of truth (also consumed by the Home
// Snapshot KPI).
const ACTIVE_OPPORTUNITY_STAGE_SET = new Set(ACTIVE_OPPORTUNITY_STAGES);

// Kept exported for the detail page header — type renders as a
// colored chip there (badge treatment is appropriate in the
// structured detail context). On cards, type renders as a mono
// cap label to preserve the suite-wide "badge slot = lifecycle
// state" grammar.
export const TYPE_BADGE = {
  hospital:       'bg-accent-dim text-accent border-accent/40',
  locums_partner: 'bg-warning/15 text-warning border-warning/40',
  other:          'bg-surface2 text-text-dim border-border',
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

export default function Organizations() {
  const navigate = useNavigate();
  const { data, loading, error, create, update, remove } = useOrganizations();
  // Page-level fetch of opportunities, bucketed below into a per-org
  // active-count map. Same single-fetch + useMemo pattern Slice 3
  // established on Opportunities and Slice 4 carried to Providers.
  const opportunities = useOpportunities();

  const [search, setSearch]         = useState('');
  const [typeFilter, setType]       = useState('all');
  const [sort, setSort]             = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Anchor dialogs below this page's total fixed chrome (primary
  // header + bar-2 + bar-3 when search is open). Tracks searchOpen
  // live via the hook's dependency on its px argument.
  useChromeBottom(BAR1_H + BAR2_H + (searchOpen ? BAR3_H : 0));

  const filtersActive = typeFilter !== 'all' || sort !== SORT_DEFAULT;
  const searchActive  = search.trim().length > 0;
  const anyActive     = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setType('all');
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

  // Bucket active opportunities by organization_id into
  // Map<org_id, {count}>. An opportunity counts when its stage is
  // in ACTIVE_OPPORTUNITY_STAGES (i.e., still in-pipeline). The
  // organization_id is the hospital FK; source_partner_id is
  // intentionally NOT counted — the partner org isn't where the
  // demand sits.
  const activeOppCountByOrgId = useMemo(() => {
    const map = new Map();
    for (const o of opportunities.data) {
      if (!o.organization_id) continue;
      if (!ACTIVE_OPPORTUNITY_STAGE_SET.has(o.stage)) continue;
      const prev = map.get(o.organization_id) || { count: 0 };
      prev.count += 1;
      map.set(o.organization_id, prev);
    }
    return map;
  }, [opportunities.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(o => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false;
      if (!q) return true;
      return (
        o.name?.toLowerCase().includes(q)    ||
        o.city?.toLowerCase().includes(q)    ||
        o.state?.toLowerCase().includes(q)   ||
        o.website?.toLowerCase().includes(q)
      );
    });
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [data, search, typeFilter, sort]);

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
              Organizations
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              Hospitals · LOCUMs partners · Other
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
              ariaLabel="New organization"
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
            placeholder="Search by name, city, state, website…"
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
                {data.length === 0 ? 'No organizations yet.' : 'No matches for current filters.'}
              </div>
              {data.length === 0 && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent-dim font-mono uppercase tracking-[0.1em] text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" /> Create the first one
                </Button>
              )}
            </EmptyContainer>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="flex flex-col gap-3">
              {rows.map(o => (
                <OrganizationCard
                  key={o.id}
                  organization={o}
                  oppSummary={activeOppCountByOrgId.get(o.id)}
                  onClick={() => navigate(`/organizations/${o.id}`)}
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
              {rows.length} {rows.length === 1 ? 'organization' : 'organizations'}
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
              <FilterRow label="Type">
                <Select value={typeFilter} onValueChange={setType}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ORGANIZATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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

      <OrganizationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/organizations/${row.id}`);
        }}
      />

      {/* Edit dialog driven by the card kebab. List context — the
          OrganizationFormDialog has no in-dialog Delete, so no
          hideDeleteAction prop conflict. */}
      <OrganizationFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        org={editTarget}
        onSave={async (payload) => {
          try {
            await update(editTarget.id, payload);
            setEditTarget(null);
          } catch (err) {
            console.error('Organization update failed', err);
            toast.error(err?.message || 'Update failed.');
          }
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete "${deleteTarget.name || 'this organization'}"?`
          : 'Delete?'}
        description="This will also delete its contacts and activities. This cannot be undone."
        onConfirm={async () => {
          try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Organization delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

// Three-row mobile / single-content-cluster wide layout. Same shape
// as Providers (orgs are leaf-ish for card purposes — they have
// children, but the card doesn't surface them inline beyond the
// "N opportunities" pill). The thumb is the org's OWN logo, not a
// parent's.
//
// Per-page card variations:
//   - Type rendered as mono cap label on row 1 / top of content
//     cluster (categorization, not lifecycle state — grammar
//     consistency with Contacts' role). Badge slot stays empty;
//     right cluster has just the pill + kebab.
//   - Parent-scoped indicator is "N opportunity / opportunities"
//     counting active stages only (lead/qualified/proposal/
//     contracted). Filled and lost are terminal states, excluded.
//   - Org names allowed to wrap to 2 lines (line-clamp-2 / no
//     truncate). The truncate-vs-wrap call is principled: primary
//     identifiers wrap when truncation would lose meaning, truncate
//     when it wouldn't. Org names systematically need it — the
//     "Medical Center" / "Health System" suffix that disambiguates
//     is exactly what gets cut. Card height varies on this page as
//     a result (109px single-line, ~140px two-line); accepted as
//     a consequence of the wrap decision.
//
// Mobile rows:
//   1 — type mono cap + opportunities pill + kebab
//   2 — organization name (accent teal, font-display, primary,
//       wraps to 2 lines when needed)
//   3 — city, ST (mono dim, smaller font from the follow-up commit)
//
// Wide:
//   thumb (left, square logo / initials fallback)
//   content cluster (flex-1, three stacked rows):
//     type mono cap
//     name (accent teal, font-display, larger, wraps to 2 lines)
//     city, ST (mono dim)
//   right cluster (shrink-0, items-end, justify-between):
//     opportunities pill + kebab on top
//     empty placeholder on bottom (no lifecycle badge slot)
function OrganizationCard({ organization: o, oppSummary, onClick, onEdit, onDelete }) {
  const typeLabel = o.type ? labelFor(ORGANIZATION_TYPES, o.type) : null;
  const location = [o.city, o.state].filter(Boolean).join(', ');

  // Opportunities-count pill — same shape as Opportunities and
  // Providers. Mobile shows just the digit (compact circle); md+
  // shows "N opportunity" / "N opportunities" spelled out. Numeral
  // accent teal; no overdue treatment (opportunities don't have a
  // per-record overdue concept). Hidden when zero.
  const oppPill = oppSummary?.count > 0 ? (
    <span className="inline-flex items-center justify-center h-6 px-2 min-w-[24px] border border-border rounded-full font-mono text-[11px] leading-none whitespace-nowrap">
      <span className="text-accent">{oppSummary.count}</span>
      <span className="hidden md:inline ml-1 text-text-dim">
        opportunit{oppSummary.count === 1 ? 'y' : 'ies'}
      </span>
    </span>
  ) : null;

  const pillAndKebab = (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {oppPill}
      <CardKebab
        ariaLabel="Organization actions"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="relative bg-surface border border-border rounded p-3 md:px-5 md:py-3 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex items-center gap-3">
        <Thumb
          path={o.logo_path}
          bucket="organization-logos"
          alt={o.name}
          fallback={initialsFor(o.name)}
          size="lg"
          shape="square"
          className="h-20 w-20 text-base flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Row 1 — type mono cap + opportunities pill + kebab. */}
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim leading-none truncate">
              {typeLabel || '—'}
            </p>
            {pillAndKebab}
          </div>
          {/* Row 2 — name (primary). Wraps to 2 lines on long names
              (line-clamp-2). leading-tight gives reasonable line
              spacing for the wrap; negative top margin compensates
              for DM Serif Display's intrinsic line-box padding so
              the cap-height sits flush against row 1. */}
          <h3 className="mt-1 font-display text-[18px] text-accent leading-tight line-clamp-2">
            {o.name || '—'}
          </h3>
          {/* Row 3 — city, ST. mt-2 gives the dominant name-to-
              context break (less than the 4-row pattern's mt-3
              because there's only one row below the name). */}
          <p className="mt-2 font-mono text-[12px] text-text-dim leading-none truncate">
            {location || ''}
          </p>
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-stretch gap-5">
        <div className="flex-shrink-0 flex items-center">
          <Thumb
            path={o.logo_path}
            bucket="organization-logos"
            alt={o.name}
            fallback={initialsFor(o.name)}
            size="md"
            shape="square"
            className="h-12 w-12 lg:h-14 lg:w-14 text-sm"
          />
        </div>

        {/* Single content cluster — type / name (wrap) / city, ST */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim leading-none truncate">
            {typeLabel || '—'}
          </p>
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight line-clamp-2">
            {o.name || '—'}
          </h3>
          <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-none truncate">
            {location || <span className="text-text-muted">—</span>}
          </p>
        </div>

        {/* Right cluster — pill + kebab on top, empty placeholder
            on bottom (no lifecycle badge slot on orgs). */}
        <div className="flex-shrink-0 flex flex-col justify-between items-end gap-2">
          {pillAndKebab}
          {/* Invisible placeholder matches the badge baseline height
              so justify-between doesn't collapse single-child to
              center. Mirrors the Contacts wide-layout pattern when
              role is absent. */}
          <span aria-hidden className="h-[20px] leading-none" />
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
