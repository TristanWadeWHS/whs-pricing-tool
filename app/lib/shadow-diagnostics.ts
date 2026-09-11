import type { VisionAnalysis } from './analysis-schema';
import type { JobInputs } from './pricing';
import type { ClarificationAnswer } from './clarification';
import { reconcileClarificationFacts, unknownAnswer } from './clarification-facts';
import { buildReadiness } from './shadow-readiness';
import { calculateShadowVolume, validatedShadowEvidence } from './shadow-volume';

export function buildShadowDiagnostics(inputs: JobInputs, analysis: VisionAnalysis, answers: ClarificationAnswer[], photoCount: number) {
  const inventory = validatedShadowEvidence(analysis.shadow);
  const facts = reconcileClarificationFacts(inputs.notes, answers, inventory?.contradictions, photoCount);
  const employeeText = [inputs.notes, ...answers.filter((answer) => !answer.notSure && !unknownAnswer(answer.answer)).map((answer) => answer.answer)].join('\n');
  const volume = calculateShadowVolume(inventory, photoCount, employeeText);
  if (analysis.shadow === undefined) volume.reasons = ['Live inventory extraction is deferred to protect core analysis. No shadow volume is available.'];
  return { status: 'available' as const,
    // Never return free text from notes, answers or model observations in diagnostics.
    facts: facts.map(({ value: _value, ...fact }) => fact),
    readiness: buildReadiness(inputs, facts, inventory, volume), volume };
}

export function safeShadowDiagnostics(inputs: JobInputs, analysis: VisionAnalysis, answers: ClarificationAnswer[], photoCount: number,
  build = buildShadowDiagnostics) {
  try { return build(inputs, analysis, answers, photoCount); }
  catch { return { status: 'unavailable' as const, reason: 'Shadow diagnostics unavailable; the existing estimate is unchanged.' }; }
}
export type ShadowDiagnostics = ReturnType<typeof safeShadowDiagnostics>;
