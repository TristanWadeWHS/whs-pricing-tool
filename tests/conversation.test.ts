import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const parse = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: vi.fn(function () { return { responses: { parse } }; }) }));
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { POST } from '../app/api/conversation/route';
import { freshConversation, finishConversation, readConversation, signConversation } from '../app/lib/conversation-state';
import { conversationModelSchema, type ConversationModel, type ConversationState } from '../app/lib/conversation-schema';
import { sampleAnalysis, pngBytes } from './helpers';
import { volumeBaseline } from '../app/lib/pricing';
import { zodTextFormat } from 'openai/helpers/zod';

afterEach(() => { vi.unstubAllEnvs(); parse.mockReset(); });
const box = { id: 'i_boxes', label: 'boxes', room: 'Garage', photoRefs: [1], duplicateOf: null };
const fridge = { id: 'i_fridge', label: 'a refrigerator beside the boxes', room: 'Garage', photoRefs: [1], duplicateOf: null };
const question = { itemId: 'i_boxes', topic: 'contents' as const, text: 'What is inside these sealed boxes?', evidence: 'Sealed boxes visible beside the refrigerator.', photoRef: 1 };
function model(overrides: Partial<ConversationModel> = {}): ConversationModel {
  return { overlapUnresolved: false, items: [box, fridge], analysis: sampleAnalysis({ estimatedLoadPercent: 60, estimatedLoadRange: '60%', estimatedLoadCount: 0.6, observedFacts: [question.evidence] }),
    pricedItemIds: ['i_boxes'], questions: [], conflicts: [], scopeChanges: [], ...overrides };
}
function state(): ConversationState {
  return { ...freshConversation(), photoHashes: ['photo1', 'photo2'], photoRooms: ['Garage', 'Bedroom'],
    items: [{ ...box, choice: 'included' }, { ...fridge, choice: 'excluded' }] };
}
function photo(index = 0) { return new File([pngBytes(), new Uint8Array([index])], `synthetic-${index}.png`, { type: 'image/png' }); }
async function post(data: Record<string, unknown> = {}, token = '', photos: File[] = [photo()]) {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-only-key');
  const form = new FormData(); if (token) form.set('token', token);
  form.set('submission', JSON.stringify({ message: 'Please remove the boxes.', room: 'Garage', services: ['mixed junk'], photoRooms: photos.map(() => 'Garage'), actions: [], answers: [], ...data }));
  photos.forEach((p) => form.append('photos', p));
  // A buffered synthetic HTTP body avoids Node's lazy FormData producer/cancel race.
  const encoded = new Response(form);
  const response = await POST(new Request('https://synthetic.test/api/conversation', { method: 'POST', headers: encoded.headers, body: await encoded.arrayBuffer() }));
  return { status: response.status, body: await response.json(), response };
}

