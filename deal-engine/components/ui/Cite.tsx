'use client';
import { useEffect, useState } from 'react';
import { SOURCES } from '@/lib/calc/constants';
import type { SourceKey } from '@/types/domain';

/** Inline citation. Every number or claim on screen should be wrapped in one. */
export function Cite({ source, detail, children }: { source: SourceKey | null; detail?: string; children: React.ReactNode }) {
  const unsupported = source === null;
  return (
    <span className={unsupported ? 'cite unsup' : 'cite'} tabIndex={0}
      data-tip-title={unsupported ? 'Unsupported claim' : SOURCES[source]} data-tip-detail={detail ?? ''}>
      {children}
    </span>
  );
}

/** One tooltip for the whole app, driven by data attributes. Works on hover and keyboard focus. */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ title: string; detail: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as HTMLElement).closest?.('[data-tip-title]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTip({ title: el.dataset.tipTitle ?? '', detail: el.dataset.tipDetail ?? '', x: r.left + r.width / 2, y: r.top });
    };
    const hide = (e: Event) => { if ((e.target as HTMLElement).closest?.('[data-tip-title]')) setTip(null); };
    const clear = () => setTip(null);
    document.addEventListener('mouseover', show); document.addEventListener('focusin', show);
    document.addEventListener('mouseout', hide); document.addEventListener('focusout', hide);
    window.addEventListener('scroll', clear, { passive: true });
    return () => {
      document.removeEventListener('mouseover', show); document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', hide); document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', clear);
    };
  }, []);
  if (!tip) return null;
  const left = Math.min(Math.max(8, tip.x - 150), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 308);
  const top = tip.y > 90 ? tip.y - 8 : tip.y + 30;
  return (
    <div className="tip" role="tooltip" style={{ left, top, transform: tip.y > 90 ? 'translateY(-100%)' : undefined }}>
      <b>{tip.title}</b>{tip.detail}
    </div>
  );
}
