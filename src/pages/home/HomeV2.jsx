import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, AlertTriangle, AlertCircle } from 'lucide-react';
import SectionHeader from '@/components/brand/SectionHeader';
import KPICard, { TierKPICard } from '@/components/brand/KPICard';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useProviders } from '@/hooks/useProviders';
import { useTasks } from '@/hooks/useTasks';
import { useAllCredentialing } from '@/hooks/useMatching';
import { useAllPlacements } from '@/hooks/usePlacements';
import { useExpirations } from '@/hooks/useExpirations';
import { expirationBucket } from '@/components/credentialing/expiration';
import {
  ACTIVE_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGES,
  PROVIDER_STATUSES,
  labelFor,
} from '@/utils/constants';
import { fmtInt } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  BBox, AttentionRow, NavigateHub, todayIso,
  classifyProviderStage, eligibilityFilter,
  deriveFilledRisk, RISK_TONE, RISK_LABEL,
} from './shared';

// V2 — retention/filled-opportunity incorporation. The matching
// engine has TWO jobs: WIN open demand AND RETAIN filled demand.
// V1 only showed the win side; V2 surfaces both. Filled opps with a
// placed provider whose hospital privilege is expiring or lapsed are
// AT-RISK contracts worth flagging.
//
// Section structure:
//   Demand        — Open + Filled side by side, plus per-band detail
//   The Match     — Open queue (same as V1) — winning side
//   Retention     — Filled queue with risk per opp — retaining side
//   Supply        — same as V1
//   Attention     — same as V1 plus retention-risk count
//   Navigate      — same as V1

const SUPPLY_GROUPS = [
  { key: 'active',   label: 'Active',     statuses: ['active'],                                                 color: 'green'   },
  { key: 'onboard',  label: 'Onboarding', statuses: ['onboarding'],                                             color: 'default' },
  { key: 'pipeline', label: 'Pipeline',   statuses: ['target', 'lead', 'contacted', 'interested', 'interviewing'], color: 'white' },
  { key: 'off',      label: 'Off-pipe',   statuses: ['inactive', 'declined', 'disqualified'],                   color: 'dim'     },
];

