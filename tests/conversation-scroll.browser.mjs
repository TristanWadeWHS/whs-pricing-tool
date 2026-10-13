import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.SMOKE_URL || 'http://127.0.0.1:3017';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }),
      reducedMotion: mobile ? 'reduce' : 'no-preference', httpCredentials: { username: 'staff', password: 'synthetic-mobile-test' } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], external = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/*', async (route) => {
      if (!['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) { external.push('blocked'); return route.abort(); }
      return route.continue();
    });
    await page.route('**/api/conversation', async (route) => {
      const response = await new Promise((resolve) => requests.push(resolve));
      await route.fulfill(response).catch(() => {}); // Reset can abort a held synthetic response.
    });
    await page.goto(`${url}/owner`);
    const log = page.getByRole('log'), composer = page.getByLabel('Message Winston', { exact: true });
    const loading = page.getByRole('status').filter({ hasText: 'Winston is getting ready to help' });
    const position = () => log.evaluate((e) => e.scrollTop);
    assert.equal(await position(), 0);
    assert.equal(await loading.count(), 0);
    const reply = (text, price = false) => ({ json: { token: 'synthetic', message: text, items: [], questions: [], reasons: [], assumptions: [], review: true,
      baseline: price ? { percent: 60, cubicYards: 7.2, equivalents: 0.6, point: 330, low: 330, high: 330, range: null, display: '$330' } : null } });
    async function send(text) {
      await composer.fill(text);
      const before = await position();
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await loading.waitFor();
      assert(Math.abs(await position() - before) <= 1, 'Request start must not scroll');
      assert.equal(await loading.locator('i').count(), 3);
      assert.equal(await page.getByText('$330', { exact: true }).count(), 0, 'No previous price while loading');
    }
    async function finish(response) {
      assert(requests.length > 0);
      requests.shift()(response);
      await loading.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('textarea').disabled);
    }
    await send('Synthetic first request.');
    const styles = await loading.locator('i').evaluateAll((dots) => dots.map((d) => ({ name: getComputedStyle(d).animationName, delay: getComputedStyle(d).animationDelay })));
    if (mobile) assert(styles.every((s) => s.name === 'none'));
    else {
      assert(styles.every((s) => s.name !== 'none'));
      assert.deepEqual(styles.map((s) => s.delay), ['0s', '0.4s', '0.8s']);
      for (const [time, active] of [[100, 0], [500, 1], [900, 2]]) {
        const opacity = await loading.locator('i').evaluateAll((dots, time) => dots.map((dot) => {
          const animation = dot.getAnimations()[0]; animation.pause(); animation.currentTime = time;
          return Number(getComputedStyle(dot).opacity);
        }), time);
        assert.equal(opacity[active], 1); assert(opacity.every((v, i) => i === active || v < 1));
      }
    }
    await page.screenshot({ path: join(tmpdir(), `whs-scroll-loading-${mobile ? 'mobile' : 'desktop'}.png`) });
    const long = 'Beginning of Winston response.\n' + 'Synthetic scope explanation for reading from the beginning.\n'.repeat(40) + 'End of Winston response.';
    await finish(reply(long, true));
    const offset = await page.locator('[data-speaker=winston]').last().evaluate((el) => el.getBoundingClientRect().top - el.closest('[role=log]').getBoundingClientRect().top);
    assert(Math.abs(offset - 16) <= 1, `Response starts at top, got ${offset}`);
    assert(await log.evaluate((e) => e.scrollTop + e.clientHeight < e.scrollHeight - 100), 'Not at bottom');
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    const anchored = await position();
    await composer.fill('Typing must not jump the response.');
    assert.equal(await position(), anchored);
    await page.screenshot({ path: join(tmpdir(), `whs-scroll-response-${mobile ? 'mobile' : 'desktop'}.png`) });

    await send('Synthetic second request.');
    await log.hover(); await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200); // Let the wheel gesture finish before the reply.
    const manual = await position();
    await finish(reply('A new response must not interrupt reading earlier messages.'));
    assert.equal(await position(), manual);

    await send('Synthetic failure.');
    await finish({ status: 502, json: { error: 'Synthetic recoverable failure.' } });
    assert.equal(await loading.count(), 0);
    await page.getByRole('button', { name: 'Retry last message' }).click();
    await loading.waitFor(); assert.equal(await loading.locator('i').count(), 3);
    await finish(reply('Short retry response.'));
    const shortOffset = await page.locator('[data-speaker=winston]').last().evaluate((el) => el.getBoundingClientRect().top - el.closest('[role=log]').getBoundingClientRect().top);
    assert(Math.abs(shortOffset - 16) <= 1, `Short response anchor: ${shortOffset}`);

    await send('Synthetic reset during loading.');
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    assert.equal(await loading.count(), 0); assert.equal(await position(), 0);
    requests.shift()(reply('Stale response must not reappear.'));
    await page.waitForTimeout(150);
    assert.equal(await page.getByText('Stale response must not reappear.').count(), 0);
    assert.equal(await page.locator('[data-speaker]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ viewport: mobile ? 'mobile-emulated' : 'desktop', startTop: true, responseStart: true, noRequestJump: true, manualScrollPreserved: true, loadingLifecycle: true, reducedMotion: mobile, providers: 'mocked' }));
    await context.close();
  }
} finally { await browser.close(); }
