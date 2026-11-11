'use client';
import { useState } from 'react';
import { computePayout } from '@/lib/calc/payout';
import { money } from '@/lib/calc/format';
import { data } from '@/lib/data';
import type { Lead } from '@/types/domain';

export function PayoutForm({ lead, defaultPrice, onSold }: { lead: Lead; defaultPrice: number; onSold: () => void }) {
  const [price, setPrice] = useState(Math.round(defaultPrice / 1000) * 1000);
  const [closeDate, setCloseDate] = useState('2026-12-15');
  const [commissionPct, setRate] = useState(5);
  const [brokerSplitPct, setSplit] = useState(70);
  const [coBroker, setCo] = useState(true);
  const [busy, setBusy] = useState(false);
  const p = computePayout({ price, commissionPct, brokerSplitPct, coBroker });

  async function sold() {
    setBusy(true);
    try { await data.markSold({ pid: lead.pid, price, closeDate, commissionPct, brokerSplitPct, coBroker, netToBroker: p.netToBroker }); onSold(); }
    finally { setBusy(false); }
  }
  return (
    <>
      <b style={{ fontSize: 14 }}>{lead.address}</b>
      <p className="note">Payout math is deterministic. No AI in this step.</p>
      <div className="form-row">
        <label>Sale price <input type="number" step={1000} value={price} onChange={(e) => setPrice(+e.target.value || 0)} style={{ width: 160 }} /></label>
        <label>Close date <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} /></label>
      </div>
      <div className="form-row">
        <label>Commission % <input type="number" step={0.25} value={commissionPct} onChange={(e) => setRate(+e.target.value || 0)} style={{ width: 80 }} /></label>
        <label>Your split % <input type="number" step={5} value={brokerSplitPct} onChange={(e) => setSplit(+e.target.value || 0)} style={{ width: 80 }} /></label>
        <label className="toggle"><input type="checkbox" checked={coBroker} onChange={(e) => setCo(e.target.checked)} /> Co-broker, 50/50</label>
      </div>
      <table className="calc"><tbody>
        <tr><td>Sale price</td><td>{money(price)}</td></tr>
        <tr><td>Gross commission at {commissionPct}%</td><td>{money(p.gross)}</td></tr>
        <tr><td>{coBroker ? 'Listing side after 50/50 co-broker split' : 'Listing side, no co-broker'}</td><td>{money(p.listingSide)}</td></tr>
        <tr><td>House share at {100 - brokerSplitPct}%</td><td>−{money(p.houseShare)}</td></tr>
        <tr className="total"><td>Net to you</td><td>{money(p.netToBroker)}</td></tr>
      </tbody></table>
      <div className="form-row" style={{ marginTop: 14 }}><button className="btn btn-lime" disabled={busy || price <= 0} onClick={sold}>Mark as sold</button></div>
    </>
  );
}
