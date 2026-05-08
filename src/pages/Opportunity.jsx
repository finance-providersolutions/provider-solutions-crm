import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import GPModeler from '@/components/opportunities/GPModeler';
import LogActivityForm from '@/components/activities/LogActivityForm';
import ActivityFeed from '@/components/activities/ActivityFeed';
import TasksSection from '@/components/tasks/TasksSection';
import { useOpportunity, useOpportunities } from '@/hooks/useOpportunities';
import { useActivities } from '@/hooks/useActivities';
import {
  OPPORTUNITY_SETTINGS, OPPORTUNITY_STAGES, POSITION_TYPES,
  SPECIALTIES, labelFor,
} from '@/utils/constants';
import { fmtCurrency, fmtDate, fmtDateTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { STAGE_BADGE } from './Opportunities';

export default function Opportunity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: opp, loading, error, refetch } = useOpportunity(id);
  const { update, remove } = useOpportunities();
  const activities = useActivities({ opportunityId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  const deleteOppTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

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

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/opportunities')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All opportunities
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="font-display text-4xl text-text leading-tight mb-2">
              {opp.title || opp.name || '—'}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {opp.organization && (
                <Link
                  to={`/organizations/${opp.organization.id}`}
                  className="text-accent hover:text-accent-bright"
                >
                  {opp.organization.name}
                </Link>
              )}
              {opp.source_partner && (
                <span className="text-text-dim text-sm">
                  via {opp.source_partner.name}
                </span>
              )}
              {opp.stage && (
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STAGE_BADGE[opp.stage])}>
                  {labelFor(OPPORTUNITY_STAGES, opp.stage)}
                </Badge>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Created {fmtDateTime(opp.created_at)}
              </span>
            </div>
          </div>
          <Button
            onClick={() => setEditOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>

        <SectionHeader text="Overview" first />
        <div className="bg-surface border border-border rounded p-6 mb-10
                        relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                        after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
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
            <DetailField label="Notes" full>
              {opp.notes
                ? <p className="text-text whitespace-pre-wrap">{opp.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        </div>

        <SectionHeader text="Rate structure" />
        <div className="bg-surface border border-border rounded p-6 mb-10 space-y-6">
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

        <SectionHeader text="GP modeler" />
        <GPModeler opportunity={opp} onSaved={refetch} />

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

        <SectionHeader text="Suggested providers" />
        <div className="bg-surface border border-border rounded p-8 text-center mb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            No suggestions yet
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
            Phase 4 — matching by specialty / state / credentials
          </div>
        </div>

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

      <OpportunityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
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
    </div>
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
