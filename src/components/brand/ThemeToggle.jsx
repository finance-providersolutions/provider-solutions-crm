import { Settings as SettingsIcon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
      className="flex items-center gap-3 px-6 py-[14px] font-sans text-[13px] cursor-pointer text-text-dim transition-colors border-b border-surface2 hover:text-accent hover:bg-accent-dim"
    >
      <SettingsIcon className="w-[15px] h-[15px] flex-shrink-0 opacity-60" strokeWidth={1.5} />
      <span className="flex-1">Theme</span>

      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex items-center w-[34px] h-[18px] rounded-[9px] border transition-all flex-shrink-0',
          isDark ? 'bg-accent-dim border-accent' : 'bg-surface2 border-border',
        )}
      >
        <span
          className={cn(
            'absolute w-3 h-3 rounded-full transition-all',
            isDark ? 'left-[18px] bg-accent' : 'left-0.5 bg-text-muted',
          )}
        />
      </span>
      <span className="font-mono text-[10px] text-text-muted min-w-[28px]">
        {isDark ? 'Dark' : 'Light'}
      </span>
    </div>
  );
}
