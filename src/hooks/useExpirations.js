import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useCredentialTypes, credentialLabel } from '@/hooks/useCredentialing';
import {
  PRIVILEGE_TERMINAL_STATUSES,
  expirationBucket,
} from '@/components/credentialing/expiration';

// Cross-provider expiration roll-up — feeds the /expirations page.
//
// Fetches all three credentialing tables in parallel, each filtered
// to rows with a non-null expiration_date. Combines them into one
// flat list with a normalized item shape (each item knows its
// sourceType so the row can render its type label and the React
// key stays unique).
//
// One page-level fetch per table — no per-row queries, no N+1.
// The hook itself stays dumb about search/sort/filter; the page
// applies those on top and uses the exported `bucketExpirations`
// helper to group the final list into 30/60/90/past windows.
//
// Excluded by design at the query layer:
//   - Privileges where status is 'denied' or 'withdrawn' (terminal
//     outcomes — not pending renewal, would clutter the dashboard).
//   - Rows with no expiration_date (no signal to surface).
//
// Excluded by design in JS:
//   - Items whose provider.archived is true.
//
// Returns: { items, loading, error, refetch }
//
// Each item shape:
//   { id, sourceType, typeLabel, itemLabel,
//     provider, providerId, providerName, expirationDate }
//   id = "<sourceType>:<row.id>".
export function useExpirations() {
  const [licenses, setLicenses]       = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [privileges, setPrivileges]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const { labelByKey } = useCredentialTypes();

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const providerSelect = 'provider:providers(id, first_name, middle_name, last_name, suffix, photo_path, archived)';
    try {
      const [licRes, credRes, privRes] = await Promise.all([
        supabase
          .from('provider_licenses')
          .select(`*, ${providerSelect}`)
          .not('expiration_date', 'is', null),
        supabase
          .from('provider_credentials')
          .select(`*, ${providerSelect}`)
          .not('expiration_date', 'is', null),
        supabase
          .from('facility_privileges')
          .select(`*, ${providerSelect}, organization:organizations(id, name)`)
          .not('expiration_date', 'is', null)
          .not('status', 'in', `(${PRIVILEGE_TERMINAL_STATUSES.join(',')})`),
      ]);
      if (licRes.error)  throw licRes.error;
      if (credRes.error) throw credRes.error;
      if (privRes.error) throw privRes.error;
      setLicenses(licRes.data    ?? []);
      setCredentials(credRes.data ?? []);
      setPrivileges(privRes.data  ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const items = useMemo(() => {
    const result = [];

    for (const l of licenses) {
      if (l.provider?.archived) continue;
      result.push({
        id:             `license:${l.id}`,
        sourceType:     'license',
        typeLabel:      'License',
        itemLabel:      l.state,
        provider:       l.provider,
        providerId:     l.provider?.id,
        providerName:   joinName(l.provider),
        expirationDate: l.expiration_date,
      });
    }

    for (const c of credentials) {
      if (c.provider?.archived) continue;
      result.push({
        id:             `credential:${c.id}`,
        sourceType:     'credential',
        typeLabel:      'Credential',
        itemLabel:      credentialLabel(c, labelByKey),
        provider:       c.provider,
        providerId:     c.provider?.id,
        providerName:   joinName(c.provider),
        expirationDate: c.expiration_date,
      });
    }

    for (const p of privileges) {
      if (p.provider?.archived) continue;
      result.push({
        id:             `privilege:${p.id}`,
        sourceType:     'privilege',
        typeLabel:      'Privilege',
        itemLabel:      p.organization?.name || 'Hospital',
        provider:       p.provider,
        providerId:     p.provider?.id,
        providerName:   joinName(p.provider),
        expirationDate: p.expiration_date,
      });
    }

    return result;
  }, [licenses, credentials, privileges, labelByKey]);

  return { items, loading, error, refetch };
}

// Cached lower-case full name used by the page's search filter.
// Stored on the item so the substring match doesn't re-build the
// name on every keystroke. Trimmed/spaced same as fmtName but kept
// here to avoid a circular import from the formatters module.
function joinName(p) {
  if (!p) return '';
  const parts = [p.first_name, p.middle_name, p.last_name]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const suffix = p.suffix && String(p.suffix).trim();
  return suffix ? `${parts}, ${suffix}` : parts;
}

// Bucket a pre-sorted item list into the four 30/60/90/past windows.
// Items more than 90 days out get a null bucket from the helper and
// are skipped. Preserves the input order within each bucket so the
// caller can sort once globally before bucketing.
export function bucketExpirations(items) {
  const past = [], thirty = [], sixty = [], ninety = [];
  for (const item of items) {
    const b = expirationBucket(item.expirationDate);
    if (b === 'past')      past.push(item);
    else if (b === '30')   thirty.push(item);
    else if (b === '60')   sixty.push(item);
    else if (b === '90')   ninety.push(item);
  }
  return { past, '30': thirty, '60': sixty, '90': ninety };
}