describe('Winston confirmed scope and deterministic baseline', () => {
  it('compiles a strict required-property schema with the installed provider helper', () => {
    const format = zodTextFormat(conversationModelSchema, 'synthetic');
    function walk(value: any) { if (!value || typeof value !== 'object') return;
      if (value.type === 'object') { expect(value.additionalProperties).toBe(false); expect(new Set(value.required)).toEqual(new Set(Object.keys(value.properties))); }
      Object.values(value).forEach(walk);
    }
    walk(format.schema);
  });
  it('asks about unmentioned appliances without silently choosing inclusion', () => {
    const s = { ...freshConversation(), photoHashes: ['a'], photoRooms: ['Garage'] };
    const result = finishConversation(s, model());
    expect(result.items.find((i) => i.id === fridge.id)?.choice).toBe('unresolved'); expect(result.baseline).toBeNull();
  });
  it('keeps an excluded appliance excluded and prices only the confirmed boxes at $330', () => {
    const result = finishConversation(state(), model());
    expect(result.items.find((i) => i.id === fridge.id)?.choice).toBe('excluded');
    expect(result.baseline).toMatchObject({ percent: 60, cubicYards: 7.2, point: 330, low: 330, high: 330, display: '$330' });
    expect(result.reasons.join(' ')).toContain('No distance tier');
  });
  it('keeps model flags and confidence out of price while requiring review for exceptional work', () => {
    const s = state(); s.services = ['demo debris'];
    const result = finishConversation(s, model({ analysis: sampleAnalysis({ estimatedLoadPercent: 60, estimatedLoadRange: '60%', estimatedLoadCount: 0.6,
      confidencePercent: 3, heavyDebrisRisk: 'high', difficulty: 'hard', assumptions: ['$9999 premium'] }) }));
    expect(result.baseline?.point).toBe(330); expect(result.review).toBe(true); expect(result.reasons.join(' ')).toContain('not an all-inclusive quote');
    expect(JSON.stringify(result)).not.toContain('9999');
    expect(conversationModelSchema.safeParse({ ...model(), price: 9999 }).success).toBe(false);
  });
  it('uses real intervals and permits more than one load without fabricating a band', () => {
    expect(volumeBaseline(150, '150%')).toMatchObject({ point: 825, low: 825, high: 825 });
    expect(volumeBaseline(60, '50-70%')).toMatchObject({ low: 275, high: 385 });
  });
  it('withholds amounts and calculations until grounded questions are answered, even if the model later omits them', () => {
    const s = state();
    const waiting = finishConversation(s, model({ questions: [question] }));
    expect(waiting.baseline).toBeNull(); expect(waiting.assumptions).toEqual([]);
    expect(JSON.stringify(waiting)).not.toMatch(/\$|330|550/);
    expect(waiting.message).toContain("we're making progress");
    const omitted = finishConversation(s, model());
    expect(omitted.questions).toHaveLength(1); expect(omitted.baseline).toBeNull();
    s.answers = [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }];
    const ready = finishConversation(s, model({ questions: [question] }));
    expect(ready.questions).toEqual([]); expect(ready.baseline?.point).toBe(330);
    expect(ready.message).toContain('Happy to help'); expect(ready.message).not.toMatch(/\$|330|550/);
    expect(ready.items).toEqual(waiting.items);
  });
  it('publishes supported endpoint prices only in the completed baseline, never chat history', () => {
    const s = state(); const m = model({ questions: [question], analysis: { ...model().analysis, estimatedLoadRange: '50-70%' } });
    expect(finishConversation(s, m).baseline).toBeNull();
    s.answers = [{ id: 'i_boxes:contents', text: '', notSure: true }];
    const ready = finishConversation(s, m);
    expect(ready.baseline).toMatchObject({ low: 275, high: 385 });
    expect(ready.review).toBe(true); expect(ready.message).not.toMatch(/\$|275|385/);
  });
  it('retains specific answers and does not ask the same topic again, including Not sure', () => {
    for (const notSure of [false, true]) {
      const s = state(); s.answers = [{ id: 'i_boxes:contents', text: notSure ? '' : 'lightweight decorations', notSure }];
      const result = finishConversation(s, model({ questions: [question] }));
      expect(result.questions).toEqual([]); expect(result.baseline?.point).toBe(330);
      if (notSure) expect(result.reasons.join(' ')).toContain('unknown');
    }
  });
  it('does not reopen resolved concerns from generic or ungrounded model conflicts', () => {
    const s = state(); s.answers = [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }];
    const conflict = { itemId: 'i_boxes', photoRef: 1, contradicts: 'lightweight decorations', evidence: 'Contents might be unknown or heavy.' };
    expect(finishConversation(s, model({ conflicts: [conflict] })).baseline?.point).toBe(330);
    const evidence = 'Concrete blocks are visible through the open side of the box.';
    const genuine = finishConversation(s, model({ conflicts: [{ ...conflict, evidence }], analysis: { ...model().analysis, observedFacts: [evidence] } }));
    expect(genuine.baseline).toBeNull(); expect(genuine.reasons.join(' ')).toContain('Concrete blocks');
    expect(s.items[0].choice).toBe('included');
  });
  it('merges duplicate views once and carries combined room scope without summing photo volumes', () => {
    const s = state(); const chair = { id: 'i_chair', label: 'chair', room: 'Bedroom', photoRefs: [2], duplicateOf: null };
    s.items.push({ ...chair, choice: 'included' });
    const result = finishConversation(s, model({ items: [box, fridge, chair, { ...box, id: 'i_angle', photoRefs: [2], duplicateOf: 'i_boxes' }], pricedItemIds: ['i_boxes', 'i_chair'] }));
    expect(result.items).toHaveLength(3); expect(result.items[0].photoRefs).toEqual([1, 2]); expect(result.baseline?.point).toBe(330);
    expect(() => finishConversation(state(), model({ items: [box, fridge, { ...box, id: 'i_double' }] }))).toThrow('Ambiguous repeated');
    expect(finishConversation(state(), model({ overlapUnresolved: true })).baseline).toBeNull();
  });
  it('withholds price for omitted, duplicate or accidentally included excluded inventory', () => {
    for (const pricedItemIds of [[], ['i_boxes', 'i_fridge'], ['i_boxes', 'i_boxes']]) expect(finishConversation(state(), model({ pricedItemIds })).baseline).toBeNull();
    expect(finishConversation(state(), model({ items: [fridge] })).baseline).toBeNull();
  });
  it('requests confirmation for grounded scope changes but ignores old or vague change claims', () => {
    const s = state(); s.messages = [{ text: 'Please include the refrigerator too.', room: '' }];
    expect(finishConversation(s, model({ scopeChanges: [{ itemId: 'i_fridge', excerpt: 'include the refrigerator' }] })).baseline).toBeNull();
    expect(s.items[1].choice).toBe('unresolved');
    const unchanged = state(); unchanged.messages = [{ text: 'More photos.', room: '' }];
    expect(finishConversation(unchanged, model({ scopeChanges: [{ itemId: 'i_fridge', excerpt: 'include the refrigerator' }] })).baseline?.point).toBe(330);
  });
  it('never prices an unbounded or out-of-supported-range analysis', () => {
    for (const analysis of [sampleAnalysis({ uncertaintyNotes: ['Total volume is unbounded.'] }), sampleAnalysis({ estimatedLoadCount: 3 })]) {
      expect(finishConversation(state(), model({ analysis })).baseline).toBeNull();
    }
  });
  it('filters generic questions not grounded in observed facts', () => {
    expect(finishConversation(state(), model({ questions: [{ ...question, evidence: 'Maybe something is hidden.' }] })).questions).toEqual([]);
  });
  it('signs and expires context and rejects tampering', () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic'); const s = state(); const token = signConversation(s);
    expect(readConversation(token)).toEqual(s);
    expect(() => readConversation(token, s.expires + 1)).toThrow();
    expect(() => readConversation(`${token.slice(0, -5)}aaaaa`)).toThrow();
  });
});

