// Shared compute + ranking helpers for the financial-projection
// surfaces (Home V5, Home V6, /financial-projections). Pure JS —
// no I/O, called from a single useMemo per consumer with the
// loaded opportunities array.
//
// Architecture per piece-5 brief: one useOpportunities() fetch
// (already carries rate columns + modeling_assumptions via `*`),
// one useMemo that runs compute() per opp, partitions into
// filled / pipeline / not-yet-modeled, and slices/sorts per
// consumer. No N+1.

import { compute, mergeAssumptions, seedDefaults } from '@/utils/gp-modeler';
import { ACTIVE_OPPORTUNITY_STAGES, SPECIALTIES, POSITION_TYPES, labelFor } from '@/utils/constants';
import { eligibilityFilter, classifyProviderStage } from './shared';

// Projection-guard predicate — an opp without BOTH core rates set
// can't be projected honestly (compute() would return $0 across
// the board, dragging the ranking). Same predicate Opportunity.jsx
// uses for its in-page GP guard.
export function projectionGuardOn(opp) {
  return opp.bill_regular_hourly == null || opp.pay_regular_daily == null;
}

// Compute the projection slice each consumer needs — annualGP is
// the ranking key; perShiftGP, margin, and targetShiftsPerYear are
// display-only. Reads from saved modeling_assumptions; falls back
// to setting-aware seedDefaults when null (same path Opportunity
// Projection's always-visible summary uses).
//
// targetShiftsPerYear is derived display, not a stored value — same
// derivation the Projection summary's cadence line uses
// (shifts_per_week × weeks_billable_per_year). Surfaces volume
// context next to annual GP so the dollar reads correctly ($228k
// off 48 shifts vs $228k off 12 shifts are very different stories).
export function computeOpportunityProjection(opp) {
  const assumptions = mergeAssumptions(opp.setting, opp.modeling_assumptions);
  const result = compute(opp, assumptions);
  const shiftsPerWeek = Number(assumptions.shifts_per_week) || 0;
  const weeksPerYear  = Number(assumptions.weeks_billable_per_year) || 0;
  return {
    annualGP:             result.annual.gp,
    annualBill:           result.annual.bill,
    perShiftGP:           result.perShift.gp,
    perShiftBill:         result.perShift.bill,
    perShiftMargin:       result.perShift.margin,
    targetShiftsPerYear:  Math.round(shiftsPerWeek * weeksPerYear),
  };
}

// Partition all opps into the three financial-projection buckets.
// Lost (terminal failure) and stages outside the active-or-filled
// set drop out entirely — they're not portfolio-relevant.
export function bucketOpportunities(opportunities) {
  const modeledFilled   = [];
  const modeledPipeline = [];
  const notYetModeled   = [];

  for (const opp of opportunities) {
    const isFilled   = opp.stage === 'filled';
    const isPipeline = ACTIVE_OPPORTUNITY_STAGES.includes(opp.stage);
    if (!isFilled && !isPipeline) continue; // drop lost / null stage

    if (projectionGuardOn(opp)) {
      notYetModeled.push({ opp, bucket: isFilled ? 'filled' : 'pipeline' });
      continue;
    }
    const proj = computeOpportunityProjection(opp);
    if (isFilled) {
      modeledFilled.push({ opp, ...proj });
    } else {
      modeledPipeline.push({ opp, ...proj });
    }
  }
  return { modeledFilled, modeledPipeline, notYetModeled };
}

// V5 ranking — annual GP descending. Same comparator for filled
// and pipeline per the confirmed decision (filled sorts by
// annual GP, symmetric with pipeline).
export function sortByAnnualGP(rows) {
  return [...rows].sort((a, b) => (b.annualGP ?? 0) - (a.annualGP ?? 0));
}

// ── V6 "Can't Staff" staffing-gap derivation ─────────────────
//
// Per-opportunity readiness scan, INDEPENDENT of rate-modeling
// state. An opp without rates can still be unfillable for
// credential reasons — the staffing gap is real regardless of GP
// modeling. That's the load-bearing honesty rule for V6: V5
// excludes unmodeled opps (no projection to rank); V6 keeps them
// in the loop (the bench question doesn't depend on rates).
//
// Reuses V4's hooks-already-loaded data + the eligibilityFilter
// and classifyProviderStage helpers from home/shared.jsx — same
// loop SuggestedProviders runs on the detail page, just iterated
// across opps. Cost: N(opps) × N(active providers) at current
// volumes (~8 × ~18 = ~150 calls per render, memoized).

