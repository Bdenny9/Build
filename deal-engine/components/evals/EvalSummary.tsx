'use client';
import type { EvalMetrics } from '@/types/domain';

/** Each metric with its release target. A prompt version ships only if every metric meets its target and none drops. */
type QualityKey = Exclude<keyof EvalMetrics, 'usd_per_case' | 'sec_per_case' | 'banned_hits' | 'failed_cases'>;
export const METRICS: { key: QualityKey; label: string; target: number; lowerIsBetter?: boolean; hint: string }[] = [
  { key: 'grounded_pct', label: 'Claims grounded', target: 100, hint: 'Clean copy: share of claims that cite a buyer-safe source' },
  { key: 'numbers_pct', label: 'Numbers match', target: 100, hint: 'Clean copy: figures that equal the value recomputed in code' },
  { key: 'clean_pass_pct', label: 'Clean copy passes', target: 90, hint: 'Clean cases that pass every check and the judge' },
  { key: 'blocked_pct', label: 'Bad copy blocked', target: 100, hint: 'Planted and injected cases that end up blocked' },
  { key: 'judge_recall_pct', label: 'Judge catches traps', target: 95, hint: 'Planted and injected claims the judge flags' },
  { key: 'judge_false_flag_pct', label: 'Judge false flags', target: 5, lowerIsBetter: true, hint: 'Honest generated claims the judge flags' },
];

export const meets = (m: (typeof METRICS)[number], v: number) => (m.lowerIsBetter ? v <= m.target : v >= m.target);

export function EvalBars({ metrics }: { metrics: EvalMetrics }) {
  return (
    <div className="vbars">
      {METRICS.map((m) => {
        const v = metrics[m.key];
        const ok = meets(m, v);
        return [
          <span key={`${m.key}-l`} title={m.hint}>{m.label}</span>,
          <div key={`${m.key}-b`} className={`vbar ${ok ? 'ok' : 'bad'}`} title={`${m.hint}. Target ${m.lowerIsBetter ? '≤' : '≥'} ${m.target}%`}>
            <i style={{ width: `${Math.max(v, 2)}%` }} />
            <span>{v}% <span className="note" style={{ marginLeft: 8 }}>target {m.lowerIsBetter ? '≤' : '≥'} {m.target}%</span></span>
          </div>,
        ];
      })}
    </div>
  );
}
