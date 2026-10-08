import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], requests = [], externals = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) externals.push(request.url()); });
    let turn = 0, failOnce = false, answered = false, currentItems = [], holdNext = false, release;
    const box = { id: 'i_boxes', label: 'boxes', room: 'Garage', photoRefs: [1, 2], choice: 'unresolved' };
    const fridge = { id: 'i_fridge', label: 'a refrigerator beside the boxes', room: 'Garage', photoRefs: [1], choice: 'unresolved' };
    await page.route('**/api/conversation', async (route) => {
      const r = route.request(); const form = await new Request('http://synthetic.test', { method: 'POST', headers: r.headers(), body: r.postDataBuffer() }).formData();
      const data = JSON.parse(form.get('submission')); const files = form.getAll('photos');
      assert(files.length <= 10); assert(files.reduce((sum, f) => sum + f.size, 0) <= 3.5 * 1024 * 1024);
      requests.push({ data, files: files.length });
      if (holdNext) { holdNext = false; await new Promise((resolve) => { release = resolve; }); }
      if (failOnce) { failOnce = false; return route.fulfill({ status: 502, json: { error: 'Synthetic recoverable analysis failure.', baseline: null } }); }
      turn++;
      if (files.length && !currentItems.length) currentItems = [structuredClone(box), structuredClone(fridge)];
      for (const action of data.actions) currentItems.find((i) => i.id === action.id).choice = action.choice;
      if (data.answers.length) { answered = true; assert.equal(data.answers[0].text, 'lightweight decorations'); }
      const confirmed = currentItems.length && currentItems.every((i) => i.choice !== 'unresolved');
      const included = currentItems.filter((i) => i.choice === 'included'); const percent = included.some((i) => i.id === 'i_fridge') ? 80 : 60;
      const amount = percent / 100 * 550;
      const baseline = confirmed && answered ? { percent, cubicYards: Number((percent / 100 * 12).toFixed(4)), equivalents: percent / 100, point: amount, low: amount, high: amount, range: null, display: `$${amount}` } : null;
      const questions = confirmed && !answered ? [{ id: 'i_boxes:contents', itemId: 'i_boxes', topic: 'contents', photoRef: 1, text: 'What is inside these sealed boxes?', evidence: 'Sealed boxes visible.' }] : [];
      return route.fulfill({ json: { token: `synthetic-context-${turn}`, items: currentItems, baseline, questions, review: true,
        message: !files.length ? 'Happy to help! Tell me what needs to go and add photos when ready.' : baseline ? 'Thanks for the details! Your provisional estimate is ready below for team review.' : 'Happy to help! Which of these visible items should we include?',
        reasons: ['Location and access are not priced. Staff review required; demolition is not an all-inclusive quote.'], assumptions: ['Synthetic model estimates only.'] } });
    });
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3017');
    const composer = page.getByLabel('Message Winston', { exact: true });
    await composer.fill('Keep this description while I choose services.');
    await page.getByRole('button', { name: 'Junk pickup', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    assert.equal(requests.length, 1); assert.deepEqual(requests[0].data.services, ['mixed junk']);
    assert.equal(requests[0].data.message, "I'd like help with Junk pickup.");
    await page.getByRole('button', { name: 'Light demolition', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    assert.equal(await composer.inputValue(), 'Keep this description while I choose services.'); assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].data.services, ['mixed junk', 'demo debris']);
    assert.equal(await page.getByRole('button', { name: 'Junk pickup', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: join(tmpdir(), `whs-conversation-opening-${width}.png`) });
    await composer.fill('Junk pickup and light demolition: boxes from my garage.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    assert.deepEqual(requests.at(-1).data.services, ['mixed junk', 'demo debris']);
    assert(requests.at(-1).data.message.endsWith('boxes from my garage.'));
    const input = page.locator('input[type=file]');
    // Retry a transient decode failure without making a network request.
    await page.evaluate(() => { const original = window.createImageBitmap; let first = true; window.createImageBitmap = (...args) => { if (first) { first = false; return Promise.reject(new Error('Synthetic decode failure')); } return original.apply(window, args); }; });
    async function images(start, count) {
      const encoded = await page.evaluate(({ start, count }) => Array.from({ length: count }, (_, offset) => {
        const i = start + offset, c = document.createElement('canvas'); c.width = c.height = 1400;
        const x = c.getContext('2d'); x.fillStyle = '#e2edf1'; x.fillRect(0, 0, 1400, 1400); x.fillStyle = `rgb(${40 + i * 15},95,65)`; x.fillRect(80 + i * 20, 120, 700, 700);
        x.fillStyle = '#000'; x.font = '90px sans-serif'; x.fillText(`Synthetic room ${i}`, 100, 1000);
        return c.toDataURL().split(',')[1];
      }), { start, count });
      return encoded.map((base64, i) => ({ name: `synthetic-${start + i}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }));
    }
    await page.getByLabel('Room or photo batch').fill('Garage');
    await input.setInputFiles(await images(0, 5));
    await page.getByRole('button', { name: 'Retry photos', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry photos', exact: true }).click();
    await page.getByText('5/10 photos ready.', { exact: false }).waitFor();
    await composer.fill('Garage photos. The boxes are for removal.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByLabel('I see a refrigerator beside the boxes. Should we include it?', { exact: false }).waitFor();
    await page.locator('#scope-i_boxes').selectOption('included');
    await page.locator('#scope-i_fridge').selectOption('excluded');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByText('Replying to: What is inside these sealed boxes?', { exact: true }).waitFor();
    assert(!/\$\d/.test(await page.locator('body').innerText()), 'No price or formula while scope questions remain');
    assert.equal(await page.getByText('Assumptions & volume calculation', { exact: true }).count(), 0);
    await composer.fill('lightweight decorations');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('i_boxes:contents'));
    await page.getByRole('heading', { name: '$330', exact: true }).waitFor();
    await page.getByLabel('Room or photo batch').fill('Bedroom');
    await input.setInputFiles(await images(5, 5));
    await page.getByText('10/10 photos ready.', { exact: false }).waitFor();
    failOnce = true;
    holdNext = true;
    await composer.fill('Bedroom and overlapping views. Keep the refrigerator excluded.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'reviewing your photos and scope' }).waitFor();
    assert(!/\$\d/.test(await page.locator('body').innerText()), 'No previous or partial price during reassessment');
    release();
    await page.getByRole('alert').filter({ hasText: 'Synthetic recoverable' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '$330', exact: true }).count(), 0);
    assert(!/\$\d/.test(await page.locator('body').innerText()), 'No stale price after failure');
    await page.getByRole('button', { name: 'Retry last message', exact: true }).click();
    await page.getByRole('heading', { name: '$330', exact: true }).waitFor();
    assert.equal(requests.at(-1).files, 10); assert.deepEqual(requests.at(-1).data.photoRooms, [...Array(5).fill('Garage'), ...Array(5).fill('Bedroom')]);
    assert.equal(await page.locator('[id="i_boxes:contents"]').count(), 0);
    if (!(await page.locator('#scope-i_fridge').isVisible())) await page.locator('summary').filter({ hasText: 'Confirmed scope' }).click();
    assert.equal(await page.locator('#scope-i_fridge').inputValue(), 'excluded');
    await page.locator('#scope-i_fridge').selectOption('included');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByRole('heading', { name: '$440', exact: true }).waitFor();
    if (!(await page.locator('#scope-i_fridge').isVisible())) await page.locator('summary').filter({ hasText: 'Confirmed scope' }).click();
    await page.locator('#scope-i_fridge').selectOption('excluded');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByRole('heading', { name: '$330', exact: true }).waitFor();
    await page.screenshot({ path: join(tmpdir(), `whs-conversation-result-${width}.png`) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('img').first().evaluate((img) => img.complete && img.naturalWidth > 0), true);
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    assert.equal(await composer.inputValue(), ''); assert.equal(await page.locator('article').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '$330', exact: true }).count(), 0);
    assert.equal(await page.getByText('10/10 photos in this conversation', { exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(externals, []);
    await context.close();
  }
  console.log('PASS: desktop/mobile immediate multi-service sends with retained composer, no pricing during questions/reassessment/failure, completed deterministic result, photo batches, scope/answers, retries and reset. Model/API responses mocked; no paid or external calls.');
} finally { await browser.close(); }
