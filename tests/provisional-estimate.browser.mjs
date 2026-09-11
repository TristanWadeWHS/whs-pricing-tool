import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
const page = await context.newPage(); page.setDefaultTimeout(20000);
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const analysis = { estimatedLoadPercent: 55, estimatedLoadCount: 0.55, estimatedLoadRange: 'Synthetic loaded volume', materialType: 'mixed junk',
  difficulty: 'easy', heavyDebrisRisk: 'low', confidencePercent: 73, photoAngleQuality: 'good', hiddenDebrisRisk: 'low',
  visibleItems: ['Synthetic boxes'], observedFacts: ['Synthetic boxes in side yard'], employeeProvidedFacts: [], assumptions: [], uncertaintyNotes: [], warnings: [], questionsToAsk: [] };
const base = { status: 'conditional_estimate', estimateKind: 'provisional', priceWithheld: false, firmQuoteEligible: false,
  estimateLabel: 'Internal estimate \u2014 requires review before quoting', analysis, inputs: { stairs: 'none' }, confidenceThreshold: 85,
  statusReasons: ['Staff review required before quoting.'], assumptions: ['Shown items only; short carry, no stairs.', 'Policy range, not a statistical prediction interval.'],
  priceDrivers: [{ topic: 'handling', state: 'resolved', message: 'Handling: low. No automatic heavy adjustment.', evidence: ['Employee: all items easily carried by one person.'] },
    { topic: 'hidden', state: 'resolved', message: 'Additional scope: resolved. No uncertainty surcharge.', evidence: ['All shown items included.'] },
    { topic: 'labor', state: 'resolved', message: 'Routine lifting, loading and packing included. No generic labor surcharge.', evidence: ['Short carry, no stairs.'] }],
  loadUnits: { percent: 55, cubicYards: 6.6, trailerEquivalents: 0.55, volumeOnlyTrips: 1, trailerCubicYards: 12 },
  diagnostics: { status: 'unavailable', reason: 'Live inventory extraction is deferred; shadow failure does not affect pricing.' },
  pricing: { suggestedQuote: 255, recommendedRange: '$215 - $295', minimumPrice: 130, baseLoadPrice: 248, adjustments: 0, adjustmentNotes: [], customerMessage: null } };
