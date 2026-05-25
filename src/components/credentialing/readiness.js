// Phase 3b — zero-fetch shift-readiness derivation. Pure function;
// callers fetch and pass the already-loaded data. Reuses the row-
// level status derivation from expiration.js — date math is NEVER
// reimplemented here.
//
// The helper splits readiness into two tiers:
//
//   portable  — license + core credentials. Portable across hospitals.
//               THIS is the roll-up that drives `overall`.
//   facility  — hospital-specific privileges at the opportunity's
//               organization. Reported as a companion; NEVER folded
//               into overall (an unplaced candidate routinely has no
//               privilege row yet — folding it in would mark every
//               candidate blocked and defeat the whole split).
//
// Every dimension is requirements-gated: opportunity.required_items
// must explicitly list the dimension key for the dimension to run.
// If required_items is null or empty, the helper short-circuits with
// overall:'indeterminate' / REQUIREMENTS_UNDEFINED before any
// dimension runs — no requirements means "not honestly assessable",
// not "ready by default".
//
// Facility dimension status values: 'ready' | 'expiring' | 'applied'
// | 'blocked'. The 'applied' value (Phase 4b) flags an in-flight
// privilege application at the opportunity's hospital — its own
// flavor between ready and blocked, NEVER folded into `overall`.

import {
  deriveCredentialingStatus,
  daysUntil,
  PRIVILEGE_TERMINAL_STATUSES,
} from './expiration.js';

// Core credential types per CREDENTIAL_TYPES, excluding 'other' —
// 'other' rows are catch-alls with no enum identity, so they can
// never satisfy a typed requirement.
const CORE_CREDENTIAL_TYPES = [
  'board_certification',
  'dea',
  'bls',
  'acls',
  'malpractice',
];

// Roll-up precedence: blocked > indeterminate > expiring > ready.
// A known failure is dispositive even under uncertainty; an
// expiring required component flips the roll-up to expiring.
const STATUS_RANK = { ready: 0, expiring: 1, indeterminate: 2, blocked: 3 };
const RANK_TO_STATUS = ['ready', 'expiring', 'indeterminate', 'blocked'];

function maxStatus(...statuses) {
  let max = 0;
  for (const s of statuses) {
    const r = STATUS_RANK[s] ?? 0;
    if (r > max) max = r;
  }
  return RANK_TO_STATUS[max];
}

// "Expiring soon" = active row whose expiration is within 90 days
// from today (and not yet past — past is already 'expired' via the
// derivation). Mirrors the 30/60/90 windows the credentialing
// dashboard uses.
function isExpiringSoon(expirationDate) {
  const d = daysUntil(expirationDate);
  return d != null && d >= 0 && d <= 90;
}

function deriveLicense(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.issue_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
  });
}

function deriveCredential(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.issue_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
  });
}

function derivePrivilege(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.approval_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  });
}

