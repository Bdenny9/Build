'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlignLeft, CalendarDays, ChevronUp, ExternalLink, FlaskConical, Home, ListChecks, Mail, Newspaper, Phone, Receipt, RefreshCw, StickyNote, Target, Zap,
} from 'lucide-react';
import { EvalBars } from '@/components/evals/EvalSummary';
import { Cite } from '@/components/ui/Cite';
import { Thumb } from '@/components/ui/Thumb';
import { ZoningStatus } from '@/components/ui/ZoningStatus';
import { TYPES, countyRecordUrl } from '@/lib/calc/constants';
import { allPass, codeChecks, type Facts } from '@/lib/calc/evals';
import { shortDay } from '@/lib/calc/format';
import { data } from '@/lib/data';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAsync } from '@/hooks/useAsync';
import type { Asset, AssetKind, JudgeResult, Lead } from '@/types/domain';
import { BuyerProfile } from './BuyerProfile';
import { ChecksCard, VerdictsCard } from './EvalPanel';

type View = 'overview' | 'activity' | AssetKind | 'buyers';
const MARKETING: [AssetKind, string, typeof AlignLeft][] = [
  ['description', 'Description', AlignLeft], ['highlights', 'Highlights', ListChecks], ['mailer', 'Mailer', Newspaper], ['email', 'Email', Mail],
];
const TITLES: Record<View, string> = {
  overview: 'Listing report', activity: 'Activity feed', description: 'Listing description', highlights: 'Highlights', mailer: 'Mailer', email: 'Email promo', buyers: 'Buyer profile',
};

export function ListingWorkspace({ lead }: { lead: Lead }) {
  const [view, setView] = useState<View>('overview');
  const [plant, setPlant] = useState(false);
  const [regen, setRegen] = useState(0);
  const isCopy = MARKETING.some(([k]) => k === view);

  const nav = (v: View, label: string, Icon: typeof AlignLeft) =>
    <button key={v} aria-selected={view === v} onClick={() => setView(v)}><Icon className="ico" aria-hidden />{label}</button>;

  return (
    <>
      <header className="lhead">
        <div className="photo" aria-hidden><Thumb classCode={lead.classCode} bare /></div>
        <div className="ttl">
          <h1>{lead.address}</h1>
          <div className="addr">{lead.area}, SC<span className="sep" aria-hidden /><span className="status">{lead.status === 'New' ? 'Listing won' : lead.status}</span></div>
        </div>
        <div className="acts">
          {isCopy && <label className="toggle"><input type="checkbox" checked={plant} onChange={(e) => setPlant(e.target.checked)} /> Plant errors</label>}
          {isCopy && <button className="btn btn-dark" onClick={() => setRegen((n) => n + 1)}><RefreshCw className="ico" aria-hidden />Regenerate</button>}
          <a className="btn btn-dark" href={countyRecordUrl(lead.pid)} target="_blank" rel="noopener noreferrer"><ExternalLink className="ico" aria-hidden />County record</a>
        </div>
      </header>
      <div className="lbody">
        <nav className="side" aria-label="Listing sections">
          <div className="grp">Project <ChevronUp className="ico" aria-hidden /></div>
          {nav('overview', 'Overview', Home)}
          {nav('activity', 'Activity Feed', Zap)}
          <div className="grp">Listing <ChevronUp className="ico" aria-hidden /></div>
          {MARKETING.map(([k, label, Icon]) => nav(k, label, Icon))}
          {nav('buyers', 'Buyer profile', Target)}
          <div className="grp">Deal <ChevronUp className="ico" aria-hidden /></div>
          <Link href="/payout"><Receipt className="ico" aria-hidden />Payout</Link>
          <Link href="/evals"><FlaskConical className="ico" aria-hidden />Model evals</Link>
        </nav>
        <main className="canvas">
          <div className="canvas-h"><h2>{TITLES[view]}</h2>{isCopy && <span className="tag ai">AI draft · hover a phrase for its source</span>}</div>
          {view === 'overview' && <Overview lead={lead} go={setView} />}
          {view === 'activity' && <ActivityFeed pid={lead.pid} />}
          {view === 'buyers' && <Buyers lead={lead} />}
          {isCopy && <CopyView key={`${view}-${plant}`} lead={lead} kind={view as AssetKind} plant={plant} regen={regen} />}
        </main>
      </div>
    </>
  );
}

