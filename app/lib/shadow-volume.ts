import { shadowEvidenceSchema, type InventoryItem, type ShadowEvidence } from './shadow-schema';

export const NOMINAL_TRAILER_YARDS = 12;
const toYards = { in: 1 / 36, ft: 1 / 3, yd: 1, cm: 1 / 91.44, m: 1 / 0.9144 };
const unitAliases: Record<string, keyof typeof toYards> = { in: 'in', inches: 'in', ft: 'ft', feet: 'ft', foot: 'ft',
  yd: 'yd', yards: 'yd', cm: 'cm', m: 'm', meters: 'm' };
type Range = { min: number; max: number };
export type VolumeResult = {
  status: 'available' | 'unavailable'; reasons: string[];
  cubicYards: Range | null; loadEquivalents: Range | null; volumeOnlyTrips: Range | null;
  lines: Array<{ item: number; quantity: number; dimensionsYards: Range[]; factor: Range; cubicYards: Range;
    source: string; packing: string; photoRefs: number[] }>;
  countedGroups: number; omittedConstituents: number; mergedViews: number;
  weight: { status: 'review_required'; dense: boolean; restricted: boolean; payloadEvidence: 'unavailable' };
};
const unavailable = (reason: string, weight: VolumeResult['weight']): VolumeResult => ({
  status: 'unavailable', reasons: [reason], cubicYards: null, loadEquivalents: null, volumeOnlyTrips: null,
  lines: [], countedGroups: 0, omittedConstituents: 0, mergedViews: 0, weight
});
function supportedEvidence(e: InventoryItem['packing']['evidence'], employeeText: string) {
  return e.source === 'photo_estimate' || ((e.source === 'employee_report' || e.source === 'employee_measurement')
    && e.excerpt.trim().length >= 3 && employeeText.includes(e.excerpt));
}
function ordered(range: Range) { return range.min <= range.max; }
function quotedNumbers(excerpt: string, numbers: number[]) {
  const recorded = (excerpt.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  return numbers.every((n) => recorded.includes(n));
}

export function calculateShadowVolume(raw: unknown, photoCount: number, employeeText: string): VolumeResult {
  const parsed = shadowEvidenceSchema.safeParse(raw);
  const weight: VolumeResult['weight'] = { status: 'review_required', dense: false, restricted: false, payloadEvidence: 'unavailable' };
  if (!parsed.success) return unavailable('Structured inventory is missing or invalid.', weight);
  const items = parsed.data.items;
  weight.dense = items.some((item) => item.material === 'dense');
  weight.restricted = items.some((item) => item.material === 'restricted');
  if (!items.length) return unavailable('No inventory supports a volume calculation.', weight);
  const unique = new Map<string, InventoryItem>();
  let mergedViews = 0;
  for (const item of items) {
    if (item.photoRefs.some((ref) => ref > photoCount)) return unavailable('Inventory refers to a photo outside this request.', weight);
    const prior = unique.get(item.id);
    if (prior) {
      const { photoRefs: _a, ...a } = prior; const { photoRefs: _b, ...b } = item;
      if (JSON.stringify(a) !== JSON.stringify(b)) return unavailable('The same inventory ID has conflicting descriptions.', weight);
      unique.set(item.id, { ...prior, photoRefs: [...new Set([...prior.photoRefs, ...item.photoRefs])] });
      mergedViews++;
    } else unique.set(item.id, item);
  }
  for (const item of unique.values()) {
    const visited = new Set([item.id]); let parent = item.parentId;
    while (parent) {
      const node = unique.get(parent);
      if (!node || node.kind === 'item' || visited.has(parent)) return unavailable('Inventory containment is missing, cyclic or invalid.', weight);
      visited.add(parent); parent = node.parentId;
    }
    if (item.overlap === 'uncertain') return unavailable('Possible overlapping items or piles require reconciliation.', weight);
  }
  // Count only root envelopes: never add a pile and the items already inside it.
  const roots = [...unique.values()].filter((item) => item.parentId === null);
  const lines: VolumeResult['lines'] = [];
  for (const [index, item] of roots.entries()) {
    const d = item.dimensions; const p = item.packing;
    if (!item.quantity || !d || ![d.length, d.width, d.height].every(ordered)
      || !supportedEvidence(d.evidence, employeeText)) return unavailable('Quantity, bounded dimensions or their evidence is missing/invalid.', weight);
    if (!supportedEvidence(item.quantityEvidence, employeeText)
      || (item.quantityEvidence.source !== 'photo_estimate' && !quotedNumbers(item.quantityEvidence.excerpt, [item.quantity]))) {
      return unavailable('Inventory quantity lacks supported count evidence.', weight);
    }
    const quotedUnits = [...d.evidence.excerpt.toLowerCase().matchAll(/\d\s*(inches|in|feet|foot|ft|yards|yd|cm|meters|m)\b/g)]
      .map((match) => unitAliases[match[1]]);
    if (d.evidence.source !== 'photo_estimate' && (!quotedNumbers(d.evidence.excerpt,
      [d.length.min, d.length.max, d.width.min, d.width.max, d.height.min, d.height.max])
      || !quotedUnits.length || quotedUnits.some((unit) => unit !== d.unit))) {
      return unavailable('Employee dimension attribution lacks the quoted numeric bounds and units.', weight);
    }
    if (d.evidence.source === 'employee_measurement' && !/measur|tape|ruler/i.test(d.evidence.excerpt)) {
      return unavailable('A measurement source requires an explicit employee measurement statement.', weight);
    }
    if (d.state === 'after_disassembly' && (p.disassembly !== 'confirmed'
      || !['employee_report', 'employee_measurement'].includes(p.evidence.source)
      || !/disassembl|dismantl/i.test(p.evidence.excerpt) || /no disassembl|no dismantl|not sure|unknown/i.test(p.evidence.excerpt))) return unavailable('Reduced dimensions require explicitly confirmed disassembly.', weight);
    if (!supportedEvidence(p.evidence, employeeText) || p.basis === 'unknown') return unavailable('Loaded-envelope or job-specific packing evidence is missing.', weight);
    let factor = { min: 1, max: 1 };
    if (p.basis === 'explicit_factor') {
      if (!p.factor || !ordered(p.factor) || p.factor.min < 1 || p.factor.max > 3
        || !['employee_report', 'employee_measurement'].includes(p.evidence.source)
        || !/packing|factor|void/i.test(p.evidence.excerpt) || !quotedNumbers(p.evidence.excerpt, [p.factor.min, p.factor.max])) {
        return unavailable('Packing expansion requires a quoted employee-specified factor between 1 and 3.', weight);
      }
      factor = p.factor;
    } else if (p.factor && (p.factor.min !== 1 || p.factor.max !== 1)) {
      return unavailable('Loaded envelopes already include voids; an additional factor would double count them.', weight);
    }
    const dimensionsYards = [d.length, d.width, d.height].map((range) => ({ min: range.min * toYards[d.unit], max: range.max * toYards[d.unit] }));
    const cubicYards = { min: item.quantity * dimensionsYards.reduce((v, r) => v * r.min, 1) * factor.min,
      max: item.quantity * dimensionsYards.reduce((v, r) => v * r.max, 1) * factor.max };
    if (!Number.isFinite(cubicYards.max)) return unavailable('Volume arithmetic is invalid.', weight);
    lines.push({ item: index + 1, quantity: item.quantity, dimensionsYards, factor, cubicYards,
      source: d.evidence.source, packing: p.basis, photoRefs: item.photoRefs });
  }
  const cubicYards = lines.reduce((sum, line) => ({ min: sum.min + line.cubicYards.min, max: sum.max + line.cubicYards.max }), { min: 0, max: 0 });
  const loadEquivalents = { min: cubicYards.min / NOMINAL_TRAILER_YARDS, max: cubicYards.max / NOMINAL_TRAILER_YARDS };
  return { status: 'available', reasons: ['Conditional geometric envelope, not measured accuracy. Packing/identity remain evidence-dependent.',
    'Whole-trip figures are volume-only lower bounds, not a safe hauling plan. Weight, fit and disposal can require more trips.'],
    cubicYards, loadEquivalents, volumeOnlyTrips: { min: Math.ceil(loadEquivalents.min), max: Math.ceil(loadEquivalents.max) },
    lines, countedGroups: roots.length, omittedConstituents: unique.size - roots.length, mergedViews, weight };
}

export function validatedShadowEvidence(raw: unknown): ShadowEvidence | null {
  const parsed = shadowEvidenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
