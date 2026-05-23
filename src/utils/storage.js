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

// Async sibling for PRIVATE buckets (Phase 3 `credentials`).
// Wraps createSignedUrl so call sites stay out of the @supabase/*
// surface. Returns null when bucket/path is missing OR when the
// signed-URL request fails — the latter logs to console so failures
// don't go silent, but the caller is expected to render an empty/
// "couldn't load" state rather than crash. Default 5-minute expiry
// matches BUILD_PLAN §4.6's credentials-bucket spec; callers can
// override per use case.
export async function getSignedUrl(bucket, path, expiresIn = 300) {
  if (!bucket || !path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error('getSignedUrl failed', { bucket, path, error });
    return null;
  }
  return data?.signedUrl ?? null;
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
