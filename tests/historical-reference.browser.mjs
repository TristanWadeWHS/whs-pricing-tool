// Synthetic local smoke only; never sends an image to OpenAI or reads Sheets.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = 'http://127.0.0.1:3015';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const context = await browser.newContext({ httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const analysis = { estimatedLoadPercent: 50, estimatedLoadCount: 0.5, estimatedLoadRange: 'Synthetic load',
  materialType: 'mixed junk', difficulty: 'easy', heavyDebrisRisk: 'low', confidencePercent: 90,
  photoAngleQuality: 'good', hiddenDebrisRisk: 'low', visibleItems: [], observedFacts: [], assumptions: [],
  uncertaintyNotes: [], warnings: [], questionsToAsk: [] };
await page.route('**/api/analyze', (route) => route.fulfill({ json: {
  status: 'direct_quote_eligible', statusReasons: [], confidenceThreshold: 80, analysis, inputs: { stairs: 'none' },
  pricing: { suggestedQuote: 325, recommendedRange: '$300-$350', minimumPrice: 130, baseLoadPrice: 300,
    adjustments: 25, adjustmentNotes: [], competitorSummary: 'Synthetic comparison', customerMessage: 'Synthetic quote unchanged.' }
} }));
try {
  await page.goto(baseURL);
  // Generate a valid synthetic image in memory, without filesystem/customer fixtures.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1600;
    canvas.getContext('2d').fillRect(0, 0, 1600, 1600); return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const submit = () => page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
  await submit();
  await page.getByText('No reliable comparison available', { exact: true }).waitFor();
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$325');
  const reference = await context.request.post(`${baseURL}/api/historical-reference`, { data: { stairs: 'none' } });
  assert.equal(reference.status(), 200);
  assert(reference.headers()['cache-control'].includes('no-store'));
  await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'matched', matchedCount: 5,
    median: 300, p25: 200, p75: 400, reasons: ['Synthetic shared scope only.'] } }));
  await submit();
  await page.getByText('Median completed price', { exact: true }).waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.historicalReference').scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(tmpdir(), `whs-historical-reference-${width}.png`) });
  }
  await page.unroute('**/api/historical-reference');
  await page.route('**/api/historical-reference', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic failure' } }));
  await submit();
  await page.getByText('Historical reference unavailable', { exact: true }).waitFor();
  assert.equal(await page.locator('.quoteBox h2').innerText(), '$325');
  assert.equal(await page.locator('textarea[readonly]').inputValue(), 'Synthetic quote unchanged.');
  assert.deepEqual(errors, []);
  console.log('PASS: real abstention, synthetic matched display desktop/mobile, data failure isolation, no page errors.');
} catch (error) {
  console.log('Synthetic browser state:', (await page.locator('body').innerText()).slice(0, 1800));
  throw error;
} finally { await browser.close(); }
