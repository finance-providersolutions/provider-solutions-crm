import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';
import SectionHeader from '@/components/brand/SectionHeader';
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
} from '@/utils/constants';
import { cn } from '@/lib/utils';
import {
  BBox, AttentionRow, NavigateHub, todayIso,
  classifyProviderStage, eligibilityFilter,
  deriveFilledRisk, RISK_TONE, RISK_LABEL,
} from './shared';

// V3 — most evolved. Top KPI row + a NEW state-keyed match
// visualization for the matching engine.
//
// THE NEW VISUALIZATION — "State Match Map":
// A diverging horizontal-bar layout where each row is a US state
// that has either supply (active providers' license rows) or demand
// (an opportunity). The state code sits in the center; supply bars
// grow LEFT (teal-green), demand bars grow RIGHT (warning amber for
// open, accent teal for filled retention). The visual immediately
// shows MATCH (both sides present), LATENT CAPACITY (supply only),
// and GAP (demand only) at a glance. This is the literal "supply
// meeting demand by state" picture the matching engine concept
// implies — V1/V2 buried that signal inside text rows.
//
// Above the map sits a compact engine-flow line:
//   SUPPLY ▸ ENGINE ▸ DEMAND
// with three running counts so the band reads as a flow, not a
// static list.

const POOL_ACTIVE = ['active'];
const POOL_PIPELINE = ['target', 'lead', 'contacted', 'interested', 'interviewing', 'onboarding'];

