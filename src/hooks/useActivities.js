import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Filters: { organizationId, contactId, sinceDays, limit }
// Each is optional. The hook always orders by occurred_at desc.
export function useActivities(filters = {}) {
  const { organizationId, contactId, sinceDays, limit } = filters;
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('activities')
      .select(`
        *,
        organization:organizations(id, name),
        contact:contacts(id, first_name, last_name)
      `)
      .order('occurred_at', { ascending: false });

    if (organizationId) query = query.eq('organization_id', organizationId);
    if (contactId)      query = query.eq('contact_id',      contactId);
    if (sinceDays != null) {
      const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('occurred_at', cutoff);
    }
    if (limit) query = query.limit(limit);

    const { data: rows, error: err } = await query;
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(rows ?? []);
    setLoading(false);
  }, [organizationId, contactId, sinceDays, limit]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('activities')
      .insert({ ...input, created_by: user?.id ?? null })
      .select(`
        *,
        organization:organizations(id, name),
        contact:contacts(id, first_name, last_name)
      `)
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [user, refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, remove };
}
