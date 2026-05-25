import { cn } from '@/lib/utils';

const VALUE_COLOR = {
  default: 'text-accent-bright',
  green:   'text-income',
  red:     'text-danger',
  blue:    'text-gp',
  white:   'text-text',
};

// Compact tier-count sibling of KPICard. Designed for 4-across at
// 380px wide (the opportunity Provider Availability tiers) and 2- or
// 3-across (the org Privilege Roster tiers). Same visual grammar as
// KPICard — bg + border + bottom gradient rule, mono cap label on
// top, large value below, centered — but quarter the footprint (no
// sub slot, tighter padding, smaller fonts) and accepts onClick + a
// `focused` state for accordion-driven section reveal.
//
// `focused` indicates this card drove the current open state — set
// either by an explicit card click or as the default-open tier on
// first load. It earns the FORWARD/raised treatment (bg-surface + a
// teal accent border + inset ring + brightened label) so the user
// can tell "this is the tier the page is focused on" at a glance. A
// section opened only via its CollapsibleSection chevron does NOT
// light its card — multi-open via chevrons is a different mode and
// clears card focus deliberately, leaving ALL cards in the receded
// state.
//
// Elevation against the parent dark-well container (bg-surface-well,
// the B-convention Level-1 container shade):
//   • FOCUSED   → bg-surface (record shade) — pops forward above the well.
//   • UNFOCUSED → bg-surface-well (same fill as the parent) — recedes
//     into the well, with the soft teal-alpha border outlining each
//     card as a tappable slot. When NO card is focused (after Expand
//     All or chevron-driven multi-open), all four cards read receded
//     and read as "available, none picked." Previously used
//     bg-surface2 here, which against the dark well visually inverted
//     the elevation (unfocused cards popped, focused recessed).
export function TierKPICard({
  label,
  value,
  color = 'default',
  focused = false,
  disabled = false,
  onClick,
}) {
  const valueColor = (disabled
    ? 'text-text-muted'
    : (VALUE_COLOR[color] ?? VALUE_COLOR.default));
  const clickable = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-pressed={clickable ? focused : undefined}
      className={cn(
        'relative border rounded px-1.5 py-2 transition-colors',
        'flex flex-col justify-center items-center text-center',
        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-30',
        focused
          ? 'bg-surface border-accent shadow-[inset_0_0_0_1px_rgba(126,232,232,0.35)]'
          : 'bg-surface-well border-border/60',
        clickable && !focused && 'hover:border-accent/60 cursor-pointer',
        !clickable && 'cursor-default',
      )}
    >
      <div className={cn(
        'font-mono text-[9px] font-bold uppercase tracking-[0.12em] leading-tight',
        focused ? 'text-accent' : 'text-text-dim',
      )}>
        {label}
      </div>
      <div className={cn(
        'font-sans font-bold tracking-[-0.02em] leading-none mt-1 text-lg tabular-nums',
        valueColor,
      )}>
        {value ?? '—'}
      </div>
    </button>
  );
}

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
