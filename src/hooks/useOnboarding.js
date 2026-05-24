import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Phase 3b final — per-provider onboarding hook. Mirrors the
// shape of useProviderLicenses / useCredentials / useFacilityPrivileges
// in useCredentialing.js: loading/error/data/refetch + create/
// update/remove, no React Query.
//
// Returns BOTH the catalog (onboarding_item_types, all rows, ordered
// by sort_order) and the provider's persisted onboarding_items.
// The catalog is per-provider invariant but kept on the hook so the
// detail section has one place to await loading. Re-fetching the
// catalog on every mount is fine at today's row count (3 seeded
// rows); a memoized catalog hook is overkill for this surface.
//
// `toggle(itemRowOrInput)` is a thin convenience that flips done
// and stamps completed_date — when flipping to done it sets the
// date to today, when flipping off it clears the date. For brand-
// new repeatable items the caller uses create() directly with the
// desired payload; toggle assumes a row already exists.

export function useOnboarding(providerId) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const catalogQuery = supabase
      .from('onboarding_item_types')
      .select('*')
      .order('sort_order', { ascending: true });

    // Catalog still loads when providerId is missing so the section
    // can render its row template even before a route resolves.
    const itemsQuery = providerId
      ? supabase
          .from('onboarding_items')
          .select('*')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [catRes, itemRes] = await Promise.all([catalogQuery, itemsQuery]);
    if (catRes.error)  { setError(catRes.error);  setLoading(false); return; }
    if (itemRes.error) { setError(itemRes.error); setLoading(false); return; }

    setCatalog(catRes.data ?? []);
    setItems(itemRes.data ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    if (!providerId) throw new Error('Missing provider id');
    const { data: row, error: err } = await supabase
      .from('onboarding_items')
      .insert({ ...input, provider_id: providerId, created_by: user?.id ?? null })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [providerId, user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('onboarding_items')
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
      .from('onboarding_items')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  // Convenience: flip done + stamp/clear completed_date in one call.
  const toggle = useCallback(async (row) => {
    const nextDone = !row.done;
    const todayIso = new Date().toISOString().slice(0, 10);
    return update(row.id, {
      done: nextDone,
      completed_date: nextDone ? todayIso : null,
    });
  }, [update]);

  return { catalog, items, loading, error, refetch, create, update, remove, toggle };
}
