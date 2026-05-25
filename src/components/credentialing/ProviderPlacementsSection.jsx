import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import Thumb from '@/components/uploads/Thumb';
import { useProviderPlacements } from '@/hooks/usePlacements';
import { useFacilityPrivileges } from '@/hooks/useCredentialing';
import {
  deriveCredentialingStatus,
  privilegeIsExpiringSoon,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Cross-grain provider lifecycle standing — the section that fills
// the Phase-2 "Placements" stub on the provider detail page.
//
// A provider's standing lives in TWO tables at TWO grains:
//   • Opportunity-grain — placements rows (provider_id = this provider,
//     status ∈ SELECTED_LIFECYCLE_STATUSES). One row per selected
//     opportunity. The CRM-authored 'selected' status is the only
//     one written by the app today.
//   • Hospital-grain — facility_privileges rows (provider_id = this
//     provider). One row per hospital × privilege application. Status
//     is derived from dates at render time (deriveCredentialingStatus)
//     so the lifecycle (pending → applied → active → expiring →
//     expired) is uniform with the rest of the app.
//
// The presentation is HOSPITAL-KEYED: outer-join the two grains on
// hospital, render one card per distinct hospital the provider touches
// in EITHER grain. The hospital card surfaces the privilege standing
// AND any selected opportunities at that hospital. Three cases:
//
//   1. OVERLAP (backed) — privilege + selected-opportunity at the
//      same hospital. Hospital reads "Privileged" (or "Applied") and
//      lists the selected opportunities below.
//   2. PRIVILEGE-ONLY — privilege at a hospital with no selected
//      opportunity. Reads as available standing.
//   3. SELECTED-WITHOUT-PRIVILEGE — selected for an opportunity at a
//      hospital where the provider has NO privilege on file. The
//      load-bearing FLAG case — must read as a gap, not require the
//      user to infer it from an absence. Treatment: a warning-tone
//      badge in the slot the lifecycle badge would otherwise occupy
//      ("No privilege") plus a warning-tone sub-line elaborating.
//
// Hospitals sort by engagement weight so the actionable cards surface
// first: flag (selected-without-privilege) > overlap > applied-only
// overlap > privileged-only > applied-only > name.
//
// Always-visible summary lines match Credentialing's three-line shape
// directly above on the page:
//   SELECTED     N opportunities (text-accent) or "none" (muted)
//   PRIVILEGED   N hospitals     (text-income) or "none"
//   APPLIED      N hospitals     (text-warning) or "none"
//
// Empty state (no placements AND no privileges anywhere) replaces the
// summary + collapsible with a single calm muted line.

function derivePrivilegeStatus(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.approval_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  });
}

