import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
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
  const activities = useActivities({ organizationId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteContact, setPendingDeleteContact] = useState(null);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState(null);
  // Details collapsed by default — matches the provider-page Details
  // one-off pattern, same DetailsCollapsibleHeader shape.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const deleteOrgTriggerRef = useRef(null);
  const contactDeleteTriggerRef = useRef(null);
  const activityDeleteTriggerRef = useRef(null);

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

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/organizations')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All organizations
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-start gap-4">
            <Thumb
              path={org.logo_path}
              bucket="organization-logos"
              alt={`${org.name} logo`}
              fallback={initialsFor(org.name)}
              size="xl"
              shape="square"
            />
            <div>
              <h1 className="font-display text-4xl text-text leading-tight mb-2">{org.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {org.type && (
                  <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', TYPE_BADGE[org.type])}>
                    {labelFor(ORGANIZATION_TYPES, org.type)}
                  </Badge>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  Created {fmtDateTime(org.created_at)}
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

            <DetailField label="Notes" full>
              {org.notes
                ? <p className="text-text whitespace-pre-wrap">{org.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        )}
        <div className="mb-10" />

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

        <SectionHeader text="Activity" />
        <LogActivityForm
          parentColumn="organization_id"
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

// Users will likely type "providersolutions.com" without a scheme;
// add https:// so the anchor doesn't resolve relative to the app.
function ensureProtocol(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
