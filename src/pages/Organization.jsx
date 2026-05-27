import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import HospitalPrivilegeRoster from '@/components/organizations/HospitalPrivilegeRoster';
import HospitalOpportunityList from '@/components/organizations/HospitalOpportunityList';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { DetailsCollapsibleHeader } from '@/components/ui/details-collapsible-header';
import { CardKebab } from '@/components/ui/card-kebab';
import LogActivityForm from '@/components/activities/LogActivityForm';
import ActivityFeed from '@/components/activities/ActivityFeed';
import TasksSection from '@/components/tasks/TasksSection';
import Thumb from '@/components/uploads/Thumb';
import { useOrganization, useOrganizations } from '@/hooks/useOrganizations';
import { useContacts } from '@/hooks/useContacts';
import { useActivities } from '@/hooks/useActivities';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import { CONTACT_ROLES, ORGANIZATION_TYPES, labelFor } from '@/utils/constants';
import { fmtDateTime, fmtName, fmtPhone } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

const TYPE_BADGE = {
  hospital:       'bg-accent-dim text-accent border-accent/40',
  locums_partner: 'bg-warning/15 text-warning border-warning/40',
  other:          'bg-surface2 text-text-dim border-border',
};

export default function Organization() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: org, loading, error, refetch } = useOrganization(id);
  const { update, remove } = useOrganizations();
  const contacts = useContacts({ organizationId: id });
  // Cluster-A universal: detail-page Activity sections default the
  // feed to the last 90 days. Older activity stays accessible from
  // the global /activities archive via the View All button below.
  const activities = useActivities({ organizationId: id, sinceDays: 90 });

  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteContact, setPendingDeleteContact] = useState(null);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  // Details collapsed by default — matches the provider-page Details
  // one-off pattern, same DetailsCollapsibleHeader shape.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Cluster-A universal: "+ New activity" button toggles the log
  // form on/off. Closing the form on successful submit keeps the
  // surface compact. Mirrors Provider.
  const [logOpen, setLogOpen] = useState(false);
  const deleteOrgTriggerRef = useRef(null);
  const contactDeleteTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

  // Fixed condensed header — mirrors the Provider and Opportunity
  // pattern. ResizeObserver tracks the header's measured height so
  // the body's paddingTop follows live (badge wrap, long names).
  // Replicated inline (~12 lines) rather than extracted to a shared
  // shell — this is the third detail page adopting the fixed-header
  // pattern (rule of three), and the extraction is queued as its
  // own follow-up sub-arc per DESIGN-NOTES.
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
  }, [org]);

  // Expose total fixed chrome height to the shared Dialog primitive
  // via `--ps-chrome-bottom` so dialogs opened from this page anchor
  // below all fixed chrome.
  useChromeBottom(58 + headerH);

  async function performDelete() {
    if (!org) return;
    try {
      await remove(org.id);
      toast.success('Organization deleted');
      navigate('/organizations');
    } catch (err) {
      console.error('delete organization', err);
      toast.error(err?.message || 'Could not delete');
      throw err;
    }
  }

  function handleDeleteContact(c, triggerEl) {
    contactDeleteTriggerRef.current = triggerEl ?? null;
    setPendingDeleteContact(c);
  }

  async function performDeleteContact() {
    if (!pendingDeleteContact) return;
    try {
      await contacts.remove(pendingDeleteContact.id);
      toast.success('Contact deleted');
    } catch (err) {
      console.error('delete contact', err);
      toast.error(err?.message || 'Could not delete contact');
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
  if (!org)    return <Centered>Organization not found.</Centered>;

  // Location line for the header. Mirrors Provider's home-state
  // line beneath the name — small mono, identity-supporting context.
  const locationLine = [org.city, org.state].filter(Boolean).join(', ');

  return (
    <>
      {/* ── Fixed condensed header — mirrors the Provider and
            Opportunity pattern. Sits below the suite-wide PageHeader
            (58px, z-200) and above body content. Stays visible while
            Dialogs are open; the shared Dialog primitive anchors
            below `--ps-chrome-bottom` (set by useChromeBottom above)
            so dialog tops clear this header. ── */}
      <div
        ref={headerRef}
        className="fixed left-0 right-0 z-[150] bg-surface border-b border-border"
        style={{ top: 'calc(58px + env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-start gap-3 sm:gap-4">
          <Thumb
            path={org.logo_path}
            bucket="organization-logos"
            alt={`${org.name} logo`}
            fallback={initialsFor(org.name)}
            shape="square"
            className="h-16 w-16 sm:h-20 sm:w-20 text-sm flex-shrink-0"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-1 sm:gap-1.5">
            {/* Name — smaller on mobile so it fits on one line; current
                size at sm+. Truncate is a safety net for very long names. */}
            <h1 className="font-display text-[20px] sm:text-[28px] text-text leading-tight truncate">
              {org.name}
            </h1>

            {/* Location row — city, ST. Renders when the org carries
                both; absent for the rare unset case (back-fill not
                forced). Mono dim, mirrors Provider's home location line. */}
            {locationLine && (
              <div className="font-mono text-[11px] text-text-dim truncate">
                {locationLine}
              </div>
            )}

            {/* Type badge row. Created timestamp lives in Details
                (matches Opportunity treatment — header chrome stays
                light; reference info moves to the collapsible). */}
            {org.type && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', TYPE_BADGE[org.type])}>
                  {labelFor(ORGANIZATION_TYPES, org.type)}
                </Badge>
              </div>
            )}
          </div>

          {/* Right column — Edit button. Provider/Opp shape: h-9
              px-2.5 sm:px-3, icon-only on mobile. */}
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
          onClick={() => navigate('/organizations')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All organizations
        </button>

        {/* Details — one-off collapsible matching the Provider-page
            Details pattern. Same DetailsCollapsibleHeader, same
            "header + conditional dense grid (no card wrapper)" shape.
            NOT the shared CollapsibleSection — that's the smaller
            labeled-sub-group pattern (Onboarding / Credentialing /
            Provider Availability tiers). */}
        <DetailsCollapsibleHeader
          open={detailsOpen}
          onToggle={() => setDetailsOpen(o => !o)}
        />
        {detailsOpen && (
          <DetailGrid>
            <DetailField label="Website">
              {org.website
                ? (
                  <a href={ensureProtocol(org.website)} target="_blank" rel="noreferrer"
                     className="text-accent hover:text-accent-bright inline-flex items-center gap-1 break-all">
                    {org.website} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : <Empty />}
            </DetailField>

            <DetailField label="Address">
              <div className="text-text">
                {org.address || <Empty />}
                {(org.city || org.state || org.zip) && (
                  <div className="text-text-dim text-sm mt-0.5">
                    {[[org.city, org.state].filter(Boolean).join(', '), org.zip]
                      .filter(Boolean).join(' ') || null}
                  </div>
                )}
              </div>
            </DetailField>

            <DetailField label="Created">
              {org.created_at ? fmtDateTime(org.created_at) : <Empty />}
            </DetailField>

            <DetailField label="Notes" full>
              {org.notes
                ? <p className="text-text whitespace-pre-wrap">{org.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        )}

        {/* Hospital-only sections: privilege roster (hospital-grain,
            excludes Selected — that lives on the opportunity page) and
            an opportunities-at-this-hospital list. Both sit between
            Details and Contacts; both are hidden entirely for non-
            hospital org types. Both use the two-level B box convention
            — bg-surface-well Level-1 container with the teal border +
            gradient rule, and bg-surface Level-2 record cards for the
            individual privilege and opportunity rows inside (see each
            sub-component). Matches the Provider-page Onboarding /
            Credentialing / Hospital Standing treatment. */}
        {org.type === 'hospital' && (
          <>
            <SectionHeader text="Privilege roster" />
            <div className="bg-surface-well border border-accent rounded p-6 mb-10
                            relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                            after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
              <HospitalPrivilegeRoster organizationId={org.id} />
            </div>

            <SectionHeader text="Opportunities" />
            <div className="bg-surface-well border border-accent rounded p-6 mb-10
                            relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                            after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
              <HospitalOpportunityList organizationId={org.id} />
            </div>
          </>
        )}

        <SectionHeader text="Contacts" />
        <div className="-mt-3 mb-3 flex justify-end">
          <Button
            onClick={() => { setEditingContact(null); setContactOpen(true); }}
            variant="outline"
            className="border-accent/40 text-accent hover:bg-accent-dim hover:text-accent font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> Add contact
          </Button>
        </div>

        {contacts.loading && (
          <div className="bg-surface border border-border rounded p-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted mb-10">
            Loading…
          </div>
        )}
        {!contacts.loading && contacts.error && (
          <div className="bg-surface border border-border rounded p-6 text-center font-mono text-xs text-danger mb-10">
            {contacts.error.message}
          </div>
        )}
        {!contacts.loading && !contacts.error && contacts.data.length === 0 && (
          <div className="bg-surface border border-border rounded p-8 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted mb-10">
            No contacts yet.
          </div>
        )}
        {!contacts.loading && !contacts.error && contacts.data.length > 0 && (
          <ul className="bg-surface border border-border rounded divide-y divide-border/40 overflow-hidden mb-10">
            {contacts.data.map(c => (
              // Slice 4: row tap navigates to the contact detail page;
              // per-row actions live in an always-visible kebab on the
              // right (Edit / Delete via ConfirmDeleteDialog). Replaces
              // the prior hover-revealed Pencil + Trash2 icons that
              // touch devices never saw. Visual affordance matches the
              // Contacts list card so the user learns one pattern.
              <li
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/contacts/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/contacts/${c.id}`);
                  }
                }}
                className="p-4 flex items-start gap-3 cursor-pointer transition-colors hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text">{fmtName(c)}</span>
                    {c.role && (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-dim border-border">
                        {labelFor(CONTACT_ROLES, c.role)}
                      </Badge>
                    )}
                    {c.title && <span className="text-text-dim text-sm">· {c.title}</span>}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-sm mt-1 text-text-dim font-mono">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-accent"
                      >
                        {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-accent"
                      >
                        {fmtPhone(c.phone)}
                      </a>
                    )}
                  </div>
                  {c.notes && (
                    <p className="text-text-dim text-sm mt-1 whitespace-pre-wrap">{c.notes}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <CardKebab
                    ariaLabel="Contact actions"
                    onEdit={() => { setEditingContact(c); setContactOpen(true); }}
                    onDelete={(triggerEl) => handleDeleteContact(c, triggerEl)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Cluster-A universal: toggle pattern + 90-day default +
            View All Activity affordance routing to /activities. The
            "+ New activity" button reveals LogActivityForm; closing
            the form on successful submit keeps the surface compact.
            View All sits in the same control row as a peer outline
            button. Mirrors Provider. */}
        <SectionHeader text="Activity" />
        {logOpen ? (
          <LogActivityForm
            parentColumn="organization_id"
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
          parentColumn="organization_id"
          parentId={id}
          parentLabel={org.name || 'this organization'}
        />
        <div className="mb-10" />

        <div className="border-t border-border/50 pt-6">
          <Button
            ref={deleteOrgTriggerRef}
            onClick={() => setConfirmDeleteOpen(true)}
            variant="ghost"
            className="text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete organization
          </Button>
        </div>
      </div>

      <OrganizationFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        org={org}
        onSave={async (payload) => {
          await update(org.id, payload);
          await refetch();
        }}
      />

      <ContactFormDialog
        open={contactOpen}
        onOpenChange={(o) => { setContactOpen(o); if (!o) setEditingContact(null); }}
        contact={editingContact}
        organizationId={id}
        onSave={async (payload) => {
          if (editingContact) await contacts.update(editingContact.id, payload);
          else await contacts.create(payload);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteOrgTriggerRef}
        title={org ? `Delete "${org.name}"?` : 'Delete?'}
        description="This will also delete its contacts and activities. This cannot be undone."
        onConfirm={performDelete}
      />

      <ConfirmDeleteDialog
        open={Boolean(pendingDeleteContact)}
        onOpenChange={(open) => { if (!open) setPendingDeleteContact(null); }}
        triggerRef={contactDeleteTriggerRef}
        title={pendingDeleteContact ? `Delete contact "${fmtName(pendingDeleteContact)}"?` : 'Delete contact?'}
        onConfirm={performDeleteContact}
      />

      <ConfirmDeleteDialog
        open={Boolean(pendingDeleteActivity)}
        onOpenChange={(open) => { if (!open) setPendingDeleteActivity(null); }}
        triggerRef={activityDeleteTriggerRef}
        title="Delete this activity entry?"
        onConfirm={performDeleteActivity}
      />
      </div>
    </>
  );
}

// Horizontal label-value Details grid — label LEFT in a fixed-width
// column, value RIGHT next to it. Same shape across all detail
// pages (Provider is the prototype reference). Cluster-A: pending
// extraction to a shared component once the pattern is settled.
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

// Users will likely type "providersolutions.com" without a scheme;
// add https:// so the anchor doesn't resolve relative to the app.
function ensureProtocol(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
