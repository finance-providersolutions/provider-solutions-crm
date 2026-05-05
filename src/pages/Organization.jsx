import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '@/components/brand/SectionHeader';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import { useOrganization, useOrganizations } from '@/hooks/useOrganizations';
import { ORGANIZATION_TYPES, labelFor } from '@/utils/constants';
import { fmtDateTime } from '@/utils/formatters';
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
  const [editOpen, setEditOpen] = useState(false);

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

  if (loading) {
    return <Centered>Loading…</Centered>;
  }
  if (error) {
    return <Centered tone="danger">{error.message}</Centered>;
  }
  if (!org) {
    return <Centered>Organization not found.</Centered>;
  }

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
                  <a href={org.website} target="_blank" rel="noreferrer"
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

        <SectionHeader text="Contacts" />
        <div className="bg-surface border border-border rounded p-8 text-center text-text-dim font-mono text-xs uppercase tracking-[0.12em] mb-10">
          Contacts list lands in the next commit.
        </div>

        <SectionHeader text="Activity" />
        <div className="bg-surface border border-border rounded p-8 text-center text-text-dim font-mono text-xs uppercase tracking-[0.12em] mb-10">
          Activity log + Log activity form land in the next commit.
        </div>

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

function Empty() {
  return <span className="text-text-muted">—</span>;
}

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