let requests = 0; let original; let history; let release; let staleRelease;
await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'abstained', reasons: ['Synthetic scope unavailable.'] } }));
await page.route('**/api/analyze', async (route) => {
  const request = route.request();
  const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
  const snapshot = { notes: form.get('notes'), stairs: form.get('stairs'), carry: form.get('carryDistance'), image: Buffer.from(await form.get('photos').arrayBuffer()).toString('base64') };
  const index = requests++;
  if (index === 0) {
    original = snapshot;
    return route.fulfill({ json: { ...base, clarification: { token: 'synthetic-1', history: [], round: 1, optional: false, canSkip: true,
      questions: [{ id: 'contents', text: 'What is inside the boxes?' }, { id: 'dismantling', text: 'Is disassembly required?' }] } } });
  }
  if (index <= 3) {
    assert.deepEqual(snapshot, original);
    const submission = JSON.parse(form.get('clarification'));
    if (index === 1) {
      assert.deepEqual(submission.history, []);
      assert.deepEqual(submission.answers, [{ id: 'contents', answer: 'lightweight decorations', notSure: false }, { id: 'dismantling', answer: 'no', notSure: false }]);
      history = submission.answers;
      await new Promise((resolve) => { release = resolve; });
      return route.fulfill({ json: { ...base, clarification: { token: 'synthetic-2', history, round: 2, optional: true, canSkip: true,
        questions: [{ id: 'dimensions', text: 'What are the approximate dimensions?' }] } } });
    }
    assert.deepEqual(submission.history, history);
    assert.deepEqual(submission.answers, [{ id: 'dimensions', answer: '', notSure: true }]);
    if (index === 2) return route.fulfill({ status: 502, json: { status: 'analysis_failed', error: 'Synthetic recoverable failure', analysis: null, pricing: null } });
    return route.fulfill({ json: { ...base, status: 'needs_manager_review', clarification: null } });
  }
  if (index === 4) {
    await new Promise((resolve) => { staleRelease = resolve; });
    return route.fulfill({ json: { ...base, pricing: { ...base.pricing, recommendedRange: '$999 - $1000' }, clarification: null } }).catch(() => {});
  }
  return route.fulfill({ json: { status: 'needs_manager_review', priceWithheld: true, estimateKind: 'withheld', firmQuoteEligible: false,
    analysis: null, pricing: null, inputs: null, clarification: null, statusReasons: ['Removal volume cannot be bounded. Confirm the item quantities.'] } });
});
try {
  await page.goto('http://127.0.0.1:3015');
  await page.getByRole('heading', { name: 'Internal Pricing Tool' }).waitFor();
  assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(), 0);
  const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 1600; return c.toDataURL().split(',')[1]; });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.locator('textarea[name=notes]').fill('Synthetic lightweight side-yard junk; all shown items included. All items easily carried by one person.');
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.getByRole('heading', { name: '$215 - $295', exact: true }).waitFor();
  assert((await page.getByRole('region', { name: 'Internal estimate' }).innerText()).includes('55% = 6.6 cubic yards = 0.55 trailer equivalents'));
  assert((await page.locator('body').innerText()).includes('Whole volume-only hauling trips: 1. Not payload or towing approval.'));
  assert((await page.locator('body').innerText()).includes('Handling: low. No automatic heavy adjustment.'));
  assert.equal(await page.locator('.clarificationQuestion').count(), 2);
  assert.equal(await page.locator('details').filter({ has: page.getByText('Technical shadow diagnostics', { exact: true }) }).getAttribute('open'), null);
  assert.equal(await page.locator('textarea[readonly]').count(), 0);
  await page.locator('#answer-contents').fill('lightweight decorations'); await page.locator('#answer-dismantling').fill('no');
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.getByText('Reassessing your job...', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Reassess estimate', exact: true }).isDisabled());
  assert.equal(await page.locator('.quoteBox').count(), 0);
  await page.locator('#answer-contents').evaluate((node) => node.form.requestSubmit());
  assert.equal(requests, 2); release();
  await page.getByRole('button', { name: 'Refine estimate', exact: true }).waitFor();
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$215 - $295');
  assert((await page.locator('body').innerText()).includes('73/100'));
  await page.getByRole('button', { name: 'Refine estimate', exact: true }).click();
  await page.getByRole('button', { name: 'Not sure / Show provisional estimate', exact: true }).click();
  assert.equal(requests, 2);
  await page.getByRole('button', { name: 'Refine estimate', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Not sure', exact: true }).check();
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.getByRole('alert').getByText('Synthetic recoverable failure').waitFor();
  assert.equal(await page.locator('.quoteBox, .historicalReference').count(), 0);
  assert(await page.getByRole('checkbox', { name: 'Not sure', exact: true }).isChecked());
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.getByRole('heading', { name: '$215 - $295', exact: true }).waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(tmpdir(), `whs-provisional-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Edit original details', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.getByRole('heading', { name: 'Manager review required', exact: true }).waitFor();
  staleRelease();
  await page.getByText('Removal volume cannot be bounded. Confirm the item quantities.').waitFor();
  assert.equal(await page.locator('.quoteBox, .historicalReference').count(), 0);
  assert(!(await page.locator('body').innerText()).includes('$'));
  assert.deepEqual(errors, []);
  console.log('PASS: mocked 55%/6.6-yard/0.55-equivalent consistency, separate volume-only trip, low handling/no generic fees, low-score provisional range, two brief answers, optional round, skip, signed-history transport, unchanged photos/details, retry retention, duplicate/stale guards, failure/unbounded withholding, collapsed diagnostics, desktop/mobile. No live OpenAI or Sheets calls.');
} finally { await browser.close(); }
