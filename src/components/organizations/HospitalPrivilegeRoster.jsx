import { useState } from 'react';
import { Link } from 'react-router-dom';
import Thumb from '@/components/uploads/Thumb';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { TierKPICard } from '@/components/brand/KPICard';
import { useProviders } from '@/hooks/useProviders';
import { useAllCredentialing } from '@/hooks/useMatching';
import {
  deriveCredentialingStatus,
  daysUntil,
  PRIVILEGE_TERMINAL_STATUSES,
} from '@/components/credentialing/expiration';
import { fmtName } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { POSITION_TYPES, labelFor, specialtyAbbrFor } from '@/utils/constants';
import { cn } from '@/lib/utils';

// Hospital-grain privilege roster — providers Privileged or Applied
// at THIS hospital. Selected is opportunity-grain and lives on the
// opportunity page; deliberately excluded here.
//
// Data flow: useAllCredentialing returns privileges across all
// providers; we filter by organization_id, derive status from dates
// (reusing deriveCredentialingStatus + PRIVILEGE_TERMINAL_STATUSES),
// join provider info from useProviders, and group by Privileged
// (active) vs Applied (applied).
//
// Expiring-soon treatment uses the same 90-day rule SuggestedProviders
// applies — a renewal-actionable signal in the canonical place for
// hospital privileges.

function derivePrivilegeStatus(row) {
  return deriveCredentialingStatus({
    applicationDate: row?.application_date ?? null,
    grantingDate:    row?.approval_date ?? null,
    expirationDate:  row?.expiration_date ?? null,
    storedStatus:    row?.status ?? null,
    terminalStatuses: PRIVILEGE_TERMINAL_STATUSES,
  });
}

function privilegeIsExpiringSoon(row) {
  const d = daysUntil(row?.expiration_date);
  return d != null && d >= 0 && d <= 90;
}

