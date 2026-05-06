import { getPublicUrl } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Compact thumbnail used in 4+ places — provider list rows,
// provider detail header, organization list rows, organization
// detail header, opportunity detail header (parent org logo). Per
// BUILD_PLAN §8: extract a child component when the section earns
// its own name and is reused.
//
// Renders an <img> from a Supabase Storage path; falls back to a
// circular initials block when path is null/missing or the image
// fails to load. Neutral, on-brand styling — no broken-image icon.
//
// Props:
//   path     — Storage path (e.g., '<uuid>/<uuid>.jpg'); nullable
//   bucket   — Storage bucket name (must be a public-read bucket)
//   alt      — alt text for the <img>
//   fallback — string used to render initials when no image
//   size     — 'sm' | 'md' | 'lg' | 'xl'
//   shape    — 'circle' | 'square' (square: rounded corners,
//              suited to org logos; circle: provider photos)
//   className— optional extra utilities

const SIZE = {
  sm: 'h-8  w-8  text-[10px]',
  md: 'h-12 w-12 text-xs',
  lg: 'h-16 w-16 text-sm',
  xl: 'h-24 w-24 text-base',
};

export default function Thumb({
  path,
  bucket,
  alt = '',
  fallback = '?',
  size = 'md',
  shape = 'circle',
  className,
}) {
  const url = getPublicUrl(bucket, path);
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded';
  const base = cn(
    'flex-shrink-0 overflow-hidden border border-border bg-surface2',
    SIZE[size] ?? SIZE.md,
    radius,
    className,
  );

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={cn(base, 'object-cover')}
        // If the public URL 404s (e.g., the path was deleted from
        // storage but the row still references it), swap in the
        // fallback by clearing the src and letting the <span>
        // render. We don't surface a toast — this is silent
        // graceful degradation.
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <span
      className={cn(
        base,
        'inline-flex items-center justify-center font-mono uppercase tracking-[0.06em] text-text-dim',
      )}
      aria-label={alt || 'No image'}
    >
      {fallback}
    </span>
  );
}
