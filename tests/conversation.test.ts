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
const question = { itemId: 'i_boxes', topic: 'contents' as const, text: 'What is inside these sealed boxes?', evidence: 'Sealed boxes visible beside the refrigerator.', photoRef: 1,
  impact: 'volume' as const, volumeEffect: 'Confirm whether the boxes are empty and flattenable or filled and must remain intact.' };
function model(overrides: Partial<ConversationModel> = {}): ConversationModel {
  const result: ConversationModel = { overlapUnresolved: false, items: [box, fridge], analysis: sampleAnalysis({ estimatedLoadPercent: 60, estimatedLoadRange: '60%', estimatedLoadCount: 0.6, observedFacts: [question.evidence] }),
    pricedItemIds: ['i_boxes'], questions: [], conflicts: [], scopeChanges: [], loadedGroups: [], ...overrides };
  if (!overrides.loadedGroups) {
    const { range, percent } = volumeBaseline(result.analysis.estimatedLoadPercent, result.analysis.estimatedLoadRange);
    result.loadedGroups = result.pricedItemIds.map((id) => ({ itemIds: [id], photoRefs: result.items.find((i) => i.id === id)?.photoRefs ?? [1],
      quantityDescription: 'One synthetic group', evidence: result.analysis.observedFacts[0], lowCubicYards: (range?.[0] ?? percent) / 100 * 12 / result.pricedItemIds.length,
      highCubicYards: (range?.[1] ?? percent) / 100 * 12 / result.pricedItemIds.length, packingAssumptions: ['Synthetic group packed intact.'],
      uncertainty: range ? 'Rear depth is partly obscured; endpoints cover the supported packing depth.' : null, handlingConcern: null, answerIds: [] }));
  }
  return result;
}
function applyAnswers(s: ConversationState, m: ConversationModel) {
  m.loadedGroups.forEach((g) => { g.answerIds = s.answers.filter((a) => g.itemIds.some((id) => a.id.startsWith(`${id}:`))).map((a) => a.id); });
  return m;
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
    const ready = finishConversation(s, applyAnswers(s, model({ questions: [question] })));
    expect(ready.questions).toEqual([]); expect(ready.baseline?.point).toBe(330);
    expect(ready.message).toContain('Happy to help'); expect(ready.message).not.toMatch(/\$|330|550/);
    expect(ready.items).toEqual(waiting.items);
  });
  it('publishes supported endpoint prices only in the completed baseline, never chat history', () => {
    const s = state(); const m = model({ questions: [question], analysis: { ...model().analysis, estimatedLoadRange: '50-70%' } });
    expect(finishConversation(s, m).baseline).toBeNull();
    s.answers = [{ id: 'i_boxes:contents', text: '', notSure: true }];
    const ready = finishConversation(s, applyAnswers(s, m));
    expect(ready.baseline).toMatchObject({ low: 275, high: 385 });
    expect(ready.review).toBe(true); expect(ready.message).not.toMatch(/\$|275|385/);
  });
  it('retains specific answers and does not ask the same topic again, including Not sure', () => {
    for (const notSure of [false, true]) {
      const s = state(); s.answers = [{ id: 'i_boxes:contents', text: notSure ? '' : 'lightweight decorations', notSure }];
      const result = finishConversation(s, applyAnswers(s, model({ questions: [question] })));
      expect(result.questions).toEqual([]); expect(result.baseline?.point).toBe(330);
      if (notSure) expect(result.reasons.join(' ')).toContain('unknown');
    }
  });
  it('does not reopen resolved concerns from generic or ungrounded model conflicts', () => {
    const s = state(); s.answers = [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }];
    const conflict = { itemId: 'i_boxes', photoRef: 1, contradicts: 'lightweight decorations', evidence: 'Contents might be unknown or heavy.', impact: 'volume' as const };
    expect(finishConversation(s, applyAnswers(s, model({ conflicts: [conflict] }))).baseline?.point).toBe(330);
    const evidence = 'Concrete blocks are visible through the open side of the box.';
    const genuine = finishConversation(s, applyAnswers(s, model({ conflicts: [{ ...conflict, evidence }], analysis: { ...model().analysis, observedFacts: [evidence] } })));
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
  it('withholds missing group volume or out-of-calculator endpoints, not legacy load-count prose', () => {
    const m = model(); m.loadedGroups[0].lowCubicYards = null; m.loadedGroups[0].highCubicYards = null;
    m.loadedGroups[0].uncertainty = 'The number of boxes behind the door is not visible; confirm whether that area is included.';
    const missing = finishConversation(state(), m);
    expect(missing.baseline).toBeNull(); expect(missing.reasons.join(' ')).toContain('number of boxes behind the door');
    m.loadedGroups[0].lowCubicYards = 25; m.loadedGroups[0].highCubicYards = 25;
    expect(finishConversation(state(), m).baseline).toBeNull();
  });
  it('filters generic questions not grounded in observed facts', () => {
    expect(finishConversation(state(), model({ questions: [{ ...question, evidence: 'Maybe something is hidden.' }] })).questions).toEqual([]);
  });
  it('does not convert an item-specific weight concern into a volume question or surcharge', () => {
    const m = model({ questions: [{ ...question, impact: 'handling', volumeEffect: null, text: 'Can one person lift the boxes?' }] });
    m.loadedGroups[0].handlingConcern = 'The included boxes may contain dense pieces; staff should verify handling equipment.';
    const r = finishConversation(state(), m);
    expect(r.baseline?.point).toBe(330); expect(r.questions).toEqual([]); expect(r.review).toBe(true);
    expect(r.reasons.join(' ')).toContain('boxes: The included boxes');
    const mislabeled = model({ questions: [{ ...question, impact: 'volume', volumeEffect: 'Unknown weight only.' }] });
    expect(finishConversation(state(), mislabeled).baseline?.point).toBe(330);
  });
  it('does not require exact dimensions when valid photo-based group bounds already exist', () => {
    const evidence = 'The rear stack depth is partly obscured but its visible extent provides a scale.';
    const q = { ...question, topic: 'dimensions' as const, text: 'What are the exact dimensions?', evidence, volumeEffect: 'The stack depth affects loaded volume.' };
    const s = state(); s.questions = [{ ...q, id: 'i_boxes:dimensions' }];
    const m = model({ analysis: { ...model().analysis, estimatedLoadRange: '50-70%', observedFacts: [evidence] }, questions: [q] });
    const r = finishConversation(s, m);
    expect(r.questions).toEqual([]); expect(r.baseline).toMatchObject({ low: 275, high: 385 });
    m.loadedGroups[0].lowCubicYards = m.loadedGroups[0].highCubicYards = null;
    m.loadedGroups[0].uncertainty = 'The number of additional boxes inside the shed cannot be seen. Confirm which boxes are included.';
    const unavailable = finishConversation(s, m);
    expect(unavailable.baseline).toBeNull(); expect(unavailable.questions).toHaveLength(1);
  });
  it('retains lightweight/no-disassembly answers and treats material-only contradictions as handling review', () => {
    const s = state(); s.answers = [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }, { id: 'i_boxes:dismantling', text: 'no', notSure: false }];
    const evidence = 'One dense-looking stone fragment is visible in the open corner of a box.';
    const m = applyAnswers(s, model({ analysis: { ...model().analysis, observedFacts: [evidence] },
      questions: [question], conflicts: [{ itemId: 'i_boxes', photoRef: 1, contradicts: 'lightweight decorations', evidence, impact: 'handling' }] }));
    const r = finishConversation(s, m);
    expect(r.baseline?.point).toBe(330); expect(r.questions).toEqual([]); expect(r.reasons.join(' ')).toContain('stone fragment');
    expect(s.answers.map((a) => a.text)).toEqual(['lightweight decorations', 'no']);
    m.loadedGroups[0].answerIds = [];
    expect(finishConversation(s, m).baseline).toBeNull();
  });
  it('regression: four included ordinary groups receive a loaded range despite a stale unbounded warning/group-as-load count', () => {
    // Synthetic volumes only. Qualitative scenario: panels, trim, cardboard and bagged goods beside a stone path.
    // No customer transcript, real image or purported photo measurements are stored here.
    const labels = ['panels', 'trim', 'cardboard', 'bagged goods'];
    const items = labels.map((label, i) => ({ id: `i_group${i}`, label, room: 'Side yard', photoRefs: [1, 2], duplicateOf: null }));
    const s: ConversationState = { ...freshConversation(), photoHashes: ['synthetic-a', 'synthetic-b'], photoRooms: ['Side yard', 'Side yard'], items: items.map((i) => ({ ...i, choice: 'included' })) };
    const evidence = 'Panels and long trim lie beside cardboard and bagged household goods.';
    const loadedGroups = items.map((i, index) => ({ itemIds: [i.id], photoRefs: [1, 2], quantityDescription: 'One synthetic confirmed group', evidence,
      lowCubicYards: [0.6, 0.3, 0.3, 1.2][index], highCubicYards: [0.9, 0.6, 0.6, 1.5][index],
      packingAssumptions: [index === 0 ? 'Stack panels flat without dismantling.' : index === 1 ? 'Align long pieces; do not count the second photo again.' : index === 2 ? 'Keep filled cardboard intact.' : 'Nest soft goods without an extra compaction multiplier.'],
      uncertainty: 'Perspective partly obscures stack depth; endpoints cover supported packing arrangements.', handlingConcern: null, answerIds: [] }));
    const m = model({ items, pricedItemIds: items.map((i) => i.id), loadedGroups,
      analysis: sampleAnalysis({ estimatedLoadPercent: 60, estimatedLoadCount: 4, warnings: ['Total volume is unbounded without exact dimensions.'], observedFacts: [evidence] }) });
    const r = finishConversation(s, m);
    expect(r.baseline).toMatchObject({ percent: 25, range: [20, 30], low: 110, high: 165 });
    expect(r.questions).toEqual([]); expect(r.reasons.join(' ')).not.toMatch(/not bounded|proof of concept/);
    expect(r.assumptions.join(' ')).toContain('Perspective partly obscures');
    expect(r.assumptions.join(' ')).toContain('Stack panels flat');
    expect(r.assumptions.join(' ')).toContain('Keep filled cardboard intact');
    // Stone/path items do not enter removal scope or pricing without an explicit choice.
    const stone = { id: 'i_stones', label: 'stone pieces beside the path', room: 'Side yard', photoRefs: [1], duplicateOf: null };
    m.items.push(stone);
    const unresolved = finishConversation(s, m);
    expect(unresolved.baseline).toBeNull(); expect(unresolved.items.find((i) => i.id === stone.id)?.choice).toBe('unresolved');
    s.items.find((i) => i.id === stone.id)!.choice = 'excluded';
    expect(finishConversation(s, m).baseline?.low).toBe(110);
    s.items.find((i) => i.id === stone.id)!.choice = 'included';
    m.pricedItemIds.push(stone.id); m.loadedGroups.push({ ...loadedGroups[0], itemIds: [stone.id], photoRefs: [1], lowCubicYards: 0.6, highCubicYards: 0.6, uncertainty: null,
      handlingConcern: 'Stone pieces need staff handling/payload review; their material weight has not been measured.' });
    const includedStone = finishConversation(s, m);
    expect(includedStone.baseline).toMatchObject({ low: 137.5, high: 192.5 });
    expect(includedStone.reasons.join(' ')).toContain('Stone pieces need staff handling');
  });
  it('rejects overlapping pile/component groups, unsupported evidence and unordered bounds without using a model dollar price', () => {
    const duplicate = model(); duplicate.loadedGroups.push({ ...duplicate.loadedGroups[0] });
    expect(finishConversation(state(), duplicate).baseline).toBeNull();
    for (const change of [{ lowCubicYards: 8, highCubicYards: 7 }, { evidence: 'Invented unseen pile.' }, { photoRefs: [10] }, { lowCubicYards: null, highCubicYards: null }]) {
      const m = model(); Object.assign(m.loadedGroups[0], change);
      expect(finishConversation(state(), m).baseline).toBeNull();
    }
    const m = model(); m.loadedGroups[0].lowCubicYards = m.loadedGroups[0].highCubicYards = 7.2;
    m.analysis.estimatedLoadPercent = 99; m.analysis.estimatedLoadRange = '$900';
    expect(finishConversation(state(), m).baseline?.point).toBe(330);
  });
  it('uses one combined pile/constituent volume and rejects adding its constituent again', () => {
    const s = state(); s.items[1].choice = 'included';
    const m = model({ pricedItemIds: ['i_boxes', 'i_fridge'] });
    m.loadedGroups = [{ ...m.loadedGroups[0], itemIds: ['i_boxes', 'i_fridge'], lowCubicYards: 7.2, highCubicYards: 7.2 }];
    expect(finishConversation(s, m).baseline?.point).toBe(330);
    m.loadedGroups.push({ ...m.loadedGroups[0], itemIds: ['i_boxes'] });
    expect(finishConversation(s, m).baseline).toBeNull();
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
    expect(result.status).toBe(200); expect(result.body.message).toContain('Happy to help with junk pickup and light demolition!'); expect(parse).not.toHaveBeenCalled();
    expect(readConversation(result.body.token).messages[0].text).toContain('boxes');
  });
  it('retains sequential immediately sent service choices in signed context without analysis', async () => {
    const first = await post({ message: "I'd like help with Junk pickup.", services: ['mixed junk'] }, '', []);
    const second = await post({ message: "I'd like help with Furniture.", services: ['mixed junk', 'furniture'] }, first.body.token, []);
    expect(readConversation(second.body.token).services).toEqual(['mixed junk', 'furniture']);
    expect(readConversation(second.body.token).messages).toHaveLength(2);
    expect(second.body.message).toContain('junk pickup and furniture');
    expect(second.body.baseline).toBeNull(); expect(parse).not.toHaveBeenCalled();
  });
  it('preserves photo batches, scope actions and question-linked answers, then recalculates additions/removals', async () => {
    const first = await post({}, '', []);
    parse.mockResolvedValue({ output_parsed: model({ questions: [question] }) });
    const inventory = await post({}, first.body.token); expect(inventory.body.baseline).toBeNull();
    const confirmed = await post({ actions: [{ id: 'i_boxes', choice: 'included' }, { id: 'i_fridge', choice: 'excluded' }] }, inventory.body.token);
    expect(confirmed.body.baseline).toBeNull(); expect(confirmed.body.questions[0].id).toBe('i_boxes:contents');
    expect(JSON.stringify({ ...confirmed.body, token: undefined })).not.toMatch(/\$|330|550/);
    const withAnswer = model({ questions: [question] }); withAnswer.loadedGroups[0].answerIds = ['i_boxes:contents'];
    parse.mockResolvedValue({ output_parsed: withAnswer });
    const answered = await post({ answers: [{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }] }, confirmed.body.token);
    expect(answered.body.questions).toEqual([]); expect(answered.body.items[1].choice).toBe('excluded');
    expect(answered.body.baseline.point).toBe(330);
    expect(JSON.stringify(parse.mock.lastCall![0].input)).toContain('lightweight decorations');
    const providerContext = JSON.parse(parse.mock.lastCall![0].input[1].content[0].text);
    expect(providerContext.messages[0].text).toBe('Please remove the boxes.');
    expect(providerContext.answers).toEqual([{ id: 'i_boxes:contents', text: 'lightweight decorations', notSure: false }]);
    expect(parse.mock.lastCall![0].input[1].content.filter((c: { type: string }) => c.type === 'input_image')).toHaveLength(1);
    const addedModel = model({ pricedItemIds: ['i_boxes', 'i_fridge'], analysis: sampleAnalysis({ estimatedLoadPercent: 80, estimatedLoadRange: '80%' }) });
    addedModel.loadedGroups[0].answerIds = ['i_boxes:contents'];
    parse.mockResolvedValue({ output_parsed: addedModel });
    const added = await post({ actions: [{ id: 'i_fridge', choice: 'included' }], photoRooms: ['Garage', 'Bedroom'] }, answered.body.token, [photo(), photo(1)]);
    expect(added.body.baseline.point).toBe(440);
    parse.mockResolvedValue({ output_parsed: withAnswer });
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
