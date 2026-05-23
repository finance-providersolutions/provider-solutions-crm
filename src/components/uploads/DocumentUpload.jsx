import { useRef, useState } from 'react';
import { ExternalLink, FileText, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';
import { Progress } from '@/components/ui/progress';
import { getSignedUrl } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Sibling to ImageUpload for the PRIVATE `credentials` bucket
// created in 0004. Shares the drop/browse/progress UX but renders
// the existing document as a compact chip (icon + label + View +
// Remove) instead of an inline <img>, and resolves URLs via
// createSignedUrl on click — getPublicUrl returns nothing for a
// private bucket.
//
// Original filename is not preserved in storage today (path is
// `<parentId>/<uuid>.<ext>`, matching ImageUpload's convention).
// The chip shows a generic "Document.<ext>" label — sufficient for
// 3a's single-doc-per-row model. If multi-doc per row becomes a
// real need, the sibling credential_documents table called out in
// the 0004 review captures filename alongside path.
//
// Props mirror ImageUpload's so the integration into the three
// credentialing form dialogs reads identically:
//
//   bucket        — Storage bucket (required, expected 'credentials')
//   parentId      — UUID used as path prefix (required). Lands at
//                   `<parentId>/<uuid>.<ext>`. For credentialing
//                   rows this is the row's own id so each record
//                   gets its own folder (cascade-friendly).
//   currentPath   — current Storage path (nullable). When set,
//                   renders the doc chip; otherwise the drop zone.
//   onUploaded(p) — called with the new Storage path on success.
//   onRemove?()   — called when the user clicks X.
//   maxSizeMB     — default 10 (PDFs run larger than photos)
//   acceptedTypes — default PDF + JPEG/PNG (scanned docs)
//
// View action: lazy-fetches a fresh 5-minute signed URL on click
// and opens it in a new tab. Lazy rather than eager so a form sitting
// open for 6+ minutes doesn't end up with a stale link in its DOM.

const DEFAULT_ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];

export default function DocumentUpload({
  bucket,
  parentId,
  currentPath,
  onUploaded,
  onRemove,
  maxSizeMB = 10,
  acceptedTypes = DEFAULT_ACCEPTED,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState(0);
  const [opening, setOpening]   = useState(false);

  function pickFile() { inputRef.current?.click(); }

  function onInputChange(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
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
    const tick = setInterval(() => {
      setProgress(p => (p < 90 ? p + 5 : p));
    }, 200);

    const ext = extOf(file.name) || extOfMime(file.type) || '.bin';
    const uuid = crypto.randomUUID();
    const path = `${parentId}/${uuid}${ext}`;

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
      toast.success('Document uploaded');
    } catch (err) {
      console.error('DocumentUpload upload failed', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      clearInterval(tick);
      setTimeout(() => { setBusy(false); setProgress(0); }, 250);
    }
  }

  function handleRemove(e) {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  }

  async function handleView(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentPath || opening) return;
    setOpening(true);
    try {
      const url = await getSignedUrl(bucket, currentPath);
      if (!url) {
        toast.error('Could not load document');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  }

  // 1. Existing document — chip with View + Remove + click-to-replace.
  if (currentPath) {
    return (
      <div className="inline-flex items-center gap-2 max-w-full bg-surface2 border border-border rounded px-3 py-2">
        <FileText className="w-4 h-4 text-text-dim flex-shrink-0" strokeWidth={1.5} />
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-dim truncate">
          Document{extLabel(currentPath)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handleView}
            disabled={busy || opening}
            aria-label="View document"
            title="Open in new tab"
            className="inline-flex items-center gap-1 text-text-dim hover:text-accent disabled:opacity-50 transition-colors font-mono text-[10px] uppercase tracking-[0.1em] px-1"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
            {opening ? 'Opening…' : 'View'}
          </button>
          <button
            type="button"
            onClick={pickFile}
            disabled={busy || opening}
            aria-label="Replace document"
            title="Replace"
            className="text-text-muted hover:text-accent disabled:opacity-50 transition-colors font-mono text-[10px] uppercase tracking-[0.1em] px-1"
          >
            Replace
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy || opening}
              aria-label="Remove document"
              title="Remove"
              className="text-text-muted hover:text-danger disabled:opacity-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {busy && (
          <Progress value={progress} className="w-16 h-1.5 ml-2" />
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

  // 2. Empty — full-width, comfortably tall drop/browse zone with
  //    icon stacked above text. Sized to read as a PDF affordance
  //    rather than an inline form control. Block (not inline-flex)
  //    so it fills the field column on both phone and desktop.
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-6 min-h-[112px] w-full',
        'border-2 border-dashed border-border bg-surface2/40 rounded',
        'cursor-pointer hover:border-accent hover:bg-accent-dim transition-colors',
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
      aria-label="Upload document"
    >
      {busy ? (
        <Progress value={progress} className="h-1.5 w-full max-w-xs" />
      ) : (
        <>
          <Upload className="w-6 h-6 text-text-muted" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted leading-tight text-center">
            Drop a file or click to browse
            <br />
            <span className="text-[9px] tracking-[0.1em]">PDF · JPG · PNG · up to {maxSizeMB} MB</span>
          </span>
        </>
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
    case 'application/pdf': return '.pdf';
    case 'image/jpeg':      return '.jpg';
    case 'image/png':       return '.png';
    default:                return '';
  }
}

// Tail of the storage path, e.g. ".pdf" from "uuid/uuid.pdf".
// Returns '' when there's no recognizable extension so the chip
// reads "Document" cleanly rather than "Document." trailing dot.
function extLabel(path) {
  const m = String(path).match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : '';
}
