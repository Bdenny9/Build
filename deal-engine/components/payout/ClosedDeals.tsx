'use client';
import { TYPES } from '@/lib/calc/constants';
import { money, monthYear } from '@/lib/calc/format';
import type { ClassCode, Deal } from '@/types/domain';

const label = (t: string) => TYPES[t as ClassCode]?.label ?? t;

export function ClosedDeals({ deals }: { deals: Deal[] }) {
  return (
    <>
      <div className="tbl-wrap"><table className="data">
        <thead><tr><th>Property</th><th>Closed</th><th className="num">Price</th><th className="num">Net to you</th></tr></thead>
        <tbody>{deals.map((d) => (
          <tr key={d.id}><td>{d.address}<div className="note">{label(d.typeLabel)}</div></td><td>{monthYear(d.closeDate)}</td>
            <td className="num">{money(d.price)}</td><td className="num">{money(d.netToBroker)}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
