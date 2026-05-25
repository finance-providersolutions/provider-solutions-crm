import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// One-off collapsible header for a detail page's top-level "Details"
// block. Visually echoes the suite-wide SectionHeader (mono cap accent
// text, gradient rule) but is a single button with a chevron that
// rotates between open (-90deg → pointing right when closed; 0deg →
// pointing down when open) so the collapsibility is obvious without a
// separate "Show / Hide" affordance.
//
// NOT a generic accordion primitive — this is the canonical Details
// header shape used at the top of Provider and Organization detail
// pages. Labeled sub-collapsibles inside a section (Onboarding /
// Credentialing / Provider Availability tiers) use the smaller shared
// CollapsibleSection in src/components/ui/collapsible-section.jsx.

export function DetailsCollapsibleHeader({ open, onToggle, label = 'Details' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full mt-0 mb-6 flex items-center gap-3 text-left group focus-visible:outline-none"
    >
      <ChevronDown
        className={cn(
          'w-4 h-4 text-accent opacity-75 transition-transform flex-shrink-0',
          !open && '-rotate-90',
        )}
        strokeWidth={1.5}
      />
      <span className="font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-accent opacity-90 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px opacity-45 bg-gradient-to-r from-accent to-transparent" />
    </button>
  );
}
