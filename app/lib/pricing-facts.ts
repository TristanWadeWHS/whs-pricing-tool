import type { VisionAnalysis } from './analysis-schema';
import type { JobInputs } from './pricing';
import type { ClarificationAnswer } from './clarification';
import { reconcileClarificationFacts, normalizeClarificationAnswer } from './clarification-facts';

type Evidence = { source: 'original_notes' | 'signed_clarification' | 'model_observation'; text: string };
type Handling = 'low' | 'medium' | 'high' | 'unknown' | 'conflicting';
const uncertain = /\b(?:may|might|possibly|possible|potential|unknown|unclear|not sure|assum(?:e|ed|ption))\b/i;
const onePerson = /\b(?:one|1|single) (?:person|worker)\b/i;
const highHandling = /\b(?:requires?|needs?|takes?) (?:at least )?(?:two|three|four|[2-9])(?: or more)? (?:people|persons?|workers?)\b|\b(?:two|three|[2-9])(?: or more)? (?:people|persons?|workers?) (?:are )?(?:required|needed)\b/i;
const equipment = /\b(?:needs?|requires?) (?:a |an )?(?:dolly|hand truck|lifting equipment|handling equipment)\b/i;
const easyCarry = /(?:carr(?:y|ies|ied)|mov(?:e|es|ed)).{0,30}easily|easily.{0,30}(?:carr|mov)/i;
const accessOnly = /(?:because of|due to|for|on|over).{0,40}(?:stairs|long carry|carry distance|long distance)/i;
const extraScope = /\b(?:additional|extra|hidden) (?:items|bags|debris|material|boxes) (?:are |is )?(?:visible|present|underneath|behind)|\b(?:bags|debris|material) (?:are |is )?visible (?:underneath|behind)/i;
const exceptional = /\bsubstantial demolition\b|\brepeated (?:long[- ]distance|long carry) (?:movement|moving|carrying)|\b(?:requires?|needs?) (?:substantial )?(?:jackhammering|structural demolition)/i;
const hazard = /\b(?:asbestos|chemicals?|hazardous|restricted|concrete|dirt|tile|drywall|demolition debris|dense material)\b/i;

export function coreLoadUnits(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 200) throw new Error('Invalid core load percent.');
  // One source of truth; no second compaction factor or inferred payload allowance.
  const equivalents = percent / 100;
  return { percent, cubicYards: Number((equivalents * 12).toFixed(4)), trailerEquivalents: equivalents,
    volumeOnlyTrips: Math.ceil(equivalents), trailerCubicYards: 12 as const };
}

