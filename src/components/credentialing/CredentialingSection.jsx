import { useState } from 'react';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { TierKPICard } from '@/components/brand/KPICard';
import LicensesSection from '@/components/credentialing/LicensesSection';
import CredentialsSection from '@/components/credentialing/CredentialsSection';
import FacilityPrivilegesSection from '@/components/credentialing/FacilityPrivilegesSection';
import { useProviderLicenses, useCredentials, useFacilityPrivileges } from '@/hooks/useCredentialing';
import {
  deriveCredentialingStatus,
  expirationBucket,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';

// Three KPI cards (Licenses / Credentials / Privileges), each driving
// its own default-collapsed sub-section below — card-accordion style,
// mirroring the Provider Availability matching surface. The cards
// replace the previous plain three-line text summary; each shows the
// group's TOTAL count as the primary value tone-colored by the worst
// per-row status, plus a nuance line under it (e.g. "1 EXPIRED" /
// "ALL CURRENT" / "NONE ON FILE") that preserves what the old summary
// communicated — just in card form.
//
// Worst-status-per-group logic (URGENCY ranks + classifyRow + summarize)
// is unchanged from the previous version; it now also returns the
// `worst` bucket and `total` count so the cards can drive their tone
// and value from the same source the summary text uses.
//
// Accordion machinery is lifted from SuggestedProviders.jsx — controlled
// CollapsibleSections, single tierOverride state, the same handlers:
//   • Card click → focus this group, open it, close the others.
//   • Chevron toggle → independent, clears card focus (multi-open mode).
//   • Expand All → opens all groups, clears focus.
// DEFAULT load: all three sub-sections COLLAPSED, no card focused — the
// section opens as a clean overview row of three cards (each showing
// label + count + nuance) with everything closed. Diverges from
// SuggestedProviders' default-open-highest rule because the at-a-glance
// row of cards already conveys the per-group status; opening one
// pre-emptively would commit screen space the user may not need.

const LICENSE_FIELDS    = { app: 'application_date', grant: 'issue_date' };
const CREDENTIAL_FIELDS = { app: 'application_date', grant: 'issue_date' };
const PRIVILEGE_FIELDS  = { app: 'application_date', grant: 'approval_date' };

// Urgency precedence — higher wins. Used inside summarize() to pick
// the worst per-row bucket for each group; the worst bucket drives
// both the summary text and the card's value/sub tone.
//   4: hard-fail outcomes that need action now (expired, denied)
//   3: heads-up — active row will expire within 30 days
//   2: in-flight (applied/pending) or self-withdrawn
//   1: actively current and not soon-expiring
const URGENCY = {
  expired:   4,
  denied:    4,
  expiring:  3,
  pending:   2,
  withdrawn: 2,
  current:   1,
};

// Map summary.tone className → VALUE_COLOR key so the cards' value
// and sub tones come from the same single source as the underlying
// status classification. Keeps the card visuals consistent with the
// tone the previous text summary used.
function toneToColor(toneClass) {
  switch (toneClass) {
    case 'text-danger':     return 'red';
    case 'text-warning':    return 'warning';
    case 'text-income':     return 'green';
    case 'text-text-dim':   return 'dim';
    case 'text-text-muted': return 'muted';
    default:                return 'default';
  }
}

function classifyRow(row, fields, terminalStatuses) {
  const status = deriveCredentialingStatus({
    applicationDate: row?.[fields.app] ?? null,
    grantingDate:    row?.[fields.grant] ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
    terminalStatuses,
  });
  if (status === 'denied')    return 'denied';
  if (status === 'withdrawn') return 'withdrawn';
  if (status === 'expired')   return 'expired';
  if (status === 'active') {
    // Soon-expiring = within the 30-day bucket; >30 reads as current.
    return expirationBucket(row?.expiration_date) === '30' ? 'expiring' : 'current';
  }
  return 'pending'; // 'applied' or 'pending'
}

function summarize(rows, fields, terminalStatuses) {
  if (!rows || rows.length === 0) {
    return { tone: 'text-text-muted', text: 'none on file', worst: 'none', total: 0 };
  }
  const buckets = rows.map(r => classifyRow(r, fields, terminalStatuses));
  let worst = 'current';
  for (const b of buckets) {
    if ((URGENCY[b] ?? 0) > (URGENCY[worst] ?? 0)) worst = b;
  }
  const count = buckets.filter(b => b === worst).length;
  const total = rows.length;
  switch (worst) {
    case 'expired':
      return { tone: 'text-danger',   text: count === total && total > 1 ? 'all expired' : `${count} expired`, worst, total };
    case 'denied':
      return { tone: 'text-danger',   text: count === 1 ? '1 denied' : `${count} denied`, worst, total };
    case 'expiring':
      return { tone: 'text-warning',  text: count === 1 ? '1 expiring soon' : `${count} expiring soon`, worst, total };
    case 'pending':
      return { tone: 'text-text-dim', text: count === 1 ? '1 pending' : `${count} pending`, worst, total };
    case 'withdrawn':
      return { tone: 'text-text-dim', text: count === 1 ? '1 withdrawn' : `${count} withdrawn`, worst, total };
    case 'current':
    default:
      return { tone: 'text-income',   text: total === 1 ? '1 current' : 'all current', worst, total };
  }
}

export default function CredentialingSection({ providerId }) {
  const licenses    = useProviderLicenses(providerId);
  const credentials = useCredentials(providerId);
  const privileges  = useFacilityPrivileges(providerId);

  const loading = licenses.loading || credentials.loading || privileges.loading;
  const error   = licenses.error   || credentials.error   || privileges.error;

  const licSummary  = summarize(licenses.data,    LICENSE_FIELDS);
  const credSummary = summarize(credentials.data, CREDENTIAL_FIELDS);
  const privSummary = summarize(privileges.data,  PRIVILEGE_FIELDS, PRIVILEGE_TERMINAL_STATUSES);

  // Group definitions in display order. The order here also drives the
  // default-open tiebreak when multiple groups share the same urgency.
  const groups = [
    { key: 'licenses',    label: 'Licenses',    sectionLabel: 'State licenses',     summary: licSummary,  body: <LicensesSection           providerId={providerId} /> },
    { key: 'credentials', label: 'Credentials', sectionLabel: 'Core credentials',   summary: credSummary, body: <CredentialsSection        providerId={providerId} /> },
    { key: 'privileges',  label: 'Privileges',  sectionLabel: 'Facility privileges', summary: privSummary, body: <FacilityPrivilegesSection providerId={providerId} /> },
  ];

  // Card-accordion state — matches SuggestedProviders.jsx pattern. Null
  // until first interaction. Default state is fully collapsed with no
  // card focused — the row of cards is the at-a-glance overview, and
  // sub-sections only open in response to explicit user input (card
  // click, chevron toggle, or Expand All).
  const [override, setOverride] = useState(null);
  const defaultState = {
    open:    new Set(),
    focused: null,
  };
  const { open, focused } = override ?? defaultState;

  function handleCardClick(key) {
    setOverride(prev => {
      const current = prev ?? defaultState;
      if (current.focused === key) {
        return { open: new Set(), focused: null };
      }
      return { open: new Set([key]), focused: key };
    });
  }

  function handleToggle(key, nextOpen) {
    setOverride(prev => {
      const current = prev ?? defaultState;
      const next = new Set(current.open);
      if (nextOpen) next.add(key); else next.delete(key);
      // Chevron clears card focus — multi-open via chevrons is the
      // non-card-driven mode.
      return { open: next, focused: null };
    });
  }

  function handleExpandAll() {
    setOverride({ open: new Set(groups.map(g => g.key)), focused: null });
  }

  const nonEmptyOpenCount = [...open].length;
  const showExpandAll = nonEmptyOpenCount < groups.length;

  return (
    <div className="bg-surface-well border border-accent rounded p-6 mb-10
                    relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                    after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
      {loading && !error && (
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
          Loading…
        </div>
      )}
      {error && (
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-danger">
          {error.message}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Expand All — muted text-only affordance above the cards.
              Mirrors the Provider Availability treatment so the two
              card-accordion sections share affordance grammar. */}
          {showExpandAll && (
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

          {/* Three KPI cards. Each: label + total count (tone-colored
              by worst per-row status) + nuance line (the same text the
              old summary line carried). When the group is empty the
              value reads "—" and the sub reads "NONE ON FILE" — the
              card is still clickable so the user can open the
              sub-section and add the first record. */}
          <div className="grid grid-cols-3 gap-2">
            {groups.map(g => {
              const isEmpty = g.summary.total === 0;
              const valueColor = toneToColor(g.summary.tone);
              return (
                <TierKPICard
                  key={g.key}
                  label={g.label}
                  value={isEmpty ? '—' : g.summary.total}
                  color={valueColor}
                  sub={g.summary.text}
                  subColor={valueColor}
                  focused={focused === g.key}
                  onClick={() => handleCardClick(g.key)}
                />
              );
            })}
          </div>

          {/* Three sub-sections — one per group, each its own
              CollapsibleSection in controlled mode so the parent
              accordion state drives them. The sub-sections themselves
              (LicensesSection / CredentialsSection /
              FacilityPrivilegesSection) are unchanged; this wrapper
              just decides which is open. */}
          <div className="mt-5 space-y-5">
            {groups.map(g => (
              <CollapsibleSection
                key={g.key}
                label={g.sectionLabel}
                open={open.has(g.key)}
                onOpenChange={(next) => handleToggle(g.key, next)}
              >
                {g.body}
              </CollapsibleSection>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
