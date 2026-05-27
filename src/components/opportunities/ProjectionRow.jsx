import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { fmtCurrency } from '@/utils/formatters';
import { OPPORTUNITY_STAGES, POSITION_TYPES, labelFor } from '@/utils/constants';
import { STAGE_BADGE } from '@/pages/Opportunities';
import { cn } from '@/lib/utils';

// Shared opportunity-projection row — used by Home V5 (value-ranked
// lists), Home V6 ("Can't Staff" readiness list), and the
// /financial-projections full page. Identity left, financial right;
// optional extras (stage badge, staffing diagnostic, secondary
// metric) ride in via props per surface.
//
// Color grammar matches Opportunity Projection on the detail page:
// annual GP in --profit teal when ≥ 0, danger red in parens when
// underwater. Italic on the dollar values = projection (estimate).
//
// IDENTITY: title line prefixes position type (M.D. / D.O. / NP /
// CRNA / PA) as a fixed-vocabulary label leading the narrative
// title — fixed label wins truncation so two opps at the same
// hospital still disambiguate by role even when titles truncate.
//
// SECONDARY METRIC:
//   secondary="shifts" (home widgets) — target shifts / yr (volume
//                                       denominator for annual GP)
//   secondary="margin" (full page)     — GP margin %
//   secondary=null                      — no secondary line
//
// UNMODELED MODE: when annualGP is null/undefined the row STILL
// renders (the row's job is identity + diagnostic, not just
// projection). Annual GP shows as "—/yr GP" muted. This is what
// keeps V6 "Can't Staff" honest for unmodeled opps — the staffing
// gap is real regardless of rate state.

function fmtProfit(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  if (n < 0) return `(${fmtCurrency(Math.abs(n))})`;
  return fmtCurrency(n);
}

export default function ProjectionRow({
  opp,
  annualGP,
  perShiftGP,
  perShiftMargin,
  targetShiftsPerYear,
  stageBadge = false,
  secondary = null,           // 'shifts' | 'margin' | null
  staffingDiagnostic,         // V6 "Can't Staff": named gap-type sub-line
  staffingTone = 'danger',    // 'danger' (zero ready) | 'warning' (one ready) | 'muted'
}) {
  const modeled = annualGP != null;
  const neg     = modeled && annualGP < 0;
  const profitClass = neg ? 'text-danger' : 'text-[var(--profit)]';
  const profitDisplay = fmtProfit(annualGP);

  const positionLabel = opp.position_type
    ? labelFor(POSITION_TYPES, opp.position_type)
    : null;
  const titleText = opp.title || opp.name || '—';

  const stagePill = stageBadge && opp.stage
    ? (
        <Badge
          variant="outline"
          className={cn('font-mono text-[9px] uppercase tracking-[0.1em]', STAGE_BADGE[opp.stage])}
        >
          {labelFor(OPPORTUNITY_STAGES, opp.stage)}
        </Badge>
      )
    : null;

  const STAFFING_TONE = {
    danger:  'text-danger',
    warning: 'text-warning',
    muted:   'text-text-muted',
  };

  return (
    <Link
      to={`/opportunities/${opp.id}`}
      className="block py-3 px-2 -mx-2 rounded hover:bg-surface2/40 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* Identity stack — hospital primary, position-prefixed
            title secondary, optional stage badge + diagnostic sub-
            line beneath. */}
        <div className="min-w-0 flex-1">
          <div className="text-text text-sm font-medium truncate">
            {opp.organization?.name || '—'}
          </div>
          <div className="font-mono text-[11px] text-text-dim truncate mt-0.5">
            {positionLabel ? `${positionLabel} · ${titleText}` : titleText}
          </div>
          {(stagePill || staffingDiagnostic) && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {stagePill}
              {staffingDiagnostic && (
                <span className={cn(
                  'font-mono text-[10px] uppercase tracking-[0.1em]',
                  STAFFING_TONE[staffingTone] ?? 'text-text-muted',
                )}>
                  {staffingDiagnostic}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Financial stack — annual GP prominent (the ranking key),
            secondary metric below per surface. Unmodeled rows show
            "—/yr GP" muted; staffing diagnostic still renders on
            the identity side so V6 stays useful for those opps. */}
        <div className="flex-shrink-0 text-right">
          <div className={cn(
            'font-mono italic text-sm font-bold',
            modeled ? profitClass : 'text-text-muted',
          )}>
            {modeled ? profitDisplay : '—'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted mt-0.5">
            / yr GP
          </div>
          {modeled && secondary === 'margin' && perShiftMargin != null && (
            <div className={cn('font-mono italic text-[11px] mt-1', profitClass)}>
              {(perShiftMargin * 100).toFixed(1)}% GP
            </div>
          )}
          {modeled && secondary === 'shifts' && targetShiftsPerYear != null && (
            <div className="font-mono text-[10px] text-text-dim mt-1">
              on {targetShiftsPerYear} shifts / yr
            </div>
          )}
          {modeled && secondary === 'pershift' && perShiftGP != null && (
            <div className={cn('font-mono italic text-[11px] mt-1', profitClass)}>
              {fmtProfit(perShiftGP)} / shift
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// Companion row for the "Not yet modeled" group on the full page —
// no projection numbers, just identity + a stage badge + a quiet
// "rates not set" prompt that the row itself links to so the user
// can go enter rates. Inherits the position-type prefix.
export function NotYetModeledRow({ opp }) {
  const positionLabel = opp.position_type
    ? labelFor(POSITION_TYPES, opp.position_type)
    : null;
  const titleText = opp.title || opp.name || '—';
  return (
    <Link
      to={`/opportunities/${opp.id}`}
      className="block py-3 px-2 -mx-2 rounded hover:bg-surface2/40 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-text text-sm font-medium truncate">
            {opp.organization?.name || '—'}
          </div>
          <div className="font-mono text-[11px] text-text-dim truncate mt-0.5">
            {positionLabel ? `${positionLabel} · ${titleText}` : titleText}
          </div>
          {opp.stage && (
            <div className="mt-1.5">
              <Badge
                variant="outline"
                className={cn('font-mono text-[9px] uppercase tracking-[0.1em]', STAGE_BADGE[opp.stage])}
              >
                {labelFor(OPPORTUNITY_STAGES, opp.stage)}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim">
            Rates not set →
          </div>
        </div>
      </div>
    </Link>
  );
}
