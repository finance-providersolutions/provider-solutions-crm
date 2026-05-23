import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Phase 3 slice 3a — per-provider scoped CRUD hooks for the three
// credentialing tables created in 0004. All three follow the same
// shape: list (ordered by expiration_date ascending, nullsLast so
// dateless rows sink to the bottom), plus create / update / remove
// that refetch on success. Each hook is no-op when providerId is
// falsy so detail pages can mount the hook unconditionally and let
// useProvider's loading state govern the gate.
//
// Cross-provider reads (the expiration roll-up dashboard) live in
// their own hook — useExpirations — to keep the read-side join
// shape separate from the per-provider write surface.

// ─── provider_licenses ────────────────────────────────────────────
export function useProviderLicenses(providerId) {
  const { user } = useAuth();
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
      .from('provider_licenses')
      .select('*')
      .eq('provider_id', providerId)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('state',           { ascending: true });
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('provider_licenses')
      .insert({ ...input, provider_id: providerId, created_by: user?.id ?? null })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [providerId, user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('provider_licenses')
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
      .from('provider_licenses')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}

// ─── credentials ──────────────────────────────────────────────────
export function useCredentials(providerId) {
  const { user } = useAuth();
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
      .from('credentials')
      .select('*')
      .eq('provider_id', providerId)
      .order('expiration_date',  { ascending: true, nullsFirst: false })
      .order('credential_type',  { ascending: true });
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('credentials')
      .insert({ ...input, provider_id: providerId, created_by: user?.id ?? null })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [providerId, user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('credentials')
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
      .from('credentials')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}

// ─── facility_privileges ──────────────────────────────────────────
// Eagerly joins the parent hospital (organization) so list rows can
// render the hospital name without a second query. The schema lets
// any organization id be referenced; the picker scopes by type =
// 'hospital' at the UI layer.
export function useFacilityPrivileges(providerId) {
  const { user } = useAuth();
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
      .from('facility_privileges')
      .select('*, organization:organizations(id, name, city, state, logo_path)')
      .eq('provider_id', providerId)
      .order('expiration_date', { ascending: true, nullsFirst: false });
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('facility_privileges')
      .insert({ ...input, provider_id: providerId, created_by: user?.id ?? null })
      .select('*, organization:organizations(id, name, city, state, logo_path)')
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [providerId, user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('facility_privileges')
      .update(patch)
      .eq('id', id)
      .select('*, organization:organizations(id, name, city, state, logo_path)')
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('facility_privileges')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return { data, loading, error, refetch, create, update, remove };
}
