import type { Zoning } from '@/types/domain';

/** One label for every zoning state, so the app never implies more than the lookup established. */
export function ZoningStatus({ z }: { z: Zoning }) {
  const [label, tip] =
    z.precision === 'none' ? ['No zoning found', 'Zoneomics returned no zone for this parcel. Not verified as unzoned.']
    : z.precision === 'jurisdiction_default' ? ['Jurisdiction default, not verified', 'Zoning applies to the jurisdiction, not verified for this parcel.']
    : ['Not fetched', 'The zoning lookup has not succeeded yet. It is retried the next time your leads load.'];
  return <span className="tag hot" title={tip}>{label}</span>;
}
