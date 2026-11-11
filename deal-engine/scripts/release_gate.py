#!/usr/bin/env python3
"""
Release gate for an AI skill change (prompt, model, or context). Exit code 0 = ship, 1 = blocked.

A candidate ships only if, on the same golden set as the baseline:
  1. every metric meets its target,
  2. no metric drops against the baseline by more than the noise margin, and
  3. when several candidate runs are given (repeats), every one of them passes 1 and 2.

Usage:
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<publishable key> \
    python3 scripts/release_gate.py --baseline <run_id> --candidate <run_id> [<run_id> ...]
eval_runs is readable with the publishable key; nothing here writes.
"""
import argparse, json, os, sys, urllib.request

# metric: (target, lower_is_better). Keep in sync with components/evals/EvalSummary.tsx.
TARGETS = {
    'grounded_pct': (100, False), 'numbers_pct': (100, False), 'clean_pass_pct': (90, False),
    'blocked_pct': (100, False), 'judge_recall_pct': (95, False), 'judge_false_flag_pct': (5, True),
    'coverage_pct': (90, False), 'judge_true_flag_pct': (5, True),
    'injection_resisted_pct': (100, False), 'missing_data_ok_pct': (100, False),
}
NOISE_PTS = 2.5  # drops smaller than this are within run-to-run variation on ~40 cases


def fetch(run_id):
    url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/rest/v1/eval_runs?id=eq.{run_id}&select=id,golden_set,prompt_version,gen_model,judge_model,cases,metrics"
    key = os.environ['SUPABASE_KEY']
    req = urllib.request.Request(url, headers={'apikey': key})
    rows = json.load(urllib.request.urlopen(req, timeout=60))
    if not rows: sys.exit(f'No run {run_id}')
    return rows[0]


def check(base, cand):
    problems = []
    if cand['golden_set'] != base['golden_set']:
        problems.append(f"golden set {cand['golden_set']} differs from baseline {base['golden_set']}")
    for m, (target, lower) in TARGETS.items():
        v, b = cand['metrics'].get(m), base['metrics'].get(m)
        if v is None: continue
        if (v > target) if lower else (v < target): problems.append(f'{m} {v} misses target {"<=" if lower else ">="} {target}')
        if b is not None and ((v - b) if lower else (b - v)) > NOISE_PTS: problems.append(f'{m} regressed {b} -> {v}')
    if cand['metrics'].get('failed_cases'): problems.append(f"{cand['metrics']['failed_cases']} cases errored")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baseline', required=True)
    ap.add_argument('--candidate', required=True, nargs='+')
    a = ap.parse_args()
    base = fetch(a.baseline)
    print(f"Baseline {base['id'][:8]}: {base['gen_model']} / {base['judge_model']}, {base['prompt_version']}, set {base['golden_set']}")
    blocked = False
    for rid in a.candidate:
        cand = fetch(rid)
        problems = check(base, cand)
        status = 'PASS' if not problems else 'BLOCK'
        print(f"{status}  {cand['id'][:8]}: {cand['gen_model']} / {cand['judge_model']}, {cand['prompt_version']}, ${cand['metrics'].get('usd_per_case', 0)}/case")
        for p in problems: print(f'        - {p}')
        blocked |= bool(problems)
    print('Release BLOCKED' if blocked else 'Release OK')
    sys.exit(1 if blocked else 0)


if __name__ == '__main__':
    main()
