import { Link } from 'react-router-dom';
import {
  Building2, Briefcase, Stethoscope, Users, ListTodo, CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared building blocks across the three Home variants. Reuses the
// established visual conventions (B-boxes, mono caps, accent tones)
// so the comparison is about IA / data shape, not about competing
// visual systems.

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const NAV_ITEMS = [
  { path: '/organizations', label: 'Organizations', icon: Building2,     desc: 'Hospitals and LOCUMs partners' },
  { path: '/opportunities', label: 'Opportunities', icon: Briefcase,     desc: 'Demand pipeline by stage'      },
  { path: '/providers',     label: 'Providers',     icon: Stethoscope,   desc: 'Supply pipeline and roster'    },
  { path: '/contacts',      label: 'Contacts',      icon: Users,         desc: 'People at organizations'       },
  { path: '/tasks',         label: 'Tasks',         icon: ListTodo,      desc: 'Open follow-ups and history'   },
  { path: '/expirations',   label: 'Expirations',   icon: CalendarClock, desc: 'Credentialing renewal radar'   },
];

// Level-1 B-box container per the two-level box convention.
export function BBox({ children, className }) {
  return (
    <div className={cn(
      'bg-surface-well border border-accent rounded p-4 sm:p-6',
      'relative after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0',
      'after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40',
      className,
    )}>
      {children}
    </div>
  );
}

// Attention strip row — icon + count + label, optional detail line,
// optional link target. Zero counts render muted so the category
// stays present.
const ATTN_TONE = { warning: 'text-warning', danger: 'text-danger', muted: 'text-text-muted' };

export function AttentionRow({ icon: Icon, tone, count, label, detail, to, loading }) {
  const isZero = count === 0;
  const valueTone = isZero ? 'text-text-muted' : ATTN_TONE[tone];
  const labelTone = isZero ? 'text-text-muted' : 'text-text-dim';
  const body = (
    <div className="flex items-center gap-3 py-3 px-1 -mx-1">
      <Icon className={cn('w-4 h-4 flex-shrink-0', valueTone)} strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('font-sans text-lg font-bold tabular-nums leading-none', valueTone)}>
            {loading ? '—' : count}
          </span>
          <span className={cn('font-mono text-[10px] uppercase tracking-[0.1em] leading-snug', labelTone)}>
            {label}
          </span>
        </div>
        {detail && (
          <div className={cn('font-mono text-[10px] uppercase tracking-[0.1em] mt-1', labelTone)}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
  if (to && !isZero && !loading) {
    return (
      <li>
        <Link to={to} className="block rounded hover:bg-surface2/40 transition-colors">{body}</Link>
      </li>
    );
  }
  return <li>{body}</li>;
}

export function NavigateHub({ navigate }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {NAV_ITEMS.map(({ path, label, icon: Icon, desc }) => (
        <button
          key={path}
          type="button"
          onClick={() => navigate(path)}
          className={cn(
            'relative bg-surface border border-border rounded p-5 transition-colors',
            'flex flex-col items-center text-center gap-2 cursor-pointer',
            'hover:border-accent hover:bg-surface2 group',
          )}
        >
          <div className="flex items-center justify-center gap-2 text-accent">
            <Icon className="w-4 h-4" strokeWidth={1.75} />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text">
              {label}
            </span>
          </div>
          <p className="font-mono text-xs text-text-dim leading-snug">{desc}</p>
        </button>
      ))}
    </div>
  );
}

// Shared per-opportunity classifier — three hard eligibility filters
// (specialty, position type, non-withdrawn state license) followed
// by the lifecycle bucketing rule that mirrors
// SuggestedProviders.deriveLifecycle. Returns lifecycle counts; the
// lifecycle module-private helper is not exported from
// SuggestedProviders so the same logic is reproduced compactly here.
// Pure (no derivation logic changes); read-only consumers.
import { deriveShiftReadiness } from '@/components/credentialing/readiness';
import {
  deriveCredentialingStatus,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';

export function classifyProviderStage({ opp, provider, licenses, credentials, privileges, placement }) {
  const oppOrgId = opp?.organization?.id ?? null;
  const hospitalPrivs = privileges.filter(p => (p?.organization_id ?? p?.organization?.id) === oppOrgId);
  const withStatus = hospitalPrivs.map(p => deriveCredentialingStatus({
    applicationDate: p?.application_date ?? null,
    grantingDate:    p?.approval_date ?? null,
    expirationDate:  p?.expiration_date ?? null,
    storedStatus:    p?.status ?? null,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  }));
  if (withStatus.some(s => s === 'active'))  return 'privileged';
  if (withStatus.some(s => s === 'applied')) return 'applied';
  if (placement)                              return 'selected';
  const verdict = deriveShiftReadiness({ opportunity: opp, licenses, credentials, privileges, provider });
  if (verdict.overall === 'ready' || verdict.overall === 'expiring') return 'eligible';
  return 'blocked';
}

export function eligibilityFilter({ opp, providers, licensesByProvider }) {
  const oppState = opp?.organization?.state ?? null;
  if (!oppState) return [];
  return providers.filter(p => {
    if (p.archived) return false;
    if (opp.specialty && p.specialty !== opp.specialty) return false;
    if (opp.position_type && p.position_type !== opp.position_type) return false;
    const licRows = licensesByProvider.get(p.id) ?? [];
    return licRows.some(l => l?.state === oppState && l?.status !== 'withdrawn');
  });
}

// Filled-opportunity retention classifier. Given an opp's placement
// rows + the privileges map, return the worst-case risk among the
// placed providers' privileges at the opp's hospital. Risk levels:
//   'expired'      hard — privilege at hospital is expired
//   'no_privilege' hard — placed but no privilege row exists
//   'expiring'     soft — active privilege expires within 90 days
//   'applied'      soft — application in progress, not granted yet
//   'pending'      soft — pending (pre-application) row
//   'active'       clean — privilege current, > 90 days out
//   'no_placements'      degenerate — opp marked filled but has no
//                        placement rows (shouldn't happen)
const RISK_ORDER = ['expired', 'no_privilege', 'expiring', 'applied', 'pending', 'active'];

export function deriveFilledRisk({ opp, placements, privilegesByProvider }) {
  if (!placements || placements.length === 0) return 'no_placements';
  const orgId = opp?.organization?.id;
  const perProv = placements.map(pl => {
    const privs = (privilegesByProvider.get(pl.provider_id) ?? []).filter(pp => pp.organization_id === orgId);
    if (privs.length === 0) return 'no_privilege';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const derived = privs.map(p => {
      const status = deriveCredentialingStatus({
        applicationDate: p?.application_date ?? null,
        grantingDate:    p?.approval_date ?? null,
        expirationDate:  p?.expiration_date ?? null,
        storedStatus:    p?.status ?? null,
        terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
      });
      const days = p.expiration_date ? Math.round((new Date(p.expiration_date) - today) / 86400000) : null;
      return { status, days };
    });
    if (derived.some(d => d.status === 'expired')) return 'expired';
    if (derived.some(d => d.status === 'active' && d.days != null && d.days >= 0 && d.days <= 90)) return 'expiring';
    if (derived.some(d => d.status === 'active')) return 'active';
    if (derived.some(d => d.status === 'applied')) return 'applied';
    if (derived.some(d => d.status === 'pending')) return 'pending';
    return 'no_privilege';
  });
  return perProv.sort((a, b) => RISK_ORDER.indexOf(a) - RISK_ORDER.indexOf(b))[0];
}

export const RISK_TONE = {
  expired:       'text-danger',
  no_privilege:  'text-danger',
  expiring:      'text-warning',
  applied:       'text-warning',
  pending:       'text-text-dim',
  active:        'text-income',
  no_placements: 'text-text-muted',
};

export const RISK_LABEL = {
  expired:       'Expired',
  no_privilege:  'No privilege',
  expiring:      'Expiring',
  applied:       'Applied',
  pending:       'Pending',
  active:        'Active',
  no_placements: 'No placements',
};

// Richer per-contract health helper used by V4's Retention section.
// V2's deriveFilledRisk returned only a worst-case risk code; V4
// needs the SPECIFIC reason ("Bob Anderson's privilege expires in
// 80 days"), so this companion helper walks the same data and
// surfaces a human-readable detail string naming the at-risk thing.
// Pure, read-only, no derivation logic changes — just inspects the
// already-derived statuses and pulls names off the provider rows.
import { fmtName } from '@/utils/formatters';

export function deriveFilledHealth({
  opp, placements, privilegesByProvider, providersById,
}) {
  if (!placements || placements.length === 0) {
    return { risk: 'no_placements', detail: 'No placements on file.', placementCount: 0 };
  }
  const orgId = opp?.organization?.id;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Walk every placed provider's privileges at the hospital, derive
  // each one's status, and record the worst-case finding with the
  // provider name + the specific date / detail. Severity order
  // matches deriveFilledRisk so the per-contract risk code stays
  // consistent across V2 and V4.
  const findings = [];
  for (const pl of placements) {
    const provider = providersById?.get(pl.provider_id);
    const provName = provider ? fmtName(provider) : 'A placed provider';
    const privs = (privilegesByProvider.get(pl.provider_id) ?? []).filter(p => p.organization_id === orgId);

    if (privs.length === 0) {
      findings.push({ risk: 'no_privilege', detail: `${provName} has no privilege on file at this hospital.`, provider, name: provName });
      continue;
    }
    for (const p of privs) {
      const status = deriveCredentialingStatus({
        applicationDate: p?.application_date ?? null,
        grantingDate:    p?.approval_date ?? null,
        expirationDate:  p?.expiration_date ?? null,
        storedStatus:    p?.status ?? null,
        terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
      });
      const days = p.expiration_date ? Math.round((new Date(p.expiration_date) - today) / 86400000) : null;
      if (status === 'expired') {
        findings.push({ risk: 'expired', detail: `${provName}'s privilege expired ${days != null ? `${-days} day${-days === 1 ? '' : 's'} ago` : ''}.`.trim(), provider, name: provName });
      } else if (status === 'active' && days != null && days >= 0 && days <= 90) {
        findings.push({ risk: 'expiring', detail: `${provName}'s privilege expires in ${days} day${days === 1 ? '' : 's'}.`, provider, name: provName });
      } else if (status === 'applied') {
        findings.push({ risk: 'applied', detail: `${provName}'s privilege application is in progress.`, provider, name: provName });
      } else if (status === 'pending') {
        findings.push({ risk: 'pending', detail: `${provName}'s privilege is pending.`, provider, name: provName });
      } else if (status === 'active') {
        findings.push({ risk: 'active', detail: `${provName} — privilege active.`, provider, name: provName });
      }
    }
  }
  const ORDER = ['expired', 'no_privilege', 'expiring', 'applied', 'pending', 'active'];
  findings.sort((a, b) => ORDER.indexOf(a.risk) - ORDER.indexOf(b.risk));
  const worst = findings[0] ?? { risk: 'active', detail: 'All clean.' };
  // Surface ALL non-clean findings (so a contract with multiple
  // at-risk privileges names them all) but still pick the worst as
  // the headline risk.
  const flagged = findings.filter(f => f.risk !== 'active');
  return {
    risk: worst.risk,
    detail: worst.detail,
    findings: flagged.length > 0 ? flagged : [worst],
    placementCount: placements.length,
  };
}