describe('conversation transport / mocked provider lifecycle', () => {
  it('accepts description first, acknowledges multiple supported services and does not call a model without photos', async () => {
    const result = await post({ services: ['mixed junk', 'demo debris'] }, '', []);
    expect(result.status).toBe(200); expect(result.body.message).toContain('Happy to help with Junk pickup and Light demolition!'); expect(parse).not.toHaveBeenCalled();
    expect(readConversation(result.body.token).messages[0].text).toContain('boxes');
  });
  it('retains sequential immediately sent service choices in signed context without analysis', async () => {
    const first = await post({ message: "I'd like help with Junk pickup.", services: ['mixed junk'] }, '', []);
    const second = await post({ message: "I'd like help with Furniture.", services: ['mixed junk', 'furniture'] }, first.body.token, []);
    expect(readConversation(second.body.token).services).toEqual(['mixed junk', 'furniture']);
    expect(readConversation(second.body.token).messages).toHaveLength(2);
    expect(second.body.message).toContain('Junk pickup and Furniture');
    expect(second.body.baseline).toBeNull(); expect(parse).not.toHaveBeenCalled();
  });
  it('preserves photo batches, scope actions and question-linked answers, then recalculates additions/removals', async () => {
    const first = await post({}, '', []);
    parse.mockResolvedValue({ output_parsed: model({ questions: [question] }) });
    const inventory = await post({}, first.body.token); expect(inventory.body.baseline).toBeNull();
    const confirmed = await post({ actions: [{ id: 'i_boxes', choice: 'included' }, { id: 'i_fridge', choice: 'excluded' }] }, inventory.body.token);
    expect(confirmed.body.baseline).toBeNull(); expect(confirmed.body.questions[0].id).toBe('i_boxes:contents');
    expect(JSON.stringify({ ...confirmed.body, token: undefined })).not.toMatch(/\$|330|550/);
    const answered = await post({ answers: [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }] }, confirmed.body.token);
    expect(answered.body.questions).toEqual([]); expect(answered.body.items[1].choice).toBe('excluded');
    expect(answered.body.baseline.point).toBe(330);
    expect(JSON.stringify(parse.mock.lastCall![0].input)).toContain('lightweight decorations');
    parse.mockResolvedValue({ output_parsed: model({ pricedItemIds: ['i_boxes', 'i_fridge'], analysis: sampleAnalysis({ estimatedLoadPercent: 80, estimatedLoadRange: '80%' }) }) });
    const added = await post({ actions: [{ id: 'i_fridge', choice: 'included' }], photoRooms: ['Garage', 'Bedroom'] }, answered.body.token, [photo(), photo(1)]);
    expect(added.body.baseline.point).toBe(440);
    parse.mockResolvedValue({ output_parsed: model() });
    const removed = await post({ actions: [{ id: 'i_fridge', choice: 'excluded' }], photoRooms: ['Garage', 'Bedroom'] }, added.body.token, [photo(), photo(1)]);
    expect(removed.body.baseline.point).toBe(330);
    const altered = await post({}, removed.body.token, [photo(2)]); expect(altered.status).toBe(400);
  });
  it('accepts ten distinct processed photos and rejects eleven, duplicates, invalid services and forged choices', async () => {
    parse.mockResolvedValue({ output_parsed: model() });
    expect((await post({}, '', Array.from({ length: 10 }, (_, i) => photo(i)))).status).toBe(200);
    expect((await post({}, '', Array.from({ length: 11 }, (_, i) => photo(i)))).status).toBe(400);
    expect((await post({}, '', [photo(), photo()])).status).toBe(400);
    expect((await post({ services: ['invented service'] })).status).toBe(400);
    expect((await post({ actions: [{ id: 'i_boxes', choice: 'included' }] })).status).toBe(400);
  });
  it('retains transport and MIME checks before any provider call', async () => {
    expect((await post({}, '', [new File(['fake'], 'x.jpg', { type: 'image/jpeg' })])).status).toBe(400);
    expect((await post({}, '', [new File([new Uint8Array(4 * 1024 * 1024)], 'x.jpg', { type: 'image/jpeg' })])).status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
  });
  it('fails without fabricated prices or raw provider details and permits explicit retry', async () => {
    parse.mockRejectedValueOnce(new Error('private provider detail'));
    const failed = await post(); expect(failed.status).toBe(502); expect(failed.body.baseline).toBeNull(); expect(JSON.stringify(failed.body)).not.toContain('private provider');
    parse.mockResolvedValueOnce({ output_parsed: model() }); expect((await post()).status).toBe(200);
    parse.mockResolvedValueOnce({ output_parsed: { ...model(), price: 9000 } }); expect((await post()).status).toBe(502);
  });
  it('keeps both experiences and the new API protected, rejects query tokens and retains no-store', () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'synthetic');
    for (const path of ['/', '/api/conversation', '/staff-estimator']) {
      const response = proxy(new NextRequest(`https://synthetic.test${path}?access_token=synthetic`));
      expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
      const authorized = proxy(new NextRequest(`https://synthetic.test${path}`, { headers: { authorization: `Basic ${btoa('staff:synthetic')}` } }));
      expect(authorized.status).toBe(200);
    }
  });
});
