import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { volumeBaseline } from './pricing';
import type { ConversationModel, ConversationState, ConversationResult, ScopeItem } from './conversation-schema';

function signature(value: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Conversation configuration unavailable.');
  return createHmac('sha256', key).update('whs-conversation-v1\0').update(value).digest();
}
export function signConversation(state: ConversationState) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  if (payload.length > 110_000) throw new Error('Conversation limit reached. Start a new estimate.');
  return `${payload}.${signature(payload).toString('base64url')}`;
}
export function readConversation(token: string, now = Date.now()): ConversationState {
  const parts = token.split('.');
  if (token.length > 111_000 || parts.length !== 2) throw new Error('Invalid conversation.');
  const actual = Buffer.from(parts[1], 'base64url'), expected = signature(parts[0]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid conversation.');
  const state = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as ConversationState;
  if (state.version !== 1 || state.expires <= now || state.turn >= 24) throw new Error('Conversation expired or reached 24 turns. Start over.');
  return state;
}
export function freshConversation(now = Date.now()): ConversationState {
  return { version: 1, expires: now + 60 * 60_000, turn: 0, messages: [], services: [], photoHashes: [], photoRooms: [], items: [], questions: [], answers: [] };
}
export function safeModelText(text: string) {
  return /[$\u00a3\u20ac]|\b(?:USD|dollars?|price|quote|savings)\b/i.test(text) ? 'A scope detail needs staff review.' : text;
}
export function finishConversation(state: ConversationState, model: ConversationModel): Omit<ConversationResult, 'token'> {
  const previous = new Map(state.items.map((item) => [item.id, item]));
  const seen = new Set<string>(); const reasons: string[] = [];
  const candidates = new Map(model.items.map((item) => [item.id, item]));
  if (candidates.size !== model.items.length) throw new Error('Duplicate inventory IDs.');
  for (const item of model.items) {
    if (item.photoRefs.some((ref) => ref > state.photoHashes.length)) throw new Error('Invalid photo reference.');
    if (item.duplicateOf) {
      const root = candidates.get(item.duplicateOf);
      if (item.duplicateOf === item.id || previous.has(item.id) || (!previous.has(item.duplicateOf) && (!root || root.duplicateOf))) throw new Error('Unresolved inventory overlap.');
      continue;
    }
    seen.add(item.id);
    const prior = previous.get(item.id);
    if (!prior && [...previous.values()].some((old) => old.label.toLowerCase() === item.label.toLowerCase() && old.room.toLowerCase() === item.room.toLowerCase())) {
      throw new Error('Ambiguous repeated inventory. Staff must review overlap.');
    }
    previous.set(item.id, prior ? { ...prior, photoRefs: [...new Set([...prior.photoRefs, ...item.photoRefs])] }
      : { id: item.id, label: safeModelText(item.label), room: safeModelText(item.room), photoRefs: item.photoRefs, choice: 'unresolved' });
  }
  for (const item of model.items.filter((item) => item.duplicateOf)) {
    const root = previous.get(item.duplicateOf!)!;
    root.photoRefs = [...new Set([...root.photoRefs, ...item.photoRefs])];
  }
  if (previous.size > 40) throw new Error('Inventory limit reached; staff review required.');
  // Natural-language changes are proposals, never silent reversals of confirmed scope.
  const latest = state.messages.at(-1)?.text.toLowerCase() ?? '';
  for (const change of model.scopeChanges) {
    const item = previous.get(change.itemId);
    if (item && /\b(?:add|include|exclude|leave|keep|remove)\b/i.test(change.excerpt) && latest.includes(change.excerpt.toLowerCase())) {
      item.choice = 'unresolved';
      item.label = safeModelText(candidates.get(item.id)?.label ?? item.label);
    }
  }
  state.items = [...previous.values()];
  const included = state.items.filter((item) => item.choice === 'included');
  if (model.overlapUnresolved) reasons.push('Photo overlap is unresolved. Confirm which views show the same items before a combined volume estimate.');
  if (!included.length) reasons.push('Confirm which items to remove before I calculate their volume.');
  if (state.items.some((item) => item.choice === 'unresolved')) reasons.push('Please confirm the included and excluded items below. Unmentioned items are not assumed included.');
  if (included.some((item) => !seen.has(item.id))) reasons.push('The analysis did not account for all previously confirmed items. Staff review is needed.');
  const priced = new Set(model.pricedItemIds);
  if (priced.size !== model.pricedItemIds.length || included.length !== priced.size || included.some((item) => !priced.has(item.id))) {
    reasons.push('The volume analysis does not match the confirmed removal scope. No price is shown.');
  }
  const conflicts = model.conflicts.filter((conflict) => previous.has(conflict.itemId)
    && previous.get(conflict.itemId)!.photoRefs.includes(conflict.photoRef)
    && state.answers.some((answer) => answer.id.startsWith(`${conflict.itemId}:`) && !answer.notSure && answer.text === conflict.contradicts)
    && model.analysis.observedFacts.includes(conflict.evidence)
    && conflict.evidence.length >= 20 && !/\b(?:unknown|unclear|maybe|may|might|possibly|potential)\b/i.test(conflict.evidence));
  for (const conflict of conflicts) reasons.push(`Photo ${conflict.photoRef}, ${previous.get(conflict.itemId)!.label}: ${safeModelText(conflict.evidence)} Confirm this conflict with staff; your scope choice has not been changed.`);
  const unbounded = [...model.analysis.uncertaintyNotes, ...model.analysis.warnings, model.analysis.estimatedLoadRange].join(' ');
  if (!model.analysis.visibleItems.length || /(?:cannot|unable to)\s+(?:estimate|bound|determine|quantify)\s+(?:the\s+)?(?:total\s+)?(?:load|volume|quantity)|(?:volume|scope|quantity)\s+(?:is |remains )?(?:unbounded|not estimable)/i.test(unbounded)
    || model.analysis.estimatedLoadCount > 2) reasons.push('The removal volume is not bounded within this proof of concept. Staff review is needed before pricing.');
  // A later model omission must not silently resolve a signed, unanswered question.
  const pendingQuestions = state.questions.filter((question) => previous.get(question.itemId)?.choice === 'included'
    && !state.answers.some((answer) => answer.id === question.id));
  const newQuestions = model.questions.filter((question) => previous.get(question.itemId)?.choice === 'included'
    && previous.get(question.itemId)!.photoRefs.includes(question.photoRef)
    && model.analysis.observedFacts.includes(question.evidence)
    && ({ contents: /sealed|closed|opaque|contents/i, dimensions: /dimension|size|scale|measure/i, dismantling: /bolt|attach|fastener|dismantl|disassembl/i })[question.topic].test(question.evidence)
    && !state.answers.some((answer) => answer.id === `${question.itemId}:${question.topic}`));
  state.questions = [...pendingQuestions, ...newQuestions]
    .filter((question, index, all) => all.findIndex((q) => q.itemId === question.itemId && q.topic === question.topic) === index)
    .slice(0, 2).map((question) => ({ ...question, text: safeModelText(question.text), evidence: safeModelText(question.evidence), id: `${question.itemId}:${question.topic}` }));
  const exceptional = state.services.some((service) => /demo|heavy|appliance|storage/.test(service))
    || model.analysis.heavyDebrisRisk !== 'low' || model.analysis.difficulty === 'hard';
  if (state.questions.length) reasons.push('Please answer the scope questions below, or choose Not sure, before I prepare the estimate.');
  const baseline = reasons.length ? null : volumeBaseline(model.analysis.estimatedLoadPercent, model.analysis.estimatedLoadRange);
  state.completedEstimate = baseline ? { percent: baseline.percent, rangeText: model.analysis.estimatedLoadRange, exceptional } : undefined;
  const review = exceptional || model.analysis.confidencePercent < 85 || model.analysis.photoAngleQuality !== 'good'
    || model.analysis.hiddenDebrisRisk !== 'low' || state.questions.length > 0 || state.answers.some((answer) => answer.notSure) || reasons.length > 0;
  return { items: state.items, questions: state.questions, baseline, review,
    message: baseline ? 'Thanks for walking through the details with me! Your provisional estimate is ready below for the team to review. Happy to help you make some space!'
      : state.items.some((item) => item.choice === 'unresolved') ? 'Happy to help! Let\'s make sure we have just the right items. Which of these should we include?'
        : state.questions.length ? 'Thanks, we\'re making progress! A few details below will help me finish your estimate.'
          : 'Thanks for the details! The team needs to review the scope issues below before I can prepare an estimate.',
    reasons: [...reasons, ...(exceptional ? ['Heavy materials or special services require staff review. This volume baseline is not an all-inclusive quote; no special-service charges have been invented.'] : []),
      'Location and access have not been priced. No distance tier, minimum, or access charge is assumed.',
      'Provisional estimate only. Staff must review scope, access, disposal and any applicable minimum before quoting.',
      ...(state.answers.some((answer) => answer.notSure) ? ['An answer remains unknown; staff review is required.'] : [])],
    assumptions: baseline ? model.analysis.assumptions.map(safeModelText) : [] };
}
