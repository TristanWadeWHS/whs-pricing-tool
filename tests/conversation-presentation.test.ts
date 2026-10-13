import { describe, expect, it } from 'vitest';
import { customerEstimate, customerAssumptions, localComparison, serviceGreeting, revealWords, PHOTO_PENDING, SCOPE_PENDING } from '../app/lib/conversation-presentation';
import { volumeBaseline } from '../app/lib/pricing';
import { calculatePromotion } from '../app/lib/promotion';

describe('customer presentation without pricing changes', () => {
  it('shows the application midpoint using existing cents formatting', () => {
    expect(customerEstimate({ low: 252, high: 380 })).toBe('$316');
    expect(customerEstimate({ low: 10, high: 10.01 })).toBe('$10.01');
    expect(customerEstimate({ low: 330, high: 330 })).toBe('$330');
    const baseline = volumeBaseline(60, '');
    expect(customerEstimate(baseline)).toBe('$330');
    expect(baseline.low).toBe(330); expect(baseline.high).toBe(330);
    for (const value of [{ low: NaN, high: 2 }, { low: 2, high: 1 }, { low: -1, high: 1 }, { low: 1, high: Infinity }]) expect(customerEstimate(value)).toBeNull();
  });
  it('does not change discounts or eligibility when presenting promotion amounts', () => {
    const original = volumeBaseline(60, '');
    const promotion = calculatePromotion(original, null, false);
    expect(promotion.rate).toBe(0.1); expect(promotion.application).toBe('illustration');
    expect(customerEstimate(promotion.total)).toBe('$297'); expect(original.low).toBe(330);
  });
  it('calculates the supplied benchmark from load equivalents, never WHS dollars', () => {
    const original = volumeBaseline(60, '');
    expect(localComparison(original)).toEqual({ low: 450, high: 450, display: '$450' });
    expect(original.low).toBe(330);
    expect(localComparison({ equivalents: 0.6, range: [40, 80] })).toEqual({ low: 300, high: 600, display: '$300\u2013$600' });
    expect(localComparison({ equivalents: 0.6, range: [45.818, 69.091] })).toEqual({ low: 343.64, high: 518.18, display: '$343.64\u2013$518.18' });
    expect(localComparison({ equivalents: 0.1 })!.low).toBe(75); // No minimum or automatic claim of savings.
    expect(localComparison({ range: [60, 60] })!.display).toBe('$450');
  });
  it('omits missing or invalid load evidence instead of inventing a comparison', () => {
    for (const load of [null, {}, { equivalents: NaN }, { equivalents: Infinity }, { equivalents: -1 }, { equivalents: 0 }]) expect(localComparison(load)).toBeNull();
    for (const range of [[80, 40], [NaN, 60], [10, Infinity], [-1, 60], [0, 60]] as [number, number][]) expect(localComparison({ equivalents: 0.6, range })).toBeNull();
  });
  it('offers room guidance only for a cleanout or explicit request', () => {
    const greeting = serviceGreeting(['Junk pickup'], ['A sofa and boxes.']);
    expect(greeting).toBe("Happy to help with junk pickup! Tell me what needs to go and add some photos whenever you're ready. Please be as descriptive as you can so I can give you a more accurate estimate. If I need clarification, I'll ask.");
    expect(greeting).not.toContain('room');
    expect(serviceGreeting(['Junk pickup'], ['Property cleanout.'])).toContain('room by room');
    expect(serviceGreeting(['Furniture', 'Light demolition'], ['Help room-by-room.'])).toContain('furniture and light demolition');
  });
  it('reveals complete words within a bounded time without staggering money', () => {
    const text = 'One two\nthree. '; const words = revealWords(text);
    expect(words.map((w) => w.word).join('')).toBe(text);
    expect(words.map((w) => w.delay)).toEqual([0, 32, 64]);
    expect(revealWords('Long '.repeat(300)).at(-1)!.delay).toBeLessThan(1800);
    expect(revealWords('Estimate $316 ready.').every((w) => w.delay === 0)).toBe(true);
  });
  it('keeps arithmetic out of customer assumptions and prices out of loading text', () => {
    expect(customerAssumptions(['Boards stack flat.', '5 cubic yards.', 'No additional compaction factor.', '$550 per load.'])).toEqual(['Boards stack flat.']);
    expect(PHOTO_PENDING).toBe('Winston is looking everything over. One moment.');
    expect(SCOPE_PENDING).toContain('scope details');
    expect(PHOTO_PENDING + SCOPE_PENDING).not.toMatch(/\$|\d/);
  });
});
