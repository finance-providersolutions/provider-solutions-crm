import { useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon, ArrowLeft } from 'lucide-react';
import Navigation from './Navigation.jsx';

const iconBtnClass =
  'flex items-center justify-center w-9 h-9 bg-surface border border-border rounded cursor-pointer flex-shrink-0 text-text-dim transition-colors hover:border-accent hover:bg-accent-dim hover:text-accent';

export default function PageHeader({ subtitle, onSignOut }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] border-b border-border bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between gap-3 px-6 h-[58px]">
        <div className="flex items-center gap-3">
          <img
            src="/pslogo.png"
            alt="Provider Solutions"
            className="w-9 h-9 rounded-md flex-shrink-0 object-cover"
          />
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-display text-[18px] sm:text-[22px] tracking-[-0.02em] leading-[1.1] text-text">
              Provider Solutions
            </span>
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim">
              {subtitle}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!isHome && (
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Home"
              className={iconBtnClass}
            >
              <HomeIcon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className={iconBtnClass}
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </button>
          <Navigation onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}