export default function HomeV3() {
  const navigate      = useNavigate();
  const opportunities = useOpportunities();
  const providers     = useProviders();
  const openTasks     = useTasks({ status: 'open' });
  const activities    = useActivities({ sinceDays: 7 });
  const cred          = useAllCredentialing();
  const placements    = useAllPlacements();
  const expirations   = useExpirations();

  // ── KPI ROW counts ──────────────────────────────────────────────
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
      filled,
      open,
      active,
      pipeline,
      activities: activities.data?.length ?? 0,
      tasks: openTaskAttention,
      tasksTotal: openTasks.data.length,
    };
  }, [opportunities.data, providers.data, openTasks.data, activities.data]);

  // ── Open-opp lifecycle (for the engine flow center number) ──
  const matchTotals = useMemo(() => {
    const ready = !opportunities.loading && !providers.loading && !cred.loading && !placements.loading;
    if (!ready) return { ready: false, eligible: 0, matched: 0, gap: 0 };
    let eligible = 0, matched = 0, gap = 0;
    for (const o of opportunities.data) {
      if (!ACTIVE_OPPORTUNITY_STAGES.includes(o.stage)) continue;
      const placRows = placements.byOpportunity.get(o.id) ?? [];
      const filtered = eligibilityFilter({ opp: o, providers: providers.data, licensesByProvider: cred.licensesByProvider });
      let oppHasMatch = false;
      let oppHasEligible = filtered.length > 0;
      for (const p of filtered) {
        const stage = classifyProviderStage({
          opp: o, provider: p,
          licenses:    cred.licensesByProvider.get(p.id)    ?? [],
          credentials: cred.credentialsByProvider.get(p.id) ?? [],
          privileges:  cred.privilegesByProvider.get(p.id)  ?? [],
          placement:   placRows.find(r => r.provider_id === p.id) ?? null,
        });
        if (stage === 'privileged' || stage === 'applied' || stage === 'selected') oppHasMatch = true;
      }
      if (oppHasMatch) matched += 1;
      else if (oppHasEligible) eligible += 1;
      else gap += 1;
    }
    return { ready: true, eligible, matched, gap };
  }, [opportunities.data, providers.data, cred, placements]);

  // ── State Match Map data ──
  const stateMap = useMemo(() => {
    // Supply: count of distinct active providers with a non-withdrawn
    // license per state. Filter to active providers (the placeable
    // pool) so the map shows real capacity, not aspirational coverage.
    const activeProvIds = new Set(providers.data.filter(p => !p.archived && p.status === 'active').map(p => p.id));
    const supply = {};
    if (!cred.loading) {
      for (const [pid, rows] of cred.licensesByProvider.entries()) {
        if (!activeProvIds.has(pid)) continue;
        const states = new Set(rows.filter(r => r.status !== 'withdrawn').map(r => r.state).filter(Boolean));
        for (const st of states) supply[st] = (supply[st] || 0) + 1;
      }
    }
    // Demand: open + filled, by state, separated.
    const openByState = {};
    const filledByState = {};
    for (const o of opportunities.data) {
      const st = o.organization?.state;
      if (!st) continue;
      if (ACTIVE_OPPORTUNITY_STAGES.includes(o.stage)) openByState[st] = (openByState[st] || 0) + 1;
      else if (o.stage === 'filled')                   filledByState[st] = (filledByState[st] || 0) + 1;
    }
    const states = Array.from(new Set([
      ...Object.keys(supply),
      ...Object.keys(openByState),
      ...Object.keys(filledByState),
    ])).sort();
    // Bar scaling — bigger of the two sides across all rows.
    const maxSupply  = Math.max(0, ...Object.values(supply));
    const maxDemand  = Math.max(0, ...Object.keys(openByState).map(s => (openByState[s] || 0) + (filledByState[s] || 0)));
    const maxAcross  = Math.max(maxSupply, maxDemand, 1);
    const rows = states.map(st => {
      const s = supply[st] || 0;
      const dOpen = openByState[st] || 0;
      const dFilled = filledByState[st] || 0;
      const d = dOpen + dFilled;
      let kind;
      if (s > 0 && d > 0) kind = 'match';
      else if (s > 0)     kind = 'latent';
      else                kind = 'gap';
      return { state: st, supply: s, open: dOpen, filled: dFilled, demand: d, kind, maxAcross };
    });
    // Sort: gaps first (problems), then matches, then latent.
    const KIND_ORDER = { gap: 0, match: 1, latent: 2 };
    rows.sort((a, b) => {
      if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      return a.state.localeCompare(b.state);
    });
    const summary = {
      matches: rows.filter(r => r.kind === 'match').length,
      gaps:    rows.filter(r => r.kind === 'gap').length,
      latent:  rows.filter(r => r.kind === 'latent').length,
    };
    return { rows, summary, ready: !opportunities.loading && !providers.loading && !cred.loading };
  }, [opportunities.data, providers.data, cred]);

  // ── Demand queue (open + filled, with retention badges) ──
  const queue = useMemo(() => {
    const ready = !opportunities.loading && !placements.loading && !cred.loading && !providers.loading;
    if (!ready) return { ready: false, rows: [] };
    const rows = opportunities.data
      .filter(o => ACTIVE_OPPORTUNITY_STAGES.includes(o.stage) || o.stage === 'filled')
      .map(o => {
        const placRows = placements.byOpportunity.get(o.id) ?? [];
        if (o.stage === 'filled') {
          const risk = deriveFilledRisk({ opp: o, placements: placRows, privilegesByProvider: cred.privilegesByProvider });
          return { opp: o, mode: 'retain', placementCount: placRows.length, risk };
        }
        const filtered = eligibilityFilter({ opp: o, providers: providers.data, licensesByProvider: cred.licensesByProvider });
        let stage = 'open';
        for (const p of filtered) {
          const s = classifyProviderStage({
            opp: o, provider: p,
            licenses:    cred.licensesByProvider.get(p.id)    ?? [],
            credentials: cred.credentialsByProvider.get(p.id) ?? [],
            privileges:  cred.privilegesByProvider.get(p.id)  ?? [],
            placement:   placRows.find(r => r.provider_id === p.id) ?? null,
          });
          if (s === 'privileged') { stage = 'privileged'; break; }
          if ((s === 'applied' || s === 'selected') && stage !== 'privileged') stage = 'committed';
          else if (s === 'eligible' && stage === 'open') stage = 'eligible';
        }
        return { opp: o, mode: 'win', filtered: filtered.length, stage };
      });
    // Sort: open (win) first by stage urgency, then filled (retain) by risk urgency.
    const WIN_RANK = { open: 0, eligible: 1, committed: 2, privileged: 3 };
    const RETAIN_RANK = { expired: 0, no_privilege: 1, expiring: 2, applied: 3, pending: 4, active: 5, no_placements: 6 };
    rows.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === 'win' ? -1 : 1;
      if (a.mode === 'win') return (WIN_RANK[a.stage] ?? 99) - (WIN_RANK[b.stage] ?? 99);
      return (RETAIN_RANK[a.risk] ?? 99) - (RETAIN_RANK[b.risk] ?? 99);
    });
    return { ready: true, rows };
  }, [opportunities.data, providers.data, cred, placements]);

  // ── Attention strip ──
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
    // Retention at-risk count — derived inline (cheap, same source data).
    let atRisk = 0;
    if (!opportunities.loading && !placements.loading && !cred.loading) {
      for (const o of opportunities.data) {
        if (o.stage !== 'filled') continue;
        const placRows = placements.byOpportunity.get(o.id) ?? [];
        const risk = deriveFilledRisk({ opp: o, placements: placRows, privilegesByProvider: cred.privilegesByProvider });
        if (['expired', 'expiring', 'no_privilege'].includes(risk)) atRisk += 1;
      }
    }
    return { expiring, dueToday, overdue, taskTotal: dueToday + overdue, atRisk };
  }, [expirations.items, opportunities.data, placements, cred, openTasks.data, opportunities.loading, placements.loading, cred.loading]);

  return (
    <>
      {/* ── TOP KPI ROW (6 cards) ─────────────────────────────────
          Mobile: 2 across in the user-specified order.
          Tablet (sm): 3 across. Laptop (lg): 6 across. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-8">
        <TopKpi label="Filled opps"      value={opportunities.loading ? '—' : kpis.filled}   tone="green"   to="/opportunities" />
        <TopKpi label="Open opps"        value={opportunities.loading ? '—' : kpis.open}     tone="default" to="/opportunities" />
        <TopKpi label="Active providers" value={providers.loading ? '—' : kpis.active}       tone="green"   to="/providers" />
        <TopKpi label="Pipeline"         value={providers.loading ? '—' : kpis.pipeline}     tone="white"   to="/providers" />
        <TopKpi label="Activity 7d"      value={activities.loading ? '—' : kpis.activities}  tone="default" to="/" />
        <TopKpi label="Open tasks"       value={openTasks.loading ? '—' : kpis.tasks}        tone={kpis.tasks > 0 ? 'red' : 'dim'} to="/tasks" />
      </div>

      {/* ── THE MATCHING ENGINE — new state-map visualization ── */}
      <SectionHeader text="The Matching Engine" first />
      <BBox className="mb-10">
        {/* Engine flow header — supply ▸ engine ▸ demand line. */}
        <EngineFlow
          supply={kpis.active}
          matched={matchTotals.ready ? matchTotals.matched : '—'}
          eligible={matchTotals.ready ? matchTotals.eligible : '—'}
          gap={matchTotals.ready ? matchTotals.gap : '—'}
        />

        <div className="mt-5 border-t border-border/40 pt-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim text-center mb-3">
            State match map
          </div>
          {!stateMap.ready && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Loading…</div>
          )}
          {stateMap.ready && stateMap.rows.length === 0 && (
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No states with supply or demand.</div>
          )}
          {stateMap.ready && stateMap.rows.length > 0 && (
            <>
              <StateMapLegend />
              <div className="mt-3 space-y-1">
                {stateMap.rows.map(row => <StateMapRow key={row.state} row={row} />)}
              </div>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim text-center">
                {stateMap.summary.gaps} gap{stateMap.summary.gaps !== 1 ? 's' : ''} ·{' '}
                {stateMap.summary.matches} match{stateMap.summary.matches !== 1 ? 'es' : ''} ·{' '}
                {stateMap.summary.latent} latent
              </div>
            </>
          )}
        </div>
      </BBox>

      {/* ── DEMAND QUEUE (open winning + filled retaining) ── */}
      <SectionHeader text="Demand queue" />
      <BBox className="mb-10">
        {!queue.ready && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">Loading…</div>
        )}
        {queue.ready && queue.rows.length === 0 && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-3">No demand right now.</div>
        )}
        {queue.ready && queue.rows.length > 0 && (
          <ul className="divide-y divide-border/40">
            {queue.rows.map(r => <QueueRow key={r.opp.id} row={r} />)}
          </ul>
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
            loading={opportunities.loading || placements.loading || cred.loading}
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

// ── Top KPI card — slimmer than KPICard so 6-across fits on laptop.
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
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim leading-tight">
        {label}
      </div>
      <div className={cn(
        'font-sans font-bold tracking-[-0.02em] leading-none mt-1.5 text-2xl tabular-nums',
        TOP_KPI_TONE[tone] ?? TOP_KPI_TONE.default,
      )}>
        {value}
      </div>
    </Tag>
  );
}