export default function HomeV2() {
  const navigate      = useNavigate();
  const opportunities = useOpportunities();
  const providers     = useProviders();
  const openTasks     = useTasks({ status: 'open' });
  const cred          = useAllCredentialing();
  const placements    = useAllPlacements();
  const expirations   = useExpirations();

  const demand = useMemo(() => {
    const open   = opportunities.data.filter(o => ACTIVE_OPPORTUNITY_STAGES.includes(o.stage));
    const filled = opportunities.data.filter(o => o.stage === 'filled');
    const byStage = Object.fromEntries(ACTIVE_OPPORTUNITY_STAGES.map(s => [s, 0]));
    for (const o of open) byStage[o.stage] = (byStage[o.stage] || 0) + 1;
    return { open, filled, openCount: open.length, filledCount: filled.length, byStage };
  }, [opportunities.data]);

  // Open-opp matching surface (same as V1).
  const match = useMemo(() => {
    const ready = !opportunities.loading && !providers.loading && !cred.loading && !placements.loading;
    if (!ready) return { ready: false, perOpp: [], totals: { privileged: 0, selected: 0, eligible: 0, open: 0 } };
    const perOpp = demand.open.map(o => {
      const placRows = placements.byOpportunity.get(o.id) ?? [];
      const filtered = eligibilityFilter({ opp: o, providers: providers.data, licensesByProvider: cred.licensesByProvider });
      const tiers = { privileged: 0, applied: 0, selected: 0, eligible: 0, blocked: 0 };
      for (const p of filtered) {
        const stage = classifyProviderStage({
          opp: o,
          provider: p,
          licenses:    cred.licensesByProvider.get(p.id)    ?? [],
          credentials: cred.credentialsByProvider.get(p.id) ?? [],
          privileges:  cred.privilegesByProvider.get(p.id)  ?? [],
          placement:   placRows.find(r => r.provider_id === p.id) ?? null,
        });
        tiers[stage] += 1;
      }
      const matchClass = tiers.privileged > 0
        ? 'privileged'
        : (tiers.applied + tiers.selected > 0 ? 'committed' : (tiers.eligible > 0 ? 'eligible' : 'open'));
      return { opp: o, oppState: o.organization?.state ?? null, filtered: filtered.length, tiers, matchClass };
    });
    const totals = {
      privileged: perOpp.filter(x => x.matchClass === 'privileged').length,
      selected:   perOpp.filter(x => x.matchClass === 'committed').length,
      eligible:   perOpp.filter(x => x.matchClass === 'eligible').length,
      open:       perOpp.filter(x => x.matchClass === 'open').length,
    };
    return { ready: true, perOpp, totals };
  }, [demand.open, providers.data, cred, placements, opportunities.loading, providers.loading]);

  // Retention surface — for each filled opp, derive risk.
  const retention = useMemo(() => {
    const ready = !opportunities.loading && !placements.loading && !cred.loading;
    if (!ready) return { ready: false, perOpp: [], counts: { active: 0, applied: 0, expiring: 0, expired: 0, no_privilege: 0 } };
    const perOpp = demand.filled.map(o => {
      const placRows = placements.byOpportunity.get(o.id) ?? [];
      const risk = deriveFilledRisk({ opp: o, placements: placRows, privilegesByProvider: cred.privilegesByProvider });
      return { opp: o, oppState: o.organization?.state ?? null, placementCount: placRows.length, risk };
    });
    const counts = { active: 0, applied: 0, expiring: 0, expired: 0, no_privilege: 0 };
    for (const r of perOpp) {
      if (counts[r.risk] != null) counts[r.risk] += 1;
    }
    const atRisk = perOpp.filter(r => ['expired', 'expiring', 'no_privilege'].includes(r.risk)).length;
    return { ready: true, perOpp, counts, atRisk };
  }, [demand.filled, placements, cred, opportunities.loading]);

  const supply = useMemo(() => {
    const counts = Object.fromEntries(SUPPLY_GROUPS.map(g => [g.key, 0]));
    const stageBreakdown = Object.fromEntries(PROVIDER_STATUSES.map(s => [s.value, 0]));
    let total = 0;
    for (const p of providers.data) {
      if (p.archived) continue;
      total += 1;
      stageBreakdown[p.status] = (stageBreakdown[p.status] || 0) + 1;
      const g = SUPPLY_GROUPS.find(g => g.statuses.includes(p.status));
      if (g) counts[g.key] += 1;
    }
    return { counts, total, stageBreakdown };
  }, [providers.data]);

  const attention = useMemo(() => {
    let expiring = 0;
    for (const it of expirations.items ?? []) {
      const b = expirationBucket(it.expirationDate);
      if (b === 'past' || b === '30' || b === '60' || b === '90') expiring += 1;
    }
    let selWithoutPriv = 0;
    if (!placements.loading && !opportunities.loading && !cred.loading) {
      for (const pl of placements.data) {
        const o = opportunities.data.find(x => x.id === pl.opportunity_id);
        const orgId = o?.organization?.id;
        if (!orgId) continue;
        const provPriv = (cred.privilegesByProvider.get(pl.provider_id) ?? []).filter(pp => pp.organization_id === orgId);
        if (provPriv.length === 0) selWithoutPriv += 1;
      }
    }
    const today = todayIso();
    let dueToday = 0, overdue = 0;
    for (const t of openTasks.data) {
      if (!t.due_date) continue;
      if (t.due_date < today) overdue += 1;
      else if (t.due_date === today) dueToday += 1;
    }
    return { expiring, selWithoutPriv, dueToday, overdue, taskTotal: dueToday + overdue };
  }, [expirations.items, placements.data, opportunities.data, cred.privilegesByProvider, openTasks.data, placements.loading, opportunities.loading, cred.loading]);

  return (
    <>
      {/* DEMAND — open + filled side by side. The two KPI cards
          frame the engine's two jobs explicitly. */}
      <SectionHeader text="Demand" first />
      <BBox className="mb-10">
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            label="Open opps"
            value={opportunities.loading ? null : fmtInt(demand.openCount)}
            sub={
              opportunities.loading
                ? 'Loading…'
                : (demand.openCount === 0
                    ? 'None in pipeline'
                    : ACTIVE_OPPORTUNITY_STAGES
                        .filter(s => demand.byStage[s] > 0)
                        .map(s => `${demand.byStage[s]} ${labelFor(OPPORTUNITY_STAGES, s)}`)
                        .join(' · '))
            }
            loading={opportunities.loading}
            drillable
            onClick={() => navigate('/opportunities')}
          />
          <KPICard
            label="Filled opps"
            value={opportunities.loading ? null : fmtInt(demand.filledCount)}
            sub={
              opportunities.loading
                ? 'Loading…'
                : (retention.ready && retention.atRisk > 0
                    ? `${retention.atRisk} at risk`
                    : `${demand.filledCount === 0 ? 'No active contracts' : 'All healthy'}`)
            }
            color={retention.ready && retention.atRisk > 0 ? 'red' : 'green'}
            loading={opportunities.loading}
            drillable
            onClick={() => navigate('/opportunities')}
          />
        </div>
        <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center">
          Two jobs — WIN open demand · RETAIN filled demand
        </div>
      </BBox>

      {/* THE MATCH — open opps (same as V1). The winning side. */}
      <SectionHeader text="The Match · winning" />
      <BBox className="mb-10">
        <div className="grid grid-cols-4 gap-2">
          <TierKPICard label="Privileged" value={match.ready ? match.totals.privileged : '—'} color="green" />
          <TierKPICard label="Selected"   value={match.ready ? match.totals.selected   : '—'} color="default" />
          <TierKPICard label="Eligible"   value={match.ready ? match.totals.eligible   : '—'} color="white" />
          <TierKPICard label="Open"       value={match.ready ? match.totals.open       : '—'} color={match.ready && match.totals.open > 0 ? 'warning' : 'dim'} />
        </div>
        <div className="mt-5">
          {!match.ready && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Computing matches…</div>
          )}
          {match.ready && match.perOpp.length === 0 && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No open opportunities in the queue.</div>
          )}
          {match.ready && match.perOpp.length > 0 && (
            <ul className="divide-y divide-border/40">
              {match.perOpp.map(row => <MatchRow key={row.opp.id} row={row} />)}
            </ul>
          )}
        </div>
      </BBox>

      {/* RETENTION — filled opps with health badges. The retaining
          side. Same B-box grammar so it visually parallels Match. */}
      <SectionHeader text="Retention · retaining" />
      <BBox className="mb-10">
        <div className="grid grid-cols-4 gap-2">
          <TierKPICard label="Active"   value={retention.ready ? retention.counts.active   : '—'} color="green" />
          <TierKPICard label="Applied"  value={retention.ready ? retention.counts.applied  : '—'} color="warning" />
          <TierKPICard label="Expiring" value={retention.ready ? retention.counts.expiring : '—'} color="warning" />
          <TierKPICard label="At risk"  value={retention.ready ? retention.counts.expired + retention.counts.no_privilege : '—'} color={retention.ready && (retention.counts.expired + retention.counts.no_privilege) > 0 ? 'red' : 'dim'} />
        </div>
        <div className="mt-5">
          {!retention.ready && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Computing retention…</div>
          )}
          {retention.ready && retention.perOpp.length === 0 && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No filled contracts.</div>
          )}
          {retention.ready && retention.perOpp.length > 0 && (
            <ul className="divide-y divide-border/40">
              {retention.perOpp.map(row => <RetentionRow key={row.opp.id} row={row} />)}
            </ul>
          )}
        </div>
      </BBox>

      <SectionHeader text="Supply" />
      <BBox className="mb-10">
        <div className="grid grid-cols-4 gap-2">
          {SUPPLY_GROUPS.map(g => (
            <TierKPICard
              key={g.key}
              label={g.label}
              value={providers.loading ? '—' : supply.counts[g.key]}
              color={g.color}
            />
          ))}
        </div>
        {!providers.loading && supply.total > 0 && (
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center leading-relaxed">
            {PROVIDER_STATUSES
              .filter(s => supply.stageBreakdown[s.value] > 0)
              .map(s => `${supply.stageBreakdown[s.value]} ${s.label}`)
              .join(' · ')}
          </div>
        )}
      </BBox>

      <SectionHeader text="Attention" />
      <BBox className="mb-10">
        <ul className="divide-y divide-border/40">
          <AttentionRow
            icon={CalendarClock}
            tone={attention.expiring > 0 ? 'warning' : 'muted'}
            count={attention.expiring}
            label={attention.expiring === 1 ? 'credential expiring within 90 days' : 'credentials expiring within 90 days'}
            to="/expirations"
            loading={expirations.loading}
          />
          <AttentionRow
            icon={AlertTriangle}
            tone={retention.atRisk > 0 ? 'danger' : 'muted'}
            count={retention.ready ? retention.atRisk : 0}
            label={(retention.atRisk === 1 ? 'filled contract' : 'filled contracts') + ' with retention risk'}
            loading={!retention.ready}
          />
          <AttentionRow
            icon={AlertCircle}
            tone={attention.overdue > 0 ? 'danger' : (attention.dueToday > 0 ? 'warning' : 'muted')}
            count={attention.taskTotal}
            label={`open ${attention.taskTotal === 1 ? 'task' : 'tasks'} needing attention today`}
            detail={openTasks.loading ? null : (attention.taskTotal === 0 ? null : `${attention.overdue} overdue · ${attention.dueToday} today`)}
            to="/tasks"
            loading={openTasks.loading}
          />
        </ul>
      </BBox>

      <SectionHeader text="Navigate" />
      <NavigateHub navigate={navigate} />
    </>
  );
}

