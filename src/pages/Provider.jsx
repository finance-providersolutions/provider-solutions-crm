import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import Thumb from '@/components/uploads/Thumb';
import ProviderFormDialog from '@/components/providers/ProviderFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import LogActivityForm from '@/components/activities/LogActivityForm';
import ActivityFeed from '@/components/activities/ActivityFeed';
import TasksSection from '@/components/tasks/TasksSection';
import { useProvider, useProviders } from '@/hooks/useProviders';
import { useActivities } from '@/hooks/useActivities';
import {
  POSITION_TYPES, PROVIDER_SOURCES, PROVIDER_STATUSES,
  SPECIALTIES, labelFor,
} from '@/utils/constants';
import { fmtDateTime, fmtName, fmtPhone } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';
import { STATUS_BADGE } from './Providers';

export default function Provider() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: provider, loading, error, refetch } = useProvider(id);
  const { update, remove } = useProviders();
  const activities = useActivities({ providerId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  const deleteProviderTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

  async function performDelete() {
    if (!provider) return;
    try {
      await remove(provider.id);
      toast.success('Provider deleted');
      navigate('/providers');
    } catch (err) {
      console.error('delete provider', err);
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
  if (!provider) return <Centered>Provider not found.</Centered>;

  // fmtName joins first + middle (as-is) + last + ", suffix" and
  // returns '—' for entirely-empty input — same shape across cards,
  // detail pages, and the back-link copy below.
  const fullName = fmtName(provider);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/providers')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All providers
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-start gap-4">
            <Thumb
              path={provider.photo_path}
              bucket="provider-photos"
              alt={`${fullName || 'Provider'} photo`}
              fallback={initialsFor(provider)}
              size="xl"
              shape="circle"
            />
            <div>
              <h1 className="font-display text-4xl text-text leading-tight mb-2">{fullName}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {provider.position_type && (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-dim border-border">
                    {labelFor(POSITION_TYPES, provider.position_type)}
                  </Badge>
                )}
                {provider.specialty && (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-accent-dim text-accent border-accent/40">
                    {labelFor(SPECIALTIES, provider.specialty)}
                  </Badge>
                )}
                {provider.status && (
                  <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[provider.status])}>
                    {labelFor(PROVIDER_STATUSES, provider.status)}
                  </Badge>
                )}
                {provider.archived && (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-muted border-border">
                    Archived
                  </Badge>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Created {fmtDateTime(provider.created_at)}
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setEditOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>

        <SectionHeader text="Details" first />
        <div className="bg-surface border border-border rounded p-6 mb-10
                        relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                        after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
          <DetailGrid>
            <DetailField label="Email">
              {provider.email
                ? <a href={`mailto:${provider.email}`} className="text-accent hover:text-accent-bright break-all">{provider.email}</a>
                : <Empty />}
            </DetailField>
            <DetailField label="Phone">
              {(() => {
                const formatted = fmtPhone(provider.phone);
                return formatted === '—'
                  ? <Empty />
                  : <a href={`tel:${provider.phone}`} className="text-text hover:text-accent">{formatted}</a>;
              })()}
            </DetailField>
            <DetailField label="NPI">
              {provider.npi || <Empty />}
            </DetailField>
            <DetailField label="Source">
              {provider.source ? labelFor(PROVIDER_SOURCES, provider.source) : <Empty />}
            </DetailField>
            <DetailField label="Home">
              {[provider.home_city, provider.home_state].filter(Boolean).join(', ') || <Empty />}
            </DetailField>
            <DetailField label="Travel">
              {[provider.aadvantage_number && `AAdvantage ${provider.aadvantage_number}`,
                provider.flight_preference,
                provider.shirt_size && `Shirt ${provider.shirt_size}`]
                .filter(Boolean).join(' · ') || <Empty />}
            </DetailField>
            <DetailField label="Notes" full>
              {provider.notes
                ? <p className="text-text whitespace-pre-wrap">{provider.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        </div>

        <SectionHeader text="Activity" />
        <LogActivityForm
          parentColumn="provider_id"
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
          parentColumn="provider_id"
          parentId={provider.id}
          parentLabel={fullName || 'this provider'}
        />
        <div className="mb-10" />

        <SectionHeader text="Placements" />
        <div className="bg-surface border border-border rounded p-8 text-center mb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            No placements yet
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
            Phase 4 — placement creation flow
          </div>
        </div>

        <SectionHeader text="Credentialing" />
        <div className="bg-surface border border-border rounded p-8 text-center mb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            Credentialing file
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
            Phase 3 — licenses, DEA, board cert, malpractice, privileges
          </div>
        </div>

        <div className="border-t border-border/50 pt-6">
          <Button
            ref={deleteProviderTriggerRef}
            onClick={() => setConfirmDeleteOpen(true)}
            variant="ghost"
            className="text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete provider
          </Button>
        </div>
      </div>

      <ProviderFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        provider={provider}
        onSave={async (payload) => {
          await update(provider.id, payload);
          await refetch();
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteProviderTriggerRef}
        title={provider ? `Delete "${fullName !== '—' ? fullName : 'this provider'}"?` : 'Delete?'}
        description="This will also delete their activities, tasks, and placements. This cannot be undone."
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
