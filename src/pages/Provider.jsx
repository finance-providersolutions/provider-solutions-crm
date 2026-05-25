import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
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
import CredentialingSection from '@/components/credentialing/CredentialingSection';
import OnboardingSection from '@/components/credentialing/OnboardingSection';
import { DetailsCollapsibleHeader } from '@/components/ui/details-collapsible-header';
import { useProvider, useProviders } from '@/hooks/useProviders';
import { useActivities } from '@/hooks/useActivities';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import {
  POSITION_TYPES, PROVIDER_SOURCES, PROVIDER_STATUSES,
  SPECIALTIES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { fmtName, fmtPhone } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';
import { STATUS_BADGE, STATUS_BADGE_FALLBACK } from './Providers';

// Provider detail page — slice 3a reference design for detail pages.
//
// Layout shape:
//   1. Fixed condensed header below the primary header (non-collapsing).
//   2. Body, padded down to clear the header, with this section order:
//      - Details        — every editable field NOT in the header,
//                          read-only, dense grid (no card wrapper).
//      - Credentialing  — single SectionHeader, three sub-groups
//                          (State licenses / Core credentials /
//                          Facility privileges) reading as one unit.
//      - Activity       — log form + feed.
//      - Tasks          — embedded TasksSection.
//      - Placements     — placeholder for the Phase 4 flow.
//      - Delete         — footer button, last.
//
// The header height is measured at runtime so the body padding tracks
// it regardless of name length, badge count, or breakpoint. No
// scroll-driven collapse — the header is always present.

export default function Provider() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: provider, loading, error, refetch } = useProvider(id);
  const { update, remove } = useProviders();
  const activities = useActivities({ providerId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  // Details is reference info, glanced at occasionally — start collapsed
  // so the action-y sections (Credentialing, Activity, Tasks) sit at the
  // top of the visible scroll. One-off, NOT a generic accordion system.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Provider-local: "+ New activity" button toggles the log form on/off.
  // LogActivityForm itself is unchanged; Organization/Opportunity detail
  // pages continue to show the always-visible form until their polish
  // pass picks up this pattern.
  const [logOpen, setLogOpen] = useState(false);
  const deleteProviderTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

  // Header height tracking — drives body paddingTop so content
  // starts cleanly below the fixed header at every breakpoint.
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
  }, [provider]); // re-measure if the provider object swaps in/out

  // Expose total fixed chrome height (primary header + this page's
  // condensed header) to the shared Dialog primitive via the
  // `--ps-chrome-bottom` CSS variable, so dialogs opened from this
  // page (provider Edit, license/credential/privilege forms, etc.)
  // anchor below all fixed chrome rather than tucking under it. The
  // hook re-runs whenever headerH changes so the variable tracks
  // badge-row wrap and other measured-height shifts live.
  useChromeBottom(58 + headerH);

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

  const fullName = fmtName(provider);
  const home     = [provider.home_city, provider.home_state].filter(Boolean).join(', ');
  const phoneFormatted = fmtPhone(provider.phone);
  const hasPhone = phoneFormatted !== '—';

  return (
    <>
      {/* ── Fixed condensed header — sits below the suite-wide
            PageHeader (58px, z-200) and above body content. Stays
            visible while Dialogs are open; the shared Dialog
            primitive anchors below `--ps-chrome-bottom` (set by
            useChromeBottom above) so dialog tops clear this header
            without it needing to disappear. ── */}
      <div
        ref={headerRef}
        className="fixed left-0 right-0 z-[150] bg-surface border-b border-border"
        style={{ top: 'calc(58px + env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-start gap-3 sm:gap-4">
          <Thumb
            path={provider.photo_path}
            bucket="provider-photos"
            alt={`${fullName} photo`}
            fallback={initialsFor(provider)}
            shape="circle"
            className="h-16 w-16 sm:h-20 sm:w-20 text-sm flex-shrink-0"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-1 sm:gap-1.5">
            {/* Name — smaller on mobile so it fits on one line; current
                size at sm+. Truncate is a safety net for very long
                names; the breakpoint sizes target typical names. */}
            <h1 className="font-display text-[20px] sm:text-[28px] text-text leading-tight truncate">
              {fullName}
            </h1>

            {/* Contact row — home city/ST + email icon (mailto) + phone
                icon (tel). Icons only render when the underlying value
                exists; clicking opens the user's default mail/phone app. */}
            <div className="flex items-center gap-3 min-w-0">
              {home && (
                <span className="font-mono text-[11px] text-text-dim truncate">
                  {home}
                </span>
              )}
              {provider.email && (
                <a
                  href={`mailto:${provider.email}`}
                  aria-label={`Email ${provider.email}`}
                  title={provider.email}
                  className="text-text-dim hover:text-accent transition-colors flex-shrink-0"
                >
                  <Mail className="w-4 h-4" strokeWidth={1.5} />
                </a>
              )}
              {hasPhone && (
                <a
                  href={`tel:${provider.phone}`}
                  aria-label={`Call ${phoneFormatted}`}
                  title={phoneFormatted}
                  className="text-text-dim hover:text-accent transition-colors flex-shrink-0"
                >
                  <Phone className="w-4 h-4" strokeWidth={1.5} />
                </a>
              )}
            </div>

            {/* Badge row — position type and specialty stay left here.
                Specialty uses the abbreviated form via specialtyAbbrFor
                (Slice 3 helper / SPECIALTY_ABBR map) so "Gastroenterology"
                reads as "Gastro" in the chrome strip. Status badge moved
                to the right column under the Edit button — see below. */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {provider.position_type && (
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-dim border-border">
                  {labelFor(POSITION_TYPES, provider.position_type)}
                </Badge>
              )}
              {provider.specialty && (
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-accent-dim text-accent border-accent/40">
                  {specialtyAbbrFor(provider.specialty)}
                </Badge>
              )}
              {provider.archived && (
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-muted border-border">
                  Archived
                </Badge>
              )}
            </div>
          </div>

          {/* Right column — Edit button on top, provider pipeline status
              badge anchored beneath it on the right edge. Status uses the
              PROVIDER 10-stage recruiting pipeline (not credential status),
              reusing the existing STATUS_BADGE map from the Providers list. */}
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
            {provider.status && (
              <Badge variant="outline" className={cn(
                'font-mono text-[10px] uppercase tracking-[0.1em]',
                STATUS_BADGE[provider.status] ?? STATUS_BADGE_FALLBACK,
              )}>
                {labelFor(PROVIDER_STATUSES, provider.status)}
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
          {/* 1. Details — dense read-only grid of every editable field
                NOT shown in the header. Default COLLAPSED — this is
                reference info, not action-y. One-off collapsible (not a
                generic accordion system); chevron rotates to indicate
                state. The grid itself is unchanged when expanded. */}
          <DetailsCollapsibleHeader
            open={detailsOpen}
            onToggle={() => setDetailsOpen(o => !o)}
          />
          {detailsOpen && (
            <DetailGrid>
              <DetailField label="Email">
                {provider.email
                  ? <a href={`mailto:${provider.email}`} className="text-accent hover:text-accent-bright break-all">{provider.email}</a>
                  : <Empty />}
              </DetailField>
              <DetailField label="Phone">
                {hasPhone
                  ? <a href={`tel:${provider.phone}`} className="text-text hover:text-accent">{phoneFormatted}</a>
                  : <Empty />}
              </DetailField>
              <DetailField label="NPI">
                {provider.npi || <Empty />}
              </DetailField>
              <DetailField label="Home">
                {home || <Empty />}
              </DetailField>
              <DetailField label="Position type">
                {provider.position_type ? labelFor(POSITION_TYPES, provider.position_type) : <Empty />}
              </DetailField>
              <DetailField label="Specialty">
                {provider.specialty ? labelFor(SPECIALTIES, provider.specialty) : <Empty />}
              </DetailField>
              <DetailField label="Source">
                {provider.source ? labelFor(PROVIDER_SOURCES, provider.source) : <Empty />}
              </DetailField>
              <DetailField label="AAdvantage #">
                {provider.aadvantage_number || <Empty />}
              </DetailField>
              <DetailField label="Flight preference">
                {provider.flight_preference || <Empty />}
              </DetailField>
              <DetailField label="Shirt size">
                {provider.shirt_size || <Empty />}
              </DetailField>
              <DetailField label="Notes" full>
                {provider.notes
                  ? <p className="text-text whitespace-pre-wrap">{provider.notes}</p>
                  : <Empty />}
              </DetailField>
            </DetailGrid>
          )}

          {/* 2. Onboarding — moved above Credentialing to mirror the
                real lifecycle (onboard, then credential). Status line
                ("N of 3 complete") + thin progress bar live OUTSIDE
                the collapsible so the glance state is always visible;
                the checklist itself is hidden behind the shared
                CollapsibleSection by default. Derived license/DEA rows
                used to live here under a "From credentialing"
                sub-group; that information now lives in the
                Credentialing status summary below. */}
          <SectionHeader text="Onboarding" />
          <OnboardingSection providerId={provider.id} />
          <div className="mb-10" />

          {/* 3. Credentialing — three subsections (licenses / core /
                privileges) sit behind a single CollapsibleSection. A
                3-line worst-status-per-group summary above the
                collapsed line is always visible. Subsection components
                themselves are unchanged — same rows, same kebab, same
                form dialogs — just hidden behind the collapsed line
                by default. */}
          <SectionHeader text="Credentialing" />
          <CredentialingSection providerId={provider.id} />
          <div className="mb-10" />

          {/* 3. Activity — Provider-local pattern: "+ New activity"
                button toggles LogActivityForm visibility. Closing the
                form on successful submit keeps the surface compact. */}
          <SectionHeader text="Activity" />
          {logOpen ? (
            <LogActivityForm
              parentColumn="provider_id"
              parentId={id}
              onLogged={async (input) => {
                await activities.create(input);
                setLogOpen(false);
              }}
            />
          ) : (
            <div className="flex items-center justify-end mb-3">
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
            emptyText="No activity logged yet."
            onDelete={handleDeleteActivity}
          />
          <div className="mb-10" />

          {/* 4. Tasks */}
          <SectionHeader text="Tasks" />
          <TasksSection
            parentColumn="provider_id"
            parentId={provider.id}
            parentLabel={fullName || 'this provider'}
          />
          <div className="mb-10" />

          {/* 5. Placements (placeholder until Phase 4 flow ships) — no-card
                empty state matching Credentialing/Activity/Tasks. */}
          <SectionHeader text="Placements" />
          <div className="px-6 py-6 text-center mb-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted">
              No placements yet
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
              Phase 4 — placement creation flow
            </div>
          </div>

          {/* 6. Delete — last */}
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
    </>
  );
}

// Dense label-value grid for the Details section. Same DetailField
// treatment used elsewhere in the app, but no card wrapper and a
// tighter gap-y so the block reads as a compact reference panel
// rather than a presented data card.
function DetailGrid({ children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mb-10">
      {children}
    </div>
  );
}

function DetailField({ label, full = false, children }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-0.5">{label}</div>
      <div className="text-text text-sm leading-snug">{children}</div>
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
