'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, Crosshair, Megaphone, Receipt } from 'lucide-react';

const TABS = [
  { href: '/prospecting', label: 'Prospect', Icon: Crosshair },
  { href: '/listings', label: 'Listings', Icon: Megaphone },
  { href: '/payout', label: 'Payout', Icon: Receipt },
];

export function AppBar() {
  const path = usePathname();
  return (
    <header className="appbar">
      <div className="appbar-in">
        <Link className="logo" href="/prospecting"><Building2 aria-hidden /> Deal Engine</Link>
        <nav className="nav" aria-label="Deal stages">
          {TABS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>
              <Icon className="ico" aria-hidden /><span>{label}</span><ChevronDown className="caret" aria-hidden />
            </Link>
          ))}
        </nav>
        <div className="note-r">Independent prototype by Brook Denny · not affiliated with Buildout</div>
      </div>
    </header>
  );
}
