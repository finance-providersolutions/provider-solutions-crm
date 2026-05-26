import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Phase 4b — placements hook. Opportunity-scoped: returns every
// non-cancelled placements row for the given opportunity, with
// select / unselect actions for the Selected lifecycle state.
//
// This is the first hook in the app to read or write the placements
// table; the table was created in 0002 as a Phase-2 stub and has
// sat unused through Phases 2 / 3 / 4a. RLS, the status CHECK
// (relaxed in 0009 to include 'selected'), the set_updated_at
// trigger, and the FK cascades from providers and opportunities are
// all exercised here for the first time.
//
// Cardinality is many-to-many with no DB unique constraint. The
// app-layer rule is at-most-one Selected row per (provider,
// opportunity) pair — enforced in `selectProvider` via a read-then-
// insert check, NOT via a unique constraint (the Scheduler will
// later create non-Selected rows for the same pair as it advances
// the lifecycle, and a unique constraint would block that).
//
// Un-select is a hard delete via `unselectProvider(placementId)`.
// There is intentionally no audit trail in Phase 4b — recorded as a
// known limitation in the docs. A future selection-history surface
// would either soft-delete or move to status='cancelled'.

const SELECTED_LIFECYCLE_STATUSES = [
  'selected', 'proposed', 'accepted', 'active', 'completed',
];

export function usePlacements(opportunityId) {
  const { user } = useAuth();
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refetch = useCallback(async () => {
    if (!opportunityId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabase
      .from('placements')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .in('status', SELECTED_LIFECYCLE_STATUSES);
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => { refetch(); }, [refetch]);

  // App-layer cardinality check: don't create a second placement row
  // for a pair that already has one in any non-cancelled status. The
  // check is a fresh DB read (not a stale local-state filter) so a
  // race between two tabs surfaces as a no-op rather than a phantom
  // duplicate.
  const selectProvider = useCallback(async (providerId) => {
    if (!opportunityId || !providerId) {
      throw new Error('opportunityId and providerId are required');
    }
    const { data: existing, error: readErr } = await supabase
      .from('placements')
      .select('id, status')
      .eq('opportunity_id', opportunityId)
      .eq('provider_id', providerId)
      .in('status', SELECTED_LIFECYCLE_STATUSES);
    if (readErr) throw readErr;
    if (existing && existing.length > 0) {
      return existing[0];
    }
    const { data: row, error: err } = await supabase
      .from('placements')
      .insert({
        opportunity_id: opportunityId,
        provider_id:    providerId,
        status:         'selected',
        created_by:     user?.id ?? null,
      })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [opportunityId, user, refetch]);

  const unselectProvider = useCallback(async (placementId) => {
    if (!placementId) throw new Error('placementId is required');
    const { error: err } = await supabase
      .from('placements')
      .delete()
      .eq('id', placementId);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, selectProvider, unselectProvider };
}

// ── Provider-scoped read for the provider-page Placements section.
// The opportunity-scoped usePlacements above doesn't fit here — that
// returns placement rows for ONE opportunity, the inverse axis. This
// hook returns every non-cancelled placement for ONE provider, with
// the opportunity AND its parent hospital eager-joined so the cross-
// grain view can render opportunity title + hospital identity without
// an N+1. Read-only (no select/unselect; that surface stays on the
// opportunity page where the recruiter does the commit). Co-located
// with the opportunity-scoped hook because both live against the same
// placements table and share the same status-allowlist constant.
//
// Both joins use explicit FK-constraint disambiguation: opportunities
// references organizations twice (organization_id + source_partner_id)
// so the nested organization select must name the FK to avoid an
// ambiguous-relationship error.
export function useProviderPlacements(providerId) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refetch = useCallback(async () => {
    if (!providerId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabase
      .from('placements')
      .select(
        '*, opportunity:opportunities!placements_opportunity_id_fkey(' +
          'id, title, organization_id, position_type, specialty, setting, ' +
          'organization:organizations!opportunities_organization_id_fkey(' +
            'id, name, city, state, logo_path' +
          ')' +
        ')',
      )
      .eq('provider_id', providerId)
      .in('status', SELECTED_LIFECYCLE_STATUSES);
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

export { SELECTED_LIFECYCLE_STATUSES };

// ── Cross-opportunity aggregate read for the matching-engine Home.
// Sibling to useAllCredentialing — one query against the placements
// table with the same non-cancelled status allowlist, then bucket the
// result by opportunity_id (and by provider_id, for the selected-
// without-privilege flag computation) so consumers can address all-
// pairs without an N+1. Read-only.
//
// No eager join: Home already pairs this against useOpportunities /
// useProviders which it loads anyway, so re-joining here would
// duplicate work.
export function useAllPlacements() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabase
      .from('placements')
      .select('id, provider_id, opportunity_id, status')
      .in('status', SELECTED_LIFECYCLE_STATUSES);
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const byOpportunity = useMemo(() => {
    const m = new Map();
    for (const r of data) {
      if (!m.has(r.opportunity_id)) m.set(r.opportunity_id, []);
      m.get(r.opportunity_id).push(r);
    }
    return m;
  }, [data]);

  const byProvider = useMemo(() => {
    const m = new Map();
    for (const r of data) {
      if (!m.has(r.provider_id)) m.set(r.provider_id, []);
      m.get(r.provider_id).push(r);
    }
    return m;
  }, [data]);

  return { data, byOpportunity, byProvider, loading, error, refetch };
}
