import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import Thumb from '@/components/uploads/Thumb';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { TierKPICard } from '@/components/brand/KPICard';
import { useProviders } from '@/hooks/useProviders';
import { useAllCredentialing } from '@/hooks/useMatching';
import { usePlacements } from '@/hooks/usePlacements';
import { deriveShiftReadiness } from '@/components/credentialing/readiness';
import {
  deriveCredentialingStatus,
  privilegeIsExpiringSoon,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';
import { fmtName } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { POSITION_TYPES, labelFor, specialtyAbbrFor } from '@/utils/constants';
import { cn } from '@/lib/utils';

// Phase 4a + 4b — provider matching with the four-stage lifecycle
// and three hard eligibility filters.
//
// HARD ELIGIBILITY FILTERS (all must pass for a provider to appear):
//   1. STATE LICENSE: provider holds a non-withdrawn license row for
//      the opportunity's state (resolved via opp.organization.state).
//      Any non-withdrawn status counts — active, applied, pending,
//      and expired all let the row APPEAR; the lifecycle/verdict
//      badge tells the truth about its actual readiness. The single
//      'withdrawn' status (legacy column writes) excludes the row.
//   2. SPECIALTY: provider.specialty === opportunity.specialty.
//      Constrained-Select equality on both sides — safe. (Previously
//      a grouping; now a hard filter — the "Different specialty"
//      lower group is removed.)
//   3. POSITION TYPE: provider.position_type === opportunity
//      .position_type. CHECK-constrained text on both sides, same
//      shared POSITION_TYPES list — safe equality.
//
// Failing any filter excludes the provider entirely. Within the
// filtered list, rank by lifecycle stage (Privileged > Applied >
// Selected > Eligible > verdict-fallback), then name.
//
// EMPTY/EDGE STATES:
//   - No resolvable opportunity state (no hospital or hospital has
//     no state): show 0 providers + "No state is associated with
//     this opportunity." This is an unexpected setup, not engineered
//     around.
//   - Filtered list is empty but state is known: show "No providers
//     are currently eligible for this opportunity."
//
// Short / empty lists against today's sparse data are honest
// coverage truth, not a bug — three hard gates against largely-one-
// specialty data correctly produces few results.
//
// LIFECYCLE STAGES (post-filter, sort order):
//   Privileged — granted, current privilege at the opp's hospital.
//                Hospital-grain: applies to every opp at this
//                hospital.
//   Applied    — facility-privilege application in progress at the
//                opp's hospital. Also hospital-grain.
//   Selected   — a placements row exists for this (provider,
//                opportunity) pair. Opportunity-specific. The only
//                lifecycle state the CRM writes.
//   Eligible   — portable-ready, no further commitment yet.
//
// Privileged / Applied wording reads "at this hospital," not "for
// this opportunity" — the hospital-grain truth must stay legible.
//
// Cardinality is enforced in the placements hook (at-most-one
// non-cancelled row per pair), not in the schema.

// Within the Selected + Applied tier, selected sorts ABOVE applied —
// selection is the stronger commit (a recruiter-authored placement)
// than an in-flight privilege application that hasn't yet resulted
// in committal. Lifecycle progression still has applied AFTER selected
// across the full stage chain, but for the sort key inside the
// combined tier we want selected on top.
const LIFECYCLE_RANK = {
  privileged:   0,
  selected:     1,
  applied:      2,
  eligible:     3,
};

const LIFECYCLE_LABEL = {
  privileged:   'Privileged',
  applied:      'Applied',
  selected:     'Selected',
  eligible:     'Eligible',
};

// Tones reuse the existing credentialing palette so badges read in
// the same visual grammar as CredentialingSection's summary lines.
//   privileged → income green   (granted, the top-of-stack achievement)
//   applied    → warning amber  (in progress)
//   selected   → accent teal    (recruiter chose; also the section's
//                                identity colour — names, borders)
//   eligible   → text (white)   (qualified, in the pool, no special
//                                status — deliberately neutral so it
//                                doesn't read as Privileged-green or
//                                Selected-teal). The expiring override
//                                still flips this to warning amber.
const LIFECYCLE_TONE = {
  privileged: 'text-income',
  applied:    'text-warning',
  selected:   'text-accent',
  eligible:   'text-text',
};

const VERDICT_RANK = { ready: 0, expiring: 1, indeterminate: 2, blocked: 3 };

const VERDICT_TONE = {
  ready:         'text-income',
  expiring:      'text-warning',
  indeterminate: 'text-text-dim',
  blocked:       'text-danger',
};

const VERDICT_LABEL = {
  ready:         'Ready',
  expiring:      'Expiring',
  indeterminate: 'Incomplete',
  blocked:       'Blocked',
};

const REASON_PRIORITY = [
  'LICENSE_EXPIRED',
  'PRIVILEGE_DENIED',
  'PRIVILEGE_EXPIRED',
  'LICENSE_MISSING_FOR_STATE',
  'CORE_MISSING',
  'STATE_UNKNOWN',
  'CORE_EXPIRING',
  'PRIVILEGE_APPLIED',
  'PRIVILEGE_NONE',
  'REQUIREMENTS_UNDEFINED',
];

function topReason(reasons) {
  if (!reasons || reasons.length === 0) return null;
  for (const code of REASON_PRIORITY) {
    const hit = reasons.find(r => r.code === code);
    if (hit) return hit;
  }
  return reasons[0];
}

function derivePrivilegeStatus(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.approval_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  });
}

