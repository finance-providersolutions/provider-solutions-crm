import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import Thumb from '@/components/uploads/Thumb';
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import RateStructureFormDialog from '@/components/opportunities/RateStructureFormDialog';
import RequirementsFormDialog from '@/components/opportunities/RequirementsFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import OpportunityProjection from '@/components/opportunities/OpportunityProjection';
import SuggestedProviders from '@/components/opportunities/SuggestedProviders';
import LogActivityForm from '@/components/activities/LogActivityForm';
import ActivityFeed from '@/components/activities/ActivityFeed';
import TasksSection from '@/components/tasks/TasksSection';
import { DetailsCollapsibleHeader } from '@/components/ui/details-collapsible-header';
import { useOpportunity, useOpportunities } from '@/hooks/useOpportunities';
import { useActivities } from '@/hooks/useActivities';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import {
  OPPORTUNITY_SETTINGS, OPPORTUNITY_STAGES, POSITION_TYPES,
  REQUIREMENT_ITEMS, SPECIALTIES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { fmtCurrency, fmtDate, fmtDateTime } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';
import { STAGE_BADGE } from './Opportunities';

// Shared B-box class string used by every section in the
// standing/input cluster on the opportunity detail page:
// bg-surface-well fill + full teal border + bottom accent-to-
// transparent gradient rule, per the two-level box convention.
// One place so the four wells (Requirements, Provider Availability,
// Rate structure, Opportunity Projection) stay visually in lockstep.
const B_BOX_CLASSES =
  "bg-surface-well border border-accent rounded p-6 mb-10 " +
  "relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 " +
  "after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40";

export default function Opportunity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: opp, loading, error, refetch } = useOpportunity(id);
  const { update, remove } = useOpportunities();
  // Cluster-A universal: detail-page Activity sections default the
  // feed to the last 90 days. Older activity stays accessible from
  // the global /activities archive via the View All button below.
  const activities = useActivities({ opportunityId: id, sinceDays: 90 });

  const [editOpen, setEditOpen] = useState(false);
  const [rateStructureOpen, setRateStructureOpen] = useState(false);
  const [rateDetailsOpen, setRateDetailsOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  // Details collapsed by default — matches the Provider and Org Details
  // one-off. Uses the shared DetailsCollapsibleHeader so this page's
  // first section reads in lockstep with the other detail pages.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Cluster-A universal: "+ New activity" button toggles the log
  // form on/off. Closing the form on successful submit keeps the
  // surface compact. Mirrors Provider and Org.
  const [logOpen, setLogOpen] = useState(false);
  const deleteOppTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

  // Header height tracking — drives body paddingTop so content
  // starts cleanly below the fixed header at every breakpoint.
  // Mirrors the Provider page pattern (Provider.jsx:73–93). Kept
  // replicated rather than extracted to a shared shell: the
  // mechanism is small, and the Provider page is the shipped
  // reference whose chrome must not regress.
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    setHeaderH(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(() => {
      setHeaderH(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [opp]);

  useChromeBottom(58 + headerH);

  async function performDelete() {
    if (!opp) return;
    try {
      await remove(opp.id);
      toast.success('Opportunity deleted');
      navigate('/opportunities');
    } catch (err) {
      console.error('delete opportunity', err);
      toast.error(err?.message || 'Could not delete');
      throw err;
    }
  }

  function handleDeleteActivity(a, triggerEl) {
    activityDeleteTriggerRef.current = triggerEl ?? null;
    setPendingDeleteActivity(a);
  }

  async function performDeleteActivity() {
    if (!pendingDeleteActivity) return;
    try {
      await activities.remove(pendingDeleteActivity.id);
      toast.success('Activity deleted');
    } catch (err) {
      console.error('delete activity', err);
      toast.error(err?.message || 'Could not delete activity');
      throw err;
    }
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (error)   return <Centered tone="danger">{error.message}</Centered>;
  if (!opp)    return <Centered>Opportunity not found.</Centered>;

  // Two thresholds against the same two core rate columns, on purpose:
  //   - rateStructureUnset (BOTH null) drives the Rate Structure card.
  //     Once EITHER core rate is set, the card shows the populated
  //     summary so the user sees their saved work.
  //   - projectionGuardOn (EITHER null) keeps the Opportunity
  //     Projection section guarded until BOTH core rates exist —
  //     projection can't compute a margin from a one-sided rate.
  const rateStructureUnset  = opp.bill_regular_hourly == null && opp.pay_regular_daily == null;
  const projectionGuardOn   = opp.bill_regular_hourly == null || opp.pay_regular_daily == null;

  // Requirements unset = null or empty array. New opps default-write
  // ['license'] on create (OpportunityFormDialog), so unset is only
  // reachable on legacy pre-piece-1 rows whose required_items was
  // never populated.
  const requirementsUnset = !Array.isArray(opp.required_items) || opp.required_items.length === 0;

  const titleLine = opp.title || opp.name || '—';
  const orgName = opp.organization?.name || '';
  // Location — city, ST. Falls back to the parent org's city/state
  // when the opportunity has no location override. Renders as its
  // own row beneath the hospital name.
  const locationLine = [
    opp.location_city || opp.organization?.city,
    opp.location_state || opp.organization?.state,
  ].filter(Boolean).join(', ');
  // Triad — position · specialty (abbr) · setting. Sits beneath the
  // title in the header. Mirrors the Opportunities card row-1
  // treatment. Source partner intentionally NOT here — it lives in
  // the Details collapsible.
  const triadParts = [
    opp.position_type && labelFor(POSITION_TYPES, opp.position_type),
    opp.specialty && specialtyAbbrFor(opp.specialty),
    opp.setting && labelFor(OPPORTUNITY_SETTINGS, opp.setting),
  ].filter(Boolean);

  return (
    <>
      {/* ── Fixed condensed header — mirrors the Provider page pattern
            (Provider.jsx:136–245). Replicated rather than extracted:
            the mechanism is ~12 lines and Provider is the shipped
            reference whose chrome must not regress. Sits below the
            58px primary PageHeader (z-200) and above body content.
            Stays visible while Dialogs are open; the shared Dialog
            primitive anchors below `--ps-chrome-bottom` (set by
            useChromeBottom above) so dialog tops clear this header. ── */}
      <div
        ref={headerRef}
        className="fixed left-0 right-0 z-[150] bg-surface border-b border-border"
        style={{ top: 'calc(58px + env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 sm:gap-4">
          {/* Logo — centered against the 4-row text block. With
              hospital, city, title, triad stacked, items-start would
              leave the thumb floating up top while the visual mass
              of the text sits lower; center reads cleaner. */}
          <Thumb
            path={opp.organization?.logo_path}
            bucket="organization-logos"
            alt={orgName || 'Hospital'}
            fallback={initialsFor(orgName || '?')}
            shape="square"
            className="h-16 w-16 sm:h-20 sm:w-20 text-sm flex-shrink-0"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1">
            {/* 1. Hospital name — links to org. At sm:+ the city/ST
                appends inline in parens on the same row (deliberate
                breakpoint divergence — wide layout becomes 3 rows
                instead of 4; mobile keeps the standalone row 2 below). */}
            {opp.organization && (
              <div className="flex items-baseline min-w-0">
                <Link
                  to={`/organizations/${opp.organization.id}`}
                  className="text-text hover:text-accent transition-colors text-sm truncate"
                >
                  {orgName}
                </Link>
                {locationLine && (
                  <span className="hidden sm:inline ml-1.5 font-mono text-[11px] text-text-dim whitespace-nowrap flex-shrink-0">
                    ({locationLine})
                  </span>
                )}
              </div>
            )}

            {/* 2. City, ST — mobile-only standalone row. Hidden at
                sm:+ where the inline parens version above takes over. */}
            {locationLine && (
              <div className="sm:hidden font-mono text-[11px] text-text-dim truncate">
                {locationLine}
              </div>
            )}

            {/* 3. Title — accent teal, font-display. Same scaling as
                the prior pass: text-[15px] sm:text-[28px]. */}
            <h1 className="font-display text-[15px] sm:text-[28px] text-accent leading-tight truncate">
              {titleLine}
            </h1>

            {/* 4. Triad — position · specialty (abbr) · setting. Sits
                under the title. Card-row-1 mono treatment, tracking-
                tight. Allowed to wrap if a long specialty pushes it
                over — header is runtime-measured so a taller header
                is handled by the chrome-bottom plumbing. */}
            {triadParts.length > 0 && (
              <div className="font-mono text-[11px] tracking-tight text-text-dim">
                {triadParts.join(' · ')}
              </div>
            )}
          </div>

          {/* Right column — Edit on top, stage badge anchored beneath. */}
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <Button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit"
              title="Edit"
              className="h-9 px-2.5 sm:px-3 bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden sm:inline sm:ml-1.5">Edit</span>
            </Button>
            {opp.stage && (
              <Badge variant="outline" className={cn(
                'font-mono text-[10px] uppercase tracking-[0.1em]',
                STAGE_BADGE[opp.stage],
              )}>
                {labelFor(OPPORTUNITY_STAGES, opp.stage)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        className="min-h-full pb-12 px-6"
        style={{ paddingTop: `calc(58px + ${headerH}px + env(safe-area-inset-top) + 24px)` }}
      >
        <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/opportunities')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All opportunities
        </button>

        {/* 1. Details — renamed from "Overview" to align with every
              other detail page (Provider / Org / Contact / Task), and
              switched to the shared DetailsCollapsibleHeader one-off
              (default-collapsed, no card wrapper) matching Provider/
              Org Details. The bare dense DetailGrid below renders only
              when expanded. */}
        <DetailsCollapsibleHeader
          open={detailsOpen}
          onToggle={() => setDetailsOpen(o => !o)}
        />
        {detailsOpen && (
          <DetailGrid>
            <DetailField label="Position type">
              {opp.position_type ? labelFor(POSITION_TYPES, opp.position_type) : <Empty />}
            </DetailField>
            <DetailField label="Specialty">
              {opp.specialty ? labelFor(SPECIALTIES, opp.specialty) : <Empty />}
            </DetailField>
            <DetailField label="Setting">
              {opp.setting ? labelFor(OPPORTUNITY_SETTINGS, opp.setting) : <Empty />}
            </DetailField>
            <DetailField label="Probability">
              {opp.probability != null ? `${opp.probability}%` : <Empty />}
            </DetailField>
            <DetailField label="Location">
              {[opp.location_city, opp.location_state].filter(Boolean).join(', ')
                || [opp.organization?.city, opp.organization?.state].filter(Boolean).join(', ')
                || <Empty />}
            </DetailField>
            <DetailField label="Dates">
              {(opp.start_date || opp.end_date)
                ? `${opp.start_date ? fmtDate(opp.start_date) : '—'} → ${opp.end_date ? fmtDate(opp.end_date) : '—'}`
                : <Empty />}
            </DetailField>
            <DetailField label="Next action">
              {opp.next_action_date ? fmtDate(opp.next_action_date) : <Empty />}
            </DetailField>
            <DetailField label="Hours guaranteed">
              {opp.hours_guaranteed ? 'Yes' : 'No'}
            </DetailField>
            <DetailField label="Source partner">
              {opp.source_partner?.name || <Empty />}
            </DetailField>
            <DetailField label="Created">
              {opp.created_at ? fmtDateTime(opp.created_at) : <Empty />}
            </DetailField>
            <DetailField label="Notes" full>
              {opp.notes
                ? <p className="text-text whitespace-pre-wrap">{opp.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        )}

        {/* 2. Requirements — piece 3 of the opportunity-maturation
              arc. Edit-on-detail: detail-page card with an unset
              empty state (legacy null/[] only — new opps default-
              write ['license']) and a populated readout with a
              pencil edit affordance opening RequirementsFormDialog.
              Now in the B-box convention (piece 2 swept this +
              Rate Structure + Opportunity Projection in one pass).
              The readout was pulled OUT of the Provider
              Availability B-box (slot 3 below) since this section
              now owns the display, and adjacency makes the
              "requirements → who qualifies" flow read top-to-bottom. */}
        <SectionHeader text="Requirements" />
        {requirementsUnset ? (
          <div className={B_BOX_CLASSES + ' flex flex-col items-center text-center gap-3'}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Requirements not defined
            </div>
            <Button
              type="button"
              onClick={() => setRequirementsOpen(true)}
              className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              Set requirements
            </Button>
          </div>
        ) : (
          <div className={B_BOX_CLASSES + ' relative'}>
            <button
              type="button"
              onClick={() => setRequirementsOpen(true)}
              aria-label="Edit requirements"
              title="Edit requirements"
              className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded text-text-dim hover:text-accent hover:bg-surface2 transition-colors z-10"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <div className="pr-10">
              <RequirementsReadout items={opp.required_items} />
            </div>
          </div>
        )}

        {/* 3. Provider Availability — INTERIM section ordering: the
              finished section leads with respect to the still-
              unfinished sections (Rate structure, Opportunity
              Projection, Activity) below it. Requirements sits
              above as the input to this matching surface. Same B
              box convention as the rest of the standing cluster
              (piece 2 brought Rate Structure + Projection into it). */}
        <SectionHeader text="Provider Availability" />
        <div className={B_BOX_CLASSES}>
          <SuggestedProviders opportunity={opp} />
        </div>

        {/* 4. Rate structure — piece 2 of the maturation arc: a
              summary-visible / details-collapsed shape inside the
              B-box convention. Summary shows rate FACTS only (no
              computed profit — profit-per-shift lives exclusively
              on Opportunity Projection so trust in the headline
              isn't eroded by a second differently-computed number).
              Collapsed Details holds the full grid (shift defaults,
              bill, pay, on-call, travel) unchanged. */}
        <SectionHeader text="Rate structure" />
        {rateStructureUnset ? (
          <div className={B_BOX_CLASSES + ' flex flex-col items-center text-center gap-3'}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Rate structure not set yet
            </div>
            <Button
              type="button"
              onClick={() => setRateStructureOpen(true)}
              className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              Set rate structure
            </Button>
          </div>
        ) : (
          <div className={B_BOX_CLASSES}>
            {/* Summary — rate facts only, grouped as a hierarchical
                daily income-statement: bold group headings + bold
                totals (each total preceded by a short right-aligned
                "sum" divider), indented components beneath, ending
                in the bold rate-only daily profit at the bottom.
                ZERO reads from modeling_assumptions; every value
                is a stored rate column or a sum/product of stored
                rate columns. Whole dollars throughout. Plain non-
                italic treatment (facts, not projections).

                Note on the daily total billed: it sums a per-day
                regular amount with a per-night on-call amount —
                a typical-day snapshot assuming one on-call night
                per working day. Stays facts-only (no read of the
                modeler's on-call-nights assumption). */}
            <div className="mb-5 mx-auto max-w-md sm:max-w-lg">
              <RateFactRow
                label={
                  <>
                    Regular hrs/day
                    {opp.shift_time_in && opp.shift_time_out && (
                      <span className="hidden sm:inline ml-1.5">
                        ({fmt12Hour(opp.shift_time_in)} – {fmt12Hour(opp.shift_time_out)})
                      </span>
                    )}
                  </>
                }
                value={opp.regular_hours_per_day != null ? `${opp.regular_hours_per_day} hrs` : '—'}
              />

              {/* Income group */}
              <RateGroupHeader label="Income" />
              <RateSubRow
                label={
                  <>
                    Reg. daily billed
                    {opp.bill_regular_hourly != null && opp.regular_hours_per_day != null && (
                      <span className="hidden sm:inline ml-1.5 normal-case tracking-normal text-text-muted/80 font-normal">
                        (${fmtNumPage(opp.bill_regular_hourly)}/hr × {fmtNumPage(opp.regular_hours_per_day)} hrs)
                      </span>
                    )}
                  </>
                }
                value={totalDailyBilled(opp) != null ? fmtCurrency(totalDailyBilled(opp)) : '—'}
                tone="income"
              />
              {opp.on_call_enabled && (
                <RateSubRow
                  label="On-call billed / night"
                  value={opp.bill_on_call_nightly != null ? fmtCurrency(opp.bill_on_call_nightly) : '—'}
                  tone="income"
                />
              )}
              <RateSumDivider />
              <RateTotalRow
                label="Daily total billed"
                value={dailyTotalBilled(opp) != null ? fmtCurrency(dailyTotalBilled(opp)) : '—'}
                tone="income"
              />

              {/* Expense group */}
              <RateGroupHeader label="Expenses" />
              <RateSubRow
                label="Regular daily pay"
                value={fmtRateExpense(sumDailyPay(opp))}
                tone="expense"
              />
              {opp.on_call_enabled ? (
                <RateSubRow
                  label="On-call pay / night"
                  value={fmtRateExpense(opp.pay_on_call_nightly)}
                  tone="expense"
                />
              ) : (
                <RateSubRow label="On-call" value="No" tone="neutral" />
              )}
              <RateSumDivider />
              <RateTotalRow
                label="Total pay to provider"
                value={fmtRateExpense(totalPayToProvider(opp))}
                tone="expense"
              />

              {/* Daily profit (rate only) — total billed minus total
                  pay to provider, both facts-only. Now includes
                  on-call on both sides; still excludes travel + any
                  modeled item, so the "rate only" label still holds
                  honestly. Sign-driven teal-positive / red-parens-
                  underwater. Bold heading, extra spacing above. */}
              <div className="mt-5 pt-4 border-t border-border/60">
                <RateTotalRow
                  label="Daily profit (rate only)"
                  value={dailyProfitRateOnly(opp) != null
                    ? fmtProfitFact(dailyProfitRateOnly(opp))
                    : '—'}
                  tone={(dailyProfitRateOnly(opp) ?? 0) < 0 ? 'expense' : 'profit'}
                />
              </div>
            </div>

            {/* Rate Details toggle row — custom (not the shared
                CollapsibleSection) so the EDIT pencil can sit
                inline at the right of the header. The chevron +
                "Rate Details" label + gradient rule reproduce the
                CollapsibleSection visual, but as a peer of the
                pencil button so the row reads as one. */}
            <div className="flex items-center gap-3 mb-4">
              <button
                type="button"
                onClick={() => setRateDetailsOpen(o => !o)}
                aria-expanded={rateDetailsOpen}
                className="flex-1 min-w-0 flex items-center gap-3 text-left group focus-visible:outline-none"
              >
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-accent opacity-75 transition-transform flex-shrink-0',
                    !rateDetailsOpen && '-rotate-90',
                  )}
                  strokeWidth={1.5}
                />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent opacity-90 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  Rate Details
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-accent/40 to-transparent" />
              </button>
              <button
                type="button"
                onClick={() => setRateStructureOpen(true)}
                aria-label="Edit rate structure"
                title="Edit rate structure"
                className="w-8 h-8 inline-flex items-center justify-center rounded text-text-dim hover:text-accent hover:bg-surface2 transition-colors flex-shrink-0"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            {rateDetailsOpen && (
              <div className="mt-2 space-y-6">
                <RateGroup title="Shift defaults">
                  <RateCell label="Time in"            value={fmt12Hour(opp.shift_time_in)} mono />
                  <RateCell label="Time out"           value={fmt12Hour(opp.shift_time_out)} mono />
                  <RateCell label="Regular hrs/day"    value={opp.regular_hours_per_day != null ? `${opp.regular_hours_per_day} hrs` : '—'} mono />
                  <RateCell label="OT threshold"       value={opp.ot_threshold_hours != null ? `${opp.ot_threshold_hours} hrs` : '—'} mono />
                </RateGroup>

                <RateGroup title="Bill (client charges)">
                  <RateCell label="Orientation / hr"        value={fmtCurrency(opp.bill_orientation_hourly,         { cents: true })} />
                  <RateCell label="Regular / hr"            value={fmtCurrency(opp.bill_regular_hourly,             { cents: true })} />
                  <RateCell label="OT / hr"                 value={fmtCurrency(opp.bill_ot_hourly,                  { cents: true })} />
                  <RateCell label="Adv. shift bonus / day"  value={fmtCurrency(opp.bill_advanced_shift_bonus_daily, { cents: true })} />
                </RateGroup>

                <RateGroup title="Pay (provider compensation)">
                  <RateCell label="Orientation / day"       value={fmtCurrency(opp.pay_orientation_daily,           { cents: true })} />
                  <RateCell label="Regular / day"           value={fmtCurrency(opp.pay_regular_daily,               { cents: true })} />
                  <RateCell label="Adv. shift bonus / day"  value={fmtCurrency(opp.pay_advanced_shift_bonus_daily,  { cents: true })} />
                  <RateCell label="Other bonus / day"       value={fmtCurrency(opp.pay_other_bonus_daily,           { cents: true })} />
                </RateGroup>

                {opp.on_call_enabled && (
                  <RateGroup title="On-call">
                    <RateCell label="Bill / night"          value={fmtCurrency(opp.bill_on_call_nightly,            { cents: true })} />
                    <RateCell label="Pay / night"           value={fmtCurrency(opp.pay_on_call_nightly,             { cents: true })} />
                    <RateCell label="Bill call-back / hr"   value={fmtCurrency(opp.bill_call_back_hourly,           { cents: true })} />
                    <RateCell label="Call window"           value={
                      opp.call_start_time && opp.call_end_time
                        ? `${fmt12Hour(opp.call_start_time)} → ${fmt12Hour(opp.call_end_time)}`
                        : '—'
                    } mono />
                  </RateGroup>
                )}

                <RateGroup title="Travel costs">
                  {opp.ps_covers_travel ? (
                    <>
                      <RateCell label="Airfare / round-trip"  value={fmtCurrency(opp.travel_airfare_estimate,         { cents: true })} />
                      <RateCell label="Hotel / night"         value={fmtCurrency(opp.travel_hotel_per_night_estimate, { cents: true })} />
                      <RateCell label="Rental / day"          value={fmtCurrency(opp.travel_rental_per_day_estimate,  { cents: true })} />
                      <RateCell label="Coverage"              value="PS covers" />
                    </>
                  ) : (
                    <div className="col-span-2 md:col-span-4 font-mono text-xs text-text-muted">
                      Hospital covers travel
                    </div>
                  )}
                </RateGroup>
              </div>
            )}
          </div>
        )}

        {/* 5. Opportunity Projection (formerly GP Modeler) — same
              B-box + summary-visible / details-collapsed shape.
              Component owns the hybrid interaction (saved summary
              up top, live calculator behind a CollapsibleSection
              with dirty-state protection). Guard short-circuits to
              a flat message when either core rate is missing. */}
        <SectionHeader text="Opportunity Projection" />
        {projectionGuardOn ? (
          <div className={B_BOX_CLASSES + ' font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center'}>
            Set rate structure to model gross profit
          </div>
        ) : (
          <div className={B_BOX_CLASSES}>
            <OpportunityProjection opportunity={opp} onSaved={refetch} />
          </div>
        )}

        {/* Cluster-A universal: toggle pattern + 90-day default +
            View All Activity affordance routing to /activities.
            Mirrors Provider and Org. */}
        <SectionHeader text="Activity" />
        {logOpen ? (
          <LogActivityForm
            parentColumn="opportunity_id"
            parentId={id}
            onLogged={async (input) => {
              await activities.create(input);
              setLogOpen(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-end gap-2 flex-wrap mb-3">
            <Button
              type="button"
              onClick={() => navigate('/activities')}
              variant="outline"
              className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
            >
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              type="button"
              onClick={() => setLogOpen(true)}
              variant="outline"
              className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
            >
              <Plus className="w-4 h-4 mr-1" /> New activity
            </Button>
          </div>
        )}
        <ActivityFeed
          activities={activities.data}
          loading={activities.loading}
          emptyText="No activity in the last 90 days."
          onDelete={handleDeleteActivity}
        />
        <div className="mb-10" />

        <SectionHeader text="Tasks" />
        <TasksSection
          parentColumn="opportunity_id"
          parentId={opp.id}
          parentLabel={opp.title || opp.name || 'this opportunity'}
        />
        <div className="mb-10" />

        <div className="border-t border-border/50 pt-6">
          <Button
            ref={deleteOppTriggerRef}
            onClick={() => setConfirmDeleteOpen(true)}
            variant="ghost"
            className="text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete opportunity
          </Button>
        </div>
        </div>
      </div>

      <OpportunityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        opportunity={opp}
        onSave={async (payload) => {
          await update(opp.id, payload);
          await refetch();
        }}
      />

      <RateStructureFormDialog
        open={rateStructureOpen}
        onOpenChange={setRateStructureOpen}
        opportunity={opp}
        onSave={async (payload) => {
          await update(opp.id, payload);
          await refetch();
        }}
      />

      <RequirementsFormDialog
        open={requirementsOpen}
        onOpenChange={setRequirementsOpen}
        opportunity={opp}
        onSave={async (payload) => {
          await update(opp.id, payload);
          await refetch();
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteOppTriggerRef}
        title={opp ? `Delete "${opp.title || opp.name || 'this opportunity'}"?` : 'Delete?'}
        description="This will also delete its activities, tasks, and placements. This cannot be undone."
        onConfirm={performDelete}
      />

      <ConfirmDeleteDialog
        open={Boolean(pendingDeleteActivity)}
        onOpenChange={(open) => { if (!open) setPendingDeleteActivity(null); }}
        triggerRef={activityDeleteTriggerRef}
        title="Delete this activity entry?"
        onConfirm={performDeleteActivity}
      />
    </>
  );
}

// Horizontal label-value Details grid — matches Provider /
// Organization. Cluster-A: pending shared-component extraction.
function DetailGrid({ children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 mb-10">
      {children}
    </div>
  );
}

function DetailField({ label, full = false, children }) {
  return (
    <div className={cn(
      'flex items-baseline gap-3 min-w-0',
      full && 'md:col-span-2',
    )}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted w-32 flex-shrink-0 leading-snug">
        {label}
      </div>
      <div className="text-text text-sm leading-snug flex-1 min-w-0 break-words">
        {children}
      </div>
    </div>
  );
}

function RateGroup({ title, children }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-3 border-b border-border/40 pb-1.5">
        {title}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
        {children}
      </div>
    </div>
  );
}

function RateCell({ label, value, mono = false }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted mb-0.5">{label}</div>
      <div className={cn('text-text', mono ? 'font-mono text-sm' : 'font-mono text-sm')}>
        {value}
      </div>
    </div>
  );
}

// Rate Structure summary uses a small hierarchy:
//   - RateGroupHeader: bold group caption (Income / Expenses)
//   - RateSubRow:      indented component line beneath the header,
//                      with optional calc-note in parens
//   - RateTotalRow:    bold sum / subtotal line under the components
//   - RateFactRow:     plain label/value row (used for the leading
//                      "regular hrs/day" context line)
//
// Color grammar follows the page-wide rule: income green for bill
// figures, expense red-in-parens for cash outflows (rendered by
// fmtRateExpense), profit teal/red sign-driven, neutral dim for
// status/coverage statements. Plain non-italic throughout — Rate
// Structure is FACTS, not projections.
const RATE_TONE = {
  income:  'text-income',
  expense: 'text-danger',
  // Headline profit teal — see --profit in tokens.css. Routed
  // through the arbitrary-value class because the named text-profit
  // utility hits a Tailwind JIT cache miss after the config-time
  // color addition until a clean restart.
  profit:  'text-[var(--profit)]',
  neutral: 'text-text-dim',
  text:    'text-text',
};

function RateFactRow({ label, value, tone = 'text' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</span>
      <span className={cn('font-mono text-sm', RATE_TONE[tone])}>{value}</span>
    </div>
  );
}

// Indented component row — sub-element of an Income/Expense
// group. Optional `note` renders as a small muted caption (calc
// derivation) on a second line beneath the label.
function RateSubRow({ label, value, tone = 'text', note }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pl-4 mt-1.5">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
        {note && (
          <div className="font-mono text-[9px] text-text-muted/80 normal-case mt-0.5">{note}</div>
        )}
      </div>
      <span className={cn('font-mono text-sm flex-shrink-0', RATE_TONE[tone])}>{value}</span>
    </div>
  );
}

// Bold sum/subtotal line — visually distinct from the indented
// components feeding into it via heavier label weight and slightly
// larger value type.
function RateTotalRow({ label, value, tone = 'text' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mt-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text">{label}</span>
      <span className={cn('font-mono text-sm font-bold', RATE_TONE[tone])}>{value}</span>
    </div>
  );
}

// Short accounting "sum" divider — a thin right-aligned rule above
// a RateTotalRow's value. Visually signals "the component values
// above add up to the bold total below." Width matches the
// approximate value column so it sits over the number, not as a
// full-width section divider.
function RateSumDivider() {
  return (
    <div className="flex justify-end mt-1.5">
      {/* CSS-var background + opacity utility — the /60 Tailwind
          opacity modifier doesn't decompose CSS-var colors, so we
          use opacity-60 on the element itself instead. */}
      <span className="block h-px w-16 bg-text-muted opacity-60" />
    </div>
  );
}

// Sum of the three DAILY pay facts on the opportunity row — a
// pure sum of stored rate columns (NO modeling_assumptions
// reads). Orientation pay is excluded (it's a one-time per-
// placement charge, not part of the regular daily picture); on-
// call pay is excluded (it's nightly, shown separately).
function sumDailyPay(opp) {
  const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
  return num(opp.pay_regular_daily)
       + num(opp.pay_advanced_shift_bonus_daily)
       + num(opp.pay_other_bonus_daily);
}

// Total daily BILLED — regular hours per day × bill hourly rate.
// Pure rate math; ZERO modeling_assumptions reads. Returns null
// if either input is missing so the caller can render "—" rather
// than a misleading $0.
function totalDailyBilled(opp) {
  const hrs  = opp.regular_hours_per_day;
  const rate = opp.bill_regular_hourly;
  if (hrs == null || hrs === '' || rate == null || rate === '') return null;
  const n = Number(hrs) * Number(rate);
  return Number.isFinite(n) ? n : null;
}

// Daily profit (rate only) — daily total billed (with on-call
// when enabled) minus total pay to provider (also with on-call
// when enabled). Now includes on-call on both sides; still
// excludes travel + any modeled item (OT hours, advanced shift
// bonuses, etc.), so "rate only" still holds honestly. The
// label is what keeps this from reading as a duplicate of
// Opportunity Projection's fully-modeled profit-per-shift.
// Returns null when daily total billed can't be computed.
function dailyProfitRateOnly(opp) {
  const billed = dailyTotalBilled(opp);
  if (billed == null) return null;
  return billed - totalPayToProvider(opp);
}

// 12-hour AM/PM formatter for time-of-day fields (Postgres `time`
// values come through as "HH:MM:SS" strings). Falls back to the
// raw value if it can't be parsed.
function fmt12Hour(timeStr) {
  if (timeStr == null || timeStr === '') return '—';
  const parts = String(timeStr).split(':');
  const hour = parseInt(parts[0], 10);
  const min  = parts[1] ?? '00';
  if (!Number.isFinite(hour)) return String(timeStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${period}`;
}

// Expense formatter for Rate Structure — wraps a stored rate
// column (or sum of rate columns) in accounting parens. Zero or
// null renders as plain "$0" without parens. Whole dollars, no
// cents — Rate Structure throughout drops cents per piece-2 r3.
function fmtRateExpense(value) {
  if (value == null || value === '') return '$0';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `(${fmtCurrency(Math.abs(n))})`;
}

// Profit-as-fact formatter — sign-aware. Negative wraps in
// accounting parens; positive renders as plain currency. Whole
// dollars to match the rest of Rate Structure. Caller applies the
// color class via the tone prop.
function fmtProfitFact(value) {
  if (value == null || !Number.isFinite(Number(value))) return '$0';
  const n = Number(value);
  if (n < 0) return `(${fmtCurrency(Math.abs(n))})`;
  return fmtCurrency(n);
}

// Bold group heading inside the Rate Structure summary — sits at
// the top of each grouped block (Income / Expenses) with indented
// component rows + a bold total row beneath. Heavier weight than
// the previous flat caption so the hierarchy reads at a glance.
function RateGroupHeader({ label }) {
  return (
    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-text mt-5 mb-1 pt-3 border-t border-border/40">
      {label}
    </div>
  );
}

// Daily total billed — the income sum that anchors the income
// group. Regular hourly billed (rate × hrs) PLUS on-call billed
// per night when on-call is enabled. Mixes a per-day and a
// per-night amount on purpose: it's a "typical day" snapshot
// (assumes one on-call night per working day), facts-only, no
// assumption-blob reads.
function dailyTotalBilled(opp) {
  const reg = totalDailyBilled(opp);
  if (reg == null) return null;
  if (!opp?.on_call_enabled) return reg;
  const oc = opp.bill_on_call_nightly == null ? 0 : Number(opp.bill_on_call_nightly) || 0;
  return reg + oc;
}

// Total pay to provider — sum-of-daily-pay rate columns PLUS
// on-call nightly pay when enabled. Mirror of dailyTotalBilled
// on the expense side. Facts-only.
function totalPayToProvider(opp) {
  const reg = sumDailyPay(opp);
  if (!opp?.on_call_enabled) return reg;
  const oc = opp.pay_on_call_nightly == null ? 0 : Number(opp.pay_on_call_nightly) || 0;
  return reg + oc;
}

// Page-local fmtNum companion of OpportunityProjection.jsx's
// fmtNum — drops trailing zeros so calc notes read clean.
function fmtNumPage(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0';
  const x = Number(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
}

function RequirementsReadout({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return (
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
        Requirements not defined
      </div>
    );
  }
  // Render in REQUIREMENT_ITEMS order so the display reads predictably
  // regardless of how the array was authored.
  const labels = REQUIREMENT_ITEMS
    .filter(r => list.includes(r.value))
    .map(r => r.label);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        Requires
      </span>
      <span className="font-mono text-[11px] text-text">
        {labels.join(' · ')}
      </span>
    </div>
  );
}

function Empty() { return <span className="text-text-muted">—</span>; }

function Centered({ children, tone }) {
  return (
    <div className="min-h-full flex items-center justify-center" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className={cn(
        'font-mono text-sm uppercase tracking-[0.12em]',
        tone === 'danger' ? 'text-danger' : 'text-text-dim',
      )}>
        {children}
      </div>
    </div>
  );
}
