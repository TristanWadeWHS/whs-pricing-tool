import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { VisionAnalysis } from './analysis-schema';
import type { ValidatedEstimateRequest } from './request-validation';

export const CLARIFICATION_THRESHOLD = 0.85;
export const QUESTION_TEXT = {
  hidden: 'Is anything else underneath, behind, or outside the photos that needs removal?',
  contents: 'What is inside the closed boxes, bags, or containers being removed?',
  dismantling: 'Are any items attached or bolted down, or do they need dismantling before removal?',
  dimensions: 'What are the approximate dimensions of the items or pile whose size is unclear?'
} as const;
const ids = ['hidden', 'contents', 'dismantling', 'dimensions'] as const;
export type ClarificationAnswer = { id: typeof ids[number]; answer: string; notSure: boolean };

export function needsClarification(analysis: VisionAnalysis) {
  // visionAnalysisSchema defines 1..100 percent, not a probability or calibrated accuracy.
  return analysis.confidencePercent / 100 < CLARIFICATION_THRESHOLD;
}

export function clarificationQuestions(analysis: VisionAnalysis, notes: string) {
  const signals = [...analysis.questionsToAsk, ...analysis.uncertaintyNotes, ...analysis.warnings].join(' ');
  const topics = [
    { id: 'hidden' as const, relevant: /hidden|underneath|behind|outside.*photo|additional.*(?:item|material)|out of frame/i,
      answered: /(?:no|nothing|not any)\s+(?:is\s+)?hidden|nothing\s+(?:underneath|behind)|only\s+(?:the\s+)?(?:items|material|things)\s+(?:shown|pictured|in the photo)/i },
    { id: 'contents' as const, relevant: /box(?:es)?|bags?|containers?|contents/i,
      answered: /(?:boxes|bags|containers)\s+(?:contain|hold|are filled with)|(?:inside|in)\s+(?:the\s+)?(?:boxes|bags)\s+(?:is|are)/i },
    { id: 'dismantling' as const, relevant: /disassembl|dismantl|bolted|attached|fixed in place/i,
      answered: /(?:no|does not need|do not need)\s+(?:disassembly|dismantling)|(?:not|nothing is)\s+(?:attached|bolted)/i },
    { id: 'dimensions' as const, relevant: /dimensions|measurements?|unclear.*(?:size|volume)|(?:size|volume).*unclear|scale/i,
      answered: /\d+(?:\.\d+)?\s*(?:feet|foot|ft\b|inches|yards|cm\b|meters)/i }
  ];
  // Fixed actionable templates prevent model-generated prices/instructions leaking into this phase.
  // Stairs, carry, planned workers and selected job type are already structured inputs.
  return topics.filter((topic) => topic.relevant.test(signals) && !topic.answered.test(notes))
    .map(({ id }) => ({ id, text: QUESTION_TEXT[id] }));
}

function sign(value: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Clarification signing unavailable.');
  // Domain-separated server-only key; never use the internal password known to browser users.
  return createHmac('sha256', key).update('whs-clarification-v1\0').update(value).digest();
}

function contextFingerprint(context: ValidatedEstimateRequest) {
  const digest = createHmac('sha256', sign('context-key'));
  digest.update(JSON.stringify(context.inputs));
  for (const photo of context.photos) digest.update(`\0${photo.mime}:${photo.bytes.length}:`).update(photo.bytes);
  return digest.digest('base64url');
}

export function issueClarification(context: ValidatedEstimateRequest, questions: ReturnType<typeof clarificationQuestions>, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ version: 1, expires: now + 30 * 60_000,
    context: contextFingerprint(context), ids: questions.map((question) => question.id) })).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

const answersSchema = z.object({ token: z.string().max(2000), answers: z.array(z.object({
  id: z.enum(ids), answer: z.string().trim().max(400), notSure: z.boolean()
}).strict().refine((answer) => answer.notSure ? !answer.answer : Boolean(answer.answer))).min(1).max(4) }).strict();

export function verifyClarification(raw: FormDataEntryValue | null, context: ValidatedEstimateRequest, now = Date.now()) {
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.length > 4000) throw new Error('Invalid clarification.');
  const submission = answersSchema.parse(JSON.parse(raw));
  const parts = submission.token.split('.');
  if (parts.length !== 2) throw new Error('Invalid clarification.');
  const expected = sign(parts[0]);
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid clarification.');
  const ticket = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (ticket.version !== 1 || !Number.isFinite(ticket.expires) || ticket.expires <= now
    || ticket.context !== contextFingerprint(context) || !Array.isArray(ticket.ids)
    || submission.answers.length !== ticket.ids.length || new Set(submission.answers.map((answer) => answer.id)).size !== ticket.ids.length
    || !submission.answers.every((answer) => ticket.ids.includes(answer.id))) throw new Error('Invalid clarification.');
  return submission.answers;
}

export function hasUnresolvedAnswers(answers: ClarificationAnswer[]) {
  return answers.some((answer) => answer.notSure || /^(?:not sure|unsure|unknown|i don'?t know)[.!]?$/i.test(answer.answer));
}

export function unresolvedClarificationIssues(analysis: VisionAnalysis, notes: string, answers: ClarificationAnswer[]) {
  const topics = new Set(clarificationQuestions(analysis, notes).map((question) => question.id));
  for (const answer of answers) if (hasUnresolvedAnswers([answer])) topics.add(answer.id);
  const descriptions = {
    hidden: 'Hidden or additional material remains unconfirmed.',
    contents: 'Closed-container contents remain unconfirmed.',
    dismantling: 'Attachment or dismantling requirements remain unconfirmed.',
    dimensions: 'Item or pile dimensions remain unconfirmed.'
  };
  // Fixed issue labels cannot leak prices or instructions from raw model text.
  return ['The uncalibrated analysis-confidence score remains below 85/100. Manager review is required before any pricing.',
    ...Array.from(topics, (topic) => descriptions[topic]),
    ...(analysis.heavyDebrisRisk !== 'low' ? ['Heavy-material handling remains a review concern.'] : []),
    ...(analysis.hiddenDebrisRisk !== 'low' ? ['Hidden-material scope remains a review concern.'] : []),
    ...(analysis.difficulty !== 'easy' ? ['Labor requirements remain a review concern.'] : []),
    ...(analysis.photoAngleQuality === 'poor' ? ['Photo clarity is insufficient.'] : [])];
}
