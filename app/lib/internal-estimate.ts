import type { VisionAnalysis } from './analysis-schema';
import type { JobInputs } from './pricing';
import type { ClarificationAnswer } from './clarification';
import { normalizeClarificationAnswer, reconcileClarificationFacts } from './clarification-facts';
import { reconcilePricingFacts } from './pricing-facts';

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
  const pricingFacts = reconcilePricingFacts(inputs, analysis, answers, photoCount);
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
  if (pricingFacts.hidden.state === 'conflicting') {
    essentialReasons.push('The included removal scope conflicts with the original notes or identified visual evidence. Resolve the included items before pricing.');
    essentialQuestions.push('hidden');
  }
  if (analysis.estimatedLoadCount > 2) {
    essentialReasons.push('The core analysis indicates more than two loads, beyond the existing percentage-based pricing calculation. Manager scope pricing is required.');
  }

  const showEvidence = (entries: { source: string; text: string }[]) => entries.map((entry) => `${entry.source.replaceAll('_', ' ')}: ${safeEvidence(entry.text)}`);
  const drivers: PriceDriver[] = [
    { topic: 'handling', state: pricingFacts.handling.level === 'unknown' ? 'unknown' : pricingFacts.handling.level === 'conflicting' ? 'review' : 'resolved',
      message: `Handling: ${pricingFacts.handling.level}. ${pricingFacts.handling.level === 'medium' ? 'One person needs equipment; approved medium adjustment applies.' : pricingFacts.handling.level === 'high' ? 'Two or more people required; approved high adjustment applies.' : 'No automatic heavy adjustment.'}`,
      evidence: showEvidence(pricingFacts.handling.evidence) },
    { topic: 'hidden', state: pricingFacts.hidden.state === 'resolved' ? 'resolved' : pricingFacts.hidden.state === 'unknown' ? 'unknown' : 'review',
      message: `Additional scope: ${pricingFacts.hidden.state}. No uncertainty surcharge. Confirm actual extra scope in the load estimate, not a second fee.`,
      evidence: showEvidence(pricingFacts.hidden.evidence) },
    { topic: 'labor', state: pricingFacts.labor.state === 'exceptional_review' ? 'review' : 'resolved',
      message: pricingFacts.labor.state === 'exceptional_review' ? 'Exceptional work requires staff pricing; no approved task-specific rate. Carry/stairs rules apply once.'
        : 'Routine carrying, lifting, loading, organizing, nesting and ordinary packing are included. No generic labor surcharge.',
      evidence: [...showEvidence(pricingFacts.labor.evidence), `Entered access: ${inputs.carryDistance} carry; stairs ${inputs.stairs}.`] },
    { topic: 'material / disposal', state: pricingFacts.hazards.length || analysis.heavyDebrisRisk !== 'low' ? 'review' : 'unknown',
      message: 'Material/disposal risk is separate from handling. No automatic hazard charge; retained safety flags require review, not an invented rate.',
      evidence: [...showEvidence(pricingFacts.hazards), `Model material-risk flag (not handling evidence): ${analysis.heavyDebrisRisk}.`] }
  ];
  if (topics.dimensions.test(text)) drivers.push({ topic: 'dimensions', state: fact('dimensions').state === 'resolved' ? 'resolved' : 'unknown',
    message: fact('dimensions').state === 'resolved' ? 'Dimensions were provided; no measurement verification is implied.' : 'Dimensions remain unverified; the range uses the core model load estimate, not measured inventory.',
    evidence: [`Model-estimated load: ${pricingFacts.load.percent}% / ${pricingFacts.load.cubicYards} cubic yards / ${pricingFacts.load.trailerEquivalents} trailer equivalents.`] });
  for (const warning of analysis.warnings.filter((warning) => !Object.values(topics).some((pattern) => pattern.test(warning)) && !/box|bag|container|contents/i.test(warning))) {
    drivers.push({ topic: 'other', state: 'review', message: 'Additional model warning requires staff review.', evidence: [`Model warning: ${safeEvidence(warning)}`] });
  }
  return { facts, pricingFacts, essentialReasons, essentialQuestions, drivers, assumptions: [
    ...pricingFacts.packingAssumptions.map(safeEvidence),
    `Access as entered: ${inputs.carryDistance} carry, stairs ${inputs.stairs}; distance tier ${inputs.distanceTier}.`,
    fact('hidden').state === 'resolved' ? 'Removal is limited to the scope confirmed in the original details and clarification.' : 'Provisional range assumes the described/photographed items only; additional scope is not included.',
    'The policy price range is not a statistical prediction interval. Staff review is required before quoting.'
  ] };
}
