import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const analysis = { estimatedLoadPercent: 55, estimatedLoadCount: 0.55, estimatedLoadRange: 'Synthetic', materialType: 'mixed junk', difficulty: 'easy', heavyDebrisRisk: 'low', confidencePercent: 73, photoAngleQuality: 'good', hiddenDebrisRisk: 'low', visibleItems: ['Synthetic boxes'], observedFacts: [], employeeProvidedFacts: [], assumptions: [], uncertaintyNotes: [], warnings: [], questionsToAsk: [] };
const base = { status: 'conditional_estimate', estimateKind: 'provisional', priceWithheld: false, firmQuoteEligible: false,
  estimateLabel: 'Internal estimate - requires review before quoting', analysis, inputs: { stairs: 'none', jobTypes: ['furniture', 'appliances'] }, confidenceThreshold: 85,
  statusReasons: ['Staff review required before quoting.'], assumptions: ['Shown scope only. Policy range, not a statistical prediction interval.'],
  priceDrivers: [{ topic: 'handling', state: 'resolved', message: 'Handling: low. No automatic heavy adjustment.', evidence: ['Synthetic employee confirmation.'] }],
  loadUnits: { percent: 55, cubicYards: 6.6, trailerEquivalents: 0.55, volumeOnlyTrips: 1, trailerCubicYards: 12 },
  diagnostics: { status: 'unavailable', reason: 'Inventory extraction remains deferred.' },
  pricing: { suggestedQuote: 310, recommendedRange: '$270 - $350', minimumPrice: 130, baseLoadPrice: 302.5, adjustments: 0, adjustmentNotes: [], customerMessage: null } };
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    let requests = 0, original, release, staleRelease;
    let mockRouting = false;
    await page.route('**/api/estimate-location?*', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (!mockRouting) return route.fulfill({ status: 503, json: { status: 'blocked', error: 'Google Maps location search is not configured.', suggestions: [] } });
      if (params.get('query') === 'No such city') return route.fulfill({ json: { suggestions: [] } });
      if (params.get('query') === 'Provider failure') return route.fulfill({ status: 502, json: { error: 'Google Maps could not complete the request.' } });
      if (params.has('placeId')) return route.fulfill({ json: { location: { id: 'synthetic-lake-forest', label: 'Lake Forest, CA', state: 'CA', drivingMiles: 20, latitude: 33.65, longitude: -117.69, token: 'synthetic-location-proof' } } });
      return route.fulfill({ json: { suggestions: [{ id: 'synthetic-lake-forest', label: 'Lake Forest, CA, USA' }] } });
    });
    await page.route('**/api/historical-reference', (route) => route.fulfill({ json: { status: 'abstained', reasons: ['Synthetic only.'] } }));
    await page.route('**/api/analyze', async (route) => {
      const req = route.request();
      const form = await new Request('http://synthetic.test', { method: 'POST', headers: req.headers(), body: req.postDataBuffer() }).formData();
      const photos = form.getAll('photos');
      assert.equal(photos.length, 10); assert.equal(form.has('workers'), false);
      assert.deepEqual(form.getAll('jobType'), ['furniture', 'appliances']);
      assert.equal(form.get('workflow'), 'guided-location-v2');
      assert.equal(form.get('locationToken'), 'synthetic-location-proof');
      assert(photos.every((p) => p.type === 'image/jpeg'));
      assert(photos.reduce((n, p) => n + p.size, 0) <= 3.5 * 1024 * 1024);
      const snapshot = { notes: form.get('notes'), carry: form.get('carryDistance'), stairs: form.get('stairs'), distance: form.get('distanceTier'), photos: await Promise.all(photos.map(async (p) => Buffer.from(await p.arrayBuffer()).toString('base64'))) };
      const index = requests++;
      if (index === 0) {
        original = snapshot; assert.equal(snapshot.carry, 'short'); assert.equal(snapshot.stairs, 'none'); assert.equal(snapshot.distance, 'under25');
        assert(snapshot.notes.includes('Item location: Second floor.'));
        await new Promise((resolve) => { release = resolve; });
        return route.fulfill({ json: { ...base, clarification: { token: 'synthetic', history: [], round: 1, optional: false, canSkip: true, questions: [{ id: 'contents', text: 'What is inside the boxes?' }, { id: 'dismantling', text: 'Is disassembly required?' }] } } });
      }
      assert.deepEqual(snapshot, original);
      if (index < 3) {
        const submitted = JSON.parse(form.get('clarification'));
        assert.deepEqual(submitted.answers, [{ id: 'contents', answer: 'lightweight decorations', notSure: false }, { id: 'dismantling', answer: 'no', notSure: false }]);
        if (index === 1) return route.fulfill({ status: 502, json: { status: 'analysis_failed', error: 'Synthetic recoverable failure', pricing: null, analysis: null } });
        return route.fulfill({ json: { ...base, clarification: null } });
      }
      if (index === 3) {
        await new Promise((resolve) => { staleRelease = resolve; });
        return route.fulfill({ json: { ...base, pricing: { ...base.pricing, recommendedRange: '$999 - $1000' } } }).catch(() => {});
      }
      return route.fulfill({ json: { status: 'needs_manager_review', priceWithheld: true, pricing: null, analysis: null, statusReasons: ['Scope is unbounded. Confirm item quantities.'] } });
    });
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3017');
    await page.getByRole('button', { name: 'Wade Home Services - start over', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Let’s take a look!', exact: true }).waitFor();
    assert(await page.locator('.welcome img').evaluate((img) => img.complete && img.naturalWidth > 0));
    await page.screenshot({ path: join(tmpdir(), `whs-guided-welcome-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Start estimate', exact: true }).click();
    assert.equal(await page.locator('.spiralEntry').evaluate((el) => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('input[name=distanceTier]').count(), 0);
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('Test');
    await page.locator('#location-status').filter({ hasText: 'not configured' }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Select a California' }).waitFor();
    assert.equal(requests, 0);
    // Exercise provider states with synthetic responses, never paid Maps calls.
    mockRouting = true;
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('No such city');
    await page.locator('#location-status').filter({ hasText: 'No California city' }).waitFor();
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('Provider failure');
    await page.locator('#location-status').filter({ hasText: 'could not complete' }).waitFor();
    await page.getByRole('button', { name: 'Retry location search', exact: true }).waitFor();
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('Lake Forest');
    await page.getByRole('button', { name: 'Lake Forest, CA, USA', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: 'Approximate city-level driving distance' }).waitFor();
    // Editing selected free text invalidates the selection and its tier.
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('Unselected text');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Select a California' }).waitFor();
    await page.getByLabel('California city or neighborhood', { exact: true }).fill('Lake Forest');
    await page.getByRole('button', { name: 'Lake Forest, CA, USA', exact: true }).click();
    await page.locator('#location-status').filter({ hasText: 'Approximate city-level driving distance' }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Furniture', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Appliances', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: 'Second floor', exact: true }).check();
    assert.equal(await page.locator('input[name=stairs]:checked,input[name=carryDistance]:checked').count(), 0);
    await page.getByRole('radio', { name: 'Short carry', exact: true }).check();
    await page.getByRole('radio', { name: 'No stairs', exact: true }).check();
    await page.screenshot({ path: join(tmpdir(), `whs-guided-access-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 1600; const ctx = c.getContext('2d'); ctx.fillStyle = '#e9eff2'; ctx.fillRect(0, 0, 1600, 1600); ctx.fillStyle = '#345b49'; ctx.fillRect(400, 400, 800, 700); return c.toDataURL().split(',')[1]; });
    await page.locator('input[type=file]').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `synthetic-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })));
    await page.waitForFunction(() => !document.querySelector('.stepActions button[type=submit]').disabled);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('textarea[name=notes]').fill('Synthetic lightweight goods. All items easily carried by one person. Elevator route; all shown items included.');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert((await page.locator('#photo-help').innerText()).includes('10 image(s) selected'));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert((await page.locator('textarea[name=notes]').inputValue()).includes('Synthetic lightweight'));
    assert.equal(await page.locator('input[name=workers]').count(), 0);
    await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
    await page.getByText('Analyzing your job...', { exact: true }).waitFor();
    assert.equal(await page.locator('.busyIndicator').evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.locator('.guided form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.activeElement?.classList.contains('analysisBusy'));
    assert.equal(requests, 1); release();
    await page.getByRole('heading', { name: '$270 - $350', exact: true }).waitFor();
    assert((await page.getByRole('region', { name: 'Internal estimate' }).innerText()).includes('furniture, appliances'));
    assert.equal(await page.locator('textarea[readonly]').count(), 0);
    assert.equal(await page.locator('.clarificationQuestion').count(), 2);
    for (const name of ['Assumptions', 'Model-estimated loads', 'Scope and price drivers', 'Historical reference', 'Uncalibrated analysis score', 'Technical shadow diagnostics']) {
      const summary = page.locator('summary').filter({ hasText: name });
      assert.equal(await summary.locator('..').getAttribute('open'), null);
    }
    await page.locator('#answer-contents').fill('lightweight decorations'); await page.locator('#answer-dismantling').fill('no');
    await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
    await page.getByRole('alert').getByText('Synthetic recoverable failure').waitFor();
    assert.equal(await page.locator('.quoteBox').count(), 0); assert.equal(await page.locator('#answer-dismantling').inputValue(), 'no');
    await page.getByRole('button', { name: 'Reassess estimate', exact: true }).click();
    await page.getByRole('heading', { name: '$270 - $350', exact: true }).waitFor();
    assert.equal(await page.locator('.clarificationQuestion').count(), 0);
    await page.locator('summary').filter({ hasText: 'Model-estimated loads' }).click();
    assert((await page.getByRole('region', { name: 'Internal estimate' }).innerText()).includes('55% = 6.6 cubic yards = 0.55 trailer equivalents'));
    await page.screenshot({ path: join(tmpdir(), `whs-guided-result-${width}.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Edit original details', exact: true }).click();
    await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await page.getByRole('button', { name: 'Analyze Job', exact: true }).click();
    await page.getByRole('heading', { name: 'Manager review required', exact: true }).waitFor();
    staleRelease(); assert.equal(await page.locator('.quoteBox').count(), 0);
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    await page.getByRole('heading', { name: 'Let’s take a look!', exact: true }).waitFor();
    assert.equal(await page.locator('.quoteBox,.clarificationPanel').count(), 0);
    await page.getByRole('button', { name: 'Start estimate', exact: true }).click();
    assert.equal(await page.getByLabel('California city or neighborhood', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: 'Review other steps while location is unresolved', exact: true }).click();
    assert.equal(await page.locator('input[name=jobType]:checked').count(), 0);
    await page.getByRole('checkbox', { name: 'Furniture', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert.equal(await page.locator('input[type=radio]:checked').count(), 0);
    await page.getByRole('radio', { name: 'Garage', exact: true }).check();
    await page.getByRole('radio', { name: 'Short carry', exact: true }).check();
    await page.getByRole('radio', { name: 'No stairs', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert((await page.locator('#photo-help').innerText()).includes('Choose up to 10 images'));
    assert(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Wade Home Services - start over', exact: true }).click();
    await page.getByRole('heading', { name: 'Let’s take a look!', exact: true }).waitFor();
    // Inspect the normal-motion animation without timing a screenshot of its transient frame.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Start estimate', exact: true }).click();
    assert.equal(await page.locator('.spiralEntry').evaluate((el) => getComputedStyle(el).animationName), 'spiral-in');
    assert.deepEqual(errors, []); await context.close();
  }
  console.log('PASS: synthetic desktop/mobile flow, missing-config/no-results/provider-error states, mocked Lake Forest selection, approximate route labeling, signed-proof transport and free-text invalidation, multi-select, 10-photo optimization, context/answers, failure/retry, duplicate/stale protection and reset. Routing and analysis mocked, not live Maps/provider verification.');
} finally { await browser.close(); }
