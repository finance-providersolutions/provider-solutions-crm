import { useEffect } from 'react';

// useChromeBottom — set the global `--ps-chrome-bottom` CSS variable that
// the shared Dialog primitive anchors itself below.
//
// Each page that owns fixed chrome above the dialog (list pages with
// bar-2 / bar-3, the provider detail page with its condensed header)
// calls this with its total chrome height in pixels. The hook writes
// `calc(${px}px + env(safe-area-inset-top))` to documentElement so the
// dialog opens cleanly below all of it. Pages that don't call the hook
// inherit the dialog primitive's fallback (the 58px primary header).
//
// The effect re-runs whenever px changes — bar-3 opening on a list page
// (+52), the provider header height shifting as badges wrap — so the
// dialog tracks chrome size live. On unmount the variable is removed so
// the next page starts from the fallback.
export function useChromeBottom(px) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      '--ps-chrome-bottom',
      `calc(${px}px + env(safe-area-inset-top))`,
    );
    return () => {
      root.style.removeProperty('--ps-chrome-bottom');
    };
  }, [px]);
}
