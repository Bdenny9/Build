'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Activity, BarChart3, ExternalLink, FileText, Gauge, Users } from 'lucide-react';
import { IconTabs } from '@/components/ui/IconTabs';
import { countyRecordUrl } from '@/lib/calc/constants';
import { data } from '@/lib/data';
import { useAnalysis } from '@/hooks/useAnalysis';
import type { Lead, LeadStatus } from '@/types/domain';
import { ActivityTab } from './ActivityTab';
import { CompsTab } from './CompsTab';
import { OpportunityTab } from './OpportunityTab';
import { OwnershipTab } from './OwnershipTab';
import { SummaryTab } from './SummaryTab';

type Sub = 'summary' | 'ownership' | 'opp' | 'comps' | 'activity';

export function DetailPane({ lead, onStatus }: { lead: Lead | null; onStatus: (s: LeadStatus) => void }) {
  if (!lead) return <aside className="detail-pane"><div className="detail-empty">Select a property to see ownership, the opportunity math and outreach.</div></aside>;
  return <Detail key={lead.pid} lead={lead} onStatus={onStatus} />;
}

function Detail({ lead, onStatus }: { lead: Lead; onStatus: (s: LeadStatus) => void }) {
  const [sub, setSub] = useState<Sub>('summary');
  const analysis = useAnalysis(lead);
  const router = useRouter();
  async function won() {
    await data.createListing(lead.pid);
    await data.addActivity(lead.pid, 'Status', 'Listing won, moved to marketing');
    onStatus('Listing won');
    router.push(`/listings/${lead.pid}`);
  }
  const needs = sub === 'opp' || sub === 'comps';
  return (
    <aside className="detail-pane" aria-label="Property detail">
      <div className="detail-head">
        <h2>{lead.address}</h2>
        <div className="sub">{lead.area}, SC · {lead.jurisdiction} · PID {lead.pid}</div>
        <div className="actions">
          <a className="btn" href={countyRecordUrl(lead.pid)} target="_blank" rel="noopener noreferrer"><ExternalLink className="ico" aria-hidden />County record</a>
          <button className="btn btn-lime" onClick={won}>Won the listing</button>
        </div>
      </div>
      <IconTabs<Sub> value={sub} onChange={setSub} tabs={[
        ['summary', 'Summary', FileText], ['ownership', 'Ownership', Users], ['opp', 'Opportunity', Gauge], ['comps', 'Comps', BarChart3], ['activity', 'Activity', Activity],
      ]} />
      <div className="detail-scroll">
        {sub === 'summary' && <SummaryTab lead={lead} />}
        {sub === 'ownership' && <OwnershipTab lead={lead} />}
        {sub === 'activity' && <ActivityTab lead={lead} onStatus={onStatus} />}
        {needs && (analysis.loading ? <p className="note">Running the numbers…</p>
          : analysis.error ? <div className="error">{analysis.error}</div>
          : analysis.data && (sub === 'opp' ? <OpportunityTab lead={lead} a={analysis.data} /> : <CompsTab a={analysis.data} />))}
      </div>
    </aside>
  );
}
