import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import { useContacts } from '@/hooks/useContacts';
import { useOrganizations } from '@/hooks/useOrganizations';
import { CONTACT_ROLES, labelFor } from '@/utils/constants';
import { fmtName, fmtPhone } from '@/utils/formatters';

export default function Contacts() {
  const contacts = useContacts();
  const orgs = useOrganizations();
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.data.filter(c => {
      if (orgFilter !== 'all' && c.organization_id !== orgFilter) return false;
      if (!q) return true;
      const name = fmtName(c).toLowerCase();
      return (
        name.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.organization?.name?.toLowerCase().includes(q)
      );
    });
  }, [contacts.data, search, orgFilter]);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl text-text leading-none mb-2">Contacts</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              People at hospitals and partners
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New contact
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, organization…"
              className="bg-surface border-border text-text pl-9"
            />
          </div>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="bg-surface border-border text-text w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {orgs.data.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-surface border border-border rounded relative overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Name</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Organization</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Role</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Email</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
              )}
              {!contacts.loading && contacts.error && (
                <TableRow><TableCell colSpan={5} className="text-center text-danger py-10 font-mono text-xs">{contacts.error.message}</TableCell></TableRow>
              )}
              {!contacts.loading && !contacts.error && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-text-dim">
                    {contacts.data.length === 0 ? 'No contacts yet.' : 'No matches for current filters.'}
                  </TableCell>
                </TableRow>
              )}
              {!contacts.loading && !contacts.error && rows.map(c => (
                <TableRow key={c.id} className="border-border hover:bg-surface2 transition-colors">
                  <TableCell className="text-text font-medium">
                    {fmtName(c)}
                    {c.title && <div className="text-text-dim text-xs font-normal">{c.title}</div>}
                  </TableCell>
                  <TableCell>
                    {c.organization ? (
                      <Link to={`/organizations/${c.organization.id}`} className="text-accent hover:text-accent-bright">
                        {c.organization.name}
                      </Link>
                    ) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim">
                    {c.role
                      ? <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.1em] bg-surface2 text-text-dim border-border">
                          {labelFor(CONTACT_ROLES, c.role)}
                        </Badge>
                      : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim font-mono text-xs">
                    {c.email
                      ? <a href={`mailto:${c.email}`} className="hover:text-accent">{c.email}</a>
                      : '—'}
                  </TableCell>
                  <TableCell className="text-text-dim font-mono text-xs">
                    {c.phone
                      ? <a href={`tel:${c.phone}`} className="hover:text-accent">{fmtPhone(c.phone)}</a>
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!contacts.loading && rows.length > 0 && (
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} {rows.length === 1 ? 'contact' : 'contacts'}
            {rows.length !== contacts.data.length && ` · ${contacts.data.length} total`}
          </div>
        )}
      </div>

      <ContactFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={orgs.data}
        onSave={async (payload) => { await contacts.create(payload); }}
      />
    </div>
  );
}
