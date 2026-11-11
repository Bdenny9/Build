'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Building2, Check, ChevronDown, Compass, Crosshair, LayoutGrid, Megaphone, Receipt } from 'lucide-react';
import { openStartHere } from './StartHere';

const TABS = [
  { href: '/prospecting', label: 'Prospecting', Icon: Crosshair },
  { href: '/listings', label: 'Marketing', Icon: Megaphone },
  { href: '/payout', label: 'Back Office', Icon: Receipt },
  { href: '/evals', label: 'Reports', Icon: BarChart3 },
];

export function AppBar() {
  const path = usePathname();
  return (
    <header className="appbar">
      <div className="appbar-in">
        <span className="apps" aria-hidden><LayoutGrid /></span>
        <Link className="logo" href="/prospecting"><Building2 aria-hidden />Deal Engine</Link>
        <nav className="nav" aria-label="Deal stages">
          {TABS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>
              <Icon className="ico" aria-hidden /><span>{label}</span><ChevronDown className="caret" aria-hidden />
            </Link>
          ))}
        </nav>
        <div className="right">
          <button className="start-btn" onClick={openStartHere}><Compass aria-hidden /><span>Start here</span></button>
          <div className="note-r">Independent prototype by Brook Denny · not affiliated with Buildout</div>
          <div className="tick" title="Every figure cites its source"><span><Check aria-hidden /></span></div>
          <div className="me"><div className="avatar" aria-hidden>V</div><span>Visitor</span><ChevronDown className="ico" aria-hidden /></div>
        </div>
      </div>
    </header>
  );
}
