// Provider pipeline-status badge palette. Single source of truth
// for the badge tone shared across Providers list, the Funnel view,
// and the Provider detail header. Target = pre-engagement (muted);
// in-funnel stages = accent; active = the only income/green; both
// inactive and declined = muted (declined isn't a "failure" — they
// walked); disqualified is the only danger tone (we screened them
// out). Same shape and tokens as Organizations.jsx TYPE_BADGE.
export const STATUS_BADGE = {
  target:       'bg-surface2   text-text-muted border-border',
  lead:         'bg-accent-dim text-accent border-accent/40',
  contacted:    'bg-accent-dim text-accent border-accent/40',
  interested:   'bg-accent-dim text-accent border-accent/40',
  interviewing: 'bg-accent-dim text-accent border-accent/40',
  onboarding:   'bg-accent-dim text-accent border-accent/40',
  active:       'bg-income/15  text-income border-income/40',
  inactive:     'bg-surface2   text-text-dim border-border',
  declined:     'bg-surface2   text-text-dim border-border',
  disqualified: 'bg-danger/15  text-danger border-danger/40',
};

// Safety net for any status value not present in STATUS_BADGE —
// covers legacy 'credentialed' rows still grandfathered by 0005's
// NOT VALID constraint, and future schema drift if a new status is
// added without a matching badge entry.
export const STATUS_BADGE_FALLBACK = 'bg-surface2 text-text-muted border-border';
