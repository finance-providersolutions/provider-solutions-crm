import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabase';

// Phase 4a — cross-provider credentialing fetch. Sibling to
// useExpirations: three parallel queries against the three
// credentialing tables, no provider_id filter, no expiration filter,
// then bucket each result set into a Map<provider_id, rows[]> via
// useMemo so consumers can address per-provider arrays without
// per-row queries.
//
// Returns the row shapes deriveShiftReadiness already expects — the
// helper consumes flat arrays of licenses/credentials/privileges
// keyed nowhere in particular. Privileges keep their hospital
// organization joined inline (same shape as useFacilityPrivileges)
// so the readiness helper's facility dimension can match by
// organization_id against the opportunity's hospital.
//
// Returns:
//   licensesByProvider     Map<uuid, license rows[]>
//   credentialsByProvider  Map<uuid, credential rows[]>
//   privilegesByProvider   Map<uuid, privilege rows[]>
//   loading / error / refetch

export function useAllCredentialing() {
  const [licenses, setLicenses]       = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [privileges, setPrivileges]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [licRes, credRes, privRes] = await Promise.all([
        supabase.from('provider_licenses').select('*'),
        supabase.from('credentials').select('*'),
        supabase
          .from('facility_privileges')
          .select('*, organization:organizations(id, name, city, state, logo_path)'),
      ]);
      if (licRes.error)  throw licRes.error;
      if (credRes.error) throw credRes.error;
      if (privRes.error) throw privRes.error;
      setLicenses(licRes.data     ?? []);
      setCredentials(credRes.data ?? []);
      setPrivileges(privRes.data  ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const licensesByProvider    = useMemo(() => bucketByProvider(licenses),    [licenses]);
  const credentialsByProvider = useMemo(() => bucketByProvider(credentials), [credentials]);
  const privilegesByProvider  = useMemo(() => bucketByProvider(privileges),  [privileges]);

  return {
    licensesByProvider,
    credentialsByProvider,
    privilegesByProvider,
    loading,
    error,
    refetch,
  };
}

function bucketByProvider(rows) {
  const map = new Map();
  for (const r of rows ?? []) {
    const pid = r?.provider_id;
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(r);
  }
  return map;
}
