'use client';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { TYPES } from '@/lib/calc/constants';
import { data } from '@/lib/data';
import { useAsync } from '@/hooks/useAsync';

export default function ListingsIndex() {
  const listings = useAsync(async () => Promise.all((await data.listListings()).map((pid) => data.getLead(pid))), []);
  const rows = (listings.data ?? []).filter(Boolean);
  return (
    <div className="page">
      <div className="page-h"><h1>Your <strong>listings</strong></h1></div>
      {listings.loading ? <p className="note">Loading listings…</p> : listings.error ? <div className="error">{listings.error}</div> : (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-h"><Megaphone className="ico" aria-hidden />Active listings</div>
          {rows.length ? <table className="data"><thead><tr><th>Property</th><th>Type</th><th>Status</th><th /></tr></thead><tbody>
            {rows.map((l) => <tr key={l!.pid}><td><b>{l!.address}</b><div className="note">{l!.area}</div></td><td>{TYPES[l!.classCode].label}</td><td><span className="tag ok">{l!.status}</span></td>
              <td className="num"><Link className="btn" href={`/listings/${l!.pid}`}>Open</Link></td></tr>)}
          </tbody></table> : <div className="empty">No listings yet. In Prospect, open a property and choose “Won the listing”.</div>}
        </div>
      )}
    </div>
  );
}
