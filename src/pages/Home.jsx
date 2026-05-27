import { useEffect, useState } from 'react';
import HomeV1 from '@/pages/home/HomeV1';
import HomeV2 from '@/pages/home/HomeV2';
import HomeV3 from '@/pages/home/HomeV3';
import HomeV4 from '@/pages/home/HomeV4';
import HomeV5 from '@/pages/home/HomeV5';
import HomeV6 from '@/pages/home/HomeV6';
import { cn } from '@/lib/utils';

// Comparison wrapper for the matching-engine Home design exploration.
// Renders a small 3-button segmented control at the top, persists the
// chosen variant to localStorage (ps-crm-home-variant), and mounts
// the corresponding variant component. Each variant owns its own
// hook calls and section composition.
//
// V1 = baseline (open-opp scoped matching engine)
// V2 = adds filled-opp retention incorporation
// V3 = most evolved — top KPI row + new state-match-map visualization
//
// This wrapper is a temporary comparison shell, not the long-term
// home page. Once a direction is chosen, the wrapper collapses to a
// direct render of the winning variant.

const VARIANTS = [
  { key: 'v1', label: 'V1 · baseline'    },
  { key: 'v2', label: 'V2 · retention'   },
  { key: 'v3', label: 'V3 · evolved'     },
  { key: 'v4', label: 'V4 · synthesis'   },
  { key: 'v5', label: 'V5 · financial'   },
  { key: 'v6', label: 'V6 · attention'   },
];

const STORAGE_KEY = 'ps-crm-home-variant';

function readStoredVariant() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VARIANTS.find(x => x.key === v)?.key ?? 'v1';
  } catch {
    return 'v1';
  }
}

export default function Home() {
  const [variant, setVariant] = useState(readStoredVariant);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, variant); } catch { /* ignore */ }
  }, [variant]);

  const Body = variant === 'v6' ? HomeV6
             : variant === 'v5' ? HomeV5
             : variant === 'v4' ? HomeV4
             : variant === 'v3' ? HomeV3
             : variant === 'v2' ? HomeV2
             : HomeV1;

  return (
    <div className="min-h-full pb-12 px-4 sm:px-6" style={{ paddingTop: 'calc(58px + env(safe-area-inset-top))' }}>
      <div className="max-w-6xl mx-auto py-6">
        {/* Variant toggle — sticky-ish at the page top, compact. */}
        <div className="mb-6 flex items-center justify-center">
          <div
            role="tablist"
            aria-label="Home variant"
            className="inline-flex rounded border border-border bg-surface p-1 gap-1"
          >
            {VARIANTS.map(v => {
              const active = v.key === variant;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setVariant(v.key)}
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded transition-colors',
                    active
                      ? 'bg-accent-dim text-accent border border-accent/60'
                      : 'text-text-dim border border-transparent hover:text-accent hover:bg-surface2',
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        <Body />
      </div>
    </div>
  );
}
