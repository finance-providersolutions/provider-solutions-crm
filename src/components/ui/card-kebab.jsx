import { useRef } from 'react';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// CRM-only wrapper around shadcn's DropdownMenu that standardizes
// the per-card / per-row actions affordance introduced in Slice 3
// (Opportunities cards) and reused across Slice 4 (Tasks, Contacts,
// Providers, Organizations cards plus the Organization-detail
// embedded contact rows).
//
// The trigger button stops both click and keydown propagation so the
// surrounding card (or row) — which often has its own onClick that
// navigates to a detail page — doesn't fire under a kebab tap.
// The dropdown content stops click propagation for the same reason.
//
// Delete is wired to fire onDelete(triggerEl); the caller passes
// that element on to ConfirmDeleteDialog's triggerRef so focus
// restores correctly on cancel.
//
// Order is fixed: Edit → [extraItems in order] → Delete. The
// destructive Delete item always renders LAST regardless of what
// extraItems contains; this keeps the destructive action visually
// anchored and prevents per-page deviations from drifting it. Use
// extraItems for lifecycle actions that sit between primary and
// destructive (e.g., Archive/Unarchive on Providers).
//
// extraItems shape: [{ label, icon, onSelect, destructive? }].
// `icon` is a lucide-react component (passed through to render
// inline at w-4 h-4 mr-2). `destructive: true` styles the row in
// danger color — reserved for irreversible operations other than
// the bottom-anchored Delete; archive/unarchive should NOT be
// marked destructive.
export function CardKebab({ ariaLabel = 'Actions', onEdit, onDelete, extraItems = [] }) {
  const triggerRef = useRef(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={ariaLabel}
          className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded text-text-dim hover:text-accent hover:bg-accent-dim transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <MoreVertical className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-border"
      >
        <DropdownMenuItem
          onSelect={() => onEdit?.()}
          className="cursor-pointer focus:bg-accent-dim focus:text-accent"
        >
          <Pencil className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Edit
        </DropdownMenuItem>
        {extraItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={`${item.label}-${idx}`}
              onSelect={() => item.onSelect?.()}
              className={cn(
                'cursor-pointer',
                item.destructive
                  ? 'text-danger focus:bg-danger/15 focus:text-danger'
                  : 'focus:bg-accent-dim focus:text-accent',
              )}
            >
              {Icon && <Icon className="w-4 h-4 mr-2" strokeWidth={1.5} />}
              {item.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem
          onSelect={() => onDelete?.(triggerRef.current)}
          className="cursor-pointer text-danger focus:bg-danger/15 focus:text-danger"
        >
          <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
