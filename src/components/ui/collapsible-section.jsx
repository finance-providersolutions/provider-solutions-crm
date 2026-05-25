import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small in-house collapsible — labeled-sub-group pattern used by
// Onboarding, Credentialing, and the Provider Availability / Privilege
// Roster tier groups. NOT a generic accordion system. Mirrors the
// mechanics of the Details one-off on Provider.jsx (chevron rotates
// between -90° collapsed and 0° expanded, single button toggle,
// default-collapsed) but generalized to take a label and children so
// multiple sections can share the toggle line.
//
// Visually quieter than the Details one-off — Details is itself the
// section header on its row; this component sits BELOW the diamond
// SectionHeader and is the section's collapsed-body affordance, so
// the type sits a step smaller and the gradient rule is dimmer.
//
// Two open-state modes — standard React controlled-or-uncontrolled
// pattern (same shape Radix primitives use):
//   • Uncontrolled (default): pass `defaultOpen`; the component owns
//     its own state via useState. Existing consumers (Onboarding /
//     Credentialing) hit this path unchanged.
//   • Controlled: pass `open` + `onOpenChange`; a parent owns the
//     state. Enables a parent to drive multiple sibling sections in
//     unison — e.g. card-click accordion reset on Provider
//     Availability tiers, where clicking a tier KPI card opens that
//     tier and collapses the others while chevron clicks still toggle
//     each section independently.
// `defaultOpen` is ignored when `open` is provided.

export function CollapsibleSection({ label, defaultOpen = false, open: controlledOpen, onOpenChange, children }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function toggle() {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
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
