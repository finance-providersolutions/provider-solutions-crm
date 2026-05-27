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

// Phase 4a + 4b — provider matching surface.
//
// ORTHOGONAL-AXES STRUCTURE — restructured from the original
// four-stage lifecycle to a three-tier shape where TIER = selection
// intent for THIS opportunity, BADGE = privileging progress at the
// opportunity's hospital. The two axes are independent: a provider
// can be Selected for Placement AND already Privileged, or Selected
// AND not-yet-privileged, or Not Selected but Privileged here, etc.
// The tier groups the operationally-coherent set ("did we commit to
// this provider for this opp"); the badge says where they stand in
// the privileging work. See DESIGN-NOTES "Provider Availability
// tiers" for the override history.
//
// HARD ELIGIBILITY FILTERS (all must pass for a provider to appear):
//   1. STATE LICENSE: provider holds a non-withdrawn license row for
//      the opportunity's state (resolved via opp.organization.state).
//      Any non-withdrawn status counts — active, applied, pending,
//      and expired all let the row APPEAR; the badge tells the truth
//      about its actual readiness. 'withdrawn' excludes the row.
//   2. SPECIALTY: provider.specialty === opportunity.specialty.
//   3. POSITION TYPE: provider.position_type === opportunity
//      .position_type.
//
// Failing any filter excludes the provider entirely.
//
// TIER DECISION TREE (per provider, after the hard filters above):
//   if (placement exists for this opp)                  → Selected
//   else if (active OR applied privilege at oppOrgId)   → Suggested/Eligible
//   else if (verdict.overall in {ready, expiring})      → Suggested/Eligible
//   else                                                → Blocked
//
// "Active or applied privilege at the hospital" is treated as a
// positive eligibility signal under the new structure — it now feeds
// the Suggested/Eligible tier rather than carving out a "Privileged
// & Ready" tier of its own. The fact that a provider is already
// privileged (or applied) at the hospital becomes a row-level badge
// signal — a selection prompt for the recruiter — rather than its
// own group.
//
// BADGE = privileging progress at the opportunity's hospital. Within
// Selected and Eligible tiers:
//   privileged → "Privileged"  (income green; warning amber if
//                                expiring within 90 days)
//   applied    → "Applied"     (warning amber, with "application in
//                                progress at this hospital" subline)
//   none       → "Eligible"    (text white; warning amber if verdict
//                                says expiring)
// "Selected" is NOT a badge label — selection is conveyed by tier
// grouping; the badge's only job inside non-Blocked tiers is the
// orthogonal privileging-progress axis.
//
// Blocked tier rows keep the verdict-fallback labels (Blocked /
// Incomplete) with their reason-detail sublines.
//
// EMPTY/EDGE STATES:
//   - No resolvable opportunity state (no hospital or hospital has
//     no state): show 0 providers + "No state is associated with
//     this opportunity." Unexpected setup, not engineered around.
//   - Filtered list is empty but state is known: show "No providers
//     are currently eligible for this opportunity."

// PRIVILEGE_PROGRESS_* — the row-level orthogonal axis (badge state
// and within-tier sort key). Selection is NOT in this enum — selection
// is a tier-membership signal, not a badge signal.
//
// Sort rank within a tier: privileged > applied > none. Surfaces
// ready-to-deploy rows at the top of each tier (recruiter sees the
// strongest candidates / strongest selections first).
const PRIVILEGE_PROGRESS_RANK = {
  privileged: 0,
  applied:    1,
  none:       2,
};

