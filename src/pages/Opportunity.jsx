import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import Thumb from '@/components/uploads/Thumb';
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import RateStructureFormDialog from '@/components/opportunities/RateStructureFormDialog';
import RequirementsFormDialog from '@/components/opportunities/RequirementsFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import GPModeler from '@/components/opportunities/GPModeler';
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

export default function Opportunity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: opp, loading, error, refetch } = useOpportunity(id);
  const { update, remove } = useOpportunities();
  const activities = useActivities({ opportunityId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [rateStructureOpen, setRateStructureOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  // Details collapsed by default — matches the Provider and Org Details
  // one-off. Uses the shared DetailsCollapsibleHeader so this page's
  // first section reads in lockstep with the other detail pages.
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  //     Once EITHER core rate is set, the card shows the populated grid
  //     so the user sees their saved work.
  //   - gpGuardOn (EITHER null) keeps the GP Modeler guarded until BOTH
  //     core rates exist, since GP can't compute a margin from a one-
  //     sided rate.
  const rateStructureUnset = opp.bill_regular_hourly == null && opp.pay_regular_daily == null;
  const gpGuardOn          = opp.bill_regular_hourly == null || opp.pay_regular_daily == null;

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
        <div className="mb-10" />

        {/* 2. Requirements — piece 3 of the opportunity-maturation
              arc. Edit-on-detail: detail-page card with an unset
              empty state (legacy null/[] only — new opps default-
              write ['license']) and a populated readout with a
              pencil edit affordance opening RequirementsFormDialog.
              Plain card chrome this pass; piece 2 sweeps the B-box
              convention across this + Rate Structure + GP Modeler
              together. The readout was pulled OUT of the Provider
              Availability B-box (slot 3 below) since this section
              now owns the display, and adjacency makes the
              "requirements → who qualifies" flow read top-to-bottom. */}
        <SectionHeader text="Requirements" />
        {requirementsUnset ? (
          <div className="bg-surface border border-border rounded p-6 mb-10 flex flex-col items-center text-center gap-3">
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
          <div className="relative bg-surface border border-border rounded p-6 mb-10">
            <button
              type="button"
              onClick={() => setRequirementsOpen(true)}
              aria-label="Edit requirements"
              title="Edit requirements"
              className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded text-text-dim hover:text-accent hover:bg-surface2 transition-colors"
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
              unfinished sections (Rate structure, GP modeler,
              Activity) below it. Requirements now sits above it as
              the input to this matching surface. Same B box
              convention as the Provider-page boxed sections. */}
        <SectionHeader text="Provider Availability" />
        <div className="bg-surface-well border border-accent rounded p-6 mb-10
                        relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                        after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
          <SuggestedProviders opportunity={opp} />
        </div>

        <SectionHeader text="Rate structure" />
        {rateStructureUnset ? (
          <div className="bg-surface border border-border rounded p-6 mb-10 flex flex-col items-center text-center gap-3">
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
        <div className="relative bg-surface border border-border rounded p-6 mb-10 space-y-6">
          <button
            type="button"
            onClick={() => setRateStructureOpen(true)}
            aria-label="Edit rate structure"
            title="Edit rate structure"
            className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded text-text-dim hover:text-accent hover:bg-surface2 transition-colors"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <RateGroup title="Shift defaults">
            <RateCell label="Time in"            value={opp.shift_time_in       ?? '—'} mono />
            <RateCell label="Time out"           value={opp.shift_time_out      ?? '—'} mono />
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
                  ? `${opp.call_start_time} → ${opp.call_end_time}`
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

        <SectionHeader text="GP modeler" />
        {gpGuardOn ? (
          <div className="bg-surface border border-border rounded p-6 mb-10 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim text-center">
            Set rate structure to model gross profit
          </div>
        ) : (
          <GPModeler opportunity={opp} onSaved={refetch} />
        )}

        <SectionHeader text="Activity" />
        <LogActivityForm
          parentColumn="opportunity_id"
          parentId={id}
          onLogged={async (input) => { await activities.create(input); }}
        />
        <ActivityFeed
          activities={activities.data}
          loading={activities.loading}
          emptyText="No activity logged yet."
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

function DetailGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">{children}</div>;
}

function DetailField({ label, full = false, children }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1.5">{label}</div>
      <div className="text-text">{children}</div>
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
