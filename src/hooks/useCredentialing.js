import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';
import { CREDENTIAL_TYPES, labelFor } from '@/utils/constants';

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
      .from('provider_credentials')
      .select('*')
      .eq('provider_id', providerId)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('type_key',        { ascending: true });
    if (err) { setError(err); setLoading(false); return; }
    setData(rows ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Bright line: creation NEVER verifies. A new row is always born
  // unverified ('provider_attested'), for every type and regardless of
  // which fields are filled — staff routinely create an empty stub just
  // to tell a provider what to supply (the complete-only model), which
  // is not an act of verification. staff_verified is the flag matching
  // and compliance trust, so it must only ever result from the explicit
  // staff verify() action below — never from an insert. verification_
  // status is forced here (not `?? input`) so no caller can assert a
  // verification through the create path. There is no lifecycle `status`
  // column on provider_credentials — the legacy statusForInsert mapping
  // is gone.
  const create = useCallback(async (input) => {
    const { data: row, error: err } = await supabase
      .from('provider_credentials')
      .insert({
        ...input,
        provider_id: providerId,
        created_by: user?.id ?? null,
        verification_status: 'provider_attested',
      })
      .select()
      .single();
    if (err) throw err;
    await refetch();
    return row;
  }, [providerId, user, refetch]);

  const update = useCallback(async (id, patch) => {
    const { data: row, error: err } = await supabase
      .from('provider_credentials')
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
      .from('provider_credentials')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  // Staff promotion bridge. Marks the wallet instance staff_verified;
  // for a state medical license it additionally upserts the
  // authoritative provider_licenses row — the layer Phase 4 matching
  // reads. provider_licenses has no (provider_id, state) unique
  // constraint, so the upsert is a read-then-write keyed on that
  // pair. The wallet stays the record of entry; the license row is
  // the derived, match-queried projection of a verified license.
  const verify = useCallback(async (credential) => {
    const { error: err } = await supabase
      .from('provider_credentials')
      .update({ verification_status: 'staff_verified' })
      .eq('id', credential.id);
    if (err) throw err;

    if (credential.type_key === 'state_medical_license' && credential.state) {
      const licensePayload = {
        state:           credential.state,
        license_number:  credential.identifier      ?? null,
        issue_date:      credential.issue_date       ?? null,
        expiration_date: credential.expiration_date  ?? null,
        document_path:   credential.document_path     ?? null,
        status:          'active',
      };
      const { data: existing, error: findErr } = await supabase
        .from('provider_licenses')
        .select('id')
        .eq('provider_id', providerId)
        .eq('state', credential.state)
        .limit(1);
      if (findErr) throw findErr;
      if (existing && existing.length > 0) {
        const { error: updErr } = await supabase
          .from('provider_licenses')
          .update(licensePayload)
          .eq('id', existing[0].id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('provider_licenses')
          .insert({ ...licensePayload, provider_id: providerId, created_by: user?.id ?? null });
        if (insErr) throw insErr;
      }
    }
    await refetch();
  }, [providerId, user, refetch]);

  return { data, loading, error, refetch, create, update, remove, verify };
}

// ─── credential_types catalog (0013) ──────────────────────────────
// The credential_types catalog is the source of truth for the
// selectable type_keys and their display labels (it carries the five
// migrated enum types plus the new ones — state_medical_license,
// state_csr, etc.). Fetched once per mount. labelByKey resolves a
// type_key to its label, falling back to the CREDENTIAL_TYPES
// constant for the migrated five while the catalog loads or if a row
// lacks a label. Defensive about the label column name so a catalog
// whose label lives under `label` or `name` both resolve.
export function useCredentialTypes() {
  const [types, setTypes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('credential_types')
        .select('*');
      if (!active) return;
      if (err) { setError(err); setLoading(false); return; }
      setTypes(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const labelByKey = useMemo(() => {
    const m = new Map();
    for (const t of types ?? []) {
      const key = t?.key;
      if (!key) continue;
      m.set(key, t?.label ?? t?.name ?? key);
    }
    return m;
  }, [types]);

  // type_key → allows_value flag. Drives whether a credential carries
  // an identifier (DEA number, certificate number, …) at all; types
  // like BLS/ACLS are certs with no number, so allows_value is false
  // and the identifier line is suppressed entirely rather than shown
  // empty. Consumers default to SHOWING unless the catalog explicitly
  // says false, so an unloaded catalog or a row missing the column
  // never hides a real identifier.
  const allowsValueByKey = useMemo(() => {
    const m = new Map();
    for (const t of types ?? []) {
      const key = t?.key;
      if (!key) continue;
      m.set(key, t?.allows_value);
    }
    return m;
  }, [types]);

  return { types, labelByKey, allowsValueByKey, loading, error };
}

// Row-aware label resolver shared by the credentialing surfaces.
// `other` rows have no enum identity — they carry their own free-text
// label. Named types resolve via the catalog, falling back to the
// CREDENTIAL_TYPES constant (covers the migrated five offline).
export function credentialLabel(row, labelByKey) {
  if (!row) return '—';
  if (row.type_key === 'other') return row.label || 'Other credential';
  return labelByKey?.get(row.type_key) ?? labelFor(CREDENTIAL_TYPES, row.type_key);
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
