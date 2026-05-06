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
import OpportunityFormDialog from '@/components/opportunities/OpportunityFormDialog';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useOrganizations } from '@/hooks/useOrganizations';
import {
  OPPORTUNITY_STAGES, SPECIALTIES, US_STATES, labelFor,
} from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Pipeline stages get distinct treatment per state. Lead/qualified
// are early accent; proposal/contracted are deeper accent; filled
// is income green; lost is danger. Same shape as Providers'
// STATUS_BADGE — re-exported for the detail page.
export const STAGE_BADGE = {
  lead:       'bg-accent-dim text-accent       border-accent/40',
  qualified:  'bg-accent-dim text-accent       border-accent/40',
  proposal:   'bg-accent-dim text-accent       border-accent/40',
  contracted: 'bg-accent-dim text-accent       border-accent/40',
  filled:     'bg-income/15  text-income       border-income/40',
  lost:       'bg-danger/15  text-danger       border-danger/40',
};

// Sentinel values for the source-partner filter dropdown so we can
// disambiguate "not filtering" from "filtering to direct".
const PARTNER_FILTER_ANY    = '__any__';
const PARTNER_FILTER_DIRECT = '__direct__';

export default function Opportunities() {
  const navigate = useNavigate();
  const { data, loading, error, create } = useOpportunities();
  const orgs = useOrganizations();

  const [search, setSearch]       = useState('');
  const [stageFilter, setStage]   = useState('all');
  const [specFilter, setSpec]     = useState('all');
  const [stateFilter, setState]   = useState('all');
  const [partnerFilter, setPartner] = useState(PARTNER_FILTER_ANY);
  const [createOpen, setCreateOpen] = useState(false);

  const partners = useMemo(
    () => orgs.data.filter(o => o.type === 'locums_partner'),
    [orgs.data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(o => {
      if (stageFilter !== 'all' && o.stage         !== stageFilter) return false;
      if (specFilter  !== 'all' && o.specialty     !== specFilter)  return false;
      if (stateFilter !== 'all' && o.location_state !== stateFilter
          && o.organization?.state !== stateFilter) return false;
      if (partnerFilter === PARTNER_FILTER_DIRECT && o.source_partner_id) return false;
      if (partnerFilter !== PARTNER_FILTER_ANY
          && partnerFilter !== PARTNER_FILTER_DIRECT
          && o.source_partner_id !== partnerFilter) return false;
      if (!q) return true;
      const haystack = [
        o.title, o.name,
        o.organization?.name,
        o.location_city, o.location_state,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search, stageFilter, specFilter, stateFilter, partnerFilter]);

  return (
    <div className="min-h-full pb-12 px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl text-text leading-none mb-2">Opportunities</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
              Demand pipeline · Hospitals and partner-sourced positions
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> New opportunity
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, hospital, location…"
              className="bg-surface border-border text-text pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStage}>
            <SelectTrigger className="bg-surface border-border text-text w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {OPPORTUNITY_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={specFilter} onValueChange={setSpec}>
            <SelectTrigger className="bg-surface border-border text-text w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specialties</SelectItem>
              {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setState}>
            <SelectTrigger className="bg-surface border-border text-text w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[260px]">
              <SelectItem value="all">All states</SelectItem>
              {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={partnerFilter} onValueChange={setPartner}>
            <SelectTrigger className="bg-surface border-border text-text w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={PARTNER_FILTER_ANY}>Any source</SelectItem>
              <SelectItem value={PARTNER_FILTER_DIRECT}>Direct (no partner)</SelectItem>
              {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-surface border border-border rounded relative overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Hospital</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Title</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Specialty</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Location</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Stage</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Source</TableHead>
                <TableHead className="text-text-dim font-mono text-[10px] uppercase tracking-[0.12em]">Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-text-muted py-10 font-mono text-xs uppercase tracking-[0.1em]">Loading…</TableCell></TableRow>
              )}
              {!loading && error && (
                <TableRow><TableCell colSpan={7} className="text-center text-danger py-10 font-mono text-xs">{error.message}</TableCell></TableRow>
              )}
              {!loading && !error && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="text-text-dim mb-3">
                      {data.length === 0 ? 'No opportunities yet.' : 'No matches for current filters.'}
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
              {!loading && !error && rows.map(o => (
                <TableRow
                  key={o.id}
                  onClick={() => navigate(`/opportunities/${o.id}`)}
                  className="border-border cursor-pointer hover:bg-surface2 transition-colors"
                >
                  <TableCell className="text-text font-medium">{o.organization?.name ?? '—'}</TableCell>
                  <TableCell className="text-text-dim">{o.title || o.name || '—'}</TableCell>
                  <TableCell className="text-text-dim">
                    {o.specialty ? labelFor(SPECIALTIES, o.specialty) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim">
                    {[o.location_city, o.location_state].filter(Boolean).join(', ')
                      || [o.organization?.city, o.organization?.state].filter(Boolean).join(', ')
                      || <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell>
                    {o.stage ? (
                      <Badge variant="outline" className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', STAGE_BADGE[o.stage])}>
                        {labelFor(OPPORTUNITY_STAGES, o.stage)}
                      </Badge>
                    ) : <span className="text-text-muted">—</span>}
                  </TableCell>
                  <TableCell className="text-text-dim text-sm">
                    {o.source_partner?.name || <span className="text-text-muted">Direct</span>}
                  </TableCell>
                  <TableCell className="text-text-dim font-mono text-xs">
                    {o.next_action_date ? fmtDate(o.next_action_date) : <span className="text-text-muted">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} {rows.length === 1 ? 'opportunity' : 'opportunities'}
            {rows.length !== data.length && ` · ${data.length} total`}
          </div>
        )}
      </div>

      <OpportunityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={async (payload) => {
          const row = await create(payload);
          navigate(`/opportunities/${row.id}`);
        }}
      />
    </div>
  );
}
