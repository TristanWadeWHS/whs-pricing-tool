import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const analysis = { confidencePercent: 73, estimatedLoadPercent: 55, estimatedLoadCount: 0.55, visibleItems: ['Synthetic sealed boxes'], observedFacts: ['Synthetic closed containers'], photoAngleQuality: 'good', materialType: 'mixed junk', difficulty: 'easy', heavyDebrisRisk: 'low' };
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const external = []; page.on('request', (request) => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url()); });
    let submissions = 0, original;
    await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'abstained', reasons: ['Synthetic test only.'] } }));
    await page.route('**/api/analyze', async (route) => {
      const r = route.request(); const f = await new Request('http://synthetic.test', { method: 'POST', headers: r.headers(), body: r.postDataBuffer() }).formData();
      const context = { city: f.get('cityId'), tier: f.get('staffDistanceTier'), notes: f.get('notes'), types: f.getAll('jobType'), photos: await Promise.all(f.getAll('photos').map(async (p) => Buffer.from(await p.arrayBuffer()).toString('base64'))) };
      assert.equal(context.tier, '25to40');
      if (submissions++ === 0) original = context;
      else { assert.deepEqual(context, original); assert(JSON.parse(f.get('clarification')).answers.some((a) => a.id === 'contents' && a.answer === 'lightweight decorations')); }
      return route.fulfill({ json: { status: 'conditional_estimate', estimateKind: 'provisional', priceWithheld: false, firmQuoteEligible: false,
        estimateLabel: 'Internal estimate - requires review before quoting', analysis, inputs: { location: { label: 'Lake Forest, Orange County, CA', county: 'Orange County' }, distanceTier: '25to40', distanceTierSource: 'staff_confirmed', jobTypes: ['furniture', 'appliances'], stairs: 'none' },
        statusReasons: ['Staff review before quoting.'], pricing: { suggestedQuote: 310, recommendedRange: '$270 - $350', minimumPrice: 145, baseLoadPrice: 302.5, adjustments: 0, adjustmentNotes: [], customerMessage: null },
        clarification: submissions === 1 ? { token: 'synthetic-signed-context', history: [], round: 1, optional: true, canSkip: true, questions: [{ id: 'contents', text: 'What is inside the sealed boxes?' }] } : null } });
    });
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3017');
    await page.getByRole('button', { name: 'Start estimate', exact: true }).click();
    const input = page.getByLabel('Southern California city or neighborhood', { exact: true });
    await input.fill('No such city xyz');
    await page.locator('#location-status').filter({ hasText: 'No matching city' }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Select a city and county' }).waitFor();
    await input.fill('Anza');
    await page.getByRole('button', { name: 'Anza, Imperial County, CA', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Anza, Riverside County, CA', exact: true }).waitFor();
    await input.fill('Lake Forest');
    await page.getByRole('button', { name: 'Lake Forest, Orange County, CA', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: 'Staff review required' }).waitFor();
    assert.equal(await page.locator('input[name=distanceTier]').count(), 0);
    assert.equal(await page.locator('input[name=staffDistanceTier]:checked').count(), 0);
    await page.getByRole('radio', { name: '25-40 miles', exact: true }).check();
    assert(!(await page.locator('#location-status').innerText()).includes('not configured'));
    await page.screenshot({ path: join(tmpdir(), `whs-local-city-${width}.png`), fullPage: true });
    await input.fill('Lake Forest edited');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Select a city and county' }).waitFor();
    await input.fill('Lake Forest');
    await page.getByRole('button', { name: 'Lake Forest, Orange County, CA', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: 'Staff review required' }).waitFor();
    assert.equal(await page.locator('input[name=staffDistanceTier]:checked').count(), 0);
    await page.getByRole('radio', { name: '25-40 miles', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Furniture', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Appliances', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: 'Garage', exact: true }).check();
    await page.getByRole('radio', { name: 'Short carry', exact: true }).check();
    await page.getByRole('radio', { name: 'No stairs', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 1600; const x = c.getContext('2d'); x.fillStyle = '#dce8ef'; x.fillRect(0, 0, 1600, 1600); x.fillStyle = '#436451'; x.fillRect(200, 200, 500, 400); return c.toDataURL().split(',')[1]; });
    await page.locator('input[type=file]').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `synthetic-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })));
    await page.waitForFunction(() => !document.querySelector('.stepActions button[type=submit]').disabled);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('textarea[name=notes]').fill('Synthetic scope only. Nothing outside the photos.');
    assert((await page.locator('.reviewList').innerText()).includes('Staff-confirmed distance tier'));
    assert(await page.getByRole('radio', { name: '25-40 miles', exact: true }).isChecked());
    assert((await page.locator('.reviewList').innerText()).includes('furniture, appliances'));
    const submitted = page.waitForRequest((req) => req.url().endsWith('/api/analyze'));
    const responded = page.waitForResponse((res) => res.url().endsWith('/api/analyze'));
    await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
    const request = await submitted;
    const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
    assert.equal(form.get('workflow'), 'guided-city-v3'); assert.equal(form.get('cityId'), 'geonames:5364514');
    assert.equal(form.has('distanceTier'), false); assert.equal(form.has('locationToken'), false);
    assert.equal(form.get('staffDistanceTier'), '25to40');
    assert.equal(form.getAll('photos').length, 10); assert(form.getAll('photos').reduce((n, p) => n + p.size, 0) <= 3.5 * 1024 * 1024);
    const result = await (await responded).json();
    assert.equal(result.status, 'conditional_estimate'); assert.equal(result.inputs.distanceTier, '25to40');
    await page.getByRole('heading', { name: '$270 - $350', exact: true }).waitFor();
    assert((await page.getByRole('region', { name: 'Internal estimate' }).innerText()).includes('Staff-confirmed distance tier'));
    await page.getByRole('button', { name: 'Refine estimate', exact: true }).click();
    await page.locator('#answer-contents').fill('lightweight decorations');
    await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#answer-contents'));
    await page.getByRole('heading', { name: '$270 - $350', exact: true }).waitFor();
    assert.equal(submissions, 2);
    assert((await page.getByRole('region', { name: 'Internal estimate' }).innerText()).includes('Staff-confirmed distance tier'));
    assert.equal(await page.locator('textarea[readonly]').count(), 0);
    await page.screenshot({ path: join(tmpdir(), `whs-local-review-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Edit original details', exact: true }).click();
    assert.equal(await page.locator('textarea[name=notes]').inputValue(), 'Synthetic scope only. Nothing outside the photos.');
    assert((await page.locator('.reviewList').innerText()).includes('10 selected and optimized'));
    assert(await page.getByRole('radio', { name: '25-40 miles', exact: true }).isChecked());
    await page.getByRole('button', { name: 'Wade Home Services - start over', exact: true }).click();
    await page.getByRole('button', { name: 'Start estimate', exact: true }).click();
    assert.equal(await input.inputValue(), '');
    // A transient local endpoint error preserves the normal retry/no-tier behavior.
    await page.route('**/api/estimate-location?*', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic local directory unavailable' } }));
    await input.fill('Lake Forest');
    await page.locator('#location-status').filter({ hasText: 'Synthetic local directory unavailable' }).waitFor();
    await page.unroute('**/api/estimate-location?*');
    await page.getByRole('button', { name: 'Retry location search', exact: true }).click();
    await page.getByRole('button', { name: 'Lake Forest, Orange County, CA', exact: true }).waitFor();
    // Synthetic mapped-city UI path only; never add a fake route to source data.
    await page.route('**/api/estimate-location?cityId=*', async (route) => { const response = await route.fetch(); const data = await response.json(); data.location = { ...data.location, status: 'verified', representativeDrivingMiles: 20, distanceTier: 'under25', reason: 'Synthetic verified city route.' }; return route.fulfill({ json: data }); });
    await page.getByRole('button', { name: 'Lake Forest, Orange County, CA', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: 'Synthetic verified city route' }).waitFor();
    assert.equal(await page.locator('input[name=staffDistanceTier]').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
  }
  console.log('PASS: desktop/mobile Lake Forest staff override, reset on city edits, ten-photo transport, mocked provisional pricing and clarification preservation, source labeling, mapped-city UI and retry. Model/historical responses mocked; no live Maps/OpenAI/Sheets calls.');
} finally { await browser.close(); }
