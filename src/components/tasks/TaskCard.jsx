import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CardKebab } from '@/components/ui/card-kebab';
import { TASK_PRIORITIES, TASK_STATUSES, labelFor } from '@/utils/constants';
import { fmtDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// Shared task card extracted from Tasks.jsx for reuse by TasksSection
// (the detail-page consumer). Two-layout responsive shape, no logo
// slot. Same asymmetric vertical rhythm pattern as Opportunities
// cards (negative top margin on the font-display title, leading-none
// compensations).
//
// `hideParent` collapses the parent block — mobile rows 3a/3b/3c and
// the wide-layout left cluster (`basis-1/3`) disappear, leaving only
// the priority + title + due/status content. Used by TasksSection on
// detail pages where the parent IS the page. /tasks consumes with
// hideParent={false} to keep the parent context visible.
//
// Per-card affordances:
//   - quick-complete checkbox (open tabs only), 36×36 hit area
//   - kebab → Edit / Delete (list-context, dialog Delete remains)
//   - whole card → onOpen() — typically /tasks/:id detail page

const PRIORITY_TEXT = {
  low:    'text-text-muted',
  normal: 'text-text-dim',
  high:   'text-warning',
};

const STATUS_BADGE = {
  open:      'bg-accent-dim text-accent      border-accent/40',
  completed: 'bg-income/15  text-income      border-income/40',
  cancelled: 'bg-surface2   text-text-muted  border-border',
};

export default function TaskCard({
  task: t,
  showQuickComplete,
  hideParent = false,
  onOpen,
  onEdit,
  onDelete,
  onQuickComplete,
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const overdue = t.status === 'open' && t.due_date && t.due_date < today;
  const parent = hideParent ? null : parentInfo(t);

  const priorityNode = t.priority ? (
    <span className={cn(
      'font-mono text-[11px] uppercase tracking-[0.12em]',
      PRIORITY_TEXT[t.priority] || 'text-text-dim',
    )}>
      {labelFor(TASK_PRIORITIES, t.priority)} priority
    </span>
  ) : null;

  const statusBadge = t.status ? (
    <Badge variant="outline" className={cn('flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]', STATUS_BADGE[t.status])}>
      {labelFor(TASK_STATUSES, t.status)}
    </Badge>
  ) : null;

  const dueText = t.due_date ? fmtDate(t.due_date) : null;
  const dueClass = overdue
    ? 'text-danger font-medium'
    : t.status === 'completed'
      ? 'text-text-muted'
      : 'text-text-dim';

  const actionsCluster = (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {showQuickComplete && (
        <QuickCompleteButton onClick={onQuickComplete} />
      )}
      <CardKebab ariaLabel="Task actions" onEdit={onEdit} onDelete={onDelete} />
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="relative bg-surface border border-border rounded p-3 md:p-5 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex flex-col">
        {/* Row 1 — priority mono text + quick-complete + kebab */}
        <div className="flex items-center gap-2 min-w-0">
          <p className="flex-1 min-w-0 leading-none truncate">
            {priorityNode || <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">—</span>}
          </p>
          {actionsCluster}
        </div>
        {/* Row 2 — title (accent teal, primary). Negative top margin
            compensates for DM Serif Display's intrinsic line-box
            padding above the cap-height (matches Opportunities). */}
        <h3 className="-mt-1 font-display text-[18px] text-accent leading-none break-words">
          {t.title || '—'}
        </h3>
        {/* Row 3 — parent block. Suppressed when hideParent (the
            detail-page consumer doesn't need this — the page IS the
            parent). Three sub-rows: type label / name / "at {hospital}"
            for opportunity parents. mt-3 creates the disproportionate
            title-to-parent break. */}
        {parent && (
          <div className="mt-3 min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted leading-none truncate">
              {parent.type}
            </p>
            <p className="mt-1 text-text text-[15px] font-medium leading-none truncate">
              {parent.name}
            </p>
            {parent.hospital && (
              <p className="mt-1 font-mono text-[11px] text-text-dim leading-none truncate">
                at {parent.hospital}
              </p>
            )}
          </div>
        )}
        {/* No-parent fallback rendered ONLY when not hidden (a missing
            parent on the global /tasks page is meaningful; on a detail
            page it can't happen — the parent is locked). */}
        {!parent && !hideParent && (
          <div className="mt-3 min-w-0">
            <p className="text-text-muted text-[14px] italic leading-none">
              — No parent
            </p>
          </div>
        )}
        {/* Row 4 — due date + status badge. When the parent block is
            hidden, this row sits closer to the title (mt-3 instead of
            mt-1) so the card doesn't read collapsed. */}
        <div className={cn(
          'flex items-center gap-2 min-w-0',
          hideParent ? 'mt-3' : 'mt-1',
        )}>
          <p className={cn('flex-1 min-w-0 font-mono text-[13px] leading-none truncate', dueClass)}>
            {dueText ? (overdue ? `Due ${dueText} · Overdue` : `Due ${dueText}`) : 'No due date'}
          </p>
          {statusBadge}
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-center gap-5">
        {/* Left cluster — parent. Suppressed when hideParent so the
            center cluster reclaims the space. Same three-line shape as
            the mobile parent block. */}
        {parent && (
          <div className="min-w-0 basis-1/3 flex flex-col gap-0.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted leading-snug truncate">
              {parent.type}
            </p>
            <p className="text-text text-[16px] lg:text-[17px] font-medium leading-tight truncate">
              {parent.name}
            </p>
            {parent.hospital && (
              <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-snug truncate">
                at {parent.hospital}
              </p>
            )}
          </div>
        )}
        {!parent && !hideParent && (
          <div className="min-w-0 basis-1/3">
            <p className="text-text-muted text-[15px] italic leading-snug">
              — No parent
            </p>
          </div>
        )}

        {/* Center cluster — priority mono text + title. Takes flex-1.
            With the parent column gone (hideParent), this naturally
            expands across the freed space. */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {priorityNode && (
            <p className="leading-snug truncate">{priorityNode}</p>
          )}
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {t.title || '—'}
          </h3>
        </div>

        {/* Right indicator cluster — actions on top, due + status below */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {actionsCluster}
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[12px]', dueClass)}>
              {dueText ? (overdue ? `Due ${dueText} · Overdue` : `Due ${dueText}`) : 'No due date'}
            </span>
            {statusBadge}
          </div>
        </div>
      </div>
    </div>
  );
}

// 36×36 hit area to match the chrome-strip floor inherited from
// Slice 1. The visible check tile inside is 28×28, but the button
// itself fills the larger box so thumb taps on phones reliably hit
// it. Stops propagation so the card's onClick doesn't fire under
// the tap.
function QuickCompleteButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="Mark complete"
      className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded text-text-muted hover:text-income hover:bg-income/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-income"
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded border border-border">
        <Check className="w-4 h-4" strokeWidth={2.5} />
      </span>
    </button>
  );
}

export function parentInfo(task) {
  if (task.opportunity) {
    const name = task.opportunity.title || task.opportunity.name || 'Untitled';
    // hospital surfaces only when the parent is an opportunity —
    // organization parents ARE the hospital, provider parents have
    // no hospital concept.
    const hospital = task.opportunity.organization?.name || null;
    return { type: 'OPPORTUNITY', name, hospital, href: `/opportunities/${task.opportunity.id}` };
  }
  if (task.organization) {
    return { type: 'ORGANIZATION', name: task.organization.name, hospital: null, href: `/organizations/${task.organization.id}` };
  }
  if (task.provider) {
    const name = [task.provider.first_name, task.provider.last_name].filter(Boolean).join(' ') || 'Unnamed';
    return { type: 'PROVIDER', name, hospital: null, href: `/providers/${task.provider.id}` };
  }
  return null;
}
