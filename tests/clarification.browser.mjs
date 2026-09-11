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
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const analysis = { estimatedLoadPercent: 50, estimatedLoadCount: 0.5, estimatedLoadRange: 'Synthetic', materialType: 'mixed junk',
  difficulty: 'easy', heavyDebrisRisk: 'low', confidencePercent: 70, photoAngleQuality: 'good', hiddenDebrisRisk: 'low',
  visibleItems: [], observedFacts: [], assumptions: [], uncertaintyNotes: [], warnings: [], questionsToAsk: [] };
function priced(amount, status = 'needs_manager_review') {
  return { status, statusReasons: ['Provisional; manager review required.'], analysis, inputs: { stairs: 'none' }, confidenceThreshold: 85,
    pricing: { suggestedQuote: amount, recommendedRange: 'Synthetic internal range', minimumPrice: 130, baseLoadPrice: 300,
      adjustments: 25, adjustmentNotes: [], competitorSummary: 'Synthetic', customerMessage: 'Manager review before a firm quote.' } };
}
const requests = [];
let releaseFirst, releaseStale;
await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'abstained', reasons: ['Synthetic scope unavailable.'] } }));
await page.route('**/api/analyze', async (route) => {
  const index = requests.length;
  requests.push(null);
  const request = route.request();
  const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
  requests[index] = { notes: form.get('notes'), photos: Buffer.from(await form.get('photos').arrayBuffer()).toString('base64'), clarification: form.get('clarification') };
  if (index === 0) {
    await new Promise((resolve) => { releaseFirst = resolve; });
    return route.fulfill({ json: { status: 'clarification_required', analysis: null, pricing: null, inputs: null,
      clarification: { token: 'synthetic-browser-ticket', questions: [
        { id: 'hidden', text: 'Is anything hidden?' }, { id: 'contents', text: 'What is inside the boxes?' }
      ] } } });
  }
  if (index === 1) return route.fulfill({ status: 502, json: { status: 'analysis_failed', pricing: null, error: 'Synthetic retryable failure' } });
  if (index === 3) {
    await new Promise((resolve) => { releaseStale = resolve; });
    return route.fulfill({ json: priced(999) }).catch(() => {});
  }
  return route.fulfill({ json: priced(index === 4 ? 545 : 325) });
});
async function until(test) {
  const start = Date.now(); while (!test()) { if (Date.now() - start > 15000) throw new Error('Synthetic synchronization timeout'); await new Promise((r) => setTimeout(r, 30)); }
}
try {
  await page.goto('http://127.0.0.1:3015');
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1600; return canvas.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.locator('textarea[name=notes]').fill('Synthetic original details');
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await until(() => releaseFirst);
  await page.locator('form').first().dispatchEvent('submit');
  assert.equal(requests.length, 1);
  releaseFirst();
  await page.getByRole('heading', { name: 'A few details will help refine your estimate' }).waitFor();
  assert.equal(await page.locator('.quoteBox, .historicalReference').count(), 0);
  assert(!(await page.locator('body').innerText()).includes('$'));
  await page.locator('#answer-hidden').fill('Only the visible items.');
  await page.getByRole('checkbox', { name: 'Not sure' }).nth(1).check();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.clarificationPanel').scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(tmpdir(), `whs-clarification-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#answer-hidden').inputValue(), 'Only the visible items.');
  assert(await page.getByRole('checkbox', { name: 'Not sure' }).nth(1).isChecked());
  await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
  await page.locator('.quoteBox h2').waitFor();
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$325');
  assert.equal(await page.locator('.clarificationPanel').count(), 0);
  assert.equal(requests[2].notes, requests[0].notes);
  assert.equal(requests[2].photos, requests[0].photos);
  assert.equal(JSON.parse(requests[2].clarification).answers[1].notSure, true);
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await until(() => releaseStale);
  await page.getByRole('button', { name: 'Cancel request' }).click();
  await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await page.getByText('$545', { exact: true }).waitFor();
  releaseStale();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$545');
  assert.deepEqual(errors, []);
  console.log('PASS: two-step flow; no pre-clarification prices; original context/answers retained; Not sure; retry; duplicate and stale response protection; desktop/mobile.');
} finally { releaseFirst?.(); releaseStale?.(); await browser.close(); }
