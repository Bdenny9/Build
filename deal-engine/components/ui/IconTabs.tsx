'use client';
import type { LucideIcon } from 'lucide-react';

export function IconTabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string, LucideIcon][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="itabs" role="tablist">
      {tabs.map(([k, label, Icon]) => (
        <button key={k} className="itab" role="tab" aria-selected={value === k} onClick={() => onChange(k)}>
          <Icon className="ico" aria-hidden />{label}
        </button>
      ))}
    </div>
  );
}
