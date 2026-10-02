import type { VisionAnalysis } from './analysis-schema';
import type { PricingFacts } from './pricing-facts';
import type { ResolvedLocation } from './location-resolution';

export type JobInputs = {
  location?: ResolvedLocation;
  distanceTier: 'under25' | '25to40' | '40to65';
  distanceTierSource?: 'verified_city_route' | 'staff_confirmed';
  jobType: string;
  jobTypes?: string[];
  carryDistance: 'curbside' | 'short' | 'medium' | 'long';
  stairs: 'none' | 'some' | 'heavy';
  staffAddOns?: string[];
  workers: number | null;
  notes: string;
};

export const FULL_LOAD_RATE = 550;
export function selectedJobTypes(inputs: JobInputs) { return inputs.jobTypes ?? [inputs.jobType]; }

// Existing approved access rates, never derived from model observations or notes.
export function availableAccessAddOns(inputs: { carryDistance: string; stairs: string }) {
  const items: { id: string; label: string; amount: number }[] = [];
  if (inputs.carryDistance === 'medium') items.push({ id: 'carry_medium', label: 'Medium carry', amount: 40 });
  if (inputs.carryDistance === 'long') items.push({ id: 'carry_long', label: 'Long carry', amount: 90 });
  if (inputs.stairs === 'some') items.push({ id: 'stairs_some', label: 'Stairs', amount: 40 });
  if (inputs.stairs === 'heavy') items.push({ id: 'stairs_heavy', label: 'Heavy stairs', amount: 100 });
  return items;
}

export function validStaffAddOns(inputs: { carryDistance: string; stairs: string }, ids: unknown[]): ids is string[] {
  const available = availableAccessAddOns(inputs);
  return ids.length <= 2 && new Set(ids).size === ids.length
    && ids.every((id) => typeof id === 'string' && available.some((item) => item.id === id));
}

// Only an explicit, bounded percentage interval is usable. Never extract numbers
// from prose, dollar amounts, cubic yards, load counts or an uncertainty score.
export function loadedPercentRange(text: string, point: number): [number, number] | null {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*%?\s*(?:-|\u2013|\u2014|to)\s*(\d+(?:\.\d+)?)\s*%(?:\s+of\s+(?:(?:a|the)\s+)?12[- ](?:cubic[- ]yard|yard|yd)\s+trailer)?\.?$/i);
  if (!match) return null;
  const low = Number(match[1]), high = Number(match[2]);
  return low >= 1 && high <= 200 && low < high && low <= point && point <= high ? [low, high] : null;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dollars = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

export function priceJob(inputs: JobInputs, analysis: VisionAnalysis, _reconciled?: PricingFacts) {
  const minimums = { under25: 130, '25to40': 145, '40to65': 175 };
  const minPrice = minimums[inputs.distanceTier];
  const percent = analysis.estimatedLoadPercent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 1 || percent > 200 || !minPrice) {
    throw new Error('Pricing requires a valid estimated load percent and distance tier.');
  }
  const ids = inputs.staffAddOns ?? [];
  if (!validStaffAddOns(inputs, ids)) throw new Error('Invalid staff-approved add-on.');
  const lineItems = availableAccessAddOns(inputs).filter((item) => ids.includes(item.id));
  const adjustments = lineItems.reduce((total, item) => total + item.amount, 0);
  const adjustmentNotes = lineItems.map((item) => `Staff-approved ${item.label}: +${dollars(item.amount)}`);
  const volumeBasePrice = money(percent / 100 * FULL_LOAD_RATE);
  const baseLoadPrice = Math.max(minPrice, volumeBasePrice);
  const amount = (load: number) => money(Math.max(minPrice, load / 100 * FULL_LOAD_RATE) + adjustments);
  const range = loadedPercentRange(analysis.estimatedLoadRange, percent);
  const low = amount(range?.[0] ?? percent), high = amount(range?.[1] ?? percent);
  const suggested = amount(percent);
  return {
    minimumPrice: minPrice, volumeBasePrice, baseLoadPrice, adjustments, adjustmentNotes, lineItems,
    estimateBasis: range ? 'model_load_range' as const : 'model_load_point' as const,
    loadPercentRange: range, priceLow: low, priceHigh: high,
    calculationNote: range
      ? 'Endpoints calculated from the model-estimated loaded-volume range; not a statistical prediction interval.'
      : 'Provisional baseline from the model-estimated load percentage. No usable explicit percentage interval; no wider price range invented.',
    recommendedRange: low === high ? dollars(low) : `${dollars(low)}\u2013${dollars(high)}`,
    suggestedQuote: suggested,
    customerMessage: `The calculated estimate is ${low === high ? dollars(low) : `${dollars(low)} to ${dollars(high)}`}, subject to staff approval and confirmation of the described removal scope and access. Additional scope requires review.`
  };
}

export type PricingResult = ReturnType<typeof priceJob>;
