import { daysUntil } from '@/components/credentialing/expiration';
import { fmtDate } from '@/utils/formatters';

// Whether the countdown pill would render for the given date. Used by
// the three credentialing section rows to decide whether to reserve
// extra bottom padding for the mobile-only absolute pill (and so
// nothing-to-show rows don't carry dead space at the bottom).
export function shouldShowExpirationPill(date) {
  const days = daysUntil(date);
  return days != null && days >= 0 && days <= 90;
}

// Just the amber countdown pill, no surrounding "Exp [date]" text.
// Mobile-only render path for the provider-detail credentialing
// section cards: the pill anchors to the card's lower-right corner,
// the date text is hidden because the card's other content already
// localizes the row to a specific license / credential / privilege.
// Same visual language as the inline pill inside ExpirationCluster.
//
// Returns null when the date is missing, in the past, or more than
// 90 days off — so this can be used directly inside `<div md:hidden
// absolute bottom-N right-N>` without an extra outer guard.
export function ExpirationPill({ date }) {
  if (!shouldShowExpirationPill(date)) return null;
  const days = daysUntil(date);
  const label = days === 0 ? 'Today' : `${days}d`;
  return (
    <span className="inline-flex items-center justify-center h-5 px-1.5 min-w-[24px] border border-warning/40 rounded-full font-mono text-[10px] leading-none text-warning bg-warning/15 whitespace-nowrap">
      {label}
    </span>
  );
}

// Shared expiration cluster used by the three credentialing sections
// on the provider detail page AND by the cross-provider expiration
// roll-up at /expirations. Reference shape — keep all four consumers
// in visual sync.
//
// Composition (left → right):
//   [optional amber pill]  Exp [date]
//
// Rules:
//   - status === 'expired' (provider-detail card context): renders
//     nothing. The red "Expired" status badge carries the state in
//     that context, and duplicating the date would be visual noise.
//   - No status passed (roll-up context): always renders the date,
//     including for past dates. The bucket section header carries
//     the urgency context there, and showing the date is useful for
//     scanning ("how long ago did this expire?").
//   - No expiration_date set: muted "No expiry" so a reviewer can
//     distinguish "we don't track expiration on this row" from "we
//     forgot to enter it."
//
// Amber pill (right is wrong — the pill sits to the LEFT of the
// date so the eye lands on the days-remaining first, then the
// calendar date for context):
//   - Shows ONLY when the expiration is approaching: 0 ≤ days ≤ 90.
//     Matches the suite-wide warning window in expirationBucket.
//   - Always amber/warning tone — it only ever means "coming up,"
//     it does not switch colors as the days tick down.
//   - Content: "Today" on day 0, otherwise "Nd" (e.g., "14d").
export default function ExpirationCluster({ date, status }) {
  if (status === 'expired') return null;

  if (!date) {
    return (
      <span className="flex-shrink-0 font-mono text-[11px] leading-none text-text-muted whitespace-nowrap">
        No expiry
      </span>
    );
  }

  const days = daysUntil(date);
  const showPill = days != null && days >= 0 && days <= 90;
  const pillLabel = days === 0 ? 'Today' : `${days}d`;

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap">
      {showPill && (
        <span className="inline-flex items-center justify-center h-5 px-1.5 min-w-[24px] border border-warning/40 rounded-full font-mono text-[10px] leading-none text-warning bg-warning/15">
          {pillLabel}
        </span>
      )}
      <span className="font-mono text-[11px] leading-none text-text-dim">
        Exp {fmtDate(date)}
      </span>
    </div>
  );
}
