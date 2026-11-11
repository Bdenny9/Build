'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bot, Compass, Database, X } from 'lucide-react';

const SEEN_KEY = 'deal-engine-start-here-v1';
export const openStartHere = () => window.dispatchEvent(new Event('open-start-here'));

type Tab = 'tour' | 'data' | 'ai';
const TABS: [Tab, string, typeof Compass][] = [['tour', 'What to try', Compass], ['data', 'Real vs mock data', Database], ['ai', 'Where AI is used', Bot]];

/** First-visit guide. Opens once per browser (remembered locally), and again from "Start here" in the top bar. */
export function StartHere() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('tour');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* storage blocked: show it */ }
    if (!seen) setOpen(true);
    const show = () => { setTab('tour'); setOpen(true); };
    window.addEventListener('open-start-here', show);
    return () => window.removeEventListener('open-start-here', show);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  }
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sh-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <h2 id="sh-title">Start here</h2>
            <p className="note" style={{ margin: '4px 0 0' }}>A CRE broker workflow from first contact to commission, on real Charleston County records. Independent prototype by Brook Denny, not affiliated with Buildout.</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={close} aria-label="Close"><X /></button>
        </div>
        <div className="itabs" role="tablist" style={{ marginTop: 4 }}>
          {TABS.map(([k, label, Icon]) => (
            <button key={k} className="itab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon className="ico" aria-hidden />{label}</button>
          ))}
        </div>
        <div className="modal-b">
          {tab === 'tour' && <Tour close={close} />}
          {tab === 'data' && <DataSources />}
          {tab === 'ai' && <AiUse close={close} />}
        </div>
        <div className="modal-f">
          <span className="note">Reopen this any time from <b>Start here</b> in the top bar.</span>
          {tab !== 'ai'
            ? <button className="btn btn-lime" onClick={() => setTab(tab === 'tour' ? 'data' : 'ai')}>Next</button>
            : <button className="btn btn-lime" onClick={close}>Start exploring</button>}
        </div>
      </div>
    </div>
  );
}

function Tour({ close }: { close: () => void }) {
  const steps: [string, string, string][] = [
    ['Prospecting', 'Click “Generate 5 leads”. You get five county parcels most likely to sell, ranked by rules: long hold, absentee owner, loan likely maturing.', '/prospecting'],
    ['Open a lead', 'Summary, Ownership and Comps are county records. Opportunity shows the score and the loan and equity math, every number with its source on hover. Activity shows the recommended next step and an AI outreach draft.', '/prospecting'],
    ['Win the listing', 'Click “Won the listing”. Marketing opens with AI-drafted copy. Each sentence cites its source, and code plus an AI judge check it before you can approve.', '/listings'],
    ['Try to break it', 'Tick “Plant errors” on a copy tab. An invented cap rate, a location claim and a mock signal get added; watch every one get caught and approval get blocked.', '/listings'],
    ['Close and get paid', 'Back Office marks a listing sold and runs the commission waterfall. Pure math, no AI.', '/payout'],
    ['See the evals', 'Reports shows how the AI was tested: 39 test cases, the quality bar, and how the models were chosen.', '/evals'],
  ];
  return (
    <ol className="steps">
      {steps.map(([t, d, href], i) => (
        <li key={t}>
          <span className="num">{i + 1}</span>
          <div><b>{t}</b><div className="note">{d}</div></div>
          <Link className="btn" href={href} onClick={close}>Go</Link>
        </li>
      ))}
    </ol>
  );
}

function DataSources() {
  const rows: [string, string, 'real' | 'estimate' | 'mock' | 'none'][] = [
    ['Parcels: owner, class, last sale, acreage', 'Charleston County GIS, 7,327 commercial parcels', 'real'],
    ['Building footprints', 'County 2025 footprint survey (ground area only, stories unknown)', 'real'],
    ['Flood zones', 'County layer of current FEMA flood data', 'real'],
    ['Jurisdiction and addresses', 'County municipal boundaries and address points', 'real'],
    ['Zoning', 'Zoneomics API, looked up per lead and cached. Shown only when verified for the parcel', 'real'],
    ['10-year Treasury rate', 'FRED (DGS10), monthly', 'real'],
    ['Comparable sales', 'County sales of the same type in the last 3 years; multi-parcel deeds grouped', 'real'],
    ['Loan balance, equity, value', 'Estimated in code from the sale, FRED rate and stated assumptions. Not real loan data', 'estimate'],
    ['“Simulated” signals', 'Mock stand-ins for licensed data (lease expirations, vacancies). Tagged everywhere; never used in buyer copy', 'mock'],
    ['Owner contacts', 'Left out on purpose. The prototype stops at the public record', 'none'],
  ];
  const label = { real: 'Real', estimate: 'Estimate', mock: 'Mock', none: 'Not shown' } as const;
  const cls = { real: 'ok', estimate: '', mock: 'sim', none: '' } as const;
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>County data as of Nov 2026. Hover any dotted figure in the app to see where it came from.</p>
      <table className="data src-table"><tbody>
        {rows.map(([what, src, kind]) => (
          <tr key={what}><td><b>{what}</b><div className="note">{src}</div></td><td className="num"><span className={`tag ${cls[kind]}`}>{label[kind]}</span></td></tr>
        ))}
      </tbody></table>
    </>
  );
}

function AiUse({ close }: { close: () => void }) {
  return (
    <>
      <p style={{ marginTop: 0 }}>AI is used only for writing, where the output is language and can be checked against the record. Everything that is a policy, a calculation or a ranking is plain code, so it gives the same answer every time.</p>
      <table className="data src-table"><thead><tr><th>Feature</th><th>Engine</th><th>Why</th></tr></thead><tbody>
        <tr><td><b>Listing copy</b></td><td><span className="tag ai">Claude Sonnet</span></td><td className="wrap">Writing is the model’s strength. It must return sentences tied to a source; code recomputes every number.</td></tr>
        <tr><td><b>Copy judge</b></td><td><span className="tag ai">Claude Opus</span></td><td className="wrap">Catches overstatement code can’t (“nearly 222,000 SF”). It is the safety gate, so it gets the strongest model. It can block, never overrule code.</td></tr>
        <tr><td><b>Outreach draft</b></td><td><span className="tag ai">Claude Sonnet</span></td><td className="wrap">A first-touch note from the record. Any number not in the record is caught. Nothing is ever sent.</td></tr>
        <tr><td><b>Lead score, next step, comps, value, buyers, payout</b></td><td><span className="tag">Rules</span></td><td className="wrap">Structured inputs and a policy the brokerage owns: explainable line by line and tested.</td></tr>
      </tbody></table>
      <div className="callout" style={{ marginTop: 12 }}>
        <b><BarChart3 className="ico" aria-hidden style={{ verticalAlign: '-2px' }} /> How the AI was tested</b>
        <ul className="note" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>39 test cases on real parcels: honest copy, plus planted traps such as inflated numbers, footprint called rentable space, fair-housing phrasing, and instructions hidden in the data.</li>
          <li>Quality bar: 100% of claims sourced and numbers matching, every trap blocked, usefulness of at least 90%.</li>
          <li>Models chosen on evidence: Haiku judging let an inflated footprint through; Sonnet writing with Opus judging met every target.</li>
          <li>A prompt change raised usefulness from 85–90% to 100%, measured on the same cases.</li>
        </ul>
        <div style={{ marginTop: 8 }}><Link className="btn" href="/evals" onClick={close}>Open the eval report</Link></div>
      </div>
    </>
  );
}
