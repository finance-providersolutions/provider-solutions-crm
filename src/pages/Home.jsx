import SectionHeader from '@/components/brand/SectionHeader';
import KPICard from '@/components/brand/KPICard';

// Placeholder until commit 5 wires up real data + recent-activity feed.
export default function Home() {
  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="font-display text-4xl text-text mb-2">Home</h1>
        <p className="text-text-dim mb-10 font-mono text-xs uppercase tracking-[0.12em]">
          Phase 1 dashboard
        </p>

        <SectionHeader text="Snapshot" first />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard label="Organizations"     value="—" sub="Coming next commit" />
          <KPICard label="Contacts"          value="—" sub="Coming next commit" color="green" />
          <KPICard label="Activities (7d)"   value="—" sub="Coming next commit" color="blue" />
        </div>
      </div>
    </div>
  );
}
