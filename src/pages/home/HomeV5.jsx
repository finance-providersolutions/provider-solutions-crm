import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock, AlertTriangle, AlertCircle,
  Check, X,
} from 'lucide-react';
import SectionHeader from '@/components/brand/SectionHeader';
import KPICard, { TierKPICard } from '@/components/brand/KPICard';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useProviders } from '@/hooks/useProviders';
import { useTasks } from '@/hooks/useTasks';
import { useActivities } from '@/hooks/useActivities';
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
import { cn } from '@/lib/utils';
import {
  BBox, AttentionRow, NavigateHub, todayIso,
  classifyProviderStage, eligibilityFilter,
  deriveFilledHealth, RISK_TONE, RISK_LABEL,
} from './shared';
import ProjectionRow from '@/components/opportunities/ProjectionRow';
import { bucketOpportunities, sortByAnnualGP } from './projectionShared';

// V5 — copy of V4 + a new "Financial Projections" widget at the top
// showing top-5 filled + top-5 pipeline opportunities ranked by
// projected annual GP. Uses the same compute path as the Opportunity
// Projection detail-page section (single fetch, one useMemo, no
// N+1). Unmodeled opps filtered out — they appear on the full
// /financial-projections page in its "Not Yet Modeled" group.
// V1–V4 untouched.

const POOL_ACTIVE = ['active'];
const POOL_PIPELINE = ['target', 'lead', 'contacted', 'interested', 'interviewing', 'onboarding'];

const SUPPLY_GROUPS = [
  { key: 'active',   label: 'Active',     statuses: ['active'],                                                 color: 'green'   },
  { key: 'onboard',  label: 'Onboarding', statuses: ['onboarding'],                                             color: 'default' },
  { key: 'pipeline', label: 'Pipeline',   statuses: ['target', 'lead', 'contacted', 'interested', 'interviewing'], color: 'white' },
  { key: 'off',      label: 'Off-pipe',   statuses: ['inactive', 'declined', 'disqualified'],                   color: 'dim'     },
];

