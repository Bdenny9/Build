export interface PayoutInput { price: number; commissionPct: number; brokerSplitPct: number; coBroker: boolean }
export interface Payout { gross: number; listingSide: number; houseShare: number; netToBroker: number }

/** Deterministic commission waterfall. No AI. */
export function computePayout({ price, commissionPct, brokerSplitPct, coBroker }: PayoutInput): Payout {
  const gross = (price * commissionPct) / 100;
  const listingSide = coBroker ? gross / 2 : gross;
  const netToBroker = (listingSide * brokerSplitPct) / 100;
  return { gross, listingSide, houseShare: listingSide - netToBroker, netToBroker };
}
