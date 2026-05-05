import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Building2, Users, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';
import { cn } from '@/lib/utils';

const ITEMS = [
  { path: '/',              label: 'Home',          icon: Home      },
  { path: '/organizations', label: 'Organizations', icon: Building2 },
  { path: '/contacts',      label: 'Contacts',      icon: Users     },
];

export default function Navigation({ onSignOut }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const close = () => setOpen(false);
  const go = (path) => { close(); navigate(path); };

  const isActive = (path) => (
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Navigation"
        className="flex flex-col justify-center gap-[5px] w-9 h-9 bg-surface border border-border rounded px-[7px] py-2 cursor-pointer flex-shrink-0 transition-colors hover:border-accent hover:bg-accent-dim group"
      >
        <span className="block w-full h-[1.5px] rounded-[2px] bg-text-dim transition-colors group-hover:bg-accent" />
        <span className="block w-full h-[1.5px] rounded-[2px] bg-text-dim transition-colors group-hover:bg-accent" />
        <span className="block w-full h-[1.5px] rounded-[2px] bg-text-dim transition-colors group-hover:bg-accent" />
      </button>

      {createPortal(
        <>
          <div
            className={cn(
              'fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm transition-opacity',
              open ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            onClick={close}
          />

          <nav
            className="fixed top-0 h-full w-[280px] z-[400] flex flex-col pt-[58px] border-l border-border bg-surface transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ right: open ? 0 : -280 }}
          >
            <DrawerHeader onClose={close}>Navigation</DrawerHeader>

            {ITEMS.map(({ path, label, icon: Icon }) => (
              <button
                key={path}
                type="button"
                onClick={() => go(path)}
                className={cn(
                  'flex items-center gap-3 px-6 py-[14px] font-sans text-[13px] cursor-pointer text-left transition-colors border-b border-surface2',
                  'hover:text-accent hover:bg-accent-dim',
                  isActive(path)
                    ? 'text-accent bg-accent-dim border-l-[3px] border-l-accent'
                    : 'text-text-dim',
                )}
              >
                <Icon className="w-[15px] h-[15px] flex-shrink-0 opacity-60" strokeWidth={1.5} />
                {label}
              </button>
            ))}

            <DrawerHeader noBorder className="mt-auto border-t border-surface2">Settings</DrawerHeader>
            <ThemeToggle />

            {onSignOut && (
              <button
                type="button"
                onClick={() => { close(); onSignOut(); }}
                className="flex items-center gap-3 px-6 py-[14px] font-sans text-[13px] cursor-pointer text-left text-text-dim transition-colors border-b border-surface2 hover:text-danger hover:bg-danger/10"
              >
                <LogOut className="w-[15px] h-[15px] flex-shrink-0 opacity-60" strokeWidth={1.5} />
                Sign out
              </button>
            )}

            <div className="font-mono text-[9px] text-text-muted px-6 py-4 tracking-[0.06em] leading-[1.6]">
              Additional pages will appear here as the app grows.
            </div>
          </nav>
        </>,
        document.body,
      )}
    </>
  );
}

function DrawerHeader({ children, onClose, noBorder = false, className = '' }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted px-6 pt-5 pb-3',
        !noBorder && 'border-b border-surface2',
        className,
      )}
    >
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="bg-transparent border-0 cursor-pointer px-1 text-text-muted text-[14px] leading-none rounded-sm transition-colors hover:text-text hover:bg-surface2"
        >
          ✕
        </button>
      )}
    </div>
  );
}
