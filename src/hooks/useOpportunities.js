import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Mirrors useProviders / useOrganizations. Eager-loads both
// related organizations (the hospital and the optional source
// partner) so list and detail can render names without extra
// fetches.
//
// Two FKs from opportunities → organizations require explicit
// disambiguation in the select clause; the names are the auto-
// generated PostgreSQL constraint names (`opportunities_<col>_fkey`).
// At today's row counts (4 → 8 in year 1 per BUILD_PLAN §1) the
// nested-object shape is fine to consume directly. If volume grows
// to where double-joining the same parent table on every row hurts,
// switch to a separate `useOrganizationsById` lookup map.
// Hospital branch carries city + state so credentialing readiness
// (deriveShiftReadiness in src/components/credentialing/readiness.js)
// can resolve the opportunity's licensure state without a second
// fetch. Intentionally NOT mirrored onto the source-partner branch —
// partner geography isn't a readiness input.
const SELECT_WITH_ORGS = `
  *,
  organization:organizations!opportunities_organization_id_fkey(id, name, type, logo_path, city, state),
  source_partner:organizations!opportunities_source_partner_id_fkey(id, name)
`;

export function useOpportunities() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabase
      .from('opportunities')
      .select(SELECT_WITH_ORGS)
      .order('next_action_date', { ascending: true,  nullsFirst: false })
      .order('created_at',       { ascending: false });
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('opportunities')
      .insert({ ...input, created_by: user?.id ?? null })
      .select(SELECT_WITH_ORGS)
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('opportunities')
      .update(patch)
      .eq('id', id)
      .select(SELECT_WITH_ORGS)
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('opportunities')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}

export function useOpportunity(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data: row, error: err } = await supabase
      .from('opportunities')
      .select(SELECT_WITH_ORGS)
      .eq('id', id)
      .single();
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(row);
    setLoading(false);
  }, [id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
