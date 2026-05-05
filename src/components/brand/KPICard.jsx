import { cn } from '@/lib/utils';

const VALUE_COLOR = {
  default: 'text-accent-bright',
  green:   'text-income',
  red:     'text-danger',
  blue:    'text-gp',
  white:   'text-text',
};

export default function KPICard({
  label,
  value,
  sub,
  color = 'default',
  loading = false,
  drillable = false,
  onClick,
}) {
  const valueColor = loading ? 'text-text-muted' : (VALUE_COLOR[color] ?? VALUE_COLOR.default);

  return (
    <div
      onClick={drillable && onClick ? onClick : undefined}
      className={cn(
        'relative bg-surface border border-border rounded p-5 transition-colors',
        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40',
        drillable && 'cursor-pointer hover:border-accent hover:bg-surface2 group',
      )}
    >
      {drillable && (
        <span className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
          View Detail ↗
        </span>
      )}
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text mb-2.5 leading-[1.4]">
        {label}
      </div>
      <div
        className={cn(
          'font-sans font-bold tracking-[-0.02em] leading-none mb-1.5',
          loading ? 'text-2xl' : 'text-[30px]',
          valueColor,
        )}
      >
        {loading ? '—' : (value ?? '—')}
      </div>
      {sub && <div className="font-mono text-xs text-text-dim">{sub}</div>}
    </div>
  );
}