// Build the hospital-keyed Map from the two grains. Outer join on
// hospital id — hospitals appearing in either grain get a bucket.
// Each bucket carries: hospital identity, the privilege rows at that
// hospital, the selected placement rows at that hospital, plus a
// derived per-bucket "current standing" used for badge + sort.
function buildHospitalGroups(placements, privileges) {
  const map = new Map();

  function ensure(orgId, hospital) {
    if (!orgId) return null;
    if (!map.has(orgId)) {
      map.set(orgId, {
        orgId,
        hospital: hospital ?? null,
        privileges: [],
        placements: [],
      });
    }
    const bucket = map.get(orgId);
    // Pick up hospital identity from whichever side provided it first
    // (and prefer a fuller record if one side has more fields).
    if (hospital && !bucket.hospital) bucket.hospital = hospital;
    return bucket;
  }

  for (const priv of privileges ?? []) {
    const orgId    = priv.organization_id ?? priv.organization?.id;
    const hospital = priv.organization ?? null;
    const bucket   = ensure(orgId, hospital);
    if (bucket) bucket.privileges.push(priv);
  }

  for (const place of placements ?? []) {
    const opp      = place.opportunity ?? null;
    const orgId    = opp?.organization_id ?? opp?.organization?.id;
    const hospital = opp?.organization ?? null;
    const bucket   = ensure(orgId, hospital);
    if (bucket) bucket.placements.push(place);
  }

  // Per-bucket derived standing:
  //   privilege: 'active' | 'applied' | 'other' | 'none'
  //     - 'active' if any privilege derives to 'active'
  //     - else 'applied' if any derives to 'applied'
  //     - else 'other' if there are privileges but all are pending/expired/denied/withdrawn
  //     - else 'none' (no privileges at this hospital)
  //   hasFlag: there are selected placements here AND privilege is not
  //            'active' AND not 'applied' (the load-bearing gap case).
  //   expiringSoon: any active privilege at this hospital expires
  //            within 90 days.
  for (const bucket of map.values()) {
    const withStatus = bucket.privileges.map(p => ({ row: p, status: derivePrivilegeStatus(p) }));
    let privilege = 'none';
    let expiringSoon = false;
    if (withStatus.some(p => p.status === 'active')) {
      privilege = 'active';
      expiringSoon = withStatus.some(p => p.status === 'active' && privilegeIsExpiringSoon(p.row));
    } else if (withStatus.some(p => p.status === 'applied')) {
      privilege = 'applied';
    } else if (withStatus.length > 0) {
      privilege = 'other';
    }
    const hasPlacements = bucket.placements.length > 0;
    // FLAG fires only when there is literally NO privilege row at this
    // hospital and a selected placement exists here. A pending or
    // historical privilege row (denied/expired/withdrawn) still counts
    // as "something on file" — those render with their own muted
    // "Privilege pending" badge instead of the warning-amber gap.
    const hasFlag = hasPlacements && privilege === 'none';
    bucket.privilege = privilege;
    bucket.expiringSoon = expiringSoon;
    bucket.hasFlag = hasFlag;
    bucket.hasPlacements = hasPlacements;
  }

  // Sort tier — surface actionable first.
  //   0 — flag (selected-without-privilege)
  //   1 — overlap with active privilege (backed engagement)
  //   2 — overlap with applied privilege (in-progress backing)
  //   3 — privileged only
  //   4 — applied only
  //   5 — other (pending/expired/denied at a hospital with no placement)
  function sortTier(b) {
    if (b.hasFlag) return 0;
    if (b.hasPlacements && b.privilege === 'active')  return 1;
    if (b.hasPlacements && b.privilege === 'applied') return 2;
    if (b.privilege === 'active')  return 3;
    if (b.privilege === 'applied') return 4;
    return 5;
  }

  return [...map.values()].sort((a, b) => {
    const ta = sortTier(a), tb = sortTier(b);
    if (ta !== tb) return ta - tb;
    return (a.hospital?.name ?? '').localeCompare(b.hospital?.name ?? '');
  });
}

