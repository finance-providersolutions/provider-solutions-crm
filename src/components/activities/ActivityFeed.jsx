import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { ACTIVITY_ICON } from './LogActivityForm';
import { ACTIVITY_TYPES, labelFor } from '@/utils/constants';
import { fmtDateTime, fmtRelative, fmtName } from '@/utils/formatters';

// Renders a vertical activity feed. `activities` is the data from
// useActivities (each row may include joined organization and
// contact). showParent toggles whether to show the org/contact link
// (yes on Home, no on Organization detail).
export default function ActivityFeed({
  activities,
  loading,
  emptyText = 'No activity yet.',
  showParent = false,
  onDelete,
}) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded p-8 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
        Loading…
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <div className="bg-surface border border-border rounded p-8 text-center font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <ol className="bg-surface border border-border rounded divide-y divide-border/40 overflow-hidden">
      {activities.map((a) => {
        const Icon = ACTIVITY_ICON[a.activity_type] ?? ACTIVITY_ICON.note;
        return (
          <li key={a.id} className="p-4 flex items-start gap-3 group">
            <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-3.5 h-3.5 text-accent" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-text">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                  {labelFor(ACTIVITY_TYPES, a.activity_type)}
                </span>
                {a.subject && <span className="font-medium">{a.subject}</span>}
                {showParent && a.organization && (
                  <Link
                    to={`/organizations/${a.organization.id}`}
                    className="text-text-dim hover:text-accent text-sm"
                  >
                    @ {a.organization.name}
                  </Link>
                )}
                {showParent && a.contact && (
                  <span className="text-text-dim text-sm">
                    · {fmtName(a.contact)}
                  </span>
                )}
              </div>
              {a.body && (
                <p className="text-text-dim text-sm mt-1 whitespace-pre-wrap">
                  {a.body}
                </p>
              )}
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
                <span title={fmtDateTime(a.occurred_at)}>{fmtRelative(a.occurred_at)}</span>
              </div>
            </div>

            {onDelete && (
              <button
                onClick={(e) => onDelete(a, e.currentTarget)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger p-1"
                aria-label="Delete activity"
                type="button"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
