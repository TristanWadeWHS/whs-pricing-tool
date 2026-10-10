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
  // Deterministic high-detail synthetic pixels exercise compression rather than
  // the tiny output of a flat-color image. No customer photo is required.
  const pixels = Buffer.alloc(1512 * 2016 * 3);
  let seed = 123456;
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    pixels[i] = 64 + (seed & 127);
  }
  const detailed = [];
  for (let i = 0; i < 10; i++) detailed.push({ name: `synthetic-${i}.jpg`, mimeType: 'image/jpeg', buffer:
    await sharp(pixels, { raw: { width: 1512, height: 2016, channels: 3 } }).resize(3024, 4032).modulate({ brightness: 1 - i * 0.01 }).jpeg({ quality: 90 }).toBuffer() });
  await input.setInputFiles(detailed.slice(0, 6));
  await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
  const optimizationError = page.getByText('Photo check:', { exact: false });
  assert.equal(await optimizationError.count(), 0, await optimizationError.count() ? await optimizationError.textContent() : '');
  await page.getByText('6/10 photos ready.', { exact: false }).waitFor();
  let retained = [];
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
    const image = await sharp(Buffer.from(await files[0].arrayBuffer())).metadata();
    assert(image.width < image.height);
    assert(image.height >= 1280 && image.height <= 2048);
    assert(files.some((p) => p.size > 367001), 'Actual batch permits outputs larger than the old ten-slot share');
    const buffers = await Promise.all(files.map(async (p) => Buffer.from(await p.arrayBuffer())));
    if (!retained.length) retained = buffers;
    else for (let i = 0; i < retained.length; i++) assert(buffers[i].equals(retained[i]), 'Prior bytes/order must not change');
    metadata.push({ httpStatus: 503, category: 'server-photo-validation-passed-provider-disabled', files: files.length, processedBytes: files.reduce((n, f) => n + f.size, 0), width: image.width, height: image.height });
    await page.waitForFunction(() => !document.querySelector('textarea').disabled);
  }
  await sendAndVerify(6);
  await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not-an-image') });
  await page.getByText('Photo check: decode;', { exact: false }).waitFor();
  assert.equal(await page.locator('text=/6\\/10 photos in this conversation/').count(), 1);
  await input.setInputFiles(detailed.slice(6));
  await page.getByText('These photos cannot fit in the remaining upload allowance', { exact: false }).waitFor();
  assert.equal(await page.locator('text=/6\\/10 photos in this conversation/').count(), 1);
  await page.getByRole('button', { name: 'Retry photos', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
  await page.getByText('These photos cannot fit in the remaining upload allowance', { exact: false }).waitFor();
  const small = [];
  for (let i = 0; i < 4; i++) small.push({ name: `small-${i}.jpg`, mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 50 + i * 30, g: 80, b: 100 } } }).jpeg().toBuffer() });
  await input.setInputFiles(small);
  await page.getByText('10/10 photos ready.', { exact: false }).waitFor();
  await sendAndVerify(10);
  await input.setInputFiles(small[0]);
  await page.getByText('This estimate supports ten photos total.', { exact: false }).waitFor();
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ realMultipartAndRoute: true, metadata, liveProviderCalls: 0, nativeIOSPicker: false }));
  await context.close();
} finally { await browser.close(); }
