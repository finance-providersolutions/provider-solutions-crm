import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Mirrors useOrganizations / useContacts. The hook is intentionally
// dumb about archived rows — every row is returned, ordered by name.
// The Providers page applies a "Hide archived" filter at view time
// so the same hook can drive any future cross-cut view (a
// Credentialing dashboard, an admin "all providers" reconciliation,
// etc.) without each call site having to re-derive the data.
//
// `create` accepts an optional `id` in the input (the
// ProviderFormDialog generates one in create mode so storage paths
// uploaded against it line up with the eventual row).
export function useProviders() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: err } = await supabase
      .from('providers')
      .select('*')
      .order('last_name',  { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false });
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
      .from('providers')
      .insert({ ...input, created_by: user?.id ?? null })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('providers')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('providers')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}

export function useProvider(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data: row, error: err } = await supabase
      .from('providers')
      .select('*')
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
