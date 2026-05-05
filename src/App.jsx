import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import PageHeader from '@/components/brand/PageHeader';
import SectionHeader from '@/components/brand/SectionHeader';
import KPICard from '@/components/brand/KPICard';
import { Toaster } from '@/components/ui/sonner';

// Temporary brand preview page. Real routes (Login, Home, Organizations,
// Organization, Contacts) wire up in the next commit alongside auth.
function BrandPreview() {
  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="font-display text-4xl text-text mb-2">Phase 1 brand shell</h1>
        <p className="text-text-dim mb-10">
          Tokens, fonts, and the five brand components — preview before auth + routing land.
        </p>

        <SectionHeader text="KPI cards" first />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <KPICard label="Organizations" value="—" sub="No data yet" />
          <KPICard label="Contacts"      value="—" sub="No data yet" color="green" />
          <KPICard label="Activities (7d)" value="—" sub="No data yet" color="blue" />
        </div>

        <SectionHeader text="Status colors" />
        <div className="flex flex-wrap gap-6 font-mono text-sm">
          <span className="text-income">● won / active</span>
          <span className="text-accent">● in-progress</span>
          <span className="text-warning italic">~ estimate</span>
          <span className="text-danger">● lost / expired</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <PageHeader subtitle="CRM · Phase 1" />
        <Routes>
          <Route path="*" element={<BrandPreview />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </ThemeProvider>
  );
}
