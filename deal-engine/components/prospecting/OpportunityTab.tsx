'use client';
import { Calculator, Gauge, ListChecks, Sparkles } from 'lucide-react';
import { Cite } from '@/components/ui/Cite';
import { ASSUMPTIONS, TYPES } from '@/lib/calc/constants';
import { int, money, moneyShort, monthYear, pct } from '@/lib/calc/format';
import type { Analysis } from '@/hooks/useAnalysis';
import type { Lead } from '@/types/domain';

export function OpportunityTab({ lead: l, a }: { lead: Lead; a: Analysis }) {
  const { loan, value, score } = a;
  const m = loan.monthsToMaturity;
  return (
    <>
      <div className="banner ai"><strong>Not a trained model.</strong> Prediction is Buildout’s likely-to-sell score. This is the case a broker makes on the call, computed in code.</div>
      <div className="scorebar"><Gauge className="ico" aria-hidden style={{ width: 22, height: 22, color: 'var(--violet)' }} /><div className="n">{score.score}</div><div><div className="l">{score.level}</div><div className="note">Transparent rule points</div></div></div>

      <div className="sec">
        <div className="sec-h"><Sparkles className="ico" aria-hidden />Why now <span className="tag ai">AI draft</span></div>
        <div className="why">
          <Cite source="parcel">{l.owner}</Cite> has held {l.address} for <Cite source="parcel">{score.holdYears.toFixed(1)} years</Cite>.
          {' '}At about <Cite source="calc">{moneyShort(value.value)}</Cite> against roughly <Cite source="calc">{moneyShort(loan.balance)}</Cite> owed,
          that’s <Cite source="calc">{moneyShort(score.equity)}</Cite> in equity. The loan, estimated at <Cite source="calc">{pct(loan.ratePct)}</Cite>,
          {' '}{m >= 0 ? <>comes due in <Cite source="calc">{m} months</Cite></> : <>came due <Cite source="calc">{-m} months ago</Cite></>}; refinancing runs near <Cite source="assume">{pct(loan.refiRatePct)}</Cite>.
        </div>
      </div>

      <div className="sec">
        <div className="sec-h"><ListChecks className="ico" aria-hidden />What scored</div>
        <ul className="rules">{score.rules.map((r) => (
          <li key={r.text} className={r.on ? '' : 'off'}><span>{r.simulated && <span className="tag sim">Simulated</span>} {r.text}</span><span className="pts">{r.on ? `+${r.points}` : '0'}</span></li>))}</ul>
      </div>

      <div className="sec">
        <div className="sec-h"><Calculator className="ico" aria-hidden />Loan and equity math</div>
        <table className="calc"><tbody>
          <tr><td>Last sale ({monthYear(l.saleDate)})</td><td><Cite source="parcel">{money(l.salePrice)}</Cite></td></tr>
          <tr><td>Loan at {ASSUMPTIONS.ltv * 100}% LTV</td><td><Cite source="assume">{money(loan.principal)}</Cite></td></tr>
          <tr><td>10-year Treasury at sale</td><td><Cite source="fred" detail="Month on or before the sale date">{pct(loan.treasuryPct)}</Cite></td></tr>
          <tr><td>Spread, {TYPES[l.classCode].label.toLowerCase()}</td><td><Cite source="assume">+{loan.spreadPts.toFixed(2)} pts</Cite></td></tr>
          <tr><td>Estimated original rate</td><td><Cite source="calc">{pct(loan.ratePct)}</Cite></td></tr>
          <tr><td>Balance after {loan.paymentsMade} payments</td><td><Cite source="calc" detail="25-year amortization">{money(loan.balance)}</Cite></td></tr>
          <tr><td>Comp median × {int(l.footprintSf)} SF</td><td><Cite source="comps">{money(value.value)}</Cite></td></tr>
          <tr className="total"><td>Estimated equity</td><td><Cite source="calc" detail={`${score.equityPct.toFixed(0)}% of value`}>{money(score.equity)}</Cite></td></tr>
        </tbody></table>
      </div>
    </>
  );
}