const MATCH_TONE = { privileged: 'text-income', committed: 'text-accent', eligible: 'text-text', open: 'text-warning' };
const MATCH_LABEL = { privileged: 'Privileged', committed: 'Committed', eligible: 'Eligible', open: 'No candidates' };

function MatchRow({ row }) {
  const { opp, oppState, filtered, tiers, matchClass } = row;
  const tone = MATCH_TONE[matchClass];
  const stageLabel = labelFor(OPPORTUNITY_STAGES, opp.stage);
  const tierBits = [
    tiers.privileged ? `${tiers.privileged} priv` : null,
    tiers.applied    ? `${tiers.applied} appl`    : null,
    tiers.selected   ? `${tiers.selected} sel`    : null,
    tiers.eligible   ? `${tiers.eligible} elig`   : null,
    tiers.blocked    ? `${tiers.blocked} blkd`    : null,
  ].filter(Boolean);
  const sub = filtered === 0
    ? (oppState ? `No providers licensed in ${oppState} for this position` : 'No state set — readiness undefined')
    : (tierBits.length > 0 ? tierBits.join(' · ') : 'No matches yet');
  return (
    <li>
      <Link to={`/opportunities/${opp.id}`} className="block py-3 px-1 -mx-1 rounded hover:bg-surface2/40 transition-colors">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-accent text-sm font-medium truncate min-w-0">{opp.title || 'Untitled opportunity'}</div>
          <div className={cn('font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0', tone)}>{MATCH_LABEL[matchClass]}</div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">
          {[stageLabel, oppState, opp.position_type, opp.organization?.name].filter(Boolean).join(' · ')}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">{sub}</div>
      </Link>
    </li>
  );
}

function RetentionRow({ row }) {
  const { opp, oppState, placementCount, risk } = row;
  const tone = RISK_TONE[risk] ?? 'text-text-dim';
  const label = RISK_LABEL[risk] ?? risk;
  const sub = `${placementCount} placed · ${oppState ?? '—'} · ${opp.position_type ?? '—'} · ${opp.organization?.name ?? ''}`;
  return (
    <li>
      <Link to={`/opportunities/${opp.id}`} className="block py-3 px-1 -mx-1 rounded hover:bg-surface2/40 transition-colors">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-accent text-sm font-medium truncate min-w-0">{opp.title || 'Untitled opportunity'}</div>
          <div className={cn('font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0', tone)}>{label}</div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">{sub}</div>
      </Link>
    </li>
  );
}
