import { supabase } from '@/api/supabase';

// Thin wrapper around supabase.storage.getPublicUrl. Components stay
// out of the @supabase/* surface area; if we later need to swap in
// signed URLs (e.g., the Phase 3 credentials bucket) the call site
// signature is the only thing that changes.
//
// Returns null when path is falsy so callers can `path && <img …>`
// without an extra guard.
export function getPublicUrl(bucket, path) {
  if (!bucket || !path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// Initials from a "First Last" or { first_name, last_name } shape.
// Returns up to 2 uppercase letters; falls back to '?' for empty
// input so the avatar fallback is never blank.
export function initialsFor(value) {
  if (!value) return '?';
  if (typeof value === 'object') {
    const f = value.first_name?.trim()?.[0] ?? '';
    const l = value.last_name?.trim()?.[0]  ?? '';
    return ((f + l) || value.name?.trim()?.[0] || '?').toUpperCase();
  }
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
