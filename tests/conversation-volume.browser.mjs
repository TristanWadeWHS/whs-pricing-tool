import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', httpCredentials: { username: 'staff', password: 'synthetic-preview-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], requests = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (!['127.0.0.1', 'localhost'].includes(new URL(r.url()).hostname)) external.push(r.url()); });
    let turn = 0, hold = false, release;
    const items = ['panels', 'trim', 'cardboard', 'bagged goods', 'stone pieces beside the path'].map((label, index) => ({ id: `i_${index}`, label, room: 'Side yard', photoRefs: [1], choice: 'unresolved' }));
    await page.route('**/api/conversation', async (route) => {
      const r = route.request(); const form = await new Request('http://synthetic.test', { method: 'POST', headers: r.headers(), body: r.postDataBuffer() }).formData();
      const data = JSON.parse(form.get('submission')); requests.push(data);
      const hasPhotos = !!form.getAll('photos').length;
      if (hold) { hold = false; await new Promise((resolve) => { release = resolve; }); }
      for (const action of data.actions) items.find((i) => i.id === action.id).choice = action.choice;
      const ready = hasPhotos && items.every((i) => i.choice !== 'unresolved');
      const stone = items[4].choice === 'included';
      const range = stone ? [25, 35] : [20, 30], percent = (range[0] + range[1]) / 2;
      const low = range[0] / 100 * 550, high = range[1] / 100 * 550;
      const dollars = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
      return route.fulfill({ json: { token: `synthetic-${++turn}`, items: hasPhotos ? items : [], questions: [], review: true,
        baseline: ready ? { percent, cubicYards: percent / 100 * 12, equivalents: percent / 100, range, low, high, point: percent / 100 * 550, display: `${dollars(low)}\u2013${dollars(high)}` } : null,
        message: ready ? 'Thanks! Your provisional volume estimate is ready for staff review.' : 'Happy to help! Which of these items should we include?',
        reasons: stone ? ['Stone pieces: staff must review handling and payload. No surcharge added.'] : ['Confirm removal scope. Staff review is required before quoting.'],
        assumptions: ready ? ['Synthetic model-estimated loaded group volumes, counted once across views.', 'Perspective partly obscures stack depth; endpoints cover supported packing arrangements.', 'Stack panels flat, align trim and keep filled cardboard intact.'] : [],
      } });
    });
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3017');
    await page.getByRole('button', { name: 'Junk pickup', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    const base64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 1400; const x = c.getContext('2d'); x.fillStyle = '#cde2d7'; x.fillRect(0, 0, 1400, 1400); x.fillStyle = '#52726a'; x.fillRect(70, 80, 600, 110); return c.toDataURL().split(',')[1]; });
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-groups.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await page.getByText('1/10 photos ready.', { exact: false }).waitFor();
    await page.getByLabel('Message Winston', { exact: true }).fill('Synthetic test: remove panels, trim, cardboard and bagged goods. Stone inclusion is not yet confirmed.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByLabel('I see stone pieces beside the path. Should we include it?', { exact: false }).waitFor();
    for (let i = 0; i < 4; i++) await page.locator(`#scope-i_${i}`).selectOption('included');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    assert(!/\$\d/.test(await page.locator('body').innerText()), 'Unconfirmed stones must withhold the entire estimate');
    await page.locator('#scope-i_4').selectOption('excluded');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByRole('heading', { name: '$110\u2013$165', exact: true }).waitFor();
    await page.getByText('Model-estimated 20-30%', { exact: false }).waitFor();
    assert(!(await page.locator('body').innerText()).includes('not bounded within this proof of concept'));
    await page.locator('summary').filter({ hasText: 'Assumptions & volume calculation' }).click();
    await page.getByText('Perspective partly obscures stack depth', { exact: false }).waitFor();
    await page.locator('summary').filter({ hasText: 'Confirmed scope' }).click();
    assert.equal(await page.locator('#scope-i_4').inputValue(), 'excluded');
    await page.locator('#scope-i_4').selectOption('included'); hold = true;
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'reviewing your photos and scope' }).waitFor();
    assert(!/\$\d/.test(await page.locator('body').innerText()), 'No stale price during reanalysis');
    while (!release) await new Promise((resolve) => setTimeout(resolve, 10)); release();
    await page.getByRole('heading', { name: '$137.50\u2013$192.50', exact: true }).waitFor();
    await page.locator('summary').filter({ hasText: 'Review status' }).click();
    await page.getByText('Stone pieces: staff must review handling and payload. No surcharge added.', { exact: true }).waitFor();
    await page.screenshot({ path: join(tmpdir(), `whs-loaded-groups-${width}.png`) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
  }
  console.log('PASS: desktop/mobile four-group range, explicit stone inclusion/exclusion, no interim pricing, handling caveat without surcharge and retained scope. Synthetic API/volumes/image only; no real photo or live calls.');
} finally { await browser.close(); }
