import type { MoneyInterval } from './promotion';

export const WINSTON_GREETING = "Hi, I'm Winston! I'm excited to help you make some space. What can the Wade Home Services team take off your hands today?";
export const ESTIMATE_INTRO = 'Thanks for walking through the details with me. Your estimate is ready below. Our team will confirm the final price.';
export const PHOTO_PENDING = 'Winston is looking everything over. One moment.';
export const SCOPE_PENDING = "Got it. I'm reviewing the scope details and getting you a precise price.";

export function customerAssumptions(assumptions: string[]) {
  return assumptions.filter((text) => !/\$|%|cubic|\byards?\b|\b(?:formula|factor|percentage|equivalent|calculation)\b|loaded group volumes/i.test(text));
}

// Presentation only: preserve the original interval and existing cent rounding.
export function customerEstimate(value: MoneyInterval): string | null {
  if (![value.low, value.high].every((n) => Number.isFinite(n) && n >= 0) || value.low > value.high) return null;
  const lowCents = Math.round((value.low + Number.EPSILON) * 100);
  const highCents = Math.round((value.high + Number.EPSILON) * 100);
  const midpoint = Math.round((lowCents + highCents) / 2) / 100;
  return `$${Number.isInteger(midpoint) ? midpoint : midpoint.toFixed(2)}`;
}

// WHS-supplied indicative benchmark, not a market survey or a pricing input.
export const LOCAL_COMPARISON_RATE = 750;
export function localComparison(load: { range?: [number, number] | null; equivalents?: number } | null) {
  if (!load) return null;
  // Core range endpoints are percentages of the same nominal trailer, not dollars.
  const equivalents = load.range == null ? [load.equivalents, load.equivalents] : load.range.map((percent) => percent / 100);
  const [lower, upper] = equivalents;
  if (typeof lower !== 'number' || typeof upper !== 'number' || ![lower, upper].every((n) => Number.isFinite(n) && n > 0) || lower > upper) return null;
  const low = Math.round((lower * LOCAL_COMPARISON_RATE + Number.EPSILON) * 100) / 100;
  const high = Math.round((upper * LOCAL_COMPARISON_RATE + Number.EPSILON) * 100) / 100;
  if (![low, high].every(Number.isFinite)) return null;
  const lowerDisplay = customerEstimate({ low, high: low });
  const upperDisplay = customerEstimate({ low: high, high });
  return { low, high, display: low === high ? lowerDisplay : `${lowerDisplay}\u2013${upperDisplay}` };
}

export function serviceGreeting(labels: string[], messages: string[]) {
  const cleanout = messages.some((text) => /\b(?:property|whole[- ]house|house|estate)\s+clean\s*out\b|\broom[- ]by[- ]room\b/i.test(text));
  const service = labels.length ? labels.map((s) => s.toLowerCase()).join(' and ') : 'your removal';
  return `Happy to help with ${service}! Tell me what needs to go and add some photos whenever you're ready. Please be as descriptive as you can so I can give you a more accurate estimate. If I need clarification, I'll ask.${cleanout ? ' We can work through the property room by room.' : ''}`;
}

export function revealWords(text: string) {
  const words = text.match(/\S+\s*/g) ?? [];
  // A dollar amount is never progressively exposed. Normal analysis messages
  // contain no prices; this also protects promotion/other completed messages.
  const step = /\$|\bUSD\b/.test(text) ? 0 : Math.min(32, 1800 / Math.max(1, words.length));
  return words.map((word, i) => ({ word, delay: i * step }));
}
