import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useContact, useContacts } from '@/hooks/useContacts';
import { CONTACT_ROLES, labelFor } from '@/utils/constants';
import { fmtDateTime, fmtName, fmtPhone } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Slice 4 minimal-mirror-Provider detail page for contacts.
// Header has no thumb (contacts carry no image today). No Activity
// or Tasks section — activities don't link to contacts directly per
// STATE.md, and tasks don't either. Page-level Delete at the bottom
// is the canonical destructive affordance from this entry point;
// ContactFormDialog has no in-dialog Delete, so there's no conflict
// to resolve via a hideDeleteAction prop (unlike Tasks).

export default function Contact() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: contact, loading, error, refetch } = useContact(id);
  const { update, remove } = useContacts();

  const [editOpen, setEditOpen]                 = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteContactTriggerRef = useRef(null);

  async function performDelete() {
    if (!contact) return;
    try {
      await remove(contact.id);
      toast.success('Contact deleted');
      navigate('/contacts');
    } catch (err) {
      console.error('delete contact', err);
      toast.error(err?.message || 'Could not delete');
      throw err;
    }
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (error)   return <Centered tone="danger">{error.message}</Centered>;
  if (!contact) return <Centered>Contact not found.</Centered>;

  const fullName = fmtName(contact);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <button
          onClick={() => navigate('/contacts')}
          className="flex items-center gap-1.5 text-text-dim hover:text-accent transition-colors font-mono text-[11px] uppercase tracking-[0.12em] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All contacts
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <h1 className="font-display text-4xl text-text leading-tight mb-2 break-words">{fullName}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {contact.role && (
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-dim border-border">
                  {labelFor(CONTACT_ROLES, contact.role)}
                </Badge>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Created {fmtDateTime(contact.created_at)}
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
            <DetailField label="Title">
              {contact.title || <Empty />}
            </DetailField>
            <DetailField label="Role">
              {contact.role ? labelFor(CONTACT_ROLES, contact.role) : <Empty />}
            </DetailField>
            <DetailField label="Email">
              {contact.email
                ? <a href={`mailto:${contact.email}`} className="text-accent hover:text-accent-bright break-all">{contact.email}</a>
                : <Empty />}
            </DetailField>
            <DetailField label="Phone">
              {(() => {
                const formatted = fmtPhone(contact.phone);
                return formatted === '—'
                  ? <Empty />
                  : <a href={`tel:${contact.phone}`} className="text-text hover:text-accent">{formatted}</a>;
              })()}
            </DetailField>
            <DetailField label="Organization" full>
              {contact.organization ? (
                <Link to={`/organizations/${contact.organization.id}`} className="text-accent hover:text-accent-bright">
                  {contact.organization.name}
                </Link>
              ) : <Empty />}
            </DetailField>
            <DetailField label="Notes" full>
              {contact.notes
                ? <p className="text-text whitespace-pre-wrap">{contact.notes}</p>
                : <Empty />}
            </DetailField>
          </DetailGrid>
        </div>

        <div className="border-t border-border/50 pt-6">
          <Button
            ref={deleteContactTriggerRef}
            onClick={() => setConfirmDeleteOpen(true)}
            variant="ghost"
            className="text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete contact
          </Button>
        </div>
      </div>

      <ContactFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={contact}
        organizationId={contact.organization_id}
        onSave={async (payload) => {
          await update(contact.id, payload);
          await refetch();
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteContactTriggerRef}
        title={contact ? `Delete contact "${fullName}"?` : 'Delete?'}
        onConfirm={performDelete}
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
