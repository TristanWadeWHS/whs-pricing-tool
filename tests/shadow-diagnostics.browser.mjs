import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const facts = ['hidden', 'contents', 'dismantling', 'dimensions'].map((id) => ({ id,
  state: id === 'dimensions' ? 'unknown' : 'resolved', source: 'signed_clarification',
  contradictionPhotos: [], contradictionKinds: [], conflictWithOriginal: false }));
const components = [
  ['scope', 'Removal scope', 25, [['Scope answer', 'resolved']]],
  ['identification', 'Identification / visibility', 20, [['Inventory identity', 'unknown'], ['Overlap', 'unknown'], ['Contents', 'resolved']]],
  ['volume', 'Dimensions / volume', 30, [['Dimensions', 'unknown']]],
  ['material', 'Material / weight', 15, [['Weight evidence', 'unknown']]],
  ['access', 'Access / labor / disassembly', 10, [['Access', 'resolved'], ['Disassembly', 'resolved']]]
].map(([id, label, weight, checks]) => ({ id, label, weight, effectiveWeight: weight,
  fraction: checks.filter((c) => c[1] === 'resolved').length / checks.length,
  checks: checks.map(([label, state]) => ({ label, state })) }));
const diagnostics = { status: 'available', facts, readiness: { score: 41.6666667, components,
  policy: 'Provisional policy weights; shadow only. Not pricing accuracy, probability or a confidence interval.',
  historicalSupport: 'Separate: unverified comparable scope; no readiness credit.', blockers: ['Dimensions are unavailable.', 'Payload evidence unavailable.'] },
  volume: { status: 'unavailable', reasons: ['No inventory supports a volume calculation.'], cubicYards: null, loadEquivalents: null,
    volumeOnlyTrips: null, lines: [], countedGroups: 0, omittedConstituents: 0, mergedViews: 0,
    weight: { status: 'review_required', dense: false, restricted: false, payloadEvidence: 'unavailable' } } };
const analysis = { estimatedLoadPercent: 50, estimatedLoadCount: 0.5, estimatedLoadRange: 'Synthetic', materialType: 'mixed junk',
  difficulty: 'easy', heavyDebrisRisk: 'low', confidencePercent: 90, photoAngleQuality: 'good', hiddenDebrisRisk: 'low',
  visibleItems: [], observedFacts: [], employeeProvidedFacts: [], assumptions: [], uncertaintyNotes: [], warnings: [], questionsToAsk: [] };
const inputs = { stairs: 'none' };
let requests = 0; let original;
await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'abstained', reasons: ['Synthetic scope unavailable.'] } }));
await page.route('**/api/analyze', async (route) => {
  const request = route.request();
  const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
  const snapshot = { notes: form.get('notes'), image: Buffer.from(await form.get('photos').arrayBuffer()).toString('base64') };
  const index = requests++;
  if (index === 0) {
    original = snapshot;
    return route.fulfill({ json: { status: 'clarification_required', priceWithheld: true, analysis: null, inputs: null, pricing: null,
      clarification: { token: 'synthetic', questions: [
        { id: 'hidden', text: 'What is the removal scope?' }, { id: 'contents', text: 'What is inside the boxes?' },
        { id: 'dismantling', text: 'Is disassembly required?' }, { id: 'dimensions', text: 'What are the dimensions?' }
      ] } } });
  }
  if (index === 1) {
    assert.deepEqual(snapshot, original);
    const answers = JSON.parse(form.get('clarification')).answers;
    assert.equal(answers[3].notSure, true);
    assert.equal(answers[1].answer, 'Boxes contain lightweight Christmas decorations.');
    return route.fulfill({ json: { status: 'needs_manager_review', priceWithheld: true, analysis: null, inputs: null, pricing: null,
      analysisConfidence: { score: 73, scale: '1-100', source: 'model_reported', calibrated: false },
      clarification: null, statusReasons: ['Dimensions remains unconfirmed.'], diagnostics } });
  }
  const ready = structuredClone(diagnostics);
  ready.volume = { ...ready.volume, status: 'available', reasons: ['Conditional geometric envelope, not measured accuracy.'],
    cubicYards: { min: 2, max: 8 / 3 }, loadEquivalents: { min: 1 / 6, max: 2 / 9 }, volumeOnlyTrips: { min: 1, max: 1 },
    countedGroups: 1, lines: [{ item: 1, quantity: 2, dimensionsYards: [{ min: 1, max: 1 }, { min: 1, max: 1 }, { min: 1, max: 4 / 3 }],
      factor: { min: 1, max: 1 }, cubicYards: { min: 2, max: 8 / 3 }, source: 'employee_report', packing: 'loaded_envelope', photoRefs: [1] }] };
  return route.fulfill({ json: { status: 'direct_quote_eligible', analysis, inputs, confidenceThreshold: 85,
    diagnostics: index === 3 ? { status: 'unavailable', reason: 'Shadow diagnostics unavailable; the existing estimate is unchanged.' } : ready,
    pricing: { suggestedQuote: 230, recommendedRange: 'Synthetic price range', minimumPrice: 130, baseLoadPrice: 225,
      adjustments: 0, adjustmentNotes: [], competitorSummary: 'Synthetic', customerMessage: 'Synthetic quote.' } } });
});
try {
  await page.goto('http://127.0.0.1:3015');
  const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 1600; return c.toDataURL().split(',')[1]; });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.locator('textarea[name=notes]').fill('Synthetic original scope');
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.locator('#answer-hidden').fill('Nothing underneath. Nothing outside the photographed scope.');
  await page.locator('#answer-contents').fill('Boxes contain lightweight Christmas decorations.');
  await page.locator('#answer-dismantling').fill('No disassembly required.');
  await page.getByRole('checkbox', { name: 'Not sure' }).nth(3).check();
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.getByRole('heading', { name: 'Manager review required', exact: true }).waitFor();
  assert(!(await page.locator('body').innerText()).includes('$'));
  assert.equal(await page.locator('.quoteBox, .historicalReference').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Reassess estimate', exact: true }).count(), 0);
  const panel = page.getByRole('region', { name: 'Internal Preview diagnostics' });
  assert((await panel.innerText()).includes('Container contents: resolved'));
  assert((await panel.innerText()).includes('Dimensions: unknown'));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await panel.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(tmpdir(), `whs-shadow-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.getByText('$230', { exact: true }).waitFor();
  assert((await panel.innerText()).includes('2 to 2.6667 cubic yards'));
  assert((await panel.innerText()).includes('0.1667 to 0.2222 fractional 12-yard load equivalents'));
  await page.screenshot({ path: join(tmpdir(), 'whs-shadow-volume.png'), fullPage: true });
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await panel.getByText('Shadow diagnostics unavailable; the existing estimate is unchanged.').waitFor();
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$230');
  assert.deepEqual(errors, []);
  console.log('PASS: synthetic clarification reconciliation, 73/100 withholding, unchanged context, desktop/mobile diagnostics, volume example and graceful shadow failure. No live model/Sheet calls.');
} finally { await browser.close(); }
