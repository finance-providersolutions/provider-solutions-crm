import { Archive, ArchiveRestore } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CardKebab } from '@/components/ui/card-kebab';
import Thumb from '@/components/uploads/Thumb';
import {
  POSITION_TYPES, PROVIDER_STATUSES, labelFor, specialtyAbbrFor,
} from '@/utils/constants';
import { fmtName } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { STATUS_BADGE, STATUS_BADGE_FALLBACK } from '@/components/providers/statusBadge';
import { cn } from '@/lib/utils';

// Shared provider card. One source of truth for the Providers list,
// the Funnel view, and any future cross-cutting view (matching,
// reconciliation, etc.). Behaviour is shaped by props rather than
// per-page forks.
//
// Required props:
//   - provider     — the row
//   - onClick      — whole-card tap (typically navigates to detail)
//   - taskSummary  — { count, hasOverdue } | undefined; pill hidden
//                    when count is 0 or summary absent
//
// Optional props:
//   - onEdit / onArchiveToggle / onDelete — kebab affordances. If
//     none are provided, the kebab is not rendered at all (read/
//     navigate-only contexts like the Funnel).
//   - showStatus   — default true. Pass false to hide the pipeline-
//     status badge (redundant inside a stage-grouped view).
//
// Layout: stacked on mobile (thumb left, 3-row meta block), single
// horizontal row at md+. The mobile row 1 is intentionally NOT
// pulled up with a negative margin (an earlier `-mt-1` caused the
// H3 line-box to overlap the position line above when the row had
// no right-side element to push its height up — bug observed on
// the Funnel page and present at lower visibility on Providers).
export default function ProviderCard({
  provider: p,
  taskSummary,
  onClick,
  onEdit,
  onArchiveToggle,
  onDelete,
  showStatus = true,
}) {
  const name = fmtName(p);
  const location = [p.home_city, p.home_state].filter(Boolean).join(', ');
  const positionSpec = [
    p.position_type ? labelFor(POSITION_TYPES, p.position_type) : null,
    p.specialty ? specialtyAbbrFor(p.specialty) : null,
  ].filter(Boolean).join(' · ');

  // Tasks-count pill — Opportunities-card pattern, with the word
  // "task" / "tasks" now visible at every width. The overlap fix
  // and status-badge removal on Funnel cards freed enough row-1
  // space that the digit alone is unnecessarily terse. Numeral
  // accent teal normally; switches to danger red with medium
  // weight when at least one linked open task is overdue.
  const tasksBadge = taskSummary?.count > 0 ? (
    <span className="inline-flex items-center justify-center h-6 px-2 border border-border rounded-full font-mono text-[11px] leading-none whitespace-nowrap">
      <span className={cn(taskSummary.hasOverdue ? 'text-danger font-medium' : 'text-accent')}>
        {taskSummary.count}
      </span>
      <span className="ml-1 text-text-dim">
        task{taskSummary.count === 1 ? '' : 's'}
      </span>
    </span>
  ) : null;

  const statusBadge = (showStatus && p.status) ? (
    <Badge variant="outline" className={cn(
      'flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]',
      STATUS_BADGE[p.status] ?? STATUS_BADGE_FALLBACK,
    )}>
      {labelFor(PROVIDER_STATUSES, p.status)}
    </Badge>
  ) : null;

  // Kebab only renders when a consumer needs at least one action.
  // Funnel passes none → no kebab, no row-1 right-side cluster.
  const showKebab = Boolean(onEdit || onArchiveToggle || onDelete);

  const kebabExtras = onArchiveToggle ? [
    {
      label: p.archived ? 'Unarchive' : 'Archive',
      icon: p.archived ? ArchiveRestore : Archive,
      onSelect: onArchiveToggle,
    },
  ] : [];

  const rightTopCluster = (tasksBadge || showKebab) ? (
    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
      {tasksBadge}
      {showKebab && (
        <CardKebab
          ariaLabel="Provider actions"
          onEdit={onEdit}
          onDelete={onDelete}
          extraItems={kebabExtras}
        />
      )}
    </div>
  ) : null;

  // Wide-layout right cluster reserves vertical room only when there
  // is something to put in each row of it. When showStatus is false
  // AND the card has no kebab/task pill, the cluster is omitted
  // entirely so the content cluster gets full width.
  const wideRightCluster = (rightTopCluster || statusBadge) ? (
    <div className="flex-shrink-0 flex flex-col justify-between items-end gap-2">
      {rightTopCluster || <span aria-hidden className="h-6" />}
      {statusBadge}
    </div>
  ) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'relative bg-surface border border-border rounded p-3 md:px-5 md:py-3 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none',
        p.archived && 'opacity-50',
      )}
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex items-center gap-3">
        <Thumb
          path={p.photo_path}
          bucket="provider-photos"
          alt={name}
          fallback={initialsFor(p)}
          size="lg"
          shape="circle"
          className="h-20 w-20 text-base flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1 — position · specialty + tasks pill + kebab. */}
          <div className="flex items-center gap-2 min-w-0 min-h-[24px]">
            <p className="flex-1 min-w-0 font-mono text-[11px] tracking-tight text-text leading-none truncate">
              {positionSpec || ''}
            </p>
            {rightTopCluster}
          </div>
          {/* Row 2 — provider name (primary). No negative margin —
              the prior `-mt-1` caused 4px overlap with row 1's box
              when row 1 had no right-side element to push its
              height up. Tight gap-1 on the parent column gives
              visual proximity without overlapping line-boxes. */}
          <h3 className="font-display text-[18px] text-accent leading-none truncate">
            {name}
          </h3>
          {/* Row 3 — city, ST + status badge. mt-2 creates the
              dominant name-to-context break. */}
          <div className="mt-2 flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 font-mono text-[12px] text-text-dim leading-none truncate">
              {location || ''}
            </p>
            {statusBadge}
          </div>
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      <div className="hidden md:flex items-stretch gap-5">
        <div className="flex-shrink-0 flex items-center">
          <Thumb
            path={p.photo_path}
            bucket="provider-photos"
            alt={name}
            fallback={initialsFor(p)}
            size="md"
            shape="circle"
            className="h-12 w-12 lg:h-14 lg:w-14 text-sm"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          {positionSpec && (
            <p className="font-mono text-[12px] text-text leading-none truncate">
              {positionSpec}
            </p>
          )}
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {name}
          </h3>
          <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-none truncate">
            {location || <span className="text-text-muted">—</span>}
          </p>
        </div>

        {wideRightCluster}
      </div>
    </div>
  );
}
