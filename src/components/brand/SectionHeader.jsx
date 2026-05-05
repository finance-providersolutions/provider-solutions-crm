import { cn } from '@/lib/utils';

export default function SectionHeader({ text, first = false }) {
  return (
    <div className={cn('flex items-center gap-0 relative mb-6', first ? 'mt-0' : 'mt-8')}>
      <div className="flex-1 h-px opacity-45 bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="flex items-center gap-3.5 px-5 flex-shrink-0">
        <span className="text-[22px] opacity-75 text-accent">◈</span>
        <span className="font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-accent opacity-90">
          {text}
        </span>
        <span className="text-[22px] opacity-75 text-accent">◈</span>
      </div>
      <div className="flex-1 h-px opacity-45 bg-gradient-to-r from-transparent via-accent to-transparent" />
    </div>
  );
}