export default function HospitalPrivilegeRoster({ organizationId }) {
  const { privilegesByProvider, loading: credLoading, error: credError } = useAllCredentialing();
  const { data: allProviders, loading: provLoading, error: provError } = useProviders();

  const loading = credLoading || provLoading;
  const error   = credError   || provError;

  // Parent-owned tier open + focus state matching the opportunity
  // Provider Availability tiers. See SuggestedProviders.jsx for the
  // full model — card click focuses one (accordion reset), chevron
  // clears focus (multi-open via chevrons is non-focused), Expand
  // All opens all non-empty tiers focus-less. Default state opens
  // the highest-ranked non-empty tier (Privileged > Applied).
  const [tierOverride, setTierOverride] = useState(null);

  if (loading) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">
        Loading roster…
      </div>
    );
  }
  if (error) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-danger py-3">
        {error.message}
      </div>
    );
  }

  // Build provider lookup once.
  const providerById = new Map((allProviders ?? []).map(p => [p.id, p]));

  // Walk every (provider, privilege) pair, keeping only those at
  // this org and at a Privileged or Applied lifecycle position.
  const privileged = []; // { provider, privilege, expiringSoon }
  const applied    = []; // { provider, privilege }

  for (const [providerId, privs] of privilegesByProvider.entries()) {
    const provider = providerById.get(providerId);
    if (!provider) continue;
    if (provider.archived) continue;

    for (const priv of privs ?? []) {
      const privOrgId = priv?.organization_id ?? priv?.organization?.id;
      if (privOrgId !== organizationId) continue;

      const status = derivePrivilegeStatus(priv);
      if (status === 'active') {
        privileged.push({
          provider,
          privilege: priv,
          expiringSoon: privilegeIsExpiringSoon(priv),
        });
      } else if (status === 'applied') {
        applied.push({ provider, privilege: priv });
      }
      // pending / expired / denied / withdrawn intentionally excluded —
      // the roster is about who is current or in-flight.
    }
  }

  // Sort each group: expiring-soon first within Privileged so the
  // actionable rows surface; then by name.
  privileged.sort((a, b) => {
    if (a.expiringSoon !== b.expiringSoon) return a.expiringSoon ? -1 : 1;
    return fmtName(a.provider).localeCompare(fmtName(b.provider));
  });
  applied.sort((a, b) => fmtName(a.provider).localeCompare(fmtName(b.provider)));

  const totalRows = privileged.length + applied.length;

  if (totalRows === 0) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted py-3">
        No providers privileged or applied at this hospital yet.
      </div>
    );
  }

  const tierDefs = [
    { key: 'privileged', items: privileged, label: 'Privileged', color: 'green',   section: 'Privileged' },
    { key: 'applied',    items: applied,    label: 'Applied',    color: 'default', section: 'Applied'    },
  ];

  const defaultTierKey = tierDefs.find(t => t.items.length > 0)?.key ?? null;
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
      return { open: nextOpenSet, focused: null };
    });
  }

  function handleExpandAll() {
    const allOpen = new Set(tierDefs.filter(t => t.items.length > 0).map(t => t.key));
    setTierOverride({ open: allOpen, focused: null });
  }

  const nonEmptyCount = tierDefs.reduce((n, t) => n + (t.items.length > 0 ? 1 : 0), 0);

  return (
    <div>
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

      {/* Two tier cards. Centered with a max-width so the cards don't
          balloon to half the section's width; they read as compact
          chips matching the opportunity-page tier cards. */}
      <div className="grid grid-cols-2 gap-2 max-w-[260px] mx-auto">
        {tierDefs.map(t => (
          <TierKPICard
            key={t.key}
            label={t.label}
            value={t.items.length}
            color={t.color}
            focused={focusedCard === t.key && t.items.length > 0}
            disabled={t.items.length === 0}
            onClick={() => handleCardClick(t.key, t.items.length === 0)}
          />
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {tierDefs.map(t => {
          if (t.items.length === 0) return null;
          return (
            <CollapsibleSection
              key={t.key}
              label={t.section}
              open={openTiers.has(t.key)}
              onOpenChange={(next) => handleTierToggle(t.key, next)}
            >
              <RosterList items={t.items} kind={t.key} />
            </CollapsibleSection>
          );
        })}
      </div>
    </div>
  );
}

function RosterList({ items, kind }) {
  return (
    <ul className="divide-y divide-border/40">
      {items.map(({ provider, privilege, expiringSoon }) => (
        <RosterRow
          key={privilege.id}
          provider={provider}
          privilege={privilege}
          kind={kind}
          expiringSoon={expiringSoon}
        />
      ))}
    </ul>
  );
}

function RosterRow({ provider, privilege, kind, expiringSoon }) {
  const meta = [
    provider.position_type ? labelFor(POSITION_TYPES, provider.position_type) : null,
    provider.specialty ? specialtyAbbrFor(provider.specialty) : null,
    provider.home_state || null,
  ].filter(Boolean).join(' · ');

  const label = kind === 'privileged' ? 'Privileged' : 'Applied';
  const tone  = kind === 'privileged'
    ? (expiringSoon ? 'text-warning' : 'text-income')
    : 'text-warning';

  return (
    <li>
      <Link
        to={`/providers/${provider.id}`}
        className="block py-3 pl-1 pr-2 rounded hover:bg-surface2/40 transition-colors"
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
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-accent text-sm font-medium truncate">
                {fmtName(provider)}
              </div>
              <div className={cn(
                'font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0',
                tone,
              )}>
                {label}
              </div>
            </div>
            {meta && (
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">
                {meta}
              </div>
            )}
            {kind === 'privileged' && expiringSoon && (
              <div className="text-xs mt-1 leading-snug text-warning">
                Privilege expires within 90 days.
              </div>
            )}
            {kind === 'applied' && (
              <div className="text-xs mt-1 leading-snug text-warning">
                Privilege application in progress.
              </div>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
