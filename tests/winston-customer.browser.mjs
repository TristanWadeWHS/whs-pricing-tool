import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const url = process.env.SMOKE_URL || 'http://127.0.0.1:3017';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const browser = await chromium.launch({ headless: true });
const item = { id: 'i_boards', label: 'Stacked boards', photoRefs: [1, 2], room: 'General', choice: 'included' };
const baseline = { percent: 60, cubicYards: 7.2, equivalents: 0.6, low: 252, high: 380, point: 330, range: [45.818, 69.091], display: '$252\u2013$380' };
const result = (more = {}) => ({ token: 'synthetic', message: 'A completed synthetic response.', items: [], questions: [], baseline: null, reasons: [], assumptions: [], review: true, ...more });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }), reducedMotion: mobile ? 'reduce' : 'no-preference', httpCredentials: { username: 'staff', password: 'synthetic-mobile-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
    const errors = [], submissions = [], pending = [], promotions = [];
    const archiveCalls=[];
    const originalUploads=[];
    let failContact=true;
    if(process.env.ARCHIVE_SMOKE==='1') {
      await page.route('**/api/estimate-session',route=>{const data=route.request().postDataJSON();archiveCalls.push(data);if(data.inquiry&&failContact){failContact=false;return route.fulfill({status:503,json:{error:'Synthetic save failure'}});}return route.fulfill({json:{enabled:true}});});
      await page.route('**/api/estimate-photos',route=>{const data=route.request().postDataJSON();archiveCalls.push(data);return route.fulfill({json:data.action==='authorize'?{presignedUrl:`https://synthetic-blob.invalid/${data.photoId}`}:{complete:true}});});
      await page.route('https://synthetic-blob.invalid/**',route=>{
        if(route.request().method()==='PUT')originalUploads.push({method:'PUT',bytes:route.request().postDataBuffer()?.length,type:route.request().headers()['content-type']});
        return route.fulfill({status:200,body:'',headers:{'Access-Control-Allow-Origin':url,'Access-Control-Allow-Methods':'PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
      });
    }
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.route('**/api/conversation', async (route) => {
      const request = route.request();
      const form = await new Request('http://synthetic.test', { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
      submissions.push({ data: JSON.parse(form.get('submission')), files: form.getAll('photos').length,history:form.get('history')?JSON.parse(form.get('history')):null });
      const response = await new Promise((resolve) => pending.push(resolve));
      await route.fulfill(response).catch(() => {});
    });
    await page.route('**/api/booking', route => { promotions.push(true); return route.abort(); });
    const log = page.getByRole('log');
    const composer = page.getByLabel('Message Winston', { exact: true });
    const status = page.locator('footer [role=status]').first();
    const comparison = page.getByRole('region', { name: 'Local Competitor Pricing', exact: true });
    const position = () => log.evaluate((e) => e.scrollTop);
    async function waitPending() { for(let n=0;n<100&&!pending.length;n++)await page.waitForTimeout(50);assert(pending.length); }
    async function finish(body, code = 200) {
      await waitPending(); pending.shift()({ status: code, json: body });
      await page.waitForFunction(() => !document.querySelector('textarea').disabled);
      assert.equal(await status.locator('i').count(), 0);
    }
    async function send(text) { await composer.fill(text); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await page.waitForFunction(() => document.querySelector('textarea').disabled); }
    async function capture() {
      const shouldRetry=failContact;
      assert.equal(await page.getByLabel('Choose photos from your library',{exact:true}).count(),0);
      await page.getByLabel('Phone number',{exact:true}).fill('(202) 555-0100');
      await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');
      await page.getByRole('button',{name:'Save inquiry & continue',exact:true}).click();
      if(shouldRetry) {
        await page.getByRole('alert').filter({hasText:'Your inquiry could not be saved'}).waitFor();
        assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),'synthetic@example.test');
        assert.equal(await page.getByLabel('Choose photos from your library',{exact:true}).count(),0);
        await page.screenshot({path:join(tmpdir(),`whs-inquiry-${mobile?'mobile':'desktop'}.png`)});
        await page.getByRole('button',{name:'Save inquiry & continue',exact:true}).click();
      }
      await composer.waitFor();
      assert.equal(await page.getByLabel('Phone number',{exact:true}).count(),0);
    }
    await page.goto(url);
    assert.equal(await position(), 0);
    const headerLogo = page.locator('header img');
    assert.equal(await headerLogo.count(), 1);
    assert.equal(await headerLogo.getAttribute('src'), '/wade-home-services-logo.png');
    assert(await headerLogo.evaluate((img) => img.complete && img.naturalWidth > 0));
    assert.equal((await headerLogo.boundingBox()).width, mobile ? 72 : 96);
    assert.equal((await page.getByAltText('Winston, your removal guide').boundingBox()).width, mobile ? 200 : 240);
    await page.getByText('Junk Removal | Light Demolition | Property Cleanouts', { exact: true }).waitFor();
    assert.equal(await page.locator('h1 img').getAttribute('src'), '/wade-home-services-logo.png');
    assert(await page.locator('h1 img').evaluate((img) => img.complete && img.naturalWidth > 0));
    await page.getByText('You Call, We Haul!', { exact: true }).waitFor();
    const animationState = () => page.getByAltText('Winston, your removal guide').evaluate((e) => e.getAnimations().map((a) => ({ start: a.startTime, state: a.playState })));
    const initialAnimation = await animationState();
    if (mobile) assert.deepEqual(initialAnimation, []);
    assert.equal(await page.getByLabel('Room or photo batch').count(), 0);
    assert.equal(await page.getByRole('link', { name: /Staff estimator/ }).count(), 0);
    assert.equal(await page.getByText('A little less clutter. A little more room.').count(), 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(tmpdir(), `whs-customer-opening-${mobile ? 'mobile' : 'desktop'}.png`) });

    await page.getByRole('button', { name: 'Junk pickup', exact: true }).click();
    assert.equal(submissions.length,0,'No analysis before private contact capture');
    await page.getByRole('button',{name:'Furniture',exact:true}).click();
    await capture();
    await send('Synthetic service inquiry.');
    await page.waitForFunction(() => document.querySelector('textarea').disabled);
    const long = 'Happy to help with junk pickup! ' + 'A synthetic completed response for checking word reveal and scrolling. '.repeat(30);
    await finish(result({ message: long }));
    assert.deepEqual((await animationState()).map((a) => a.start), initialAnimation.map((a) => a.start), 'Opening does not replay');
    assert.deepEqual(submissions[0].data.services, ['mixed junk','furniture']);
    assert(!JSON.stringify(submissions).includes('synthetic@example.test'),'Contact excluded from model multipart');
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
    assert.equal(await comparison.count(), 0);
    await finish(result({ items: [{ ...item, choice: 'unresolved' }], message: 'Should we include the boards?' }));
    assert.equal(submissions.at(-1).files, 3); assert.deepEqual(submissions.at(-1).data.photoRooms, ['General', 'General', 'General']);
    await page.locator('#scope-i_boards').selectOption('included');
    await page.getByRole('button', { name: 'Confirm scope', exact: true }).click();
    await page.getByText("Got it. I'm reviewing the scope details and getting you a precise price.", { exact: true }).waitFor();
    const question = { id: 'i_boards:dismantling', itemId: 'i_boards', topic: 'dismantling', text: 'Are these boards attached?', photoRef: 1, evidence: 'Visible fasteners.' };
    await finish(result({ items: [item], questions: [question], baseline, message: 'One scope detail remains.' }));
    assert.equal(await page.getByRole('heading', { name: '$316', exact: true }).count(), 0);
    assert.equal(await comparison.count(), 0, 'No benchmark or benchmark rate during required clarification');
    await page.getByLabel('Are these boards attached?', { exact: true }).fill('No');
    await page.getByRole('button', { name: 'Send answers', exact: true }).click();
    await page.getByText("Got it. I'm reviewing the scope details and getting you a precise price.", { exact: true }).waitFor();
    const final = result({ items: [item], baseline, reasons: ['Specific dense material needs handling review.', 'Location and access require confirmation.'], assumptions: ['Boards stack flat.', 'Loaded percentage / 100 x $550.'] });
    await finish(final);
    await page.getByRole('heading', { name: '$316', exact: true }).waitFor();
    assert.equal(await page.getByText('$252\u2013$380', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Loaded percentage / 100 x $550.', { exact: true }).count(), 0);
    await comparison.getByText('$343.64\u2013$518.18', { exact: true }).waitFor();
    assert((await comparison.innerText()).includes('Actual competitor pricing varies'));
    assert(!(await comparison.innerText()).includes('pricing this higher'));
    assert(await comparison.evaluate((e) => e.previousElementSibling.textContent.includes('$316') && e.nextElementSibling.textContent.includes('Book the Job')));
    assert(await page.getByText('Specific dense material needs handling review.', { exact: true }).isVisible());
    assert.equal(await page.getByRole('heading', { name: 'A little thank-you from our team' }).count(), 0);
    await page.getByRole('heading', { name: '$316', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: join(tmpdir(), `whs-customer-estimate-${mobile ? 'mobile' : 'desktop'}.png`) });
    await comparison.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `whs-customer-comparison-${mobile ? 'mobile' : 'desktop'}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.getByRole('button',{name:'New customer',exact:true}).count(),0);
    await page.getByRole('button',{name:'Book the Job',exact:true}).click();
    await page.getByRole('heading',{name:'Request your appointment',exact:true}).waitFor();
    const booking=page.getByRole('form',{name:'Booking request'});
    const bookingCalls=[];
    const slot={start:'2026-12-01T18:00:00.000Z',end:'2026-12-01T19:00:00.000Z',label:'December 1, 10:00 AM'};
    await page.route('**/api/booking/availability',route=>route.fulfill({json:{ok:true,slots:[slot]}}));
    await page.route('**/api/booking/request',route=>{const body=route.request().postDataJSON();bookingCalls.push(body);return bookingCalls.length===1?route.fulfill({status:503,json:{error:'Synthetic uncertain response. Retry this request.'}}):route.fulfill({json:{ok:true,pending:true,leadId:'AI-synthetic-request',requestedTime:slot.label}});});
    await booking.getByLabel('Full name',{exact:true}).fill('Synthetic Customer');
    await booking.getByLabel('Street address',{exact:true}).fill('1 Test Street');
    await booking.getByLabel('City',{exact:true}).fill('Irvine');
    await booking.getByLabel('ZIP code',{exact:true}).fill('92618');
    await booking.getByLabel('Special notes (optional)',{exact:true}).fill('Synthetic access note');
    await booking.getByLabel('Requested date',{exact:true}).fill('2026-12-01');
    await booking.getByLabel('Available time (Pacific)',{exact:true}).selectOption(slot.start);
    await booking.getByRole('checkbox').check();
    await booking.getByRole('button',{name:'Submit request',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(tmpdir(),`whs-booking-form-${mobile?'mobile':'desktop'}.png`)});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await booking.getByRole('button',{name:'Submit request',exact:true}).click();
    await booking.getByRole('alert').waitFor();
    assert(await booking.getByLabel('Full name',{exact:true}).isDisabled());
    await booking.getByRole('button',{name:'Retry request',exact:true}).click();
    await page.getByRole('heading',{name:'Request received',exact:true}).waitFor();
    assert.deepEqual(bookingCalls[0],bookingCalls[1],'Uncertain response retries exact same request');
    assert(!JSON.stringify(bookingCalls).includes('synthetic@example.test'),'Contact remains server authoritative');
    assert.equal(await page.getByRole('link',{name:'Have Questions? Call Now',exact:true}).getAttribute('href'),'tel:+19494245605');
    await page.screenshot({path:join(tmpdir(),`whs-booking-received-${mobile?'mobile':'desktop'}.png`)});
    assert.equal(promotions.length,0);
    await send('Synthetic point estimate.');
    assert.equal(await comparison.count(), 0, 'Hide previous comparison during new request');
    await finish(result({ baseline: { ...baseline, range: null, low: 330, high: 330, display: '$330' } }));
    await comparison.getByText('$450', { exact: true }).waitFor();
    await send('Synthetic unavailable load equivalents.');
    await finish(result({ baseline: { ...baseline, range: null, equivalents: null, low: 330, high: 330, display: '$330' } }));
    assert.equal(await comparison.count(), 0);
    await send('Synthetic recoverable error.'); await finish({ error: 'Synthetic request failure.' }, 502);
    await page.getByRole('button', { name: 'Retry last message' }).click();
    await page.waitForFunction(() => document.querySelector('textarea').disabled);
    await waitPending();
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    assert.equal(await status.locator('i').count(), 0); assert.equal(await position(), 0);
    pending.shift()({ json: final }); await page.waitForTimeout(150);
    assert.equal(await page.getByRole('heading', { name: '$316', exact: true }).count(), 0);
    assert.equal(await comparison.count(), 0);

    await page.goto(`${url}/owner`);
    await page.getByRole('button',{name:'Junk pickup',exact:true}).click();await capture();
    assert.equal(await page.getByLabel('Room or photo batch').count(), 1);
    assert.equal(await page.getByRole('link', { name: /Staff estimator/ }).count(), 1);
    await send('Synthetic owner estimate.'); await finish(final);
    await page.getByRole('heading', { name: '$252\u2013$380', exact: true }).waitFor();
    assert.equal(await comparison.count(), 0, 'Owner keeps actual full pricing details, not customer comparison presentation');
    await page.getByText('Assumptions & volume calculation', { exact: true }).click();
    assert(await page.getByText('Loaded percentage / 100 x $550.', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    if(process.env.ARCHIVE_SMOKE==='1') {
      assert(archiveCalls.some(c=>c.ordinal===3&&c.action==='authorize'));
      assert.equal(originalUploads.length,3);
      assert(originalUploads.every(p=>p.method==='PUT'&&p.bytes>0&&p.type==='image/jpeg'));
      assert(submissions.every(s=>s.history?.estimateId&&s.history?.requestId));
      assert.notEqual(submissions[0].history.estimateId,submissions.at(-1).history.estimateId,'Start Over creates a new job, not a new visitor');
      const id='11111111-1111-4111-8111-111111111111';
      await page.route('**/api/estimate-history*',route=>route.fulfill({json:route.request().url().includes('?')?
        {estimate:{id,status:'scope_pending'},photos:[{photo_id:id,ordinal:1,variant:'original',status:'complete'}],revisions:[{revision:1,created_at:'2026-10-13',record:{input:{message:'Synthetic saved description'},displayed:{amount:null}}}],failures:[],events:[]}:
        {estimates:[{id,status:'scope_pending',created_at:'2026-10-13',revision:1}],next:null}}));
      await page.goto(`${url}/owner/history`);
      await page.getByRole('button',{name:id,exact:true}).click();
      await page.getByText('Revision 1',{exact:false}).click();
      assert(await page.getByText(/Synthetic saved description/).isVisible());
      await page.getByText('Linked photos and upload status',{exact:true}).click();
      assert((await page.getByRole('link',{name:'Open authorized photo'}).getAttribute('href')).startsWith('/api/estimate-history/photo?'));
      assert.equal(await page.locator('img').count(),0,'History does not prefetch photos');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:join(tmpdir(),`whs-private-history-${mobile?'mobile':'desktop'}.png`)});
    }
    console.log(JSON.stringify({ viewport: mobile ? 'mobile-emulated/reduced-motion' : 'desktop', midpoint: true, views: true, reveal: true, scroll: true, loading: true, keyboard: true, photoBatches: 2, providers: 'mocked', bookingActions: 0 }));
    await context.close();
  }
  const guest = await browser.newContext();
  for (const path of ['/', '/owner', '/staff-estimator', '/api/conversation','/api/estimate-history','/api/estimate-history/photo']) assert.equal((await guest.request.get(url + path)).status(), 401);
  await guest.close();
} finally { await browser.close(); }
