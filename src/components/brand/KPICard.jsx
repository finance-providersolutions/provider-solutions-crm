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
        'flex flex-col justify-center items-center text-center',
        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40',
        drillable && 'cursor-pointer hover:border-accent hover:bg-surface2 group',
      )}
    >
      {drillable && (
        <span className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
          View Detail ↗
        </span>
      )}
      {/* Per-slot min-heights sized to 1 line so short content sits
          tight with no reserved empty row. Slots grow to 2 lines when
          content genuinely wraps. Cross-card height equality comes
          from the grid: align-items defaults to stretch, so when any
          card in a row grows, the others stretch to match its height,
          and justify-center on the card vertically centers their
          (shorter) content within that extra space. Min-heights derive
          from font-size × leading: label = 11px × 1.4, value = 30px
          (leading-none), sub = 12px × 1.5. */}
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text mb-2.5 leading-[1.4] min-h-[16px]">
        {label}
      </div>
      <div
        className={cn(
          'font-sans font-bold tracking-[-0.02em] leading-none mb-1.5 min-h-[30px]',
          loading ? 'text-2xl' : 'text-[30px]',
          valueColor,
        )}
      >
        {loading ? '—' : (value ?? '—')}
      </div>
      <div className="font-mono text-xs text-text-dim min-h-[18px]">
        {sub}
      </div>
    </div>
  );
}
