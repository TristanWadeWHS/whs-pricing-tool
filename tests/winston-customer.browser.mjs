import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const url = process.env.SMOKE_URL || 'http://127.0.0.1:3017';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const item = { id: 'i_boards', label: 'Stacked boards', photoRefs: [1, 2], room: 'General', choice: 'included' };
const baseline = { percent: 60, cubicYards: 7.2, equivalents: 0.6, low: 252, high: 380, point: 330, range: [45.818, 69.091], display: '$252\u2013$380' };
const result = (more = {}) => ({ token: 'synthetic', message: 'A completed synthetic response.', items: [], questions: [], baseline: null, reasons: [], assumptions: [], review: true, ...more });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }), reducedMotion: mobile ? 'reduce' : 'no-preference', httpCredentials: { username: 'staff', password: 'synthetic-mobile-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
    const errors = [], submissions = [], pending = [], promotions = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.route('**/api/conversation', async (route) => {
      const request = route.request();
      const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
      submissions.push({ data: JSON.parse(form.get('submission')), files: form.getAll('photos').length });
      const response = await new Promise((resolve) => pending.push(resolve));
      await route.fulfill(response).catch(() => {});
    });
    await page.route('**/api/booking', (route) => {
      const data = route.request().postDataJSON(); promotions.push(data); assert.equal(data.action, 'promotion');
      return route.fulfill({ json: { customerType: data.customerType, message: 'Welcome! We are happy to help.', bookingEnabled: false, bookingNotice: 'Booking unavailable.',
        promotion: { rate: 0.1, application: 'illustration', provisional: true, original: { low: 252, high: 380 }, discount: { low: 25.2, high: 38 }, total: { low: 226.8, high: 342 }, reasons: ['Eligibility and minimums require confirmation.'] } } });
    });
    const log = page.getByRole('log');
    const composer = page.getByLabel('Message Winston', { exact: true });
    const status = page.locator('footer [role=status]').first();
    const position = () => log.evaluate((e) => e.scrollTop);
    async function finish(body, code = 200) {
      assert(pending.length); pending.shift()({ status: code, json: body });
      await page.waitForFunction(() => !document.querySelector('textarea').disabled);
      assert.equal(await status.locator('i').count(), 0);
    }
    async function send(text) { await composer.fill(text); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await page.waitForFunction(() => document.querySelector('textarea').disabled); }
    await page.goto(url);
    assert.equal(await position(), 0);
    const headerLogo = page.locator('header img');
    assert.equal(await headerLogo.count(), 1);
    assert.equal(await headerLogo.getAttribute('src'), '/wade-home-services-logo.png');
    assert(await headerLogo.evaluate((img) => img.complete && img.naturalWidth > 0));
    assert.equal((await headerLogo.boundingBox()).width, mobile ? 72 : 96);
    assert((await page.getByAltText('Winston, your removal guide').boundingBox()).width >= 160);
    assert.equal(await page.getByLabel('Room or photo batch').count(), 0);
    assert.equal(await page.getByRole('link', { name: /Staff estimator/ }).count(), 0);
    assert.equal(await page.getByText('A little less clutter. A little more room.').count(), 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(tmpdir(), `whs-customer-opening-${mobile ? 'mobile' : 'desktop'}.png`) });

    await page.getByRole('button', { name: 'Junk pickup', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('textarea').disabled);
    const long = 'Happy to help with junk pickup! ' + 'A synthetic completed response for checking word reveal and scrolling. '.repeat(30);
    await finish(result({ message: long }));
    assert.deepEqual(submissions[0].data.services, ['mixed junk']);
    const response = page.locator('[data-speaker=winston]').last();
    const offset = await response.evaluate((e) => e.getBoundingClientRect().top - e.closest('[role=log]').getBoundingClientRect().top);
    assert(Math.abs(offset - 16) < 2);
    const words = response.locator('[data-reveal] > span');
    const opacities = await words.evaluateAll((list) => list.map((e) => Number(getComputedStyle(e).opacity)));
    if (mobile) assert(opacities.every((n) => n === 1));
    else { assert.equal(opacities[0], 1); assert.equal(opacities.at(-1), 0); }
    assert.equal(await response.locator('[data-reveal]').getAttribute('aria-hidden'), 'true');
    await log.evaluate((e) => { e.scrollTop = 100; });
    await page.waitForTimeout(1900);
    assert.equal(await position(), 100, 'No scroll while words appear');
    const photoInput = page.getByLabel('Choose photos from your library', { exact: true });
    const photos = [];
    for (let i = 0; i < 3; i++) photos.push({ name: `synthetic-${i}.jpg`, mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 50 + i * 30, g: 80, b: 120 } } }).jpeg().toBuffer() });
    await photoInput.setInputFiles(photos.slice(0, 2)); await page.getByText('2/10 photos ready.', { exact: false }).waitFor();
    await photoInput.setInputFiles(photos.slice(2)); await page.getByText('3/10 photos ready.', { exact: false }).waitFor();
    await photoInput.setInputFiles({ name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid') });
    await page.getByRole('button', { name: 'Retry photos', exact: true }).waitFor();
    assert.equal(await page.getByText('Photo check:', { exact: false }).count(), 0);
    await photoInput.setInputFiles(photos[0]);
    await page.getByText('3/10 photos ready.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retry photos', exact: true }).count(), 0);
    await send('Synthetic boards, all shown items.');
    await page.getByText('Winston is looking everything over. One moment.', { exact: true }).waitFor();
    assert.equal(await status.locator('i').count(), 3);
    assert.equal(await page.getByRole('heading', { name: '$316', exact: true }).count(), 0);
    await finish(result({ items: [{ ...item, choice: 'unresolved' }], message: 'Should we include the boards?' }));
    assert.equal(submissions.at(-1).files, 3); assert.deepEqual(submissions.at(-1).data.photoRooms, ['General', 'General', 'General']);
    await page.locator('#scope-i_boards').selectOption('included');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByText("Got it. I'm reviewing the scope details and getting you a precise price.", { exact: true }).waitFor();
    const question = { id: 'i_boards:dismantling', itemId: 'i_boards', topic: 'dismantling', text: 'Are these boards attached?', photoRef: 1, evidence: 'Visible fasteners.' };
    await finish(result({ items: [item], questions: [question], baseline, message: 'One scope detail remains.' }));
    assert.equal(await page.getByRole('heading', { name: '$316', exact: true }).count(), 0);
    await page.getByLabel('Are these boards attached?', { exact: true }).fill('No');
    await page.getByRole('button', { name: 'Send answers', exact: true }).click();
    await page.getByText("Got it. I'm reviewing the scope details and getting you a precise price.", { exact: true }).waitFor();
    const final = result({ items: [item], baseline, reasons: ['Specific dense material needs handling review.', 'Location and access require confirmation.'], assumptions: ['Boards stack flat.', 'Loaded percentage / 100 x $550.'] });
    await finish(final);
    await page.getByRole('heading', { name: '$316', exact: true }).waitFor();
    assert.equal(await page.getByText('$252\u2013$380', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Loaded percentage / 100 x $550.', { exact: true }).count(), 0);
    assert(await page.getByText('Specific dense material needs handling review.', { exact: true }).isVisible());
    assert.equal(await page.getByRole('heading', { name: 'A little thank-you from our team' }).count(), 0);
    await page.getByRole('heading', { name: '$316', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: join(tmpdir(), `whs-customer-estimate-${mobile ? 'mobile' : 'desktop'}.png`) });
    const customer = page.getByRole('button', { name: 'New customer', exact: true });
    await customer.focus(); await page.keyboard.press('Space');
    await page.getByText('$284.40', { exact: true }).waitFor();
    assert.equal(promotions.length, 1); assert.equal(await page.getByRole('form', { name: 'Booking preferences' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Confirm booking request' }).count(), 0);
    await send('Synthetic recoverable error.'); await finish({ error: 'Synthetic request failure.' }, 502);
    await page.getByRole('button', { name: 'Retry last message' }).click();
    await page.waitForFunction(() => document.querySelector('textarea').disabled);
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    assert.equal(await status.locator('i').count(), 0); assert.equal(await position(), 0);
    pending.shift()({ json: final }); await page.waitForTimeout(150);
    assert.equal(await page.getByRole('heading', { name: '$316', exact: true }).count(), 0);

    await page.goto(`${url}/owner`);
    assert.equal(await page.getByLabel('Room or photo batch').count(), 1);
    assert.equal(await page.getByRole('link', { name: /Staff estimator/ }).count(), 1);
    await send('Synthetic owner estimate.'); await finish(final);
    await page.getByRole('heading', { name: '$252\u2013$380', exact: true }).waitFor();
    await page.getByText('Assumptions & volume calculation', { exact: true }).click();
    assert(await page.getByText('Loaded percentage / 100 x $550.', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: mobile ? 'mobile-emulated/reduced-motion' : 'desktop', midpoint: true, views: true, reveal: true, scroll: true, loading: true, keyboard: true, photoBatches: 2, providers: 'mocked', bookingActions: 0 }));
    await context.close();
  }
  const guest = await browser.newContext();
  for (const path of ['/', '/owner', '/staff-estimator', '/api/conversation']) assert.equal((await guest.request.get(url + path)).status(), 401);
  await guest.close();
} finally { await browser.close(); }
