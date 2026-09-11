import type { VisionAnalysis } from './analysis-schema';
import type { JobInputs } from './pricing';
import type { ClarificationAnswer } from './clarification';
import { FACT_LABELS, normalizeClarificationAnswer, reconcileClarificationFacts } from './clarification-facts';

export const INTERNAL_ESTIMATE_LABEL = 'Internal estimate \u2014 requires review before quoting';
export type PriceDriver = { topic: string; state: 'resolved' | 'review' | 'unknown'; message: string; evidence: string[] };
const topics = {
  heavy: /heavy|dense|concrete|dirt|tile|drywall|appliance|demolition|metal|restricted|hazard|asbestos|chemical|material composition/i,
  hidden: /hidden|underneath|behind|outside.*photo|additional.*(?:item|material)|out of frame/i,
  labor: /labor|access|stairs|carry|disassembl|dismantl|bolted|attached|fixed in place/i,
  dimensions: /dimensions|measurements?|(?:size|volume).*unclear|unclear.*(?:size|volume)|scale/i
};
function safeEvidence(text: string) {
  return /[$\u20ac\u00a3]|\b(?:price|quote|cost|charge)\b.{0,30}\d/i.test(text)
    ? 'Model text included unsupported pricing; inspect the physical scope instead.' : text;
}

export function assessInternalEstimate(inputs: JobInputs, analysis: VisionAnalysis, answers: ClarificationAnswer[], photoCount: number) {
  const facts = reconcileClarificationFacts(inputs.notes, answers, analysis.shadow?.contradictions, photoCount);
  const fact = (id: ClarificationAnswer['id']) => facts.find((entry) => entry.id === id)!;
  const text = [...analysis.uncertaintyNotes, ...analysis.warnings, analysis.estimatedLoadRange].join('. ');
  const essentialReasons: string[] = [];
  const essentialQuestions: ClarificationAnswer['id'][] = [];
  if (!analysis.visibleItems.length) {
    essentialReasons.push('No identifiable removal items were supplied by the core analysis. Confirm the items to remove.');
    essentialQuestions.push('hidden');
  }
  if (/(?:cannot|unable to)\s+(?:estimate|bound|determine|quantify)\s+(?:the\s+)?(?:visible\s+|total\s+)?(?:load|volume|quantity|removal scope)|(?:visible |total )?(?:volume|quantity|removal scope)\s+(?:is |remains )?(?:unbounded|not estimable)/i.test(text)) {
    essentialReasons.push('Core analysis explicitly cannot bound the removal volume or quantity. Supply dimensions or item counts before pricing.');
    essentialQuestions.push('dimensions');
  }
  const scopeAnswer = answers.find((answer) => answer.id === 'hidden');
  if (scopeAnswer && /Additional removal items exist; quantity and scope are unknown/.test(normalizeClarificationAnswer(scopeAnswer).answer)) {
    essentialReasons.push('Additional removal items were confirmed, but their type and quantity are unspecified. The total job cannot yet be priced.');
    essentialQuestions.push('hidden');
  }
  if (fact('hidden').state === 'conflicting') {
    essentialReasons.push('The included removal scope conflicts with the original notes or identified visual evidence. Resolve the included items before pricing.');
    essentialQuestions.push('hidden');
  }
  if (analysis.estimatedLoadCount > 2) {
    essentialReasons.push('The core analysis indicates more than two loads, beyond the existing percentage-based pricing calculation. Manager scope pricing is required.');
  }

  const drivers: PriceDriver[] = [];
  const observations = (pattern: RegExp) => analysis.observedFacts.filter((value) => pattern.test(value)
    && !/\bno (?:heavy|dense|concrete|hidden|additional|disassembly|dismantling|stairs)|nothing (?:hidden|underneath)|not (?:attached|bolted)/i.test(value)
    && !/\b(?:may|might|possible|potential|unclear|unknown|uncertain)\b/i.test(value)).map((value) => `Model observation (not independently verified): ${safeEvidence(value)}`);
  for (const [topic, id, flag] of [
    ['heavy', 'contents', analysis.heavyDebrisRisk], ['hidden', 'hidden', analysis.hiddenDebrisRisk],
    ['labor', 'dismantling', analysis.difficulty]
  ] as const) {
    const current = fact(id); const observed = observations(topics[topic]);
    const resolved = current.state === 'resolved' || current.state === 'not_applicable';
    const activeFlag = flag !== 'low' && flag !== 'easy';
    if (!resolved && !activeFlag && !observed.length && current.source === 'none') continue;
    const evidence = [
      ...(current.value ? [`${current.source === 'signed_clarification' ? 'Answer to ' + id : 'Original notes'}: ${safeEvidence(current.value)}`] : []),
      ...observed,
      ...(topic === 'labor' ? [`Employee inputs: ${inputs.carryDistance} carry; stairs ${inputs.stairs}.`] : []),
      ...(activeFlag ? [`Model ${topic} flag: ${flag}. The existing pricing adjustment and firm-quote safeguard are retained.`] : [])
    ];
    drivers.push({ topic, state: observed.length || current.state === 'conflicting' ? 'review' : resolved ? 'resolved' : 'unknown',
      message: observed.length ? 'Specific model-observed evidence needs staff review; answers do not erase it.'
        : resolved ? `${FACT_LABELS[id]} answered. No specific contradictory visual evidence was supplied.${activeFlag ? ' Review the retained model adjustment; this is not a repeated customer question.' : ''}`
          : `${FACT_LABELS[id]} remains an assumption.${activeFlag ? ' No specific visual support for the model flag was supplied.' : ''}`,
      evidence });
  }
  if (topics.dimensions.test(text)) drivers.push({ topic: 'dimensions', state: fact('dimensions').state === 'resolved' ? 'resolved' : 'unknown',
    message: fact('dimensions').state === 'resolved' ? 'Dimensions were provided; no measurement verification is implied.' : 'Dimensions remain unverified; the range uses the core model load estimate, not measured inventory.',
    evidence: [`Core load estimate: ${analysis.estimatedLoadPercent}% / ${analysis.estimatedLoadCount} load equivalents.`] });
  for (const warning of analysis.warnings.filter((warning) => !Object.values(topics).some((pattern) => pattern.test(warning)) && !/box|bag|container|contents/i.test(warning))) {
    drivers.push({ topic: 'other', state: 'review', message: 'Additional model warning requires staff review.', evidence: [`Model warning: ${safeEvidence(warning)}`] });
  }
  return { facts, essentialReasons, essentialQuestions, drivers, assumptions: [
    `Uses the model's ${analysis.estimatedLoadPercent}% loaded-volume estimate and the unchanged WHS pricing rules.`,
    `Access as entered: ${inputs.carryDistance} carry, stairs ${inputs.stairs}; distance tier ${inputs.distanceTier}.`,
    fact('hidden').state === 'resolved' ? 'Removal is limited to the scope confirmed in the original details and clarification.' : 'Provisional range assumes the described/photographed items only; additional scope is not included.',
    'The policy price range is not a statistical prediction interval. Staff review is required before quoting.'
  ] };
}
