import type { JobInputs } from './pricing';
import type { ClarificationFact, FactState } from './clarification-facts';
import type { ShadowEvidence } from './shadow-schema';
import type { VolumeResult } from './shadow-volume';

export type ReadinessCheck = { label: string; state: FactState };
export const READINESS_WEIGHTS = { scope: 25, identification: 20, volume: 30, material: 15, access: 10 };
export type ReadinessComponent = { id: keyof typeof READINESS_WEIGHTS; label: string; weight: number;
  effectiveWeight: number; fraction: number | null; checks: ReadinessCheck[] };

export function scoreReadiness(components: Array<Pick<ReadinessComponent, 'id' | 'label' | 'checks'>>) {
  const applicable = components.filter((component) => component.checks.some((check) => check.state !== 'not_applicable'));
  const denominator = applicable.reduce((sum, component) => sum + READINESS_WEIGHTS[component.id], 0);
  const scored = components.map((component): ReadinessComponent => {
    const checks = component.checks.filter((check) => check.state !== 'not_applicable');
    return { ...component, weight: READINESS_WEIGHTS[component.id],
      effectiveWeight: checks.length && denominator ? READINESS_WEIGHTS[component.id] / denominator * 100 : 0,
      fraction: checks.length ? checks.filter((check) => check.state === 'resolved').length / checks.length : null };
  });
  return { score: denominator ? scored.reduce((sum, c) => sum + c.effectiveWeight * (c.fraction ?? 0), 0) : null,
    components: scored };
}

export function buildReadiness(inputs: JobInputs, facts: ClarificationFact[], inventory: ShadowEvidence | null, volume: VolumeResult) {
  const state = (id: ClarificationFact['id']) => facts.find((fact) => fact.id === id)?.state ?? 'unknown';
  const known = (test: boolean): FactState => test ? 'resolved' : 'unknown';
  const items = inventory?.items ?? [];
  const hasItems = items.length > 0;
  const result = scoreReadiness([
    { id: 'scope', label: 'Removal scope', checks: [{ label: 'Attributed scope answer', state: state('hidden') }] },
    { id: 'identification', label: 'Identification / visibility', checks: [
      { label: 'Item identities and counts', state: known(hasItems && items.every((i) => i.identification === 'identified' && i.quantity !== null)) },
      { label: 'Photo overlap / containment', state: known(volume.status === 'available') },
      { label: 'Container contents', state: state('contents') }
    ] },
    { id: 'volume', label: 'Dimensions / volume', checks: [
      { label: 'Supported loaded-envelope calculation', state: known(volume.status === 'available') },
      { label: 'Employee dimension evidence (not visual guesses)', state: known(volume.status === 'available'
        && volume.lines.every((line) => line.source === 'employee_report' || line.source === 'employee_measurement')) }
    ] },
    { id: 'material', label: 'Material / weight', checks: [
      { label: 'Material identification', state: known(hasItems && items.every((i) => i.material !== 'unknown')) },
      { label: 'Documented weight / payload evidence', state: 'unknown' }
    ] },
    { id: 'access', label: 'Access / labor / disassembly', checks: [
      { label: 'Recorded carry and stairs', state: known(Boolean(inputs.carryDistance && inputs.stairs)) },
      { label: 'Disassembly answer', state: state('dismantling') }
    ] }
  ]);
  const blockers = [
    ...facts.filter((fact) => fact.state === 'conflicting').map((fact) => `${fact.id}: contradictory evidence requires staff review.`),
    ...(state('hidden') !== 'resolved' ? ['Removal scope is not resolved.'] : []),
    ...(volume.status !== 'available' ? volume.reasons : []),
    ...(volume.weight.dense || volume.weight.restricted ? ['Dense/restricted material requires handling and weight review.'] : []),
    'Weight and legal payload/towing evidence is unavailable; this diagnostic cannot approve hauling.'
  ];
  return { ...result, blockers, policy: 'Provisional policy weights; shadow only. Not pricing accuracy, probability or a confidence interval.',
    historicalSupport: 'Separate: unverified comparable scope; no readiness credit.' };
}
