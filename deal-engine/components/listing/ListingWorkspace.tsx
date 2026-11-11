'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, ListChecks, Mail, Newspaper, Target } from 'lucide-react';
import { Cite } from '@/components/ui/Cite';
import { TYPES } from '@/lib/calc/constants';
import { allPass, codeChecks, type Facts } from '@/lib/calc/evals';
import { data } from '@/lib/data';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAsync } from '@/hooks/useAsync';
import type { Asset, AssetKind, CheckResult, Lead } from '@/types/domain';
import { BuyerProfile } from './BuyerProfile';
import { EvalPanel } from './EvalPanel';

type Tab = AssetKind | 'buyers';
const MARKETING: [AssetKind, string, typeof AlignLeft][] = [['description', 'Listing description', AlignLeft], ['highlights', 'Highlights', ListChecks], ['mailer', 'Mailer', Newspaper], ['email', 'Email promo', Mail]];

export function ListingWorkspace({ lead }: { lead: Lead }) {
  const [tab, setTab] = useState<Tab>('description');
  const [plant, setPlant] = useState(false);
  const analysis = useAnalysis(lead);
  const asset = useAsync<Asset | null>(() => (tab === 'buyers' ? Promise.resolve(null) : data.generateAsset(lead.pid, tab, { plantErrors: plant })), [lead.pid, tab, plant]);
  const [judge, setJudge] = useState<CheckResult | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  const facts: Facts = useMemo(() => ({ footprintSf: lead.footprintSf, acreage: lead.acreage, medianPsf: analysis.data ? Math.round(analysis.data.value.medianPsf) : undefined }), [lead, analysis.data]);
  useEffect(() => {
    setJudge(null);
    if (asset.data) data.judgeAsset(asset.data.claims).then(setJudge).catch((e) => setJudge({ name: 'LLM judge: overstating', kind: 'llm', pass: false, detail: `Judge unavailable: ${e.message}` }));
  }, [asset.data]);

  const checks = asset.data ? [...codeChecks(asset.data.claims, facts), ...(judge ? [judge] : [])] : [];
  const ok = !!judge && allPass(checks);
  const isApproved = asset.data ? !!approved[asset.data.id] : false;
  async function approve() { if (!asset.data) return; await data.approveAsset(asset.data.id); setApproved((a) => ({ ...a, [asset.data!.id]: true })); }

  const claim = (c: Asset['claims'][number], i: number) => <Cite key={i} source={c.source === 'sim' ? null : c.source} detail={c.detail}>{c.text}</Cite>;
  const title = tab === 'buyers' ? 'Buyer profile' : MARKETING.find((m) => m[0] === tab)![1];

  return (
    <div className="lw">
      <nav className="side" aria-label="Listing assets">
        <div style={{ padding: '4px 8px 8px' }}><b style={{ fontSize: 14 }}>{lead.address}</b><div className="note">{lead.area} · {TYPES[lead.classCode].label}</div></div>
        <div className="grp">Marketing</div>
        {MARKETING.map(([k, label, Icon]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}><Icon className="ico" aria-hidden />{label}</button>)}
        <div className="grp">Targeting</div>
        <button aria-selected={tab === 'buyers'} onClick={() => setTab('buyers')}><Target className="ico" aria-hidden />Buyer profile</button>
      </nav>

      <section className="doc" aria-label={title}>
        <div className="doc-card">
          <div className="doc-h">
            <b>{title}</b>
            {tab !== 'buyers' && <span className="tag ai">AI draft · hover a phrase for its source</span>}
            {tab !== 'buyers' && <label className="toggle"><input type="checkbox" checked={plant} onChange={(e) => setPlant(e.target.checked)} /> Plant errors</label>}
          </div>
          <div className="doc-b">
            {tab === 'buyers' ? (analysis.data ? <BuyerProfile lead={lead} value={analysis.data.value.value} /> : <p className="note">Loading…</p>)
              : asset.loading ? <p className="note">Generating from the listing record…</p>
              : asset.error ? <div className="error">{asset.error}</div>
              : asset.data && (tab === 'highlights'
                ? <ul>{asset.data.claims.map((c, i) => <li key={i}>{claim(c, i)}</li>)}</ul>
                : <p style={{ margin: 0 }}>{asset.data.claims.map((c, i) => <span key={i}>{claim(c, i)} </span>)}</p>)}
          </div>
          {tab !== 'buyers' && (
            <div className="doc-f">
              <button className="btn btn-lime" disabled={!ok || isApproved} onClick={approve}>{isApproved ? 'Approved' : 'Approve for publishing'}</button>
              <span className="note">{!judge ? 'Waiting on the judge.' : ok ? (isApproved ? 'Ready for the flyer and syndication.' : 'All checks pass. Broker approval still required.') : 'Blocked until the failed checks are fixed.'}</span>
            </div>
          )}
        </div>
      </section>

      {tab === 'buyers'
        ? <aside className="evalp"><div className="sec-h">Why these buyers</div><p className="note">Rules on zoning, property type, flood zone and size, so the ranking is repeatable and explainable. No AI judgment.</p></aside>
        : <EvalPanel checks={checks} judging={!!asset.data && !judge} />}
    </div>
  );
}