export function deriveShiftReadiness({
  opportunity,
  licenses = [],
  credentials = [],
  privileges = [],
  provider,
} = {}) {
  const opportunityId = opportunity?.id ?? null;
  const providerId    = provider?.id ?? opportunity?.provider_id ?? null;

  const required = Array.isArray(opportunity?.required_items)
    ? opportunity.required_items
    : null;

  // Short-circuit: no requirements declared → not honestly
  // assessable. Returns BEFORE any dimension runs so STATE_UNKNOWN /
  // CORE_MISSING / PRIVILEGE_NONE etc. can never fire here.
  if (!required || required.length === 0) {
    return {
      providerId,
      opportunityId,
      resolvedState: null,
      overall: 'indeterminate',
      portable: {
        status: 'indeterminate',
        license:         { status: 'indeterminate', reasons: [] },
        coreCredentials: { status: 'indeterminate', reasons: [], missing: [], expiring: [] },
      },
      facility: {
        status: 'indeterminate',
        privileges: { status: 'indeterminate', reasons: [] },
      },
      reasons: [
        {
          tier: 'overall',
          dimension: null,
          code: 'REQUIREMENTS_UNDEFINED',
          severity: 'soft',
          detail: 'Opportunity has no required credentialing items set.',
        },
      ],
    };
  }

  const requiredSet = new Set(required);
  const reasons = [];

  // ─── License dimension ──────────────────────────────────────────
  // Skipped dimensions default to 'ready' (rank 0) so they contribute
  // nothing to the portable roll-up. The license sub-object stays
  // present so consumers can address it positionally.
  const license = { status: 'ready', reasons: [] };
  let resolvedState = null;

  if (requiredSet.has('license')) {
    const state = opportunity?.organization?.state ?? null;
    resolvedState = state;

    if (!state) {
      // STATE_UNKNOWN may ONLY fire when 'license' is in
      // required_items — gated by the outer `if`, so the
      // skipped-license path can never emit it.
      license.status = 'indeterminate';
      const r = {
        tier: 'portable',
        dimension: 'license',
        code: 'STATE_UNKNOWN',
        severity: 'soft',
        detail: "Hospital state is not set on the opportunity's organization; license cannot be verified.",
      };
      license.reasons.push(r);
      reasons.push(r);
    } else {
      const stateLicenses = (licenses ?? []).filter(l => l?.state === state);
      const derived = stateLicenses.map(l => ({ row: l, status: deriveLicense(l) }));
      const actives = derived.filter(d => d.status === 'active');

      if (actives.length > 0) {
        // 'active' from the derivation already excludes expired rows.
        // If every active row is within the 90-day window, flag the
        // dimension as 'expiring'; otherwise at least one comfortably
        // active license satisfies → 'ready'. No code is emitted on
        // 'expiring' — the code list intentionally has no
        // LICENSE_EXPIRING; the dimension status communicates it.
        const allExpiring = actives.every(d => isExpiringSoon(d.row.expiration_date));
        license.status = allExpiring ? 'expiring' : 'ready';
      } else if (derived.some(d => d.status === 'expired')) {
        license.status = 'blocked';
        const r = {
          tier: 'portable',
          dimension: 'license',
          code: 'LICENSE_EXPIRED',
          severity: 'hard',
          detail: `${state} license is expired.`,
        };
        license.reasons.push(r);
        reasons.push(r);
      } else {
        // No active, no expired → no licence on file for the state,
        // or only 'applied'/'pending' rows (which per the spec do
        // NOT satisfy — applying for a state is not the same as
        // being licensed in it).
        license.status = 'blocked';
        const r = {
          tier: 'portable',
          dimension: 'license',
          code: 'LICENSE_MISSING_FOR_STATE',
          severity: 'hard',
          detail: `Provider does not hold an active ${state} license.`,
        };
        license.reasons.push(r);
        reasons.push(r);
      }
    }
  }

  // ─── Core credentials dimension ────────────────────────────────
  // Each required credential-type key (from CREDENTIAL_TYPES, minus
  // 'other') is evaluated independently. State-independent — runs
  // even when license is indeterminate.
  const coreCredentials = {
    status: 'ready',
    reasons: [],
    missing: [],
    expiring: [],
  };
  const requiredCoreTypes = CORE_CREDENTIAL_TYPES.filter(t => requiredSet.has(t));

  for (const type of requiredCoreTypes) {
    const rows = (credentials ?? []).filter(c => c?.credential_type === type);
    if (rows.length === 0) {
      coreCredentials.missing.push(type);
      continue;
    }
    const derived = rows.map(r => ({ row: r, status: deriveCredential(r) }));
    const actives = derived.filter(d => d.status === 'active');
    if (actives.length === 0) {
      // 'expired' / 'applied' / 'pending' — none satisfy.
      coreCredentials.missing.push(type);
      continue;
    }
    const hasComfortablyActive = actives.some(d => !isExpiringSoon(d.row.expiration_date));
    if (!hasComfortablyActive) {
      coreCredentials.expiring.push(type);
    }
    // else: at least one active row well outside the 90-day window
    // → this type is satisfied (no entry in missing/expiring).
  }

  for (const type of coreCredentials.missing) {
    const r = {
      tier: 'portable',
      dimension: 'coreCredentials',
      code: 'CORE_MISSING',
      severity: 'hard',
      detail: `Required core credential missing or not active: ${type}.`,
    };
    coreCredentials.reasons.push(r);
    reasons.push(r);
  }
  for (const type of coreCredentials.expiring) {
    const r = {
      tier: 'portable',
      dimension: 'coreCredentials',
      code: 'CORE_EXPIRING',
      severity: 'soft',
      detail: `Required core credential expiring within 90 days: ${type}.`,
    };
    coreCredentials.reasons.push(r);
    reasons.push(r);
  }

  if (coreCredentials.missing.length > 0) {
    coreCredentials.status = 'blocked';
  } else if (coreCredentials.expiring.length > 0) {
    coreCredentials.status = 'expiring';
  } else {
    coreCredentials.status = 'ready';
  }

  // ─── Facility (privileges) dimension ───────────────────────────
  const privilegesDim = { status: 'ready', reasons: [] };

  if (requiredSet.has('privilege')) {
    const orgId = opportunity?.organization?.id ?? null;
    const rows = orgId
      ? (privileges ?? []).filter(p => (p?.organization_id ?? p?.organization?.id) === orgId)
      : [];
    const derived = rows.map(p => ({ row: p, status: derivePrivilege(p) }));

    const terminal = derived.find(d => d.status === 'denied' || d.status === 'withdrawn');
    const active   = derived.find(d => d.status === 'active');
    const applied  = derived.find(d => d.status === 'applied');
    const expired  = derived.find(d => d.status === 'expired');

    if (terminal) {
      // Hard severity: a hospital that already said no is a real
      // bar, not a paperwork gap.
      privilegesDim.status = 'blocked';
      const r = {
        tier: 'facility',
        dimension: 'privileges',
        code: 'PRIVILEGE_DENIED',
        severity: 'hard',
        detail: `Facility privilege is ${terminal.status} at this hospital.`,
      };
      privilegesDim.reasons.push(r);
      reasons.push(r);
    } else if (active) {
      privilegesDim.status = isExpiringSoon(active.row.expiration_date) ? 'expiring' : 'ready';
    } else if (applied) {
      // In-flight privilege application at the hospital — the
      // application_date is set but the hospital has not granted
      // yet. Soft severity: forward progress, not a failure. Its
      // own facility-dimension status flavor — NOT ready, NOT
      // blocked. Sits ahead of the expired branch so a fresh re-
      // application reads as in-progress rather than as a stale
      // expiration. Like every facility state, never folds into the
      // portable `overall` roll-up.
      privilegesDim.status = 'applied';
      const r = {
        tier: 'facility',
        dimension: 'privileges',
        code: 'PRIVILEGE_APPLIED',
        severity: 'soft',
        detail: 'Facility privilege application is in progress at this hospital.',
      };
      privilegesDim.reasons.push(r);
      reasons.push(r);
    } else if (expired) {
      privilegesDim.status = 'blocked';
      const r = {
        tier: 'facility',
        dimension: 'privileges',
        code: 'PRIVILEGE_EXPIRED',
        severity: 'hard',
        detail: 'Facility privilege is expired at this hospital.',
      };
      privilegesDim.reasons.push(r);
      reasons.push(r);
    } else {
      // No row at all, or only pending rows (no application_date
      // yet). Soft severity: the normal next step for an unplaced
      // candidate, not a failure. Facility never rolls into overall,
      // so this stays informational at the facility tier.
      privilegesDim.status = 'blocked';
      const r = {
        tier: 'facility',
        dimension: 'privileges',
        code: 'PRIVILEGE_NONE',
        severity: 'soft',
        detail: rows.length === 0
          ? 'No facility privilege record at this hospital.'
          : 'Facility privilege is pending at this hospital.',
      };
      privilegesDim.reasons.push(r);
      reasons.push(r);
    }
  }

  // ─── Roll-up ────────────────────────────────────────────────────
  // overall = portable ONLY. Facility is never folded in (see header
  // comment for why).
  const portableStatus = maxStatus(license.status, coreCredentials.status);

  return {
    providerId,
    opportunityId,
    resolvedState,
    overall: portableStatus,
    portable: {
      status: portableStatus,
      license,
      coreCredentials,
    },
    facility: {
      status: privilegesDim.status,
      privileges: privilegesDim,
    },
    reasons,
  };
}
