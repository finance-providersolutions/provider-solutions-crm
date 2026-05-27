import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { REQUIREMENT_ITEMS } from '@/utils/constants';
import { cn } from '@/lib/utils';

// Always-required keys — currently just state license. Rendered as
// checked + disabled in the picker so the user sees it but cannot
// uncheck it; the serializer forces these into the saved array
// regardless of local Set membership. Justification: the matching
// engine's license dimension is silenced when 'license' is absent
// from required_items, but SuggestedProviders' list-level state-
// license filter would still exclude providers without a state-
// license row — verdict text would read 'ready' for license even on
// providers with expired/missing licenses. Pinning closes that
// asymmetry. Drop a key into this Set if a future credential should
// become universal-required app-wide; the picker and serializer both
// honor it without further changes.
const PINNED_KEYS = new Set(['license']);

export default function RequirementsFormDialog({ open, onOpenChange, opportunity, onSave }) {
  const [selected, setSelected] = useState(() => new Set(['license']));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const current = Array.isArray(opportunity?.required_items)
      ? opportunity.required_items
      : [];
    const next = new Set(current);
    for (const k of PINNED_KEYS) next.add(k);
    setSelected(next);
  }, [open, opportunity]);

  function toggle(value) {
    if (PINNED_KEYS.has(value)) return;
    setSelected(s => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Serialize in REQUIREMENT_ITEMS order so the stored array
      // reads predictably regardless of toggle order. Pinned keys
      // are always present, even if local state somehow lost them.
      const serialized = REQUIREMENT_ITEMS
        .map(r => r.value)
        .filter(v => selected.has(v) || PINNED_KEYS.has(v));
      await onSave({ required_items: serialized });
      toast.success('Requirements saved');
      onOpenChange(false);
    } catch (err) {
      console.error('RequirementsFormDialog save failed', err);
      toast.error(err?.message || 'Could not save requirements');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">Requirements</DialogTitle>
          <DialogDescription className="text-text-dim">
            Credentialing items a provider must hold to work this opportunity. Drives readiness on the matching list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <ul className="divide-y divide-border/40 border border-border/40 rounded">
              {REQUIREMENT_ITEMS.map(item => {
                const pinned = PINNED_KEYS.has(item.value);
                const on = pinned || selected.has(item.value);
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      onClick={() => toggle(item.value)}
                      aria-pressed={on}
                      aria-label={pinned ? `${item.label} — always required` : undefined}
                      disabled={pinned}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        pinned ? 'cursor-default' : 'hover:bg-surface2/40',
                      )}
                    >
                      <span className={cn(
                        'w-7 h-7 inline-flex items-center justify-center rounded border transition-colors flex-shrink-0',
                        on
                          ? 'border-income text-income bg-income/10'
                          : 'border-border text-transparent',
                      )}>
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={cn(
                          'block font-mono text-[11px] uppercase tracking-[0.12em]',
                          on ? 'text-text' : 'text-text-dim',
                        )}>
                          {item.label}
                        </span>
                        {pinned && (
                          <span className="block font-mono text-[10px] tracking-[0.06em] text-text-muted mt-0.5 normal-case">
                            Universal — every shift needs state licensure
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex-shrink-0 flex flex-col gap-2 pt-3 mt-4 border-t border-border
                          sm:flex-row sm:items-center sm:justify-end sm:gap-2">
            <Button
              type="button" variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              {submitting ? 'Saving…' : 'Save requirements'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
