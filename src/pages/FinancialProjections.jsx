import { useMemo } from 'react';
import SectionHeader from '@/components/brand/SectionHeader';
import ProjectionRow, { NotYetModeledRow } from '@/components/opportunities/ProjectionRow';
import { useOpportunities } from '@/hooks/useOpportunities';
import {
  bucketOpportunities,
  sortByAnnualGP,
} from '@/pages/home/projectionShared';

// /financial-projections — the full demand-side financial surface
// (companion to the Home V5/V6 widgets). Three sections:
//
//   1. Filled       — every modeled filled opp, ranked by annual GP
//   2. Pipeline     — every modeled pipeline opp, ranked by annual GP
//   3. Not Yet Modeled — created-but-unrated opps (filled or pipeline)
//                        listed with a "rates not set" prompt so they
//                        don't vanish from the financial view
//
// Per-page row extras: stage badge (pipeline only) + margin %.
// Standard suite chrome: no two-tier list-page header pattern here
// (this page has no search/filter/+new — that's the page-type rule
// from Home: no fixed bar with an empty action group).
//
// Nav placement: this is the third demand-side route (Opportunities,
// the future Matching page, and this) — flagged in DESIGN-NOTES for
// the parked nav-reorganization slice.

export default function FinancialProjections() {
  const opportunities = useOpportunities();

  const { filled, pipeline, notYetModeled } = useMemo(() => {
    const buckets = bucketOpportunities(opportunities.data);
    return {
      filled:        sortByAnnualGP(buckets.modeledFilled),
      pipeline:      sortByAnnualGP(buckets.modeledPipeline),
      notYetModeled: buckets.notYetModeled,
    };
  }, [opportunities.data]);

  return (
    <div
      className="min-h-full pb-12 px-4 sm:px-6"
      style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}
    >
      <div className="max-w-6xl mx-auto py-6">
        <h1 className="font-display text-3xl text-text mb-1">Financial Projections</h1>
        <p className="font-mono text-[11px] text-text-dim mb-8">
          Per-opportunity projections from the Opportunity Projection compute path. Ranked by annual GP.
        </p>

        {opportunities.loading && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-12">
            Loading…
          </div>
        )}

        {!opportunities.loading && (
          <>
            {/* ── Filled ── */}
            <SectionHeader text="Filled" first />
            <div className="mb-10">
              {filled.length === 0 ? (
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-6">
                  No modeled filled contracts.
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {filled.map(row => (
                    <li key={row.opp.id}>
                      <ProjectionRow
                        opp={row.opp}
                        annualGP={row.annualGP}
                        perShiftGP={row.perShiftGP}
                        perShiftMargin={row.perShiftMargin}
                        targetShiftsPerYear={row.targetShiftsPerYear}
                        secondary="margin"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Pipeline ── */}
            <SectionHeader text="Pipeline" />
            <div className="mb-10">
              {pipeline.length === 0 ? (
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-6">
                  No modeled pipeline opportunities.
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {pipeline.map(row => (
                    <li key={row.opp.id}>
                      <ProjectionRow
                        opp={row.opp}
                        annualGP={row.annualGP}
                        perShiftGP={row.perShiftGP}
                        perShiftMargin={row.perShiftMargin}
                        targetShiftsPerYear={row.targetShiftsPerYear}
                        stageBadge
                        secondary="margin"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Not Yet Modeled ── */}
            <SectionHeader text="Not Yet Modeled" />
            <div className="mb-10">
              {notYetModeled.length === 0 ? (
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center py-6">
                  Every active opportunity is modeled.
                </div>
              ) : (
                <>
                  <p className="font-mono text-[11px] text-text-dim mb-3">
                    {notYetModeled.length} {notYetModeled.length === 1 ? 'opportunity is' : 'opportunities are'} missing rate data — they can't be projected until rates are set on the detail page.
                  </p>
                  <ul className="divide-y divide-border/40">
                    {notYetModeled.map(row => (
                      <li key={row.opp.id}>
                        <NotYetModeledRow opp={row.opp} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
