import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import LogActivityForm from '@/components/activities/LogActivityForm';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { useOrganization, useOrganizations } from '@/hooks/useOrganizations';
import { useContacts } from '@/hooks/useContacts';
import { useActivities } from '@/hooks/useActivities';
import { CONTACT_ROLES, ORGANIZATION_TYPES, labelFor } from '@/utils/constants';
import { fmtDateTime, fmtName, fmtPhone } from '@/utils/formatters';
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

  async function handleDelete() {
    if (!org) return;
    const confirmed = window.confirm(
      `Delete "${org.name}"?\n\nThis will also delete its contacts and activities. This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await remove(org.id);
      toast.success('Organization deleted');
      navigate('/organizations');
    } catch (err) {
      console.error('delete organization', err);
      toast.error(err?.message || 'Could not delete');
    }
  }

  async function handleDeleteContact(c) {
    const confirmed = window.confirm(`Delete contact "${fmtName(c)}"?`);
    if (!confirmed) return;
    try {
      await contacts.remove(c.id);
      toast.success('Contact deleted');
    } catch (err) {
      console.error('delete contact', err);
      toast.error(err?.message || 'Could not delete contact');
    }
  }

  async function handleDeleteActivity(a) {
    const confirmed = window.confirm('Delete this activity entry?');
    if (!confirmed) return;
    try {
      await activities.remove(a.id);
      toast.success('Activity deleted');
    } catch (err) {
      console.error('delete activity', err);
      toast.error(err?.message || 'Could not delete activity');
    }
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (error)   return <Centered tone="danger">{error.message}</Centered>;
  if (!org)    return <Centered>Organization not found.</Centered>;

  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/organizations')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All organizations
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
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
        </div>

        <div className="flex items-center justify-between mb-3">
          <SectionHeader text="Contacts" first />
        </div>
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
              <li key={c.id} className="p-4 flex items-start gap-3 group">
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
                      <a href={`mailto:${c.email}`} className="hover:text-accent">{c.email}</a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="hover:text-accent">{fmtPhone(c.phone)}</a>
                    )}
                  </div>
                  {c.notes && (
                    <p className="text-text-dim text-sm mt-1 whitespace-pre-wrap">{c.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditingContact(c); setContactOpen(true); }}
                    className="text-text-muted hover:text-accent p-1"
                    aria-label="Edit contact"
                    type="button"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(c)}
                    className="text-text-muted hover:text-danger p-1"
                    aria-label="Delete contact"
                    type="button"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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

        <div className="border-t border-border/50 pt-6">
          <Button
            onClick={handleDelete}
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
    <div className="min-h-full pt-[58px] flex items-center justify-center">
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