export function reconcilePricingFacts(inputs: JobInputs, analysis: VisionAnalysis, answers: ClarificationAnswer[] = [], photoCount = 0) {
  const facts = reconcileClarificationFacts(inputs.notes, answers, analysis.shadow?.contradictions, photoCount);
  const evidence: Evidence[] = [
    ...inputs.notes.split(/[.!?;\n]+/).filter(Boolean).map((text) => ({ source: 'original_notes' as const, text: text.trim() })),
    ...answers.filter((answer) => ['contents', 'dismantling'].includes(answer.id)).flatMap((answer) => {
      const normalized = normalizeClarificationAnswer(answer);
      return normalized.notSure ? [] : [{ source: 'signed_clarification' as const, text: normalized.answer }];
    }),
    ...analysis.observedFacts.map((text) => ({ source: 'model_observation' as const, text }))
  ];
  const definite = evidence.filter((entry) => !uncertain.test(entry.text));
  const handlingEvidence = definite.flatMap((entry) => {
    if (accessOnly.test(entry.text)) return [];
    const level: Handling = highHandling.test(entry.text) && !/\b(?:not|never) (?:required|needed)|\b(?:does not|doesn't) (?:require|need)/i.test(entry.text) ? 'high'
      : onePerson.test(entry.text) && equipment.test(entry.text) && !/\bno (?:dolly|equipment)|without (?:a )?dolly|does not (?:need|require)/i.test(entry.text) ? 'medium'
        : onePerson.test(entry.text) && easyCarry.test(entry.text) && !/\bnot easily|cannot|can't/i.test(entry.text) ? 'low' : 'unknown';
    return level === 'unknown' ? [] : [{ ...entry, level }];
  });
  const lowClaim = handlingEvidence.some((entry) => entry.level === 'low' && entry.source !== 'model_observation');
  const conflict = lowClaim && handlingEvidence.some((entry) => entry.level !== 'low');
  const handling: { level: Handling; evidence: Evidence[] } = { level: conflict ? 'conflicting'
    : handlingEvidence.some((entry) => entry.level === 'high') ? 'high'
      : handlingEvidence.some((entry) => entry.level === 'medium') ? 'medium'
        : handlingEvidence.length ? 'low' : 'unknown', evidence: handlingEvidence };
  const scope = facts.find((fact) => fact.id === 'hidden')!;
  const extra = definite.filter((entry) => extraScope.test(entry.text) && !/\bno (?:additional|extra|hidden)|nothing hidden/i.test(entry.text));
  const noExtra = scope.state === 'resolved' && /no additional|nothing|only.*(?:visible|shown|photo)|all.*included/i.test(scope.value ?? '');
  const hidden = { state: scope.state === 'conflicting' || (noExtra && extra.length) ? 'conflicting' as const
    : noExtra ? 'resolved' as const : extra.length ? 'confirmed_extra' as const : 'unknown' as const,
    evidence: [...(scope.value ? [{ source: scope.source, text: scope.value }] : []), ...extra] };
  const laborEvidence = definite.filter((entry) => exceptional.test(entry.text) && !/\bno substantial|no demolition|no repeated/i.test(entry.text));
  const labor = { state: laborEvidence.length ? 'exceptional_review' as const : 'routine_included' as const, evidence: laborEvidence };
  const hazards = definite.filter((entry) => hazard.test(entry.text) && !/\bno (?:hazardous|restricted|concrete|demolition)|no evidence of/i.test(entry.text));
  const reviewReasons = [
    ...(['medium', 'high'].includes(handling.level) ? ['Handling assistance is required; staff must verify the equipment/crew requirement before quoting.'] : []),
    ...(handling.level === 'unknown' ? ['Handling requirements are unverified; no automatic heavy adjustment.'] : []),
    ...(handling.level === 'conflicting' ? ['Handling evidence conflicts; no automatic heavy adjustment until staff resolves it.'] : []),
    ...(hidden.state === 'conflicting' ? ['Additional-scope evidence contradicts the confirmed removal scope.'] : []),
    ...(hidden.state === 'confirmed_extra' ? ['Confirm additional material is included in the modeled volume; do not add an uncertainty surcharge.'] : []),
    ...(laborEvidence.length ? ['Exceptional labor needs staff pricing: no approved task-specific rate is defined. Explicit carry/stairs charges apply once only.'] : []),
    ...(hazards.length || analysis.heavyDebrisRisk !== 'low' ? ['Material/disposal safety review is separate from handling. No automatic hazard fee is defined.'] : [])
  ];
  return { handling, hidden, labor, hazards, reviewReasons, load: coreLoadUnits(analysis.estimatedLoadPercent), packingAssumptions: [
    'Model-estimated efficiently loaded volume in a nominal 12-cubic-yard trailer; not a measured inventory.',
    'Nesting/stacking and folding/flattening require support for these items. Filled boxes retain their contents; chairs are not assumed dismantlable.',
    'No extra compaction discount is applied to the already-loaded volume. Substantial demolition is not included as routine packing.',
    ...analysis.assumptions.filter((text) => /pack|nest|stack|fold|flatten|compact|breakdown|disassembl/i.test(text)
      && !(facts.find((fact) => fact.id === 'dismantling')?.state === 'resolved' && /no disassembly/i.test(facts.find((fact) => fact.id === 'dismantling')?.value ?? '') && /disassembl|breakdown/i.test(text)))
      .map((text) => `Unverified model packing assumption: ${text}`)
  ] };
}
export type PricingFacts = ReturnType<typeof reconcilePricingFacts>;
