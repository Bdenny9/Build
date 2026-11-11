'use client';
import { ClosedDeals } from '@/components/payout/ClosedDeals';
import { PayoutForm } from '@/components/payout/PayoutForm';
import { moneyShort, money } from '@/lib/calc/format';
import { data } from '@/lib/data';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAsync } from '@/hooks/useAsync';

export default function PayoutPage() {
  const state = useAsync(async () => {
    const [deals, listings] = await Promise.all([data.listDeals(), data.listListings()]);
    const pendingPid = listings.find((pid) => !deals.some((d) => d.pid === pid));
    const pending = pendingPid ? await data.getLead(pendingPid) : null;
    return { deals, pending };
  }, []);
  const analysis = useAnalysis(state.data?.pending ?? null);

  if (state.loading) return <div className="page"><p className="note">Loading deals…</p></div>;
  if (state.error) return <div className="page"><div className="error">{state.error}</div></div>;
  const { deals, pending } = state.data!;
  const vol = deals.reduce((s, d) => s + d.price, 0), net = deals.reduce((s, d) => s + d.netToBroker, 0);

  return (
    <div className="page">
      <div className="page-h"><h1>From proposal <strong>to commission</strong></h1></div>
      <div className="stats">
        <div className="stat"><div className="n">{deals.length}</div><div className="l">Closed deals</div></div>
        <div className="stat"><div className="n">{moneyShort(vol)}</div><div className="l">Closed volume</div></div>
        <div className="stat"><div className="n">{money(net)}</div><div className="l">Net commission to you</div></div>
        <div className="stat"><div className="n">{pending ? 1 : 0}</div><div className="l">Pending listing</div></div>
      </div>
      <div className="grid2">
        <div className="card"><div className="card-h">Mark as sold</div><div className="card-b">
          {pending && analysis.data ? <PayoutForm lead={pending} defaultPrice={analysis.data.value.value} onSold={state.reload} />
            : <div className="empty" style={{ border: 0 }}>{pending ? 'Running the numbers…' : 'No pending listing. Win a listing in Prospecting first.'}</div>}
        </div></div>
        <div className="card"><div className="card-h">Closed deals</div><ClosedDeals deals={deals} /></div>
      </div>
    </div>
  );
}
