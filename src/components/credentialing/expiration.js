// Shared expiration helpers for the three credentialing sections on
// the provider detail page (and the cross-provider expiration view
// added next). Three siblings consuming the same logic earns the
// extraction (per BUILD_PLAN §8).
//
// Date math is intentionally calendar-day based (string compare on
// YYYY-MM-DD), not millisecond-based — matches how the task
// overdue rule works elsewhere in the app and avoids timezone
// surprises when the user is in one timezone and the date column
// was entered from another.

// 90-day "expiring soon" predicate for facility-privilege rows.
// Shared across SuggestedProviders, HospitalPrivilegeRoster, and
// ProviderPlacementsSection — the third consumer triggered the lift
// out of two near-identical inline copies. Returns true when the
// privilege has a future expiration_date within 90 days inclusive.
export function privilegeIsExpiringSoon(row) {
  const d = daysUntil(row?.expiration_date);
  return d != null && d >= 0 && d <= 90;
}

// Whole calendar days from today to the given YYYY-MM-DD date.
// Negative = already expired; 0 = today; positive = future.
// Returns null when input is missing.
export function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Tailwind text-color utility for an expiration date based on how
// close it is. Buckets match the 30/60/90 day windows the
// credentialing dashboard uses:
//   - expired (days < 0)        → danger (red)
//   - within 30 days            → danger (red)
//   - 31-60 days                → warning (amber)
//   - 61-90 days                → text-dim (advisory)
//   - more than 90 days / null  → text-dim (neutral)
//
// Returning a single utility class keeps call sites trivial:
// `<span className={cn(base, expirationToneClass(date))}>…</span>`.
export function expirationToneClass(date) {
  const days = daysUntil(date);
  if (days == null)        return 'text-text-dim';
  if (days < 0)            return 'text-danger';
  if (days <= 30)          return 'text-danger';
  if (days <= 60)          return 'text-warning';
  return 'text-text-dim';
}

// Compact short-form label for an expiration relative to today.
// Used as a sub-line under the formatted date in list rows.
//   - null  → '—'
//   - past  → 'Expired'
//   - today → 'Today'
//   - <30d  → 'In Nd'
//   - else  → null (caller hides the sub-line; no advisory needed)
export function expirationShortNote(date) {
  const days = daysUntil(date);
  if (days == null) return '—';
  if (days < 0)     return 'Expired';
  if (days === 0)   return 'Today';
  if (days <= 30)   return `In ${days}d`;
  return null;
}

// Bucket key for the cross-provider expiration dashboard. Returns
// one of '30', '60', '90', 'past', or null (more than 90 days out
// or no date). Mirrors the dashboard's tab/section model so the
// roll-up can groupBy this directly.
export function expirationBucket(date) {
  const days = daysUntil(date);
  if (days == null) return null;
  if (days < 0)     return 'past';
  if (days <= 30)   return '30';
  if (days <= 60)   return '60';
  if (days <= 90)   return '90';
  return null;
}

// ─── Computed credentialing status ──────────────────────────────
//
// Status across all three credentialing tables is DISPLAY-ONLY
// and derived from the row's dates at render time. The forms no
// longer expose a lifecycle status picker; the DB column persists
// to satisfy NOT NULL and is kept in sync as a derived value.
//
// Precedence (first match wins):
//   1. storedStatus is a TERMINAL outcome listed in
//      `terminalStatuses` (privileges only — 'denied', 'withdrawn')
//      → return that stored value unchanged. Terminal outcomes
//      cannot be derived from dates and must override the date
//      computation: a privilege the hospital denied must never
//      render as Pending or Active just because dates are set.
//   2. expirationDate is set AND in the past   → 'expired'
//   3. grantingDate present                    → 'active'
//   4. applicationDate present                 → 'applied'
//   5. otherwise                               → 'pending'
//
// Per section the granting date is named differently:
//   - licenses, credentials       → issue_date is the granting date
//   - facility_privileges         → approval_date is the granting date
// Callers pass the appropriate column under `grantingDate`.
//
// Returns one of: 'expired' | 'active' | 'applied' | 'pending'
// (lifecycle, all three sections) plus 'denied' | 'withdrawn'
// (terminal, privileges only). Use the companion
// derivedStatusLabel + derivedStatusToneClass helpers for display.
export function deriveCredentialingStatus({
  applicationDate,
  grantingDate,
  expirationDate,
  storedStatus,
  terminalStatuses,
}) {
  if (storedStatus && terminalStatuses && terminalStatuses.includes(storedStatus)) {
    return storedStatus;
  }
  if (expirationDate) {
    const days = daysUntil(expirationDate);
    if (days != null && days < 0) return 'expired';
  }
  if (grantingDate)    return 'active';
  if (applicationDate) return 'applied';
  return 'pending';
}

// Tailwind class strings for the computed status values. Lifecycle
// values mirror the rest of the app's palette: expired → danger,
// active → income green, applied → neutral muted (acknowledged but
// not yet decided), pending → warning amber (needs attention).
// Terminal outcomes (privileges): denied → danger (hospital said
// no), withdrawn → muted (provider's own decision, neutral) —
// same split as Declined vs Disqualified on providers.
const DERIVED_STATUS_BADGE = {
  expired:   'bg-danger/15  text-danger    border-danger/40',
  active:    'bg-income/15  text-income    border-income/40',
  applied:   'bg-surface2   text-text-dim  border-border',
  pending:   'bg-warning/15 text-warning   border-warning/40',
  denied:    'bg-danger/15  text-danger    border-danger/40',
  withdrawn: 'bg-surface2   text-text-dim  border-border',
};

const DERIVED_STATUS_LABEL = {
  expired:   'Expired',
  active:    'Active',
  applied:   'Applied',
  pending:   'Pending',
  denied:    'Denied',
  withdrawn: 'Withdrawn',
};

export function derivedStatusToneClass(status) {
  return DERIVED_STATUS_BADGE[status] ?? DERIVED_STATUS_BADGE.pending;
}

export function derivedStatusLabel(status) {
  return DERIVED_STATUS_LABEL[status] ?? 'Pending';
}

// Terminal-outcome list for privileges. Exposed as a constant so
// section components and form dialogs share one source of truth
// instead of literally listing ['denied', 'withdrawn'] in three
// places.
export const PRIVILEGE_TERMINAL_STATUSES = ['denied', 'withdrawn'];

// On INSERT, the schema's NOT NULL CHECK on `status` forces us to
// write a non-null value. The CHECK allows 'active', 'pending',
// 'expired' on licenses+credentials and additionally 'denied',
// 'withdrawn' on privileges — but it does NOT allow 'applied'.
// Map the computed display value to a CHECK-allowed insert value
// here. Used by the form dialogs' create path only; UPDATE omits
// status entirely so legacy denied/withdrawn rows on privileges
// are preserved (only the explicit kebab "Mark denied / Mark
// withdrawn / Clear outcome" actions ever write status on update).
export function statusForInsert(derived) {
  if (derived === 'applied') return 'pending';
  return derived; // 'active' | 'pending' | 'expired' | 'denied' | 'withdrawn'
}
