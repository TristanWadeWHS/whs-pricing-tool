import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const url = process.env.SMOKE_URL || 'http://127.0.0.1:3017';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Synthetic login only targets a local server.');
assert(process.env.HEIF_PYTHON, 'HEIF_PYTHON must point to a test-only Python with pillow-heif.');

// Generated color quadrants only, never a saved/customer photograph. Both files
// carry orientation 6; the correct displayed size is portrait 600 x 800.
const fixtures = JSON.parse(execFileSync(process.env.HEIF_PYTHON, ['-c', `
import io,json,base64
from PIL import Image,ImageDraw
import pillow_heif
pillow_heif.register_heif_opener()
im=Image.new('RGB',(800,600))
d=ImageDraw.Draw(im)
for box,color in [((0,0,399,299),'red'),((400,0,799,299),'green'),((0,300,399,599),'blue'),((400,300,799,599),'yellow')]: d.rectangle(box,fill=color)
exif=Image.Exif(); exif[274]=6
out={}
for fmt in ['JPEG','HEIF']:
 b=io.BytesIO(); im.save(b,format=fmt,quality=90,exif=exif.tobytes())
 out[fmt]=base64.b64encode(b.getvalue()).decode('ascii')
print(json.dumps(out))
`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const useWebkit = existsSync(webkit.executablePath());
const browser = await (useWebkit ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'msedge', headless: true }));
try {
  const device = devices['iPhone 13'];
  const first = await browser.newContext({ ...device, extraHTTPHeaders: { authorization: `Basic ${Buffer.from('staff:synthetic-mobile-test').toString('base64')}` } });
  const authenticated = await first.request.get(url);
  assert.equal(authenticated.status(), 200);
  const cookies = (await first.cookies()).filter((c) => c.name === '__Host-whs-internal-session');
  assert.equal(cookies.length, 1); assert(cookies[0].httpOnly && cookies[0].secure); assert.equal(cookies[0].sameSite, 'Lax');
  await first.close();
  const context = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  await context.addCookies(cookies); // New browser context has no cached Basic credentials.
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const errors = [], external = []; let submitted;
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/*', async (route) => {
    const target = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(target.hostname)) { external.push(target.hostname); return route.abort(); }
    return route.continue();
  });
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  // Next dev overrides HTML Cache-Control; proxy/API no-store is checked separately.
  assert.match(response.headers()['cache-control'], /no-store|no-cache/);
  assert.equal(await page.evaluate(() => document.cookie.includes('whs-internal-session')), false);
  const api = await page.evaluate(async () => {
    const r = await fetch('/api/conversation', { method: 'POST', body: new FormData() });
    return { status: r.status, challenge: r.headers.get('www-authenticate') };
  });
  assert.equal(api.status, 400); assert.equal(api.challenge, null); // Auth passed; validation rejects before any model call.
  await page.reload(); assert.equal(await page.locator('textarea').count(), 1);
  const input = page.getByLabel('Choose photos from your library', { exact: true });
  assert.equal(await input.getAttribute('capture'), null); assert.notEqual(await input.getAttribute('multiple'), null);
  assert((await input.getAttribute('accept')).includes('.heic'));
  await page.route('**/api/conversation', async (route) => {
    const request = route.request();
    const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
    submitted = { form, bytes: request.postDataBuffer().length };
    return route.fulfill({ json: { token: 'synthetic', message: 'Photos received for this synthetic test.', items: [], questions: [], baseline: null, reasons: [], assumptions: [], review: true } });
  });
  await input.setInputFiles({ name: 'orientation.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(fixtures.JPEG, 'base64') });
  await page.getByText('1/10 photos ready.', { exact: false }).waitFor();
  // No MIME simulation: these are actual HEVC bytes from a synthetic encoder.
  await input.setInputFiles({ name: 'hevc-orientation.HEIC', mimeType: 'image/heic', buffer: Buffer.from(fixtures.HEIF, 'base64') });
  await page.getByText('2/10 photos ready.', { exact: false }).waitFor();
  await input.setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('synthetic-invalid') });
  await page.getByText('This HEIC/HEIF photo could not be prepared.', { exact: false }).waitFor();
  const extra = [];
  for (let i = 0; i < 8; i++) extra.push({ name: `small-${i}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 20 + i * 20, g: 80, b: 140 } } }).png().toBuffer() });
  await input.setInputFiles(extra.slice(0, 3));
  await page.getByText('5/10 photos ready.', { exact: false }).waitFor();
  await input.setInputFiles(extra.slice(3));
  await page.getByText('10/10 photos ready.', { exact: false }).waitFor();
  await input.setInputFiles(extra[0]);
  await page.getByText('This estimate supports ten photos total.', { exact: false }).waitFor();
  await page.getByLabel('Message Winston', { exact: true }).fill('Synthetic mobile photo upload check.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Photos received for this synthetic test.', { exact: true }).waitFor();
  const photos = submitted.form.getAll('photos'); assert.equal(photos.length, 10);
  assert(photos.every((p) => p.type === 'image/jpeg'));
  assert(photos.reduce((n, p) => n + p.size, 0) <= Math.floor(3.5 * 1024 * 1024));
  assert(submitted.bytes < 4 * 1024 * 1024);
  for (const photo of photos.slice(0, 2)) {
    const bytes = Buffer.from(await photo.arrayBuffer()), metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 600, `${photo.name} portrait width`); assert.equal(metadata.height, 800, `${photo.name} portrait height`); assert.equal(metadata.orientation, undefined);
    const pixel = await sharp(bytes).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer();
    assert(pixel[2] > 180 && pixel[0] < 80 && pixel[1] < 80, 'Top left must be blue after a single clockwise rotation.');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(tmpdir(), 'whs-mobile-access-photos.png'), fullPage: true });
  const guest = await browser.newContext();
  const denied = await guest.request.get(`${url}/api/conversation`);
  assert.equal(denied.status(), 401); assert.equal(denied.headers()['www-authenticate'], undefined);
  assert.equal(denied.headers()['cache-control'], 'no-store');
  const rootDenied = await guest.request.get(url); assert.equal(rootDenied.status(), 401); assert(rootDenied.headers()['www-authenticate'].includes('Basic'));
  const bad = await guest.request.get(url, { headers: { authorization: `Basic ${Buffer.from('staff:wrong').toString('base64')}` } }); assert.equal(bad.status(), 401);
  await guest.close(); await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(JSON.stringify({ passed: true, engine: useWebkit ? 'WebKit' : 'Chromium mobile emulation', cookieOnlyAccess: true, syntheticJpegAndHevcOrientation: true, photos: 10, batches: 4, providerCalls: 0, nativeIOSPickerVerified: false }));
} finally { await browser.close(); }