// ── Engine flow: SUPPLY ▸ ENGINE ▸ DEMAND. Three nodes connected
// by chevrons. The center node carries the matched/eligible/gap
// breakdown; the wings carry headline supply and headline demand.
function EngineFlow({ supply, matched, eligible, gap }) {
  return (
    <div className="grid grid-cols-[1fr_auto_2fr_auto_1fr] gap-1 sm:gap-2 items-stretch">
      <FlowNode
        topLabel="Supply"
        bigValue={supply}
        subLabel="active providers"
        tone="green"
      />
      <FlowArrow />
      <FlowEngine matched={matched} eligible={eligible} gap={gap} />
      <FlowArrow />
      <FlowNode
        topLabel="Demand"
        bigValue={(matched === '—' ? '—' : (matched + eligible + gap))}
        subLabel="open opps"
        tone="warning"
      />
    </div>
  );
}

const FLOW_TONE = {
  green:   'text-income',
  warning: 'text-warning',
  default: 'text-accent-bright',
};

function FlowNode({ topLabel, bigValue, subLabel, tone }) {
  return (
    <div className="bg-surface border border-border rounded p-2 flex flex-col items-center justify-center text-center">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-text-dim leading-tight">
        {topLabel}
      </div>
      <div className={cn(
        'font-sans font-bold tracking-[-0.02em] leading-none my-1 text-xl sm:text-2xl tabular-nums',
        FLOW_TONE[tone],
      )}>
        {bigValue}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-muted leading-tight">
        {subLabel}
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-accent">
      <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
    </div>
  );
}

