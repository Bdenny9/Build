/** Striped label/value rows, matching Buildout's Ownership panel. */
export function LV({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="lv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
