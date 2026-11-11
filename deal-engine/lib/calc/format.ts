export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const moneyShort = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
export const int = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;
export const monthYear = (iso: string) =>
  new Date(iso.length === 7 ? iso + '-15T12:00:00' : iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
export const shortDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
