import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useOpportunities } from '@/hooks/useOpportunities';
import {
  OPPORTUNITY_SETTINGS, OPPORTUNITY_STAGES, POSITION_TYPES,
  SPECIALTIES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { STAGE_BADGE } from '@/pages/Opportunities';
import { cn } from '@/lib/utils';

// Opportunities at THIS hospital. Inline filter on useOpportunities
// — at today's data volume (4 opps in total) a per-org query is
// unnecessary; revisit if opportunity volume grows large.

export default function HospitalOpportunityList({ organizationId }) {
  const { data: allOpportunities, loading, error } = useOpportunities();

  if (loading) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim py-3">
        Loading opportunities…
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

  const rows = (allOpportunities ?? []).filter(o => o.organization_id === organizationId);

  if (rows.length === 0) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted py-3">
        No opportunities at this hospital yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/40">
      {rows.map(opp => <OpportunityRow key={opp.id} opp={opp} />)}
    </ul>
  );
}

function OpportunityRow({ opp }) {
  const meta = [
    opp.position_type ? labelFor(POSITION_TYPES, opp.position_type) : null,
    opp.specialty     ? specialtyAbbrFor(opp.specialty)             : null,
    opp.setting       ? labelFor(OPPORTUNITY_SETTINGS, opp.setting) : null,
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <Link
        to={`/opportunities/${opp.id}`}
        className="block py-3 pl-1 pr-2 rounded hover:bg-surface2/40 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-accent text-sm font-medium truncate">
            {opp.title || opp.name || '—'}
          </div>
          {opp.stage && (
            <Badge variant="outline" className={cn(
              'font-mono text-[10px] uppercase tracking-[0.1em] flex-shrink-0',
              STAGE_BADGE[opp.stage],
            )}>
              {labelFor(OPPORTUNITY_STAGES, opp.stage)}
            </Badge>
          )}
        </div>
        {meta && (
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim mt-0.5">
            {meta}
          </div>
        )}
      </Link>
    </li>
  );
}