/** One marketing asset: stored copy (generated once), code checks, judge verdicts, approval enforced server-side. */
function CopyView({ lead, kind, plant, regen }: { lead: Lead; kind: AssetKind; plant: boolean; regen: number }) {
  const analysis = useAnalysis(lead);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [judge, setJudge] = useState<JudgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setJudge(null); setApproveErr(null);
    data.generateAsset(lead.pid, kind, { plantErrors: plant, regenerate: regen > 0 })
      .then(async (a) => {
        if (!live) return;
        setAsset(a); setLoading(false);
        const j = a.judge ?? await data.judgeAsset(a);
        if (live) setJudge(j);
      })
      .catch((e: Error) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [lead.pid, kind, plant, regen]);

  // Server-stored checks are authoritative; the browser recomputes only when they are absent (mock mode).
  const facts: Facts = { footprintSf: lead.footprintSf, acreage: lead.acreage, medianPsf: analysis.data ? Math.round(analysis.data.value.medianPsf) : undefined };
  const code = asset ? asset.codeChecks ?? codeChecks(asset.claims, facts) : [];
  const checks = judge ? [...code, judge.result] : code;
  const ok = !!judge && allPass(checks);
  const flagged = new Set((judge?.verdicts ?? []).filter((v) => v.overstates).map((v) => v.index));

  async function approve() {
    if (!asset) return;
    setBusy(true); setApproveErr(null);
    try { const at = await data.approveAsset(asset.id); setAsset({ ...asset, approvedAt: at }); }
    catch (e) { setApproveErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (loading) return <p className="note">Generating from the listing record…</p>;
  if (error) return <div className="error">{error}</div>;
  if (!asset) return null;

  const claim = (c: Asset['claims'][number], i: number) => (
    <span key={i} className={flagged.has(i) ? 'flagged' : undefined}>
      <Cite source={c.source === 'sim' ? null : c.source} detail={c.detail}>{c.text}</Cite>
    </span>
  );

  return (
    <div className="cards">
      <section className="rcard span2" aria-label="Draft">
        <div className="rh">
          <div><h3>Draft</h3><div className="sub">Prompt {asset.promptVersion} · built from the county record only</div></div>
          <div className="right">{asset.approvedAt ? <span className="tag ok">Approved {shortDay(new Date(asset.approvedAt))}</span> : <span className="tag">Not approved</span>}</div>
        </div>
        <div className="rb doc-text">
          {kind === 'highlights'
            ? <ul>{asset.claims.map((c, i) => <li key={i}>{claim(c, i)}</li>)}</ul>
            : <p style={{ margin: 0 }}>{asset.claims.map((c, i) => <span key={i}>{claim(c, i)} </span>)}</p>}
        </div>
        <div className="rf">
          <button className="btn btn-lime" disabled={!ok || !!asset.approvedAt || busy} onClick={approve}>{asset.approvedAt ? 'Approved' : 'Approve for publishing'}</button>
          <span className="note">{!judge ? 'Waiting on the judge.' : ok ? (asset.approvedAt ? 'Ready for the flyer and syndication.' : 'All checks pass. Broker approval still required.') : 'Blocked until the failed checks are fixed. Approval is enforced in the database.'}</span>
          {approveErr && <div className="error" style={{ width: '100%' }}>{approveErr}</div>}
        </div>
      </section>
      <ChecksCard checks={checks} judging={!judge} />
      {judge && <VerdictsCard claims={asset.claims} verdicts={judge.verdicts} />}
    </div>
  );
}

/** Report-style overview: copy status, activity, model evals, buyers. Reads stored data only; no model calls. */
function Overview({ lead, go }: { lead: Lead; go: (v: View) => void }) {
  const state = useAsync(async () => {
    const [assets, acts, runs] = await Promise.all([data.listAssets(lead.pid), data.listActivities(lead.pid), data.listEvalRuns()]);
    return { assets, acts, run: runs[0] ?? null };
  }, [lead.pid]);
  if (state.loading) return <p className="note">Loading the report…</p>;
  if (state.error) return <div className="error">{state.error}</div>;
  const { assets, acts, run } = state.data!;

  const latest = (k: AssetKind) => assets.find((a) => a.kind === k);
  const stage = (a?: Asset) => !a ? { label: 'Not drafted', w: 0, cls: '' }
    : a.approvedAt ? { label: 'Approved', w: 100, cls: 'ok' }
    : a.judge && allPass([...(a.codeChecks ?? []), a.judge.result]) ? { label: 'Passed checks', w: 66, cls: 'ok' }
    : a.judge ? { label: 'Blocked', w: 33, cls: 'bad' } : { label: 'Drafted', w: 33, cls: '' };
  const count = (k: string) => acts.filter((a) => a.kind === k).length;

  return (
    <div className="cards">
      <section className="rcard">
        <div className="rh"><div><h3>Marketing</h3><div className="sub">Copy status for this listing</div></div></div>
        <div className="rb vbars">
          {MARKETING.map(([k, label]) => {
            const s = stage(latest(k));
            return [
              <button key={`${k}-l`} className="btn-ghost" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13.5 }} onClick={() => go(k)}>{label}</button>,
              <div key={`${k}-b`} className={`vbar ${s.cls}`}><i style={{ width: `${s.w}%` }} /><span>{s.label}</span></div>,
            ];
          })}
        </div>
      </section>
      <section className="rcard">
        <div className="rh"><div><h3>Activity</h3><div className="sub">Touches logged on this property</div></div></div>
        <div className="rb irows">
          {[['Call', 'Calls logged', Phone, 'var(--c1)'], ['Email', 'Emails logged', Mail, 'var(--c2)'], ['Note', 'Notes logged', StickyNote, 'var(--c3)'], ['Status', 'Status changes', CalendarDays, 'var(--c4)']].map(([k, label, Icon, color]) => {
            const I = Icon as typeof Phone;
            return (
              <div key={k as string} className="irow">
                <div className="circ" style={{ background: color as string }}><I aria-hidden /></div>
                <div><div className="k">{label as string}</div><div className="v">{count(k as string)} completed</div></div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rcard">
        <div className="rh">
          <div><h3>Model evals</h3><div className="sub">{run ? `${run.promptVersion === 'sample' ? 'Sample data' : `Prompt ${run.promptVersion}`} · ${run.cases} golden cases` : 'No eval run yet'}</div></div>
        </div>
        <div className="rb">{run ? <EvalBars metrics={run.metrics} /> : <p className="note">Run the golden set to score the copy prompt.</p>}</div>
        <div className="rf"><Link className="btn-ghost" href="/evals" style={{ marginLeft: 'auto', textDecoration: 'none', fontSize: 13 }}>See more</Link></div>
      </section>
      <section className="rcard">
        <div className="rh"><div><h3>Property</h3><div className="sub">From the county record</div></div></div>
        <div className="rb vbars" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <span>Type</span><span><Cite source="parcel" detail={`Class code ${lead.classCode}`}>{TYPES[lead.classCode].label}</Cite></span>
          <span>Footprint</span><span><Cite source="foot">{lead.footprintSf.toLocaleString('en-US')} SF</Cite></span>
          <span>Lot</span><span><Cite source="parcel">{lead.acreage} acres</Cite></span>
          <span>Flood zone</span><span><Cite source="fema">{lead.floodZone}</Cite></span>
          <span>Zoning</span><span>{lead.zoning.precision === 'parcel' ? <Cite source="zoning">{lead.zoning.zoneCode}</Cite> : <ZoningStatus z={lead.zoning} />}</span>
        </div>
      </section>
    </div>
  );
}

function ActivityFeed({ pid }: { pid: string }) {
  const acts = useAsync(() => data.listActivities(pid), [pid]);
  return (
    <section className="rcard" style={{ maxWidth: 760 }}>
      <div className="rh"><div><h3>Activity feed</h3><div className="sub">Everything logged on this property, newest first</div></div></div>
      <ul className="log rb">
        {acts.loading ? <li className="note">Loading…</li> : acts.data?.length
          ? acts.data.map((x) => <li key={x.id}><time>{shortDay(new Date(x.createdAt))}</time><span><b>{x.kind}</b> {x.text}</span></li>)
          : <li className="note">No activity yet.</li>}
      </ul>
    </section>
  );
}

function Buyers({ lead }: { lead: Lead }) {
  const analysis = useAnalysis(lead);
  return (
    <div className="cards">
      <section className="rcard span2">
        <div className="rh"><div><h3>Likely buyers</h3><div className="sub">Ranked by rules on zoning, type, lot size and flood zone. No AI judgment.</div></div></div>
        <div className="rb">{analysis.data ? <BuyerProfile lead={lead} value={analysis.data.value.value} /> : <p className="note">Loading…</p>}</div>
      </section>
    </div>
  );
}