export default function ProviderPlacementsSection({ providerId }) {
  const placements = useProviderPlacements(providerId);
  const privileges = useFacilityPrivileges(providerId);

  const loading = placements.loading || privileges.loading;
  const error   = placements.error   || privileges.error;

  const groups = useMemo(
    () => buildHospitalGroups(placements.data, privileges.data),
    [placements.data, privileges.data],
  );

  // Top-line counts for the always-visible summary.
  const selectedCount   = placements.data?.length ?? 0;
  const privilegedCount = groups.filter(g => g.privilege === 'active').length;
  const appliedCount    = groups.filter(g => g.privilege === 'applied').length;
  const empty = !loading && !error && selectedCount === 0 && (privileges.data?.length ?? 0) === 0;

  return (
    <div className="bg-surface-well border border-accent rounded p-6 mb-10
                    relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                    after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
      {loading && (
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
          Loading…
        </div>
      )}
      {!loading && error && (
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-danger">
          {error.message}
        </div>
      )}

      {!loading && !error && empty && (
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted py-2">
          No placement or privilege standing yet.
        </div>
      )}

      {!loading && !error && !empty && (
        <>
          <div className="mb-4 grid grid-cols-[auto_auto] gap-x-2 gap-y-1 justify-center font-mono text-[11px] uppercase tracking-[0.12em]">
            <SummaryLine label="Selected"   count={selectedCount}   unitOne="opportunity" unitMany="opportunities" tone="text-accent"  />
            <SummaryLine label="Privileged" count={privilegedCount} unitOne="hospital"    unitMany="hospitals"      tone="text-income"  />
            <SummaryLine label="Applied"    count={appliedCount}    unitOne="hospital"    unitMany="hospitals"      tone="text-warning" />
          </div>

          {/* Default-open here, unlike Onboarding/Credentialing
              (which default-collapsed). This section's three-line
              summary isn't self-sufficient — the value is the per-
              hospital cross-grain detail, so it leads with that
              detail visible. Collapse capability stays available. */}
          <CollapsibleSection label="Standing Details" defaultOpen>
            <div className="flex flex-col gap-3">
              {groups.map(g => <HospitalGroupCard key={g.orgId} group={g} />)}
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

function SummaryLine({ label, count, unitOne, unitMany, tone }) {
  const valueText = count === 0
    ? 'none'
    : `${count} ${count === 1 ? unitOne : unitMany}`;
  const valueTone = count === 0 ? 'text-text-muted' : tone;
  return (
    <>
      <span className="text-right text-text-muted">{label}</span>
      <span className={cn('text-left', valueTone)}>{valueText}</span>
    </>
  );
}

function HospitalGroupCard({ group }) {
  const { hospital, privilege, expiringSoon, hasFlag, placements } = group;
  const cityState = hospital?.city
    ? `${hospital.city}, ${hospital.state ?? ''}`.trim().replace(/,\s*$/, '')
    : (hospital?.state ?? '');

  // Badge in the right-hand slot.
  //   • Flag case (selected here with no current/applied privilege) →
  //     "No privilege" badge in warning amber. Substitutes for the
  //     lifecycle badge so the slot itself tells the gap story.
  //   • Else lifecycle badge (Privileged / Applied) when a privilege
  //     exists in those states.
  //   • Else if there are only pending/expired/denied privileges →
  //     muted "Privilege pending" badge.
  //   • Else (shouldn't happen — hospital wouldn't be in groups) no badge.
  let badgeLabel = null;
  let badgeTone  = null;
  if (hasFlag) {
    badgeLabel = 'No privilege';
    badgeTone  = 'text-warning';
  } else if (privilege === 'active') {
    badgeLabel = expiringSoon ? 'Privileged · Expiring' : 'Privileged';
    badgeTone  = expiringSoon ? 'text-warning' : 'text-income';
  } else if (privilege === 'applied') {
    badgeLabel = 'Applied';
    badgeTone  = 'text-warning';
  } else if (privilege === 'other') {
    // Shortened from "Privilege pending" — the badge slot's context
    // (it's on the hospital card) already conveys the subject, so the
    // single word reads unambiguously and saves the right-side space.
    badgeLabel = 'Pending';
    badgeTone  = 'text-text-dim';
  }

  return (
    <div className="bg-surface border border-border rounded p-3 md:p-4">
      <div className="flex items-start gap-3">
        <Thumb
          path={hospital?.logo_path}
          bucket="organization-logos"
          alt={hospital?.name ?? 'Hospital logo'}
          fallback={initialsFor(hospital?.name)}
          size="md"
          shape="square"
        />
        <div className="flex-1 min-w-0">
          {/* Row 1: hospital name only — claims the full content width
              so long names don't truncate at 380px. The status badge
              moved to row 2 alongside city/state. Single layout that
              reads cleanly at both mobile and desktop widths. */}
          <Link
            to={hospital?.id ? `/organizations/${hospital.id}` : '#'}
            className="block text-accent text-sm font-medium hover:text-accent-bright"
          >
            {hospital?.name ?? 'Unknown hospital'}
          </Link>
          {/* Row 2: city/state on the left, status badge on the right.
              Renders whenever either is present so a hospital missing
              city/state still gets its badge surface. */}
          {(cityState || badgeLabel) && (
            <div className="flex items-baseline justify-between gap-3 mt-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim min-w-0 truncate">
                {cityState}
              </span>
              {badgeLabel && (
                <span className={cn(
                  'font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0',
                  badgeTone,
                )}>
                  {badgeLabel}
                </span>
              )}
            </div>
          )}

          {/* Flag elaboration — only when selected-without-privilege.
              Sits below the identity row so the warning amber reads
              as a sub-line tied to this hospital, not free-floating. */}
          {hasFlag && (
            <div className="text-xs mt-2 leading-snug text-warning">
              Selected here with no privilege application on file.
            </div>
          )}
          {!hasFlag && privilege === 'active' && expiringSoon && (
            <div className="text-xs mt-2 leading-snug text-warning">
              Privilege at this hospital expires within 90 days.
            </div>
          )}
          {!hasFlag && privilege === 'applied' && (
            <div className="text-xs mt-2 leading-snug text-warning">
              Privilege application in progress.
            </div>
          )}

          {/* Selected opportunities at this hospital (opportunity-grain
              rows folded under their hospital). Each row links to the
              opportunity detail page. Hidden cleanly when there are no
              selected opportunities here — the privilege-only case. */}
          {placements.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1.5">
                Selected for
              </div>
              <ul className="space-y-1 border-l-2 border-accent/40 pl-3">
                {placements.map(p => (
                  <li key={p.id} className="flex items-baseline gap-2 min-w-0">
                    <Link
                      to={`/opportunities/${p.opportunity?.id ?? p.opportunity_id}`}
                      className="text-text hover:text-accent text-sm leading-snug truncate"
                    >
                      {p.opportunity?.title ?? 'Untitled opportunity'}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
