import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Pass { organizationId } to scope to one org. Omit for cross-org list.
export function useContacts({ organizationId } = {}) {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('contacts')
      .select('*, organization:organizations(id, name, type, city, state, logo_path)')
      .order('last_name', { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false });
    if (organizationId) query = query.eq('organization_id', organizationId);

    const { data: rows, error: err } = await query;
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(rows ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('contacts')
      .insert({ ...input, created_by: user?.id ?? null })
      .select('*, organization:organizations(id, name, type, city, state, logo_path)')
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .select('*, organization:organizations(id, name, type, city, state, logo_path)')
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}

// Singular fetch for the Contact detail page (Slice 4). Mirrors
// useProvider(id) / useTask(id). Same eager-join of the parent
// org so the detail page can render the org name and link without
// a second round-trip.
export function useContact(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data: row, error: err } = await supabase
      .from('contacts')
      .select('*, organization:organizations(id, name, type, city, state, logo_path)')
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