export default function HomeV5() {
  const navigate      = useNavigate();
  const opportunities = useOpportunities();
  const providers     = useProviders();
  const openTasks     = useTasks({ status: 'open' });
  const activities    = useActivities({ sinceDays: 7 });
  const cred          = useAllCredentialing();
  const placements    = useAllPlacements();
  const expirations   = useExpirations();

  const providersById = useMemo(() => new Map(providers.data.map(p => [p.id, p])), [providers.data]);

  // ── Financial projections (V5) ──
  // Single useMemo over opportunities.data: bucket into filled /
  // pipeline / not-yet-modeled, sort modeled buckets by annual GP,
  // slice top 5 each. No N+1 — compute() runs once per opp.
  const financial = useMemo(() => {
    const buckets = bucketOpportunities(opportunities.data);
    return {
      filledTop5:   sortByAnnualGP(buckets.modeledFilled).slice(0, 5),
      pipelineTop5: sortByAnnualGP(buckets.modeledPipeline).slice(0, 5),
      filledCount:   buckets.modeledFilled.length,
      pipelineCount: buckets.modeledPipeline.length,
      notYetCount:   buckets.notYetModeled.length,
    };
  }, [opportunities.data]);

  // ── KPI ROW counts ──
  const kpis = useMemo(() => {
    const open   = opportunities.data.filter(o => ACTIVE_OPPORTUNITY_STAGES.includes(o.stage)).length;
    const filled = opportunities.data.filter(o => o.stage === 'filled').length;
    let active = 0, pipeline = 0;
    for (const p of providers.data) {
      if (p.archived) continue;
      if (POOL_ACTIVE.includes(p.status))   active   += 1;
      if (POOL_PIPELINE.includes(p.status)) pipeline += 1;
    }
    const today = todayIso();
    let openTaskAttention = 0;
    for (const t of openTasks.data) {
      if (!t.due_date) continue;
      if (t.due_date <= today) openTaskAttention += 1;
    }
    return {
      filled, open, active, pipeline,
      activities: activities.data?.length ?? 0,
      tasks: openTaskAttention,
    };
  }, [opportunities.data, providers.data, openTasks.data, activities.data]);

  // ── State Match (demand-only) ──
  const stateMap = useMemo(() => {
    // Supply: active-provider license states.
    const activeProvIds = new Set(providers.data.filter(p => !p.archived && p.status === 'active').map(p => p.id));
    const supplyByState = {};
    if (!cred.loading) {
      for (const [pid, rows] of cred.licensesByProvider.entries()) {
        if (!activeProvIds.has(pid)) continue;
        const states = new Set(rows.filter(r => r.status !== 'withdrawn').map(r => r.state).filter(Boolean));
        for (const st of states) supplyByState[st] = (supplyByState[st] || 0) + 1;
      }
    }
    // Demand split into open/filled.
    const openByState = {}, filledByState = {};
    for (const o of opportunities.data) {
      const st = o.organization?.state;
      if (!st) continue;
      if (ACTIVE_OPPORTUNITY_STAGES.includes(o.stage)) openByState[st] = (openByState[st] || 0) + 1;
      else if (o.stage === 'filled')                   filledByState[st] = (filledByState[st] || 0) + 1;
    }
    // ONLY demand-states (drop latent — supply-without-demand is noise).
    const demandStates = Array.from(new Set([
      ...Object.keys(openByState),
      ...Object.keys(filledByState),
    ])).sort();

    const maxSupply = Math.max(1, ...demandStates.map(st => supplyByState[st] || 0));
    const maxDemand = Math.max(1, ...demandStates.map(st => (openByState[st] || 0) + (filledByState[st] || 0)));

    const rows = demandStates.map(st => {
      const supply = supplyByState[st] || 0;
      const open   = openByState[st]   || 0;
      const filled = filledByState[st] || 0;
      const verdict = supply > 0 ? 'match' : 'gap';
      return { state: st, supply, open, filled, verdict, maxSupply, maxDemand };
    });
    // Gaps first, then matches.
    rows.sort((a, b) => {
      const order = { gap: 0, match: 1 };
      if (order[a.verdict] !== order[b.verdict]) return order[a.verdict] - order[b.verdict];
      return a.state.localeCompare(b.state);
    });
    const summary = {
      gaps:    rows.filter(r => r.verdict === 'gap').length,
      matches: rows.filter(r => r.verdict === 'match').length,
    };
    return { ready: !opportunities.loading && !providers.loading && !cred.loading, rows, summary };
  }, [opportunities.data, providers.data, cred]);

  // ── Retention per-contract ──
  const retention = useMemo(() => {
    const ready = !opportunities.loading && !placements.loading && !cred.loading && !providers.loading;
    if (!ready) return { ready: false, rows: [] };
    const filled = opportunities.data.filter(o => o.stage === 'filled');
    const rows = filled.map(o => {
      const placRows = placements.byOpportunity.get(o.id) ?? [];
      const health = deriveFilledHealth({
        opp: o,
        placements: placRows,
        privilegesByProvider: cred.privilegesByProvider,
        providersById,
      });
      return { opp: o, health };
    });
    const ORDER = ['expired', 'no_privilege', 'expiring', 'applied', 'pending', 'active', 'no_placements'];
    rows.sort((a, b) => ORDER.indexOf(a.health.risk) - ORDER.indexOf(b.health.risk));
    const atRiskCount = rows.filter(r => ['expired', 'expiring', 'no_privilege'].includes(r.health.risk)).length;
    return { ready: true, rows, atRiskCount };
  }, [opportunities.data, placements, cred, providers.data, providersById, opportunities.loading]);

  // ── Demand summary ──
  const demand = useMemo(() => {
    const open   = opportunities.data.filter(o => ACTIVE_OPPORTUNITY_STAGES.includes(o.stage));
    const filled = opportunities.data.filter(o => o.stage === 'filled');
    const byStage = Object.fromEntries(ACTIVE_OPPORTUNITY_STAGES.map(s => [s, 0]));
    for (const o of open) byStage[o.stage] = (byStage[o.stage] || 0) + 1;
    return { openCount: open.length, filledCount: filled.length, byStage };
  }, [opportunities.data]);

  // ── Open-opp Match grounding (V1 shape — per-opp rows) ──
  const match = useMemo(() => {
    const ready = !opportunities.loading && !providers.loading && !cred.loading && !placements.loading;
    if (!ready) return { ready: false, perOpp: [], totals: { privileged: 0, selected: 0, eligible: 0, open: 0 } };
    const perOpp = opportunities.data
      .filter(o => ACTIVE_OPPORTUNITY_STAGES.includes(o.stage))
      .map(o => {
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
  }, [opportunities.data, providers.data, cred, placements]);

  // ── Supply ──
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

  // ── Attention ──
  const attention = useMemo(() => {
    let expiring = 0;
    for (const it of expirations.items ?? []) {
      const b = expirationBucket(it.expirationDate);
      if (b === 'past' || b === '30' || b === '60' || b === '90') expiring += 1;
    }
    const today = todayIso();
    let dueToday = 0, overdue = 0;
    for (const t of openTasks.data) {
      if (!t.due_date) continue;
      if (t.due_date < today) overdue += 1;
      else if (t.due_date === today) dueToday += 1;
    }
    return {
      expiring,
      dueToday, overdue, taskTotal: dueToday + overdue,
      atRisk: retention.ready ? retention.atRiskCount : 0,
    };
  }, [expirations.items, openTasks.data, retention.atRiskCount, retention.ready]);

  return (
    <>
      {/* ── TOP KPI ROW (6 cards) — V3 carry, drill links wired to
            unfiltered list routes since list pages don't support URL
            filter state today (probed; not building this pass). ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-8">
        <TopKpi label="Filled opps"      value={opportunities.loading ? '—' : kpis.filled}   tone="green"   to="/opportunities" />
        <TopKpi label="Open opps"        value={opportunities.loading ? '—' : kpis.open}     tone="default" to="/opportunities" />
        <TopKpi label="Active providers" value={providers.loading ? '—' : kpis.active}       tone="green"   to="/providers" />
        <TopKpi label="Pipeline"         value={providers.loading ? '—' : kpis.pipeline}     tone="white"   to="/providers" />
        <TopKpi label="Activity 7d"      value={activities.loading ? '—' : kpis.activities}  tone="default" />
        <TopKpi label="Open tasks"       value={openTasks.loading ? '—' : kpis.tasks}        tone={kpis.tasks > 0 ? 'red' : 'dim'} to="/tasks" />
      </div>

      {/* ── FINANCIAL PROJECTIONS (V5 addition — top 5 by annual GP) ── */}
      <SectionHeader text="Financial Projections" first />
      <BBox className="mb-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center mb-4">
          Top opportunities by projected annual gross profit
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Filled — most valuable active contracts */}
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text mb-2 pb-2 border-b border-border/40">
              Filled
            </div>
            {opportunities.loading && (
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">Loading…</div>
            )}
            {!opportunities.loading && financial.filledTop5.length === 0 && (
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">
                No modeled filled contracts.
              </div>
            )}
            {!opportunities.loading && financial.filledTop5.length > 0 && (
              <ul className="divide-y divide-border/40">
                {financial.filledTop5.map(row => (
                  <li key={row.opp.id}>
                    <ProjectionRow
                      opp={row.opp}
                      annualGP={row.annualGP}
                      perShiftGP={row.perShiftGP}
                      perShiftMargin={row.perShiftMargin}
                      targetShiftsPerYear={row.targetShiftsPerYear}
                      secondary="shifts"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pipeline — most valuable potential deals */}
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text mb-2 pb-2 border-b border-border/40">
              Pipeline
            </div>
            {opportunities.loading && (
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">Loading…</div>
            )}
            {!opportunities.loading && financial.pipelineTop5.length === 0 && (
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">
                No modeled pipeline opportunities.
              </div>
            )}
            {!opportunities.loading && financial.pipelineTop5.length > 0 && (
              <ul className="divide-y divide-border/40">
                {financial.pipelineTop5.map(row => (
                  <li key={row.opp.id}>
                    <ProjectionRow
                      opp={row.opp}
                      annualGP={row.annualGP}
                      perShiftGP={row.perShiftGP}
                      perShiftMargin={row.perShiftMargin}
                      targetShiftsPerYear={row.targetShiftsPerYear}
                      secondary="shifts"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
          <span>
            {financial.filledCount + financial.pipelineCount} modeled · {financial.notYetCount} unrated
          </span>
          <Link to="/financial-projections" className="text-accent hover:text-accent-bright transition-colors">
            View all →
          </Link>
        </div>
      </BBox>

      {/* ── STATE MATCH (reworked) ── */}
      <SectionHeader text="State Match" />
      <BBox className="mb-10">
        {!stateMap.ready && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Loading…</div>
        )}
        {stateMap.ready && stateMap.rows.length === 0 && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No states with open or filled demand.</div>
        )}
        {stateMap.ready && stateMap.rows.length > 0 && (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center mb-4">
              Where we have business — does supply meet demand?
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stateMap.rows.map(row => <StateMatchCard key={row.state} row={row} />)}
            </div>
            <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center">
              {stateMap.summary.gaps} gap{stateMap.summary.gaps !== 1 ? 's' : ''}{' '}
              · {stateMap.summary.matches} match{stateMap.summary.matches !== 1 ? 'es' : ''}
              {' · latent (supply, no demand) hidden by design'}
            </div>
          </>
        )}
      </BBox>

      {/* ── RETENTION (reframed — per-contract health) ── */}
      <SectionHeader text="Retention" />
      <BBox className="mb-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center mb-4">
          Active contracts — are placed providers still privileged?
        </div>
        {!retention.ready && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Loading…</div>
        )}
        {retention.ready && retention.rows.length === 0 && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No filled contracts.</div>
        )}
        {retention.ready && retention.rows.length > 0 && (
          <ul className="space-y-3">
            {retention.rows.map(row => <RetentionCard key={row.opp.id} row={row} />)}
          </ul>
        )}
      </BBox>

      {/* ── GROUNDING: DEMAND ── */}
      <SectionHeader text="Demand" />
      <BBox className="mb-10">
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            label="Open opps"
            value={opportunities.loading ? null : kpis.open}
            sub={
              opportunities.loading
                ? 'Loading…'
                : (kpis.open === 0
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
            value={opportunities.loading ? null : kpis.filled}
            sub={
              opportunities.loading
                ? 'Loading…'
                : (retention.ready && retention.atRiskCount > 0
                    ? `${retention.atRiskCount} at risk`
                    : (kpis.filled === 0 ? 'No active contracts' : 'All healthy'))
            }
            color={retention.ready && retention.atRiskCount > 0 ? 'red' : 'green'}
            loading={opportunities.loading}
            drillable
            onClick={() => navigate('/opportunities')}
          />
        </div>
      </BBox>

      {/* ── GROUNDING: OPEN-OPP MATCH ── */}
      <SectionHeader text="Open-opp Match" />
      <BBox className="mb-10">
        <div className="grid grid-cols-4 gap-2">
          <TierKPICard label="Privileged" value={match.ready ? match.totals.privileged : '—'} color="green" />
          <TierKPICard label="Selected"   value={match.ready ? match.totals.selected   : '—'} color="default" />
          <TierKPICard label="Eligible"   value={match.ready ? match.totals.eligible   : '—'} color="white" />
          <TierKPICard label="Open"       value={match.ready ? match.totals.open       : '—'} color={match.ready && match.totals.open > 0 ? 'warning' : 'dim'} />
        </div>
        <div className="mt-5">
          {match.ready && match.perOpp.length > 0 && (
            <ul className="divide-y divide-border/40">
              {match.perOpp.map(row => <MatchRow key={row.opp.id} row={row} />)}
            </ul>
          )}
          {match.ready && match.perOpp.length === 0 && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No open opportunities in the queue.</div>
          )}
        </div>
      </BBox>

      {/* ── GROUNDING: SUPPLY ── */}
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

      {/* ── ATTENTION ── */}
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
            tone={attention.atRisk > 0 ? 'danger' : 'muted'}
            count={attention.atRisk}
            label={(attention.atRisk === 1 ? 'filled contract' : 'filled contracts') + ' with retention risk'}
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

// ── Top KPI card (V3 carry). Either a Link to a list page (drill)
// or a plain div for cards with no destination (Activity 7d).
const TOP_KPI_TONE = {
  default: 'text-accent-bright',
  green:   'text-income',
  red:     'text-danger',
  white:   'text-text',
  dim:     'text-text-muted',
};
function TopKpi({ label, value, tone = 'default', to }) {
  const Tag = to ? Link : 'div';
  return (
    <Tag
      to={to}
      className={cn(
        'relative bg-surface border border-border rounded p-3',
        'flex flex-col items-center text-center justify-center',
        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40',
        to && 'cursor-pointer hover:border-accent hover:bg-surface2 transition-colors',
      )}
    >
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim leading-tight">{label}</div>
      <div className={cn('font-sans font-bold tracking-[-0.02em] leading-none mt-1.5 text-2xl tabular-nums', TOP_KPI_TONE[tone] ?? TOP_KPI_TONE.default)}>
        {value}
      </div>
    </Tag>
  );
}

// ── State Match Card — per-state Level-2 surface card. Three
// explicit stacked bars (Supply / Open / Filled) so the win-vs-
// retain split is legible regardless of bar width.
function StateMatchCard({ row }) {
  const { state, supply, open, filled, verdict, maxSupply, maxDemand } = row;
  const verdictColor = verdict === 'match' ? 'text-income' : 'text-danger';
  const verdictIcon  = verdict === 'match' ? <Check className="w-3 h-3" strokeWidth={2.5} /> : <X className="w-3 h-3" strokeWidth={2.5} />;
  const verdictLabel = verdict === 'match' ? 'Match' : 'Gap';
  // Bar widths — capped so a 0 still gets visible track scaffolding.
  const supplyPct = supply > 0 ? Math.max(8, Math.round((supply / maxSupply) * 100)) : 0;
  const openPct   = open   > 0 ? Math.max(8, Math.round((open   / maxDemand) * 100)) : 0;
  const filledPct = filled > 0 ? Math.max(8, Math.round((filled / maxDemand) * 100)) : 0;
  return (
    <div className={cn(
      'bg-surface border rounded p-3',
      verdict === 'gap' ? 'border-danger/60' : 'border-border',
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-base font-bold uppercase tracking-[0.12em] text-text">
          {state}
        </div>
        <div className={cn('flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]', verdictColor)}>
          {verdictIcon}
          <span>{verdictLabel}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <MetricBar label="Supply" value={supply} pct={supplyPct} barClass="bg-income/70"  sub={supply === 0 ? 'No active providers' : (supply === 1 ? '1 active provider licensed' : `${supply} active providers licensed`)} />
        <MetricBar label="Open"   value={open}   pct={openPct}   barClass="bg-warning/80" sub={open === 0 ? '' : (open === 1 ? '1 open opportunity' : `${open} open opportunities`)} />
        <MetricBar label="Filled" value={filled} pct={filledPct} barClass="bg-accent/70"  sub={filled === 0 ? '' : (filled === 1 ? '1 active contract' : `${filled} active contracts`)} />
      </div>
    </div>
  );
}

function MetricBar({ label, value, pct, barClass, sub }) {
  const empty = value === 0;
  return (
    <div className="grid grid-cols-[58px_1fr_24px] items-center gap-2">
      <div className={cn('font-mono text-[9px] font-bold uppercase tracking-[0.12em]', empty ? 'text-text-muted' : 'text-text-dim')}>
        {label}
      </div>
      <div className="h-2 bg-surface2/60 rounded-sm relative overflow-hidden">
        {!empty && (
          <div className={cn('absolute left-0 top-0 h-full rounded-sm', barClass)} style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className={cn('font-mono text-[11px] font-bold tabular-nums text-right', empty ? 'text-text-muted' : 'text-text')}>
        {empty ? '—' : value}
      </div>
    </div>
  );
}

// ── Retention contract card — concrete per-contract health: opp
// title, hospital, the named at-risk detail (provider + specific
// expiry / pending state). Replaces V2's abstract tier counts.
function RetentionCard({ row }) {
  const { opp, health } = row;
  const tone = RISK_TONE[health.risk] ?? 'text-text-dim';
  const label = RISK_LABEL[health.risk] ?? health.risk;
  const isAtRisk = ['expired', 'expiring', 'no_privilege'].includes(health.risk);
  return (
    <li>
      <Link
        to={`/opportunities/${opp.id}`}
        className={cn(
          'block bg-surface border rounded p-3 transition-colors',
          isAtRisk ? 'border-warning/40 hover:border-warning' : 'border-border hover:border-accent',
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-accent text-sm font-medium truncate">{opp.title || 'Untitled opportunity'}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5 truncate">
              {[opp.organization?.name, opp.organization?.state, opp.position_type].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className={cn('flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] flex-shrink-0', tone)}>
            {isAtRisk ? <AlertTriangle className="w-3 h-3" strokeWidth={2} /> : <Check className="w-3 h-3" strokeWidth={2.5} />}
            <span>{label}</span>
          </div>
        </div>
        {/* All flagged findings — usually one, occasionally several
            (a contract with multiple at-risk privileges). Lists them
            with the named provider + specific reason. */}
        <ul className="space-y-1">
          {health.findings.map((f, idx) => (
            <li key={idx} className={cn('font-mono text-[11px] leading-snug', isAtRisk ? 'text-text' : 'text-text-dim')}>
              <span className={cn('mr-1', RISK_TONE[f.risk] ?? 'text-text-dim')}>
                {f.risk === 'active' ? '✓' : '⚠'}
              </span>
              {f.detail}
            </li>
          ))}
        </ul>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted mt-2">
          {health.placementCount} {health.placementCount === 1 ? 'placement' : 'placements'}
        </div>
      </Link>
    </li>
  );
}

// ── Match row (V1-style, kept for grounding section). ──
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
