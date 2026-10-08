import type { volumeBaseline } from './pricing';

// Temporary business policy, shared by new and returning customers. No expiry assumed.
export const TEMPORARY_PROMOTION_RATE = 0.10;
export type MoneyInterval = { low: number; high: number };
export function moneyInterval(value: MoneyInterval) {
  const usd = (n: number) => `$${n.toFixed(2)}`;
  return value.low === value.high ? usd(value.low) : `${usd(value.low)} - ${usd(value.high)}`;
}

// Always start from the original application-calculated baseline, never a discounted total.
export function calculatePromotion(baseline: ReturnType<typeof volumeBaseline>, minimum: number | null, exceptional: boolean) {
  if (![baseline.low, baseline.high].every((n) => Number.isFinite(n) && n >= 0)
    || baseline.low > baseline.high || (minimum !== null && (!Number.isFinite(minimum) || minimum < 0))) throw new Error('Invalid promotion basis.');
  const floor = minimum === null ? 0 : Math.round(minimum * 100);
  const endpoint = (value: number) => {
    const original = Math.max(Math.round(value * 100), floor);
    const total = Math.max(original - Math.round(original * TEMPORARY_PROMOTION_RATE), floor);
    return { original: original / 100, discount: (original - total) / 100, total: total / 100 };
  };
  const low = endpoint(baseline.low), high = endpoint(baseline.high);
  const reasons = [
    ...(minimum === null ? ['The location minimum is not established. Staff must confirm promotion eligibility and the final total; no mandatory minimum is waived.'] : []),
    ...(exceptional ? ['Exceptional work requires staff review. This illustration covers only the volume baseline, not special-service charges.'] : []),
  ];
  return { rate: TEMPORARY_PROMOTION_RATE, original: { low: low.original, high: high.original },
    discount: { low: low.discount, high: high.discount }, total: { low: low.total, high: high.total },
    application: reasons.length ? 'illustration' as const : 'eligible' as const, reasons,
    provisional: true as const };
}
export type Promotion = ReturnType<typeof calculatePromotion>;
