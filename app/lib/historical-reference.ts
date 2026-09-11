export type ReferenceScope = {
  // These keys require an explicitly verified crosswalk, never free text from a model.
  scopeGroup: string | null;
  loadUnit: string | null;
  projectedLoads: number | null;
  stairs: boolean | null;
  heavyMaterials: boolean | null;
  demolition: boolean | null;
};

export type ReferenceRecord = { scope: ReferenceScope; completedPrice: number | null };
export type HistoricalReferenceResult = {
  status: 'matched' | 'abstained' | 'unavailable';
  matchedCount: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  reasons: string[];
};

export function abstain(reason: string, status: 'abstained' | 'unavailable' = 'abstained'): HistoricalReferenceResult {
  return { status, matchedCount: null, median: null, p25: null, p75: null, reasons: [reason] };
}

export function currentReferenceScope(stairs: 'none' | 'some' | 'heavy'): ReferenceScope {
  // Only stairs has a supported crosswalk today. Risk is not a heavy-material flag;
  // debris category is not demolition work, and carry/load units are not verified.
  return { stairs: stairs !== 'none', scopeGroup: null, loadUnit: null,
    projectedLoads: null, heavyMaterials: null, demolition: null };
}

export function hasComparableScope(scope: ReferenceScope) {
  return Boolean(scope.scopeGroup && scope.loadUnit) && typeof scope.projectedLoads === 'number'
    && Number.isFinite(scope.projectedLoads) && scope.projectedLoads > 0
    && typeof scope.stairs === 'boolean' && typeof scope.heavyMaterials === 'boolean'
    && typeof scope.demolition === 'boolean';
}

export function matchHistoricalReference(scope: ReferenceScope, records: ReferenceRecord[]): HistoricalReferenceResult {
  if (!hasComparableScope(scope)) return abstain('Comparable scope is unverified. Stairs alone cannot establish a meaningful historical match.');
  const matches = records.filter((row) => hasComparableScope(row.scope)
    && row.scope.scopeGroup === scope.scopeGroup && row.scope.loadUnit === scope.loadUnit
    && row.scope.projectedLoads === scope.projectedLoads && row.scope.stairs === scope.stairs
    && row.scope.heavyMaterials === scope.heavyMaterials && row.scope.demolition === scope.demolition);
  // Select on scope first; completed price is used only to summarize selected records.
  const prices = matches.flatMap((row) => typeof row.completedPrice === 'number'
    && Number.isFinite(row.completedPrice) && row.completedPrice > 0 ? [row.completedPrice] : []).sort((a, b) => a - b);
  if (prices.length < 5) return abstain('Fewer than five comparable records have usable completed prices; price summaries are withheld.');
  const quantile = (p: number) => {
    const index = (prices.length - 1) * p;
    return Math.round((prices[Math.floor(index)] + (prices[Math.ceil(index)] - prices[Math.floor(index)]) * (index % 1)) * 100) / 100;
  };
  return { status: 'matched', matchedCount: prices.length, median: quantile(0.5), p25: quantile(0.25), p75: quantile(0.75),
    reasons: ['Same verified scope group and projected load count in verified shared units.',
      'Same recorded stairs, heavy-material and demolition indicators.',
      ...(prices.length < 10 ? ['Small sample; no statistical confidence is claimed.'] : [])] };
}

export async function resolveHistoricalReference(scope: ReferenceScope, load: () => Promise<ReferenceRecord[]>) {
  if (!hasComparableScope(scope)) return matchHistoricalReference(scope, []);
  try { return matchHistoricalReference(scope, await load()); }
  catch { return abstain('Historical data is unavailable. The calculated estimate is unchanged.', 'unavailable'); }
}