// Label map for non-Blocked tier rows. 'none' renders as "Eligible"
// because within a non-Blocked tier the row is by definition eligible
// — the badge just communicates "no privilege progress yet at this
// hospital." Same label whether the provider is in Selected or
// Suggested tier — the tier carries the selection truth, the label
// carries the orthogonal privilege truth.
const PRIVILEGE_PROGRESS_LABEL = {
  privileged: 'Privileged',
  applied:    'Applied',
  none:       'Eligible',
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

// Compute the privileging-progress state for one provider against
// the opportunity's hospital. Returns the badge axis: which privilege
// row at this hospital is the leading signal, and whether the active
// one (if any) is expiring within 90 days.
//
// 'privileged' beats 'applied' beats 'none' inside this function —
// reflecting that a granted current privilege is the strongest single
// signal at the hospital. (Inside the bigger picture, selection still
// trumps privileging for tier membership — see computeGroup below.)
function computePrivilegeProgress(hospitalPrivs) {
  const withStatus = (hospitalPrivs ?? []).map(p => ({
    row: p,
    status: derivePrivilegeStatus(p),
  }));
  const activePriv = withStatus.find(p => p.status === 'active');
  if (activePriv) {
    return {
      state:    'privileged',
      expiring: privilegeIsExpiringSoon(activePriv.row),
    };
  }
  if (withStatus.some(p => p.status === 'applied')) {
    return { state: 'applied' };
  }
  return { state: 'none' };
}

// Compute which TIER (Selected / Suggested-Eligible / Blocked) a
// provider belongs to for this opportunity. Tiers are mutually
// exclusive and exhaustive. Pure function — takes the resolved
// signals as input, doesn't re-fetch.
//
// Cascade (placement intent over lifecycle progression — see
// DESIGN-NOTES "Tier structure restructured"):
//   1. placement for this opp exists      → 'selected'
//   2. active OR applied priv at hospital → 'eligible'   (positive
//                                                          eligibility
//                                                          signal,
//                                                          not selection)
//   3. verdict ready / expiring           → 'eligible'   (portable-
//                                                          ready, no
//                                                          hospital
//                                                          progress)
//   4. everything else                    → 'blocked'
function computeGroup({ placement, privProgress, verdict }) {
  if (placement) return 'selected';
  if (privProgress.state === 'privileged' || privProgress.state === 'applied') {
    return 'eligible';
  }
  if (verdict?.overall === 'ready' || verdict?.overall === 'expiring') {
    return 'eligible';
  }
  return 'blocked';
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
  //     focus.
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

  // Per-provider evaluation — verdict from the readiness engine,
  // placement from the per-opp lookup, privilege progress from the
  // hospital-scoped subset of the provider's privileges, group from
  // the three signals together.
  const evaluated = filtered.map(provider => {
    const verdict = deriveShiftReadiness({
      opportunity,
      licenses:    licensesByProvider.get(provider.id)    ?? [],
      credentials: credentialsByProvider.get(provider.id) ?? [],
      privileges:  privilegesByProvider.get(provider.id)  ?? [],
      provider,
    });
    const placement = placementByProvider.get(provider.id) ?? null;
    const hospitalPrivs = (privilegesByProvider.get(provider.id) ?? [])
      .filter(p => (p?.organization_id ?? p?.organization?.id) === oppOrgId);
    const privProgress = computePrivilegeProgress(hospitalPrivs);
    const group = computeGroup({ placement, privProgress, verdict });
    return { provider, verdict, placement, privProgress, group };
  });

  // Tier bucketing — three tiers, mutually exclusive. Counts always
  // render (zero reads as "zero", not "missing"); empty tiers do NOT
  // render their CollapsibleSection.
  const tiers = {
    selected: [],
    eligible: [],
    blocked:  [],
  };
  for (const item of evaluated) {
    tiers[item.group].push(item);
  }
  // Within-tier sort: by privilege-progress (privileged > applied >
  // none) then by name for non-Blocked tiers; by verdict severity
  // then name for the Blocked tier (unchanged).
  for (const key of Object.keys(tiers)) {
    tiers[key] = sortWithinTier(tiers[key], key);
  }
  const counts = {
    selected: tiers.selected.length,
    eligible: tiers.eligible.length,
    blocked:  tiers.blocked.length,
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

  // Three-tier definitions in display order. Section heading is the
  // longer phrase shown inside the CollapsibleSection; card label is
  // the compact KPI strip label.
  const tierDefs = [
    { key: 'selected', card: 'Selected', section: 'Selected for Placement', color: 'default' },
    { key: 'eligible', card: 'Eligible', section: 'Suggested / Eligible',   color: 'white'   },
    { key: 'blocked',  card: 'Blocked',  section: 'Blocked',                color: 'red'     },
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

      <div className="grid grid-cols-3 gap-2">
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

// Within-tier sort. Privilege-progress is the primary key for the
// non-Blocked tiers — privileged rows above applied above none — so
// the strongest selections (ready to deploy) and strongest candidates
// (already privileged here) surface at the top of each tier. Name
// breaks ties.
//
// The Blocked tier sorts by verdict severity then name — unchanged
// from the previous implementation. Blocked rows have privProgress
// .state === 'none' uniformly, so the privilege rank wouldn't
// distinguish them anyway.
function sortWithinTier(items, tierKey) {
  return items.slice().sort((a, b) => {
    if (tierKey === 'blocked') {
      const va = VERDICT_RANK[a.verdict.overall] ?? 99;
      const vb = VERDICT_RANK[b.verdict.overall] ?? 99;
      if (va !== vb) return va - vb;
      return fmtName(a.provider ?? {}).localeCompare(fmtName(b.provider ?? {}));
    }
    const ra = PRIVILEGE_PROGRESS_RANK[a.privProgress.state] ?? 99;
    const rb = PRIVILEGE_PROGRESS_RANK[b.privProgress.state] ?? 99;
    if (ra !== rb) return ra - rb;
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
  const { provider, verdict, placement, privProgress, group } = item;
  const reason = topReason(verdict.reasons);
  const isSelected = Boolean(placement);

  // Badge derivation — the orthogonal-axes structure puts privilege
  // progress on the badge (and selection on the tier). Blocked tier
  // rows fall through to the verdict-fallback label since their
  // privProgress is uniformly 'none' (the badge would otherwise read
  // "Eligible" which is wrong for a blocked row).
  let label, tone;
  if (group === 'blocked') {
    label = VERDICT_LABEL[verdict.overall] ?? verdict.overall;
    tone  = VERDICT_TONE[verdict.overall] ?? 'text-text-dim';
  } else if (privProgress.state === 'privileged') {
    label = PRIVILEGE_PROGRESS_LABEL.privileged;
    tone  = privProgress.expiring ? 'text-warning' : 'text-income';
  } else if (privProgress.state === 'applied') {
    label = PRIVILEGE_PROGRESS_LABEL.applied;
    tone  = 'text-warning';
  } else {
    // privProgress.state === 'none', non-Blocked tier. The badge
    // says "Eligible" — same label whether the row sits in Selected
    // or Suggested tier, since the tier carries selection truth and
    // the badge carries the orthogonal privilege truth.
    label = PRIVILEGE_PROGRESS_LABEL.none;
    tone  = (verdict.overall === 'expiring') ? 'text-warning' : 'text-text';
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

  // Left-border accent on selected rows was dropped under the
  // orthogonal-axes restructure — the Selected for Placement tier
  // already conveys selection at the group level, so the per-row
  // border read as redundant. If selection-by-row needs to come
  // back, this is the place to reinstate it.
  return (
    <li className="relative">
      <Link
        to={`/providers/${provider.id}`}
        className="block py-3 pl-1 -ml-1 pr-12 rounded hover:bg-surface2/40 transition-colors"
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

            {/* Sublines below either layout. The applied / expiring
                sublines key off privilege progress directly (not tier
                membership) — a Selected-and-applied row still shows
                "Privilege application in progress at this hospital,"
                same as a Suggested-and-applied row would. */}
            {group === 'blocked' && reason && (
              <div className={cn('text-xs mt-1 leading-snug', tone)}>
                {reason.detail}
              </div>
            )}
            {privProgress.state === 'applied' && (
              <div className="text-xs mt-1 leading-snug text-warning">
                Privilege application in progress at this hospital.
              </div>
            )}
            {privProgress.state === 'privileged' && privProgress.expiring && (
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