export function deriveStaffing({
  opp,
  providers,
  licensesByProvider,
  credentialsByProvider,
  privilegesByProvider,
  placementsByOpportunity,
}) {
  const placRows = placementsByOpportunity?.get(opp.id) ?? [];
  const filtered = eligibilityFilter({ opp, providers, licensesByProvider });

  // Tier counts mirror V4's match useMemo classification.
  const tiers = { privileged: 0, applied: 0, selected: 0, eligible: 0, blocked: 0 };
  for (const p of filtered) {
    const stage = classifyProviderStage({
      opp,
      provider:    p,
      licenses:    licensesByProvider.get(p.id)    ?? [],
      credentials: credentialsByProvider.get(p.id) ?? [],
      privileges:  privilegesByProvider.get(p.id)  ?? [],
      placement:   placRows.find(r => r.provider_id === p.id) ?? null,
    });
    tiers[stage] += 1;
  }
  // "Ready" = anyone who isn't blocked. Privileged/applied/
  // selected/eligible all represent a staffable path forward.
  const readyCount = tiers.privileged + tiers.applied + tiers.selected + tiers.eligible;
  return { tiers, readyCount, filteredCount: filtered.length };
}

// Diagnostic sub-line that NAMES THE ACTUAL BLOCKER(S), not just
// the first failing filter in check-order. The matching engine
// applies three hard filters — state license, specialty,
// position_type — so the question "why can't this be staffed?"
// requires checking each dimension INDEPENDENTLY against the
// active-roster pool, then naming the ones that actually zero
// out. Naming a non-blocker (or skipping a real one) points the
// user at the wrong recruiting action.
//
// Variants:
//   • "no state set"        — opp's hospital has no state
//   • "0 {position}s"       — no providers of that position type
//                             exist in the roster at all
//   • "0 in {specialty}"    — no providers in that specialty exist
//                             at all
//   • "0 licensed in {ST}"  — providers exist matching specialty/
//                             position but none hold a state
//                             license; OR no providers in roster
//                             period (degenerate empty roster)
//   • "0 {position}s · 0 in {specialty}"  — multiple independent
//                             dimensions block; names all in
//                             priority order
//   • "0 {position} {specialty}s in {ST}" — each dimension passes
//                             alone but the intersection is empty
//                             (e.g. NPs and GIs each exist, but no
//                             NP-GIs in MT). Combinatorial gap.
//   • "0 ready · N licensed in {ST}" — eligibility passes N
//                             candidates but ALL classified blocked
//                             by readiness (credential gaps).
//
// Priority order when naming multiple blockers: position > specialty
// > state. Position is the most concrete recruiting action ("hire
// an NP"), specialty is the next-most-actionable ("hire a GI"),
// state is recruiting + credentialing ("get someone licensed in OR").
export function staffingDiagnostic({
  opp,
  providers,
  licensesByProvider,
  staffing,
}) {
  const state = opp?.organization?.state ?? null;
  if (!state) return 'no state set';

  const activeRoster = (providers ?? []).filter(p => !p.archived);

  // Independent dimension passes against the active roster — count
  // providers that satisfy each filter ALONE, not in combination.
  const stateLicensed = activeRoster.filter(p => {
    const rows = licensesByProvider?.get(p.id) ?? [];
    return rows.some(l => l?.state === state && l?.status !== 'withdrawn');
  });
  const specialtyMatch = opp.specialty
    ? activeRoster.filter(p => p.specialty === opp.specialty)
    : activeRoster;
  const positionMatch = opp.position_type
    ? activeRoster.filter(p => p.position_type === opp.position_type)
    : activeRoster;

  // Collect the dimensions that independently zero out the pool.
  // Priority order is position > specialty > state — most-
  // actionable recruiting signal first.
  const blockers = [];
  if (opp.position_type && positionMatch.length === 0) {
    const posLabel = labelFor(POSITION_TYPES, opp.position_type) || opp.position_type;
    blockers.push({ dim: 'position', text: `0 ${posLabel}s` });
  }
  if (opp.specialty && specialtyMatch.length === 0) {
    const specLabel = labelFor(SPECIALTIES, opp.specialty) || opp.specialty;
    blockers.push({ dim: 'specialty', text: `0 in ${specLabel}` });
  }
  if (stateLicensed.length === 0) {
    blockers.push({ dim: 'state', text: `0 licensed in ${state}` });
  }

  if (staffing.filteredCount === 0) {
    if (blockers.length > 0) {
      // One or more dimensions ALONE eliminate everyone. Name them
      // all in priority order. Join with " · " — readable in mono
      // caps and short enough for 380px at typical lengths.
      return blockers.map(b => b.text).join(' · ');
    }
    // No single dimension zeroes the pool, but the INTERSECTION
    // does — combinatorial gap. Each filter has matches; together
    // they have none (e.g. NP-GIs in MT when NPs, GIs, and MT-
    // licensed providers each exist independently). Spell out
    // the combination so the user knows the joint condition is the
    // problem, not any single dimension.
    const parts = [];
    if (opp.position_type) parts.push(labelFor(POSITION_TYPES, opp.position_type) || opp.position_type);
    if (opp.specialty)     parts.push(labelFor(SPECIALTIES, opp.specialty) || opp.specialty);
    if (parts.length > 0) return `0 ${parts.join(' ')} in ${state}`;
    return `0 candidates in ${state}`;
  }

  // Eligibility passed N candidates but none classified as ready —
  // all hit the readiness 'blocked' branch (credential gaps,
  // missing core credentials, expired license, etc.).
  return `0 ready · ${staffing.filteredCount} licensed in ${state}`;
}