function FlowEngine({ matched, eligible, gap }) {
  return (
    <div className="bg-surface-well border border-accent rounded p-2 flex flex-col justify-center">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-accent leading-tight text-center mb-1">
        Engine
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <FlowMini label="match" value={matched}  tone="text-income"  />
        <FlowMini label="elig"  value={eligible} tone="text-text"    />
        <FlowMini label="gap"   value={gap}      tone="text-danger"  />
      </div>
    </div>
  );
}

function FlowMini({ label, value, tone }) {
  return (
    <div>
      <div className={cn('font-sans font-bold leading-none text-base sm:text-lg tabular-nums', tone)}>
        {value}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-dim mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}

// ── State Match Map row — diverging bar layout.
function StateMapLegend() {
  return (
    <div className="flex items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-text-dim">
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-income rounded-sm" />Supply</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-warning rounded-sm" />Open</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-accent rounded-sm" />Filled</span>
    </div>
  );
}

const KIND_TONE = {
  match:  'border-l-2 border-income',
  latent: 'border-l-2 border-border',
  gap:    'border-l-2 border-danger',
};

function StateMapRow({ row }) {
  const { state, supply, open, filled, kind, maxAcross } = row;
  // Bar widths as percentages of the max-across, capped at 100%.
  const supplyPct = supply > 0 ? Math.max(8, Math.round((supply / maxAcross) * 100)) : 0;
  const demand = open + filled;
  const demandPct = demand > 0 ? Math.max(8, Math.round((demand / maxAcross) * 100)) : 0;
  // Filled vs open within the demand bar — proportional split.
  const filledPct = demand > 0 ? Math.round((filled / demand) * 100) : 0;
  return (
    <div className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 pl-2 rounded', KIND_TONE[kind])}>
      {/* Left (supply) — right-aligned bar growing leftward. */}
      <div className="flex items-center justify-end gap-2 min-w-0">
        <span className="font-mono text-[10px] tabular-nums text-text-dim flex-shrink-0">
          {supply > 0 ? supply : ''}
        </span>
        <div className="flex-1 h-2 relative">
          {supply > 0 && (
            <div
              className="absolute right-0 top-0 h-full bg-income/70 rounded-sm"
              style={{ width: `${supplyPct}%` }}
              title={`Supply: ${supply}`}
            />
          )}
        </div>
      </div>
      {/* Center state pill. */}
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text px-1.5 min-w-[28px] text-center">
        {state}
      </div>
      {/* Right (demand) — left-aligned bar growing rightward, split
          open (amber) / filled (teal accent). */}
      <div className="flex items-center justify-start gap-2 min-w-0">
        <div className="flex-1 h-2 relative">
          {demand > 0 && (
            <div className="absolute left-0 top-0 h-full rounded-sm flex" style={{ width: `${demandPct}%` }}>
              {filled > 0 && (
                <div className="h-full bg-accent/70" style={{ width: `${filledPct}%` }} title={`Filled: ${filled}`} />
              )}
              {open > 0 && (
                <div className="h-full bg-warning/80" style={{ width: `${100 - filledPct}%` }} title={`Open: ${open}`} />
              )}
            </div>
          )}
        </div>
        <span className="font-mono text-[10px] tabular-nums text-text-dim flex-shrink-0">
          {demand > 0 ? demand : ''}
        </span>
      </div>
    </div>
  );
}

// ── Demand queue row (open or filled, with mode-aware badge). ──
const WIN_TONE = { privileged: 'text-income', committed: 'text-accent', eligible: 'text-text', open: 'text-warning' };
const WIN_LABEL = { privileged: 'Privileged', committed: 'Committed', eligible: 'Eligible', open: 'No candidates' };

function QueueRow({ row }) {
  const { opp } = row;
  const state = opp.organization?.state;
  let label, tone, meta;
  if (row.mode === 'win') {
    label = WIN_LABEL[row.stage] ?? 'Open';
    tone  = WIN_TONE[row.stage]  ?? 'text-warning';
    meta = `WIN · ${opp.stage} · ${state ?? '—'} · ${opp.position_type ?? '—'} · ${row.filtered} eligible`;
  } else {
    label = RISK_LABEL[row.risk] ?? row.risk;
    tone  = RISK_TONE[row.risk]  ?? 'text-text-dim';
    meta = `RETAIN · filled · ${state ?? '—'} · ${opp.position_type ?? '—'} · ${row.placementCount} placed`;
  }
  return (
    <li>
      <Link to={`/opportunities/${opp.id}`} className="block py-3 px-1 -mx-1 rounded hover:bg-surface2/40 transition-colors">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-accent text-sm font-medium truncate min-w-0">{opp.title || 'Untitled opportunity'}</div>
          <div className={cn('font-mono text-[10px] uppercase tracking-[0.12em] flex-shrink-0', tone)}>{label}</div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">{meta}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5 truncate">{opp.organization?.name}</div>
      </Link>
    </li>
  );
}
