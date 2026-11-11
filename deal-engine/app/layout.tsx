import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import { AppBar } from '@/components/shell/AppBar';
import { TooltipLayer } from '@/components/ui/Cite';
import './globals.css';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });

export const metadata: Metadata = { title: 'Charleston Deal Engine · Prototype by Brook Denny' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <AppBar />
        <main>{children}</main>
        <TooltipLayer />
      </body>
    </html>
  );
}
