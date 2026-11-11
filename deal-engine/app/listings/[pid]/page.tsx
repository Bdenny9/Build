'use client';
import { ListingWorkspace } from '@/components/listing/ListingWorkspace';
import { data } from '@/lib/data';
import { useAsync } from '@/hooks/useAsync';

export default function ListingPage({ params }: { params: { pid: string } }) {
  const lead = useAsync(() => data.getLead(params.pid), [params.pid]);
  if (lead.loading) return <div className="page"><p className="note">Loading listing…</p></div>;
  if (lead.error) return <div className="page"><div className="error">{lead.error}</div></div>;
  if (!lead.data) return <div className="page"><div className="empty">No parcel with PID {params.pid}.</div></div>;
  return <ListingWorkspace lead={lead.data} />;
}
