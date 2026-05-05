import { useNavigate } from 'react-router-dom';
import SectionHeader from '@/components/brand/SectionHeader';
import KPICard from '@/components/brand/KPICard';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useContacts } from '@/hooks/useContacts';
import { useActivities } from '@/hooks/useActivities';
import { fmtInt } from '@/utils/formatters';

export default function Home() {
  const navigate = useNavigate();
  const orgs = useOrganizations();
  const contacts = useContacts();
  const week = useActivities({ sinceDays: 7 });
  const recent = useActivities({ limit: 10 });

  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="font-display text-4xl text-text mb-2">Home</h1>
        <p className="text-text-dim mb-10 font-mono text-[11px] uppercase tracking-[0.12em]">
          Provider Solutions CRM · Phase 1
        </p>

        <SectionHeader text="Snapshot" first />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <KPICard
            label="Organizations"
            value={orgs.loading ? null : fmtInt(orgs.data.length)}
            sub={orgs.loading ? 'Loading…' : 'Hospitals + partners'}
            loading={orgs.loading}
            drillable
            onClick={() => navigate('/organizations')}
          />
          <KPICard
            label="Contacts"
            value={contacts.loading ? null : fmtInt(contacts.data.length)}
            sub={contacts.loading ? 'Loading…' : 'People we know'}
            color="green"
            loading={contacts.loading}
            drillable
            onClick={() => navigate('/contacts')}
          />
          <KPICard
            label="Activities (7d)"
            value={week.loading ? null : fmtInt(week.data.length)}
            sub={week.loading ? 'Loading…' : 'Calls, emails, meetings, notes'}
            color="blue"
            loading={week.loading}
          />
        </div>

        <SectionHeader text="Recent activity" />
        <ActivityFeed
          activities={recent.data}
          loading={recent.loading}
          showParent
          emptyText="Nothing logged yet — log your first call from any organization detail page."
        />
      </div>
    </div>
  );
}
