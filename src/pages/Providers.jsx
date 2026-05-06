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
import Thumb from '@/components/uploads/Thumb';
import ProviderFormDialog from '@/components/providers/ProviderFormDialog';
import { useProviders } from '@/hooks/useProviders';
import {
  POSITION_TYPES, PROVIDER_STATUSES, SPECIALTIES, labelFor,
} from '@/utils/constants';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Status pill colors. In-process stages share the accent treatment;
// active is the only "currently in revenue" green; inactive /
// disqualified mute and warn respectively. Same shape and tokens
// as Organizations.jsx TYPE_BADGE.
export const STATUS_BADGE = {
  lead:         'bg-accent-dim text-accent border-accent/40',
  contacted:    'bg-accent-dim text-accent border-accent/40',
  interested:   'bg-accent-dim text-accent border-accent/40',
  interviewing: 'bg-accent-dim text-accent border-accent/40',
  onboarding:   'bg-accent-dim text-accent border-accent/40',
  credentialed: 'bg-accent-dim text-accent border-accent/40',
  active:       'bg-income/15  text-income border-income/40',
  inactive:     'bg-surface2   text-text-dim border-border',
  disqualified: 'bg-danger/15  text-danger border-danger/40',
};

export default function Providers() {
  const navigate = useNavigate();
  const { data, loading, error, create } = useProviders();
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatus]         = useState('all');
  const [specialtyFilter, setSpecialty]   = useState('all');
  const [hideArchived, setHideArchived]   = useState(true);
  const [createOpen, setCreateOpen]       = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(p => {
      if (hideArchived && p.archived) return false;
      if (statusFilter    !== 'all' && p.status    !== statusFilter)    return false;
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (!q) return true;
      const haystack = [
        p.first_name, p.last_name, p.email, p.npi,
        p.home_city, p.home_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search, statusFilter, specialtyFilter, hideArchived]);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl text-text leading-none mb-2">Providers</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Supply pipeline · Recruiting through credentialed
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New provider
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, NPI, city…"
              className="bg-surface border-border text-text pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="bg-surface border-border text-text w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROVIDER_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={specialtyFilter} onValueChange={setSpecialty}>
            <SelectTrigger className="bg-surface border-border text-text w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specialties</SelectItem>
              {SPECIALTIES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideArchived}
              onChange={(e) => setHideArchived(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Hide archived
            </span>
          </label>
        </div>

        <div className="bg-surface border border-border rounded relative overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em] w-[60px]"></TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Name</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Specialty</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Type</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Home</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
              )}
              {!loading && error && (
                <TableRow><TableCell colSpan={6} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
              )}
              {!loading && !error && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="text-text-dim mb-3">
                      {data.length === 0 ? 'No providers yet.' : 'No matches for current filters.'}
                    </div>
                    {data.length === 0 && (
                      <Button
                        onClick={() => setCreateOpen(true)}
                        variant="outline"
                        className="border-accent text-accent hover:bg-accent-dim font-mono uppercase tracking-[0.1em] text-xs"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add the first one
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && rows.map(p => (
                <TableRow
                  key={p.id}
                  onClick={() => navigate(`/providers/${p.id}`)}
                  className={cn(
                    'border-border cursor-pointer hover:bg-surface2 transition-colors',
                    p.archived && 'opacity-60',
                  )}
                >
                  <TableCell>
                    <Thumb
                      path={p.photo_path}
                      bucket="provider-photos"
                      alt={`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()}
                      fallback={initialsFor(p)}
                      size="sm"
                      shape="circle"
                    />
                  </TableCell>
                  <TableCell className="text-text font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      {[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                      {p.archived && (
                        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.1em] bg-surface2 text-text-muted border-border">
                          Archived
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-text-dim">
                    {p.specialty ? labelFor(SPECIALTIES, p.specialty) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim font-mono text-xs">
                    {p.position_type ? labelFor(POSITION_TYPES, p.position_type) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim">
                    {[p.home_city, p.home_state].filter(Boolean).join(', ') || <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell>
                    {p.status ? (
                      <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[p.status])}>
                        {labelFor(PROVIDER_STATUSES, p.status)}
                      </Badge>
                    ) : <span className="text-text-muted">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} {rows.length === 1 ? 'provider' : 'providers'}
            {rows.length !== data.length && ` · ${data.length} total`}
          </div>
        )}
      </div>

      <ProviderFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/providers/${row.id}`);
        }}
      />
    </div>
  );
}