// Lifecycle stage derivation for ONE provider against ONE
// opportunity. Returns the stage key or null when the provider has
// no lifecycle standing (fall back to the verdict label).
function deriveLifecycle({ verdict, opportunityOrgId, privileges, placement }) {
  const hospitalPrivs = (privileges ?? []).filter(
    p => (p?.organization_id ?? p?.organization?.id) === opportunityOrgId,
  );
  const withStatus = hospitalPrivs.map(p => ({ row: p, status: derivePrivilegeStatus(p) }));

  const activePriv = withStatus.find(p => p.status === 'active');
  if (activePriv) {
    return {
      stage: 'privileged',
      expiring: privilegeIsExpiringSoon(activePriv.row),
    };
  }
  if (withStatus.some(p => p.status === 'applied')) {
    return { stage: 'applied' };
  }
  if (placement) {
    return { stage: 'selected' };
  }
  if (verdict.overall === 'ready')    return { stage: 'eligible' };
  if (verdict.overall === 'expiring') return { stage: 'eligible', expiring: true };
  return null;
}

export default function SuggestedProviders({ opportunity }) {
  const { data: allProviders, loading: provLoading, error: provError } = useProviders();
  const {
    licensesByProvider, credentialsByProvider, privilegesByProvider,
    loading: credLoading, error: credError,
  } = useAllCredentialing();
  const placements = usePlacements(opportunity?.id);

  const loading = provLoading || credLoading || placements.loading;
  const error   = provError   || credError   || placements.error;

  // Bucket the opportunity's placements by provider_id for O(1)
  // lookup per row. One placement row per pair is the app-layer
  // rule; if multiple rows ever land for the same pair we surface
  // the first.
  const placementByProvider = useMemo(() => {
    const map = new Map();
    for (const row of placements.data ?? []) {
      if (!map.has(row.provider_id)) map.set(row.provider_id, row);
    }
    return map;
  }, [placements.data]);

  const [pendingUnselect, setPendingUnselect] = useState(null);
  const [actingProviderId, setActingProviderId] = useState(null);
  const unselectTriggerRef = useRef(null);

  // Parent-owned open + focus state for the tier sections. The model
  // distinguishes two modes:
  //   • Card-driven (focused): exactly one section open, and the
  //     corresponding KPI card lights up with the accent treatment.
  //     Set by clicking a card OR by the default-open-on-load rule
  //     (highest-ranked non-empty tier).
  //   • Chevron-driven (multi-open or empty): any combination of
  //     sections open via individual chevrons, with NO card showing
  //     focus. Card focus is deliberately cleared whenever a chevron
  //     toggle or Expand All fires, because the "this is the focused
  //     tier" claim no longer holds when multiple sections are open.
  //
  // State is null until the user interacts — that lets the default
  // (which depends on tier sizes, computed after early returns) flow
  // through cleanly. Handlers resolve `current ?? defaultState`
  // before mutating, so they always start from the live values.
  const [tierOverride, setTierOverride] = useState(null);

  async function handleSelect(provider) {
    setActingProviderId(provider.id);
    try {
      await placements.selectProvider(provider.id);
      toast.success(`Selected ${fmtName(provider)}`);
    } catch (err) {
      console.error('select provider', err);
      toast.error(err?.message || 'Could not select');
    } finally {
      setActingProviderId(null);
    }
  }

  function requestUnselect(provider, placement, triggerEl) {
    unselectTriggerRef.current = triggerEl ?? null;
    setPendingUnselect({ provider, placement });
  }

  async function performUnselect() {
    if (!pendingUnselect) return;
    setActingProviderId(pendingUnselect.provider.id);
    try {
      await placements.unselectProvider(pendingUnselect.placement.id);
      toast.success(`Un-selected ${fmtName(pendingUnselect.provider)}`);
      setPendingUnselect(null);
    } catch (err) {
      console.error('unselect provider', err);
      toast.error(err?.message || 'Could not un-select');
      throw err;
    } finally {
      setActingProviderId(null);
    }
  }

  if (loading) return <Centered>Loading providers…</Centered>;
  if (error)   return <Centered tone="danger">{error.message}</Centered>;

  const oppSpecialty    = opportunity?.specialty ?? null;
  const oppPositionType = opportunity?.position_type ?? null;
  const oppOrgId        = opportunity?.organization?.id ?? null;
  const oppState        = opportunity?.organization?.state ?? null;

  // Edge: no resolvable opportunity state. Block the entire list —
  // this is an unexpected setup (hospital missing, or hospital row
  // has no state), not something to engineer around.
  if (!oppState) {
    return (
      <Centered>No state is associated with this opportunity.</Centered>
    );
  }

  // STATE LICENSE filter: provider must have a non-withdrawn license
  // row for the opportunity's state. ANY non-withdrawn status counts
  // (active, applied, pending, expired) — appearance is the gate,
  // the badge tells the truth about actual readiness.
  function hasStateLicense(providerId) {
    const rows = licensesByProvider.get(providerId) ?? [];
    return rows.some(l => l?.state === oppState && l?.status !== 'withdrawn');
  }

  const filtered = (allProviders ?? []).filter(p => {
    if (p.archived) return false;
    if (oppSpecialty    && p.specialty     !== oppSpecialty)    return false;
    if (oppPositionType && p.position_type !== oppPositionType) return false;
    if (!hasStateLicense(p.id)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <Centered>No providers are currently eligible for this opportunity.</Centered>
    );
  }

  const evaluated = filtered.map(provider => {
    const verdict = deriveShiftReadiness({
      opportunity,
      licenses:    licensesByProvider.get(provider.id)    ?? [],
      credentials: credentialsByProvider.get(provider.id) ?? [],
      privileges:  privilegesByProvider.get(provider.id)  ?? [],
      provider,
    });
    const placement = placementByProvider.get(provider.id) ?? null;
    const lifecycle = deriveLifecycle({
      verdict,
      opportunityOrgId: oppOrgId,
      privileges: privilegesByProvider.get(provider.id) ?? [],
      placement,
    });
    return { provider, verdict, placement, lifecycle };
  });

  const sorted = sortByLifecycle(evaluated);

  // Tier bucketing — presentation regroup of the already-derived
  // lifecycle. The four-tier UX is:
  //   • Privileged & Ready  — lifecycle.stage === 'privileged'
  //   • Selected + Applied  — 'selected' or 'applied'
  //   • Suggested/Eligible  — 'eligible'
  //   • Blocked             — null lifecycle (verdict-fallback row)
  // Counts always render (zero reads as "zero", not "missing");
  // empty tiers do NOT render their CollapsibleSection.
  const tiers = {
    privileged: [],
    selApp:     [],
    eligible:   [],
    blocked:    [],
  };
  for (const item of sorted) {
    const stage = item.lifecycle?.stage ?? null;
    if (stage === 'privileged')                            tiers.privileged.push(item);
    else if (stage === 'selected' || stage === 'applied')  tiers.selApp.push(item);
    else if (stage === 'eligible')                         tiers.eligible.push(item);
    else                                                   tiers.blocked.push(item);
  }
  const counts = {
    privileged: tiers.privileged.length,
    selApp:     tiers.selApp.length,
    eligible:   tiers.eligible.length,
    blocked:    tiers.blocked.length,
  };

  const renderRow = (item) => (
    <ProviderRow
      key={item.provider.id}
      item={item}
      acting={actingProviderId === item.provider.id}
      onSelect={() => handleSelect(item.provider)}
      onUnselect={(triggerEl) => requestUnselect(item.provider, item.placement, triggerEl)}
    />
  );

  // Tier metadata in display order — card label, tone for the
  // KPI-card value, section heading inside its CollapsibleSection.
  // Note: the Selected+Applied tier card reads "Selected" (the
  // primary lifecycle the recruiter authored) while its section
  // heading keeps "Selected + Applied" since the Applied rows fold
  // into the same group.
  const tierDefs = [
    { key: 'privileged', card: 'Ready',    section: 'Privileged & Ready',  color: 'green'   },
    { key: 'selApp',     card: 'Selected', section: 'Selected + Applied',  color: 'default' },
    { key: 'eligible',   card: 'Eligible', section: 'Suggested / Eligible', color: 'white'  },
    { key: 'blocked',    card: 'Blocked',  section: 'Blocked',              color: 'red'    },
  ];

  // Default-open rule: the highest-ranked tier that has members.
  // tierDefs order is the rank order. Card focus matches.
  const defaultTierKey = tierDefs.find(t => tiers[t.key].length > 0)?.key ?? null;
  const defaultState = {
    open:    defaultTierKey ? new Set([defaultTierKey]) : new Set(),
    focused: defaultTierKey,
  };
  const { open: openTiers, focused: focusedCard } = tierOverride ?? defaultState;

  function handleCardClick(tierK, isEmpty) {
    if (isEmpty) return;
    setTierOverride(prev => {
      const current = prev ?? defaultState;
      if (current.focused === tierK) {
        return { open: new Set(), focused: null };
      }
      return { open: new Set([tierK]), focused: tierK };
    });
  }

  function handleTierToggle(tierK, nextOpen) {
    setTierOverride(prev => {
      const current = prev ?? defaultState;
      const nextOpenSet = new Set(current.open);
      if (nextOpen) nextOpenSet.add(tierK);
      else nextOpenSet.delete(tierK);
      // Chevron clears focus — multi-open via chevrons is the
      // non-card-driven mode, so no card lights up.
      return { open: nextOpenSet, focused: null };
    });
  }

  function handleExpandAll() {
    const allOpen = new Set(tierDefs.filter(t => tiers[t.key].length > 0).map(t => t.key));
    setTierOverride({ open: allOpen, focused: null });
  }

  const nonEmptyCount = tierDefs.reduce((n, t) => n + (tiers[t.key].length > 0 ? 1 : 0), 0);

  return (
    <div>
      {/* Expand All — muted text-only affordance above the cards.
          Hidden when there's nothing meaningful to expand (zero or
          one non-empty tier) and when everything is already open. */}
      {nonEmptyCount > 1 && openTiers.size < nonEmptyCount && (
        <div className="flex justify-center mb-3">
          <button
            type="button"
            onClick={handleExpandAll}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors"
          >
            Expand all
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {tierDefs.map(t => (
          <TierKPICard
            key={t.key}
            label={t.card}
            value={counts[t.key]}
            color={t.color}
            focused={focusedCard === t.key && tiers[t.key].length > 0}
            disabled={tiers[t.key].length === 0}
            onClick={() => handleCardClick(t.key, tiers[t.key].length === 0)}
          />
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {tierDefs.map(t => {
          if (tiers[t.key].length === 0) return null;
          return (
            <CollapsibleSection
              key={t.key}
              label={t.section}
              open={openTiers.has(t.key)}
              onOpenChange={(next) => handleTierToggle(t.key, next)}
            >
              <RowList items={tiers[t.key]} renderRow={renderRow} muted={t.key === 'blocked'} />
            </CollapsibleSection>
          );
        })}
      </div>

      <ConfirmDeleteDialog
        open={Boolean(pendingUnselect)}
        onOpenChange={(open) => { if (!open) setPendingUnselect(null); }}
        triggerRef={unselectTriggerRef}
        title={
          pendingUnselect
            ? `Un-select ${fmtName(pendingUnselect.provider)}?`
            : 'Un-select?'
        }
        description="This removes the commitment record. There is no undo and no audit trail."
        confirmLabel="Un-select"
        onConfirm={performUnselect}
      />
    </div>
  );
}

function sortByLifecycle(list) {
  return list.slice().sort((a, b) => {
    const ra = a.lifecycle ? LIFECYCLE_RANK[a.lifecycle.stage] : 99;
    const rb = b.lifecycle ? LIFECYCLE_RANK[b.lifecycle.stage] : 99;
    if (ra !== rb) return ra - rb;
    // Fallback: providers without a lifecycle stage sort by verdict rank.
    const va = VERDICT_RANK[a.verdict.overall] ?? 99;
    const vb = VERDICT_RANK[b.verdict.overall] ?? 99;
    if (va !== vb) return va - vb;
    return fmtName(a.provider ?? {}).localeCompare(fmtName(b.provider ?? {}));
  });
}

function RowList({ items, muted = false, renderRow }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn('divide-y divide-border/40', muted && 'opacity-70')}>
      {items.map(renderRow)}
    </ul>
  );
}

function ProviderRow({ item, acting, onSelect, onUnselect }) {
  const { provider, verdict, placement, lifecycle } = item;
  const reason = topReason(verdict.reasons);
  const isSelected = Boolean(placement);

  // Label + tone: lifecycle stage wins when present, else fall back
  // to the verdict label so blocked/indeterminate providers still
  // carry their original reading.
  let label, tone;
  if (lifecycle) {
    label = LIFECYCLE_LABEL[lifecycle.stage];
    tone  = lifecycle.expiring && lifecycle.stage !== 'applied'
      ? 'text-warning'
      : LIFECYCLE_TONE[lifecycle.stage];
  } else {
    label = VERDICT_LABEL[verdict.overall] ?? verdict.overall;
    tone  = VERDICT_TONE[verdict.overall] ?? 'text-text-dim';
  }

  // Desktop meta — the full position·specialty·state line under the
  // name. Mobile drops position+specialty (they're constant across
  // this filtered list — every row matches the opportunity's spec
  // and position type, so repeating them on every row is noise) and
  // shows only home state, alongside the dropped-down status on the
  // lower line. Breakpoint matches the suite's responsive card
  // pattern (md, 768px).
  const desktopMeta = [
    provider.position_type ? labelFor(POSITION_TYPES, provider.position_type) : null,
    provider.specialty ? specialtyAbbrFor(provider.specialty) : null,
    provider.home_state || null,
  ].filter(Boolean).join(' · ');

  const homeState = provider.home_state || '';

  const tonedLabel = (
    <div className={cn(
      'font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0',
      tone,
    )}>
      {label}
    </div>
  );

  return (
    <li className={cn(
      'relative',
      // Left border accent makes Selected-or-further rows scan-
      // distinct from mere suggestions, without changing the row's
      // height or layout.
      isSelected && 'border-l-2 border-accent',
    )}>
      <Link
        to={`/providers/${provider.id}`}
        className={cn(
          'block py-3 pr-12 rounded hover:bg-surface2/40 transition-colors',
          isSelected ? 'pl-2' : 'pl-1 -ml-1',
        )}
      >
        <div className="flex items-start gap-3">
          <Thumb
            path={provider.photo_path}
            bucket="provider-photos"
            alt={fmtName(provider)}
            fallback={initialsFor(provider)}
            size="md"
          />
          <div className="flex-1 min-w-0">
            {/* MOBILE layout (below md): name claims its full row;
                the lower line carries home state on the left and the
                status label dropped down to align horizontally with
                where it sat before — right edge of the meta column,
                roughly the lower half of the action button's vertical
                run. */}
            <div className="md:hidden">
              <div className="text-accent text-sm font-medium truncate">
                {fmtName(provider)}
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim">
                  {homeState}
                </div>
                {tonedLabel}
              </div>
            </div>

            {/* DESKTOP layout (md+): unchanged — status sits inline
                with the name on row 1, full position·spec·state meta
                on row 2. */}
            <div className="hidden md:block">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-accent text-sm font-medium truncate">
                  {fmtName(provider)}
                </div>
                {tonedLabel}
              </div>
              {desktopMeta && (
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">
                  {desktopMeta}
                </div>
              )}
            </div>

            {/* Warning / reason lines below either layout. */}
            {reason && !lifecycle && (
              <div className={cn('text-xs mt-1 leading-snug', tone)}>
                {reason.detail}
              </div>
            )}
            {lifecycle && lifecycle.stage === 'applied' && (
              <div className="text-xs mt-1 leading-snug text-warning">
                Privilege application in progress at this hospital.
              </div>
            )}
            {lifecycle && lifecycle.stage === 'privileged' && lifecycle.expiring && (
              <div className="text-xs mt-1 leading-snug text-warning">
                Privilege at this hospital expires within 90 days.
              </div>
            )}
          </div>
        </div>
      </Link>

      <ActionButton
        isSelected={isSelected}
        acting={acting}
        onSelect={onSelect}
        onUnselect={onUnselect}
        providerName={fmtName(provider)}
      />
    </li>
  );
}

function ActionButton({ isSelected, acting, onSelect, onUnselect, providerName }) {
  const ariaLabel = isSelected
    ? `Un-select ${providerName}`
    : `Select ${providerName}`;
  const Icon = isSelected ? UserMinus : UserPlus;

  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (acting) return;
    if (isSelected) {
      onUnselect(e.currentTarget);
    } else {
      onSelect();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={acting}
      aria-label={ariaLabel}
      className={cn(
        'absolute right-1 top-2 inline-flex items-center justify-center w-9 h-9 rounded',
        'border transition-colors',
        isSelected
          ? 'border-accent/40 text-accent hover:bg-accent-dim'
          : 'border-border text-text-dim hover:border-accent/60 hover:text-accent hover:bg-accent-dim/60',
        acting && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Centered({ children, tone }) {
  return (
    <div className={cn(
      'text-center font-mono text-[11px] uppercase tracking-[0.12em] py-4',
      tone === 'danger' ? 'text-danger' : 'text-text-dim',
    )}>
      {children}
    </div>
  );
}
