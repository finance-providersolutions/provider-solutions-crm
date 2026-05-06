import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getPublicUrl } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Reusable image uploader for the public-read buckets
// (organization-logos, provider-photos). Built so the Phase 3
// credentials bucket can swap in a different bucket prop + a
// signed-URL retrieval path without rewriting the component.
//
// Props:
//   bucket          — Supabase Storage bucket name (required)
//   currentPath     — current Storage path (nullable); when set,
//                     renders the existing image with a remove (X)
//                     control. When null, renders the drop / browse
//                     zone.
//   parentId        — UUID used as the path prefix
//                     (e.g., organizations.id, providers.id). The
//                     uploaded object lands at
//                     `<parentId>/<random-uuid>.<ext>`. Required.
//   pathPrefix      — optional extra segment between parentId and
//                     the uuid (e.g., 'logo' or 'image' for the
//                     organization-logos bucket). When omitted,
//                     the path is `<parentId>/<uuid>.<ext>`.
//   onUploaded(path)— called with the new Storage path on success.
//                     Parent decides what to write to the row.
//   onRemove?       — called with no args when the user clicks the
//                     X. Parent decides whether to clear the row's
//                     path column and/or delete the storage object.
//   maxSizeMB       — default 5
//   acceptedTypes   — default ['image/jpeg', 'image/png', 'image/webp']
//   alt             — alt text for the rendered <img>
//   shape           — 'circle' | 'square' for the preview frame
//   size            — 'sm' | 'md' | 'lg' | 'xl' — preview frame sizing
//
// Errors surface via sonner toast. Loading state is shown via the
// shadcn Progress bar while the upload is in flight.

const SIZE = {
  sm: 'h-16 w-16',
  md: 'h-24 w-24',
  lg: 'h-32 w-32',
  xl: 'h-40 w-40',
};

const DEFAULT_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export default function ImageUpload({
  bucket,
  currentPath,
  parentId,
  pathPrefix,
  onUploaded,
  onRemove,
  maxSizeMB = 5,
  acceptedTypes = DEFAULT_ACCEPTED,
  alt = '',
  shape = 'square',
  size = 'lg',
}) {
  const inputRef = useRef(null);
  const [busy, setBusy]       = useState(false);
  // Progress bar is indeterminate (Supabase JS doesn't expose
  // upload progress events on storage.from().upload), so we just
  // animate between 0 and 90 while busy and snap to 100 on done.
  // This keeps the UI honest — there's no real per-byte progress
  // to show.
  const [progress, setProgress] = useState(0);

  const url = getPublicUrl(bucket, currentPath);
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded';

  function pickFile() {
    inputRef.current?.click();
  }

  function onInputChange(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Reset so picking the same file twice in a row still fires.
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleFile(file) {
    if (!parentId) {
      toast.error('Cannot upload — missing parent ID. Save the row first.');
      return;
    }
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Unsupported file type. Allowed: ${acceptedTypes.join(', ')}`);
      return;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`File too large (max ${maxSizeMB} MB)`);
      return;
    }

    setBusy(true);
    setProgress(20);
    // Tick toward 90 until the upload resolves; snap to 100 after.
    const tick = setInterval(() => {
      setProgress(p => (p < 90 ? p + 5 : p));
    }, 200);

    const ext = extOf(file.name) || extOfMime(file.type) || '.bin';
    const uuid = crypto.randomUUID();
    const path = pathPrefix
      ? `${parentId}/${pathPrefix}/${uuid}${ext}`
      : `${parentId}/${uuid}${ext}`;

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      setProgress(100);
      onUploaded?.(path);
      toast.success('Image uploaded');
    } catch (err) {
      console.error('ImageUpload upload failed', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      clearInterval(tick);
      // Brief delay before clearing the bar so the user sees 100%.
      setTimeout(() => { setBusy(false); setProgress(0); }, 250);
    }
  }

  function handleRemove(e) {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  }

  // ── Rendered states ────────────────────────────────────────────

  // 1. Existing image — show preview + X button. Click image to replace.
  if (url) {
    return (
      <div className={cn('relative inline-block group', SIZE[size] ?? SIZE.lg)}>
        <img
          src={url}
          alt={alt}
          className={cn(
            'w-full h-full object-cover border border-border',
            radius,
            !busy && 'cursor-pointer',
          )}
          onClick={() => !busy && pickFile()}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        {onRemove && !busy && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove image"
            className="absolute -top-1.5 -right-1.5 bg-surface border border-border rounded-full p-0.5 text-text-muted hover:text-danger hover:border-danger transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {busy && (
          <div className={cn('absolute inset-0 flex items-center justify-center bg-bg/60', radius)}>
            <Progress value={progress} className="w-3/4 h-1.5" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes.join(',')}
          onChange={onInputChange}
        />
      </div>
    );
  }

  // 2. Empty — drop / browse zone.
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center text-center',
        'border-2 border-dashed border-border bg-surface2/40',
        'cursor-pointer hover:border-accent hover:bg-accent-dim transition-colors',
        SIZE[size] ?? SIZE.lg,
        radius,
        busy && 'pointer-events-none opacity-60',
      )}
      onClick={pickFile}
      onDrop={onDrop}
      onDragOver={onDragOver}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); }
      }}
      aria-label="Upload image"
    >
      {busy ? (
        <div className="w-3/4 px-2">
          <Progress value={progress} className="h-1.5" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 px-2">
          <Upload className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted leading-tight">
            Drop or click
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={acceptedTypes.join(',')}
        onChange={onInputChange}
      />
    </div>
  );
}

function extOf(name) {
  const m = String(name).match(/\.([a-zA-Z0-9]+)$/);
  return m ? '.' + m[1].toLowerCase() : '';
}

function extOfMime(type) {
  switch (type) {
    case 'image/jpeg': return '.jpg';
    case 'image/png':  return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif':  return '.gif';
    default:           return '';
  }
}
