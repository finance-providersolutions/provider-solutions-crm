import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Briefcase, Stethoscope, Users, ListTodo, CalendarClock,
} from 'lucide-react';
import SectionHeader from '@/components/brand/SectionHeader';
import KPICard from '@/components/brand/KPICard';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useProviders } from '@/hooks/useProviders';
import { useTasks } from '@/hooks/useTasks';
import { useActivities } from '@/hooks/useActivities';
import {
  ACTIVE_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGES,
  labelFor,
} from '@/utils/constants';
import { fmtInt } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Today's date as YYYY-MM-DD for the same-string compare against
// tasks.due_date that Tasks.jsx uses (column is a date, not a
// timestamptz, so string compare in ISO format is correct and
// avoids any timezone drift).
const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const NAV_ITEMS = [
  { path: '/organizations', label: 'Organizations', icon: Building2,     desc: 'Hospitals and LOCUMs partners' },
  { path: '/opportunities', label: 'Opportunities', icon: Briefcase,     desc: 'Demand pipeline by stage'      },
  { path: '/providers',     label: 'Providers',     icon: Stethoscope,   desc: 'Supply pipeline and roster'    },
  { path: '/contacts',      label: 'Contacts',      icon: Users,         desc: 'People at organizations'       },
  { path: '/tasks',         label: 'Tasks',         icon: ListTodo,      desc: 'Open follow-ups and history'   },
  { path: '/expirations',   label: 'Expirations',   icon: CalendarClock, desc: 'Credentialing renewal radar'   },
];

export default function Home() {
  const navigate = useNavigate();
  const opportunities = useOpportunities();
  const providers     = useProviders();
  const openTasks     = useTasks({ status: 'open' });
  const recent        = useActivities({ limit: 10 });

  // Bucket open opportunities by stage for the headline count + sub
  // line. Same active-stage allowlist as the Organizations card pill
  // (single source of truth in constants).
  const openOppByStage = useMemo(() => {
    const counts = Object.fromEntries(ACTIVE_OPPORTUNITY_STAGES.map(s => [s, 0]));
    let total = 0;
    for (const o of opportunities.data) {
      if (!counts.hasOwnProperty(o.stage)) continue;
      counts[o.stage] += 1;
      total += 1;
    }
    return { counts, total };
  }, [opportunities.data]);

  // Stage breakdown for the KPI sub line. Spell stage names in full
  // and hide zero-count stages — "1 Lead · 2 Qualified" reads cleanly
  // and stays scannable; the dropped zeros mean the line is absent
  // entirely when nothing is open. The 2-line sub slot on KPICard
  // absorbs the wrap when all four stages are populated.
  const openOppSubLine = useMemo(() => {
    return ACTIVE_OPPORTUNITY_STAGES
      .filter(s => openOppByStage.counts[s] > 0)
      .map(s => `${openOppByStage.counts[s]} ${labelFor(OPPORTUNITY_STAGES, s)}`)
      .join(' · ');
  }, [openOppByStage]);

  const activeProviderCount = useMemo(
    () => providers.data.filter(p => p.status === 'active').length,
    [providers.data],
  );

  // Open tasks needing attention today: due_date is set AND <= today.
  // The same string-compare rule Tasks.jsx uses (line 425) for the
  // overdue treatment; we extend it to include today so the headline
  // answers "what needs me now."
  const taskAttention = useMemo(() => {
    const today = todayIso();
    let dueToday = 0;
    let overdue = 0;
    for (const t of openTasks.data) {
      if (!t.due_date) continue;
      if (t.due_date < today)  overdue  += 1;
      else if (t.due_date === today) dueToday += 1;
    }
    return { dueToday, overdue, total: dueToday + overdue };
  }, [openTasks.data]);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="font-display text-4xl text-text mb-2">Home</h1>
        <p className="text-text-dim mb-10 font-mono text-[11px] uppercase tracking-[0.12em]">
          Provider Solutions CRM
        </p>

        <SectionHeader text="Snapshot" first />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <KPICard
            label="Open opportunities"
            value={opportunities.loading ? null : fmtInt(openOppByStage.total)}
            sub={opportunities.loading ? 'Loading…' : openOppSubLine}
            loading={opportunities.loading}
            drillable
            onClick={() => navigate('/opportunities')}
          />
          <KPICard
            label="Active providers"
            value={providers.loading ? null : fmtInt(activeProviderCount)}
            sub={providers.loading ? 'Loading…' : 'Currently placeable'}
            color="green"
            loading={providers.loading}
            drillable
            onClick={() => navigate('/providers')}
          />
          <KPICard
            label="Tasks needing attention"
            value={openTasks.loading ? null : fmtInt(taskAttention.total)}
            sub={
              openTasks.loading
                ? 'Loading…'
                : `${taskAttention.dueToday} today · ${taskAttention.overdue} overdue`
            }
            color={!openTasks.loading && taskAttention.overdue > 0 ? 'red' : 'green'}
            loading={openTasks.loading}
            drillable
            onClick={() => navigate('/tasks')}
          />
        </div>

        <SectionHeader text="Recent activity" />
        <div className="mb-10">
          <ActivityFeed
            activities={recent.data}
            loading={recent.loading}
            showParent
            emptyText="Nothing logged yet — log your first call from any organization detail page."
          />
        </div>

        <SectionHeader text="Navigate" />
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
              <p className="font-mono text-xs text-text-dim leading-snug">
                {desc}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
