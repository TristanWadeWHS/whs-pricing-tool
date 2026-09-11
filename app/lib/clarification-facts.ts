import type { ClarificationAnswer } from './clarification';
import type { ShadowEvidence } from './shadow-schema';

export type FactId = ClarificationAnswer['id'];
export type FactState = 'resolved' | 'unknown' | 'conflicting' | 'not_applicable';
export type ClarificationFact = {
  id: FactId;
  state: FactState;
  source: 'signed_clarification' | 'original_notes' | 'none';
  value: string | null;
  contradictionPhotos: number[];
  conflictWithOriginal: boolean;
  contradictionKinds: ShadowEvidence['contradictions'][number]['kind'][];
};
export const FACT_LABELS: Record<FactId, string> = {
  hidden: 'Hidden and additional removal scope', contents: 'Container contents',
  dismantling: 'Disassembly requirements', dimensions: 'Dimensions'
};
export const FACT_IDS: FactId[] = ['hidden', 'contents', 'dismantling', 'dimensions'];
export function unknownAnswer(answer: string) {
  return /\b(?:not sure|unsure|unknown|don'?t know|do not know|maybe|uncertain)\b/i.test(answer);
}
const contradictionKind: Record<FactId, ShadowEvidence['contradictions'][number]['kind']> = {
  hidden: 'additional_material_visible', contents: 'different_contents_visible',
  dismantling: 'fastener_visible', dimensions: 'dimension_reference_disagrees'
};
function stance(id: FactId, text: string) {
  if (id === 'hidden') {
    if (/nothing|no (?:hidden|additional)|only.*(?:visible|shown|photo)/i.test(text)) return 'absent';
    if (/additional|extra|also.*remov/i.test(text)) return 'present';
  }
  if (id === 'dismantling') {
    if (/no (?:disassembly|dismantling)|not (?:attached|bolted)|nothing.*(?:attached|bolted)/i.test(text)) return 'absent';
    if (/(?:needs?|requires?) (?:disassembly|dismantling)|is (?:attached|bolted)/i.test(text)) return 'present';
  }
  return null;
}
const notePatterns: Record<FactId, RegExp> = {
  hidden: /nothing\s+(?:hidden|underneath|behind|outside)|(?:no|nothing is)\s+hidden|only\s+(?:the\s+)?(?:items|material|things)\s+(?:shown|pictured|in the photo)/i,
  contents: /(?:boxes|bags|containers)\s+(?:contain|hold|are filled with)\s+[^.!?]+/i,
  dismantling: /(?:no|does not need|do not need|needs?|requires?)\s+(?:disassembly|dismantling)|(?:not|nothing is|is)\s+(?:attached|bolted)/i,
  dimensions: /\d+(?:\.\d+)?\s*(?:feet|foot|ft\b|inches|yards|cm\b|meters)/i
};

// Facts remain attributed claims, not verified measurements or instructions to the model.
export function reconcileClarificationFacts(notes: string, answers: ClarificationAnswer[],
  contradictions: ShadowEvidence['contradictions'] = [], photoCount = 0): ClarificationFact[] {
  return FACT_IDS.map((id) => {
    const answer = answers.find((entry) => entry.id === id);
    const fromNotes = notes.split(/[.!?](?:\s|$)|\n/).filter((sentence) => notePatterns[id].test(sentence)).join('. ').trim();
    const value = answer ? answer.answer.trim() : fromNotes;
    const unknown = !value || answer?.notSure || unknownAnswer(value)
      || ((id === 'contents' || id === 'dimensions') && /^(?:yes|no|none)$/i.test(value))
      || (id === 'dimensions' && !notePatterns.dimensions.test(value));
    const notApplicable = id === 'contents' && /^no (?:closed )?(?:boxes|bags|containers)(?: (?:to remove|are present))?[.!]?$/i.test(value);
    const conflictWithOriginal = Boolean(answer && fromNotes && stance(id, value) && stance(id, fromNotes)
      && stance(id, value) !== stance(id, fromNotes));
    const evidence = unknown ? [] : contradictions.filter((entry) => entry.questionId === id && entry.kind === contradictionKind[id]
      && entry.photoRef <= photoCount && entry.photoRef >= 1
      && entry.contradicts.trim() === value
      && entry.observation.trim().length >= 12
      && !/\?|unclear|unknown|possibly|maybe|uncertain|not sure/i.test(entry.observation)
      && entry.observation.trim().toLowerCase() !== value.toLowerCase());
    return { id, value: value || null, state: unknown ? 'unknown' : evidence.length || conflictWithOriginal ? 'conflicting' : notApplicable ? 'not_applicable' : 'resolved',
      source: answer ? 'signed_clarification' : fromNotes ? 'original_notes' : 'none',
      conflictWithOriginal, contradictionKinds: [...new Set(evidence.map((entry) => entry.kind))],
      contradictionPhotos: [...new Set(evidence.map((entry) => entry.photoRef))] };
  });
}

export function factReviewIssues(facts: ClarificationFact[], relevant: FactId[]) {
  return facts.flatMap((fact) => fact.state === 'conflicting'
    ? [fact.conflictWithOriginal ? `${FACT_LABELS[fact.id]}: the clarification conflicts with original notes; staff verification required.`
      : `${FACT_LABELS[fact.id]}: model-reported ${fact.contradictionKinds.join(', ').replaceAll('_', ' ')} in photo ${fact.contradictionPhotos.join(', ')}; staff verification required.`]
    : fact.state === 'unknown' && relevant.includes(fact.id) ? [`${FACT_LABELS[fact.id]} remains unconfirmed.`] : []);
}
