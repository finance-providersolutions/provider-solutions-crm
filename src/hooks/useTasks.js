import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';

// Eager-loads all three optional parents (organization, opportunity,
// provider) in a single select. At Phase 2 task volumes the
// triple-null-padded shape per row is fine; the UI picks whichever
// parent column is non-null and renders its name plus a mono-caps
// type subtitle.
//
// Filters: { assigneeId, status, completedSinceDays,
//            organizationId, opportunityId, providerId }
//   - assigneeId: scopes to one user (used for "My open tasks")
//   - status: 'open' | 'completed' | 'cancelled' or null for any
//   - completedSinceDays: when set, gates by completed_at >= cutoff
//                         (used for "Completed (last 30 days)")
//   - organizationId / opportunityId / providerId: scope to tasks
//     parented on a specific record (used by TasksSection on the
//     three detail pages).
const SELECT_WITH_PARENTS = `
  *,
  organization:organizations(id, name),
  opportunity:opportunities(id, title, name),
  provider:providers(id, first_name, last_name)
`;

export function useTasks(filters = {}) {
  const {
    assigneeId, status, completedSinceDays,
    organizationId, opportunityId, providerId,
  } = filters;
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('tasks')
      .select(SELECT_WITH_PARENTS)
      .order('due_date',   { ascending: true,  nullsFirst: false })
      .order('created_at', { ascending: false });

    if (assigneeId)     query = query.eq('assignee_id',     assigneeId);
    if (status)         query = query.eq('status',          status);
    if (organizationId) query = query.eq('organization_id', organizationId);
    if (opportunityId)  query = query.eq('opportunity_id',  opportunityId);
    if (providerId)     query = query.eq('provider_id',     providerId);
    if (completedSinceDays != null) {
      const cutoff = new Date(Date.now() - completedSinceDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('completed_at', cutoff);
    }

    const { data: rows, error: err } = await query;
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(rows ?? []);
    setLoading(false);
  }, [assigneeId, status, completedSinceDays, organizationId, opportunityId, providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('tasks')
      .insert({ ...input, created_by: user?.id ?? null })
      .select(SELECT_WITH_PARENTS)
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .select(SELECT_WITH_PARENTS)
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  // The load-bearing action for the open-task list views. Sets both
  // status and completed_at in a single update so the row moves to
  // the "Completed (last 30 days)" view immediately.
  const quickComplete = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  return useMemo(
    () => ({ data, loading, error, refetch, create, update, remove, quickComplete }),
    [data, loading, error, refetch, create, update, remove, quickComplete],
  );
}
