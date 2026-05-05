import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import { useOrganizations } from '@/hooks/useOrganizations';
import { ORGANIZATION_TYPES, labelFor } from '@/utils/constants';
import { cn } from '@/lib/utils';

const TYPE_BADGE = {
  hospital:       'bg-accent-dim text-accent border-accent/40',
  locums_partner: 'bg-warning/15 text-warning border-warning/40',
  other:          'bg-surface2 text-text-dim border-border',
};

export default function Organizations() {
  const navigate = useNavigate();
  const { data, loading, error, create } = useOrganizations();
  const [search, setSearch]   = useState('');
  const [typeFilter, setType] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(o => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false;
      if (!q) return true;
      return (
        o.name?.toLowerCase().includes(q)    ||
        o.city?.toLowerCase().includes(q)    ||
        o.state?.toLowerCase().includes(q)   ||
        o.website?.toLowerCase().includes(q)
      );
    });
  }, [data, search, typeFilter]);

  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl text-text leading-none mb-2">Organizations</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Hospitals · LOCUMs partners · Other
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New organization
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, city, state, website…"
              className="bg-surface border-border text-text pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setType}>
            <SelectTrigger className="bg-surface border-border text-text w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ORGANIZATION_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-surface border border-border rounded relative overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Name</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Type</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Location</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Website</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
              )}
              {!loading && error && (
                <TableRow><TableCell colSpan={4} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
              )}
              {!loading && !error && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="text-text-dim mb-3">
                      {data.length === 0 ? 'No organizations yet.' : 'No matches for current filters.'}
                    </div>
                    {data.length === 0 && (
                      <Button
                        onClick={() => setCreateOpen(true)}
                        variant="outline"
                        className="border-accent text-accent hover:bg-accent-dim font-mono uppercase tracking-[0.1em] text-xs"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Create the first one
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && rows.map(o => (
                <TableRow
                  key={o.id}
                  onClick={() => navigate(`/organizations/${o.id}`)}
                  className="border-border cursor-pointer hover:bg-surface2 transition-colors"
                >
                  <TableCell className="text-text font-medium">{o.name}</TableCell>
                  <TableCell>
                    {o.type ? (
                      <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', TYPE_BADGE[o.type])}>
                        {labelFor(ORGANIZATION_TYPES, o.type)}
                      </Badge>
                    ) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim">
                    {[o.city, o.state].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-text-dim font-mono text-xs truncate max-w-[240px]">
                    {o.website || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} {rows.length === 1 ? 'organization' : 'organizations'}
            {rows.length !== data.length && ` · ${data.length} total`}
          </div>
        )}
      </div>

      <OrganizationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/organizations/${row.id}`);
        }}
      />
    </div>
  );
}
