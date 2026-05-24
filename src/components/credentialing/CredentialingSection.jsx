import { CollapsibleSection } from '@/components/ui/collapsible-section';
import LicensesSection from '@/components/credentialing/LicensesSection';
import CredentialsSection from '@/components/credentialing/CredentialsSection';
import FacilityPrivilegesSection from '@/components/credentialing/FacilityPrivilegesSection';
import { useProviderLicenses, useCredentials, useFacilityPrivileges } from '@/hooks/useCredentialing';
import {
  deriveCredentialingStatus,
  expirationBucket,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';

// Wraps the three credentialing subsections (licenses / credentials /
// privileges) behind a single CollapsibleSection, with a 3-line
// worst-status-per-group summary above. The three subsection
// components are unchanged — they render exactly as before, just
// hidden behind the collapsed line by default.
//
// "Worst-status-per-group" = one expiring license makes the Licenses
// line read "expiring soon" regardless of how many are fine. Reuses
// deriveCredentialingStatus + expirationBucket — date math is NEVER
// reimplemented here.

const LICENSE_FIELDS    = { app: 'application_date', grant: 'issue_date' };
const CREDENTIAL_FIELDS = { app: 'application_date', grant: 'issue_date' };
const PRIVILEGE_FIELDS  = { app: 'application_date', grant: 'approval_date' };

// Urgency precedence — higher wins.
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
    return { tone: 'text-text-muted', text: 'none on file' };
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
      return { tone: 'text-danger',  text: count === total && total > 1 ? 'all expired' : `${count} expired` };
    case 'denied':
      return { tone: 'text-danger',  text: count === 1 ? '1 denied' : `${count} denied` };
    case 'expiring':
      return { tone: 'text-warning', text: count === 1 ? '1 expiring soon' : `${count} expiring soon` };
    case 'pending':
      return { tone: 'text-text-dim', text: count === 1 ? '1 pending' : `${count} pending` };
    case 'withdrawn':
      return { tone: 'text-text-dim', text: count === 1 ? '1 withdrawn' : `${count} withdrawn` };
    case 'current':
    default:
      return { tone: 'text-income', text: total === 1 ? '1 current' : 'all current' };
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

  return (
    <>
      <div className="mb-4 grid grid-cols-[auto_auto] gap-x-2 gap-y-1 justify-center font-mono text-[11px] uppercase tracking-[0.12em]">
        {loading && !error ? (
          <div className="col-span-2 text-center text-text-dim">Loading…</div>
        ) : error ? (
          <div className="col-span-2 text-center text-danger">{error.message}</div>
        ) : (
          <>
            <StatusLine label="Licenses"    summary={licSummary} />
            <StatusLine label="Credentials" summary={credSummary} />
            <StatusLine label="Privileges"  summary={privSummary} />
          </>
        )}
      </div>

      <CollapsibleSection label="Provider Credentials">
        <SubGroupHeader text="State licenses" />
        <LicensesSection providerId={providerId} />
        <div className="mt-6">
          <SubGroupHeader text="Core credentials" />
          <CredentialsSection providerId={providerId} />
        </div>
        <div className="mt-6">
          <SubGroupHeader text="Facility privileges" />
          <FacilityPrivilegesSection providerId={providerId} />
        </div>
      </CollapsibleSection>
    </>
  );
}

// One status row — two grid cells emitted into the parent's
// auto/auto grid. The grid is `justify-center` so the whole block
// sits centered under the SectionHeader; the gutter between
// columns ends up on the page midline. Labels right-align toward
// that midline; values left-align away from it.
function StatusLine({ label, summary }) {
  return (
    <>
      <span className="text-right text-text-muted">{label}</span>
      <span className={`text-left ${summary.tone}`}>{summary.text}</span>
    </>
  );
}

// Mirrors the SubGroupHeader on Provider.jsx so the three sub-groups
// inside the collapsed body read identically to how they did before
// this refactor.
function SubGroupHeader({ text }) {
  return (
    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">
      {text}
    </div>
  );
}
