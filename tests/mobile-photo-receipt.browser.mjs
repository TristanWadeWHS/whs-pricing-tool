import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const url = process.env.SMOKE_URL || 'http://127.0.0.1:3017';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
// Run Next locally with OPENAI_API_KEY='' (explicitly empty). The REAL route
// validates the multipart body and files, then returns its existing 503 before
// creating any provider client. No endpoint interception or route changes.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ ...devices['iPhone 13'], httpCredentials: { username: 'staff', password: 'synthetic-mobile-test' } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const external = [], errors = [], metadata = [];
  page.on('pageerror', (e) => errors.push(e.name));
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host)) { external.push(host); return route.abort(); }
    return route.continue();
  });
  await page.goto(url);
  // Start with a photo: the intentionally empty provider key also disables
  // conversation signing, so this check does not exercise signed continuation.
  const input = page.getByLabel('Choose photos from your library', { exact: true });
  const photo = await sharp({ create: { width: 1800, height: 2400, channels: 3, background: '#7495a2' } }).jpeg().toBuffer();
  await input.setInputFiles({ name: 'synthetic.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByText('1/10 photos ready.', { exact: false }).waitFor();
  async function sendAndVerify(count) {
    await page.getByLabel('Message Winston', { exact: true }).fill('Synthetic upload validation only.');
    const received = page.waitForResponse((r) => r.url().endsWith('/api/conversation') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const response = await received;
    const body = await response.json();
    assert.equal(response.status(), 503);
    assert.equal(body.error, 'Photo analysis is not configured. Your entries are retained; staff review is available.');
    const request = response.request();
    const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
    const files = form.getAll('photos'); assert.equal(files.length, count);
    assert(files.every((p) => p.type === 'image/jpeg'));
    assert(files.reduce((n, f) => n + f.size, 0) <= Math.floor(3.5 * 1024 * 1024));
    metadata.push({ httpStatus: 503, category: 'server-photo-validation-passed-provider-disabled', files: files.length, processedBytes: files.reduce((n, f) => n + f.size, 0) });
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
  }
  await sendAndVerify(1);
  await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not-an-image') });
  await page.getByText('Photo check: decode;', { exact: false }).waitFor();
  assert.equal(await page.locator('text=/1\\/10 photos in this conversation/').count(), 1);
  // Optional supplied desktop copy stays outside the worktree; no screenshot,
  // binary persistence, names, notes or other customer metadata are produced.
  if (process.env.LOCAL_PHOTO_INPUT) {
    await input.setInputFiles(process.env.LOCAL_PHOTO_INPUT);
    await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
    const failure = await page.getByText('Photo check:', { exact: false }).count();
    if (failure) {
      console.log(JSON.stringify({ laptopCopy: 'local-optimization-failed', diagnostic: await page.getByText('Photo check:', { exact: false }).textContent() }));
    } else {
      await page.getByText('2/10 photos ready.', { exact: false }).waitFor();
      await sendAndVerify(2);
      console.log(JSON.stringify({ laptopCopy: 'server-validation-passed' }));
    }
  }
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ realMultipartAndRoute: true, metadata, liveProviderCalls: 0, nativeIOSPicker: false }));
  await context.close();
} finally { await browser.close(); }
