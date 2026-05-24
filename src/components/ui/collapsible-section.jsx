import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small in-house collapsible — two consumers today (Onboarding,
// Credentialing), not a generic accordion system. Mirrors the
// mechanics of the Details one-off on Provider.jsx (chevron rotates
// between -90° collapsed and 0° expanded, single button toggle,
// default-collapsed) but generalized to take a label and children
// so the two sections can share the toggle line.
//
// Visually quieter than the Details one-off — Details is itself the
// section header on its row; this component sits BELOW the diamond
// SectionHeader and is the section's collapsed-body affordance, so
// the type sits a step smaller and the gradient rule is dimmer.

export function CollapsibleSection({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full mb-4 flex items-center gap-3 text-left group focus-visible:outline-none"
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 text-accent opacity-75 transition-transform flex-shrink-0',
            !open && '-rotate-90',
          )}
          strokeWidth={1.5}
        />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent opacity-90 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {label}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-accent/40 to-transparent" />
      </button>
      {open && children}
    </div>
  );
}
