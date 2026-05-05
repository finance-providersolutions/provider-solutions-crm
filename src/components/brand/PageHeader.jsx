import Navigation from './Navigation.jsx';

export default function PageHeader({ subtitle, onSignOut }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between gap-3 px-6 h-[58px] border-b border-border bg-bg/95 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <img
          src="/pslogo.png"
          alt="Provider Solutions"
          className="w-9 h-9 rounded-md flex-shrink-0 object-cover"
        />
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="font-display text-[22px] tracking-[-0.02em] leading-[1.1] text-text">
            Provider Solutions
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim">
            {subtitle}
          </span>
        </div>
      </div>
      <Navigation onSignOut={onSignOut} />
    </div>
  );
}
