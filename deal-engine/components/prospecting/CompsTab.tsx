'use client';
import { BarChart3 } from 'lucide-react';
import { Cite } from '@/components/ui/Cite';
import { int, money, monthYear } from '@/lib/calc/format';
import type { Analysis } from '@/hooks/useAnalysis';

export function CompsTab({ a }: { a: Analysis }) {
  const { value } = a;
  return (
    <div className="sec">
      <div className="sec-h"><BarChart3 className="ico" aria-hidden />Comparable sales <span className="tag">{value.usableComps.length} sales</span></div>
      <p className="note" style={{ marginTop: 0 }}>Same class code, nearest sales in three years. Under $10,000 dropped as non-market.{value.thin ? ' Thin sample: treat as rough.' : ''}</p>
      <div className="tbl-wrap"><table className="data">
        <thead><tr><th>Address</th><th>Sold</th><th className="num">SF</th><th className="num">$/SF</th></tr></thead>
        <tbody>
          {value.usableComps.map((c) => (
            <tr key={c.pid}><td><Cite source="comps" detail={`${money(c.salePrice)} · PID ${c.pid}`}>{c.address}</Cite></td><td>{monthYear(c.saleDate)}</td>
              <td className="num">{int(c.footprintSf)}</td><td className="num">{money(c.salePrice / c.footprintSf)}</td></tr>))}
          <tr><td colSpan={3}><b>Median</b></td><td className="num"><b>{money(value.medianPsf)}</b></td></tr>
        </tbody>
      </table></div>
    </div>
  );
}
