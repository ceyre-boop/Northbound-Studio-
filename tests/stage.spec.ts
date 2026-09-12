/* The Stage is the one piece of this site that four people wrote against
 * without talking to each other, so it gets tested for the failures that only
 * show up when their code shares a context.
 *
 * The highest-probability bug in the whole design is GL state leakage: the
 * particle field leaves additive blending set, the aurora renders blown out in
 * exactly the one scroll position where both are live, and neither author can
 * reproduce it alone. ?strict=1 catches that by name. Everything else here is
 * lifecycle: does an act survive being scrolled past and come back, does the
 * page survive losing its context, and does it hold together with no JS and no
 * WebGL at all.
 */
import { test, expect } from '@playwright/test';

const ACTS = ['northlight', 'drift', 'solution', 'work'];

/** Walk the whole document in n steps, letting each frame actually run. */
async function scrub(page, steps = 40, settle = 60) {
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((t) => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, h * t);
    }, i / steps);
    await page.waitForTimeout(settle);
  }
}

test.describe('the stage', () => {

  test('no act leaves GL state dirty at any point in the scroll', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/?motion=full&strict=1');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });
    await scrub(page);

    const dirty = errors.filter((e) => /left GL state dirty/.test(e));
    expect(dirty, dirty.join('\n')).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every act runs, and never more than two at once', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });

    const seen = new Set<string>();
    let maxLive = 0;
    for (let i = 0; i <= 40; i++) {
      await page.evaluate((t) => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, h * t);
      }, i / 40);
      await page.waitForTimeout(60);
      const d = await page.evaluate(() => window.NB_STAGE.debug());
      maxLive = Math.max(maxLive, d.resources.live);
      const b = await page.evaluate(() => window.NB_STAGE.budget());
      Object.keys(b.acts).forEach((k) => seen.add(k));
    }

    expect([...seen].sort(), 'an act never reported a frame — it never ran').toEqual([...ACTS].sort());
    expect(maxLive, 'more than two acts were live at once; the frame budget assumes at most two').toBeLessThanOrEqual(2);
  });

  /* The leak test. Ten full passes: if an act allocates on the way in and does
     not give it all back on the way out, resource counts ratchet upward and
     this fails. That is the difference between a leak being a failing
     assertion here and a slow death on someone's phone. */
  test('scrubbing the page ten times does not ratchet GL resources', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });

    await scrub(page, 12, 40);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const first = await page.evaluate(() => window.NB_STAGE.debug().resources);

    for (let pass = 0; pass < 9; pass++) await scrub(page, 12, 25);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const last = await page.evaluate(() => window.NB_STAGE.debug().resources);

    for (const key of ['programs', 'buffers', 'textures', 'fbos'] as const) {
      expect(last[key], `${key} grew from ${first[key]} to ${last[key]} over ten passes`).toBeLessThanOrEqual(first[key]);
    }
  });

  test('a lost context comes back without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/?motion=full');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });
    await page.evaluate(() => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, h * 0.4);
    });
    await page.waitForTimeout(300);

    const restored = await page.evaluate(async () => {
      const c = document.getElementById('nb-stage') as HTMLCanvasElement;
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl && (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
      if (!ext) return 'unsupported';
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 300));
      ext.restoreContext();
      await new Promise((r) => setTimeout(r, 1500));
      return window.NB_STAGE.ok ? 'ok' : 'dead';
    });

    test.skip(restored === 'unsupported', 'WEBGL_lose_context unavailable');
    expect(restored).toBe('ok');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('reduced motion composes a still frame rather than a blank one', async ({ page }) => {
    /* This is the default experience on the machine this site is built on, so
       it is the path most likely to be seen and the one least likely to be
       checked. A blank canvas passes "it did not crash" and fails the point. */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });
    expect(await page.evaluate(() => window.NB_STAGE.mode)).toBe('reduced');

    await scrub(page, 20, 80);

    const painted = await page.evaluate(() => {
      const c = document.getElementById('nb-stage') as HTMLCanvasElement;
      const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
      const px = new Uint8Array(4 * 64);
      gl.readPixels(Math.floor(c.width / 2) - 4, Math.floor(c.height / 2) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px.some((v) => v !== 0);
    });
    expect(painted, 'the canvas is empty in reduced motion — drawStill() rendered nothing').toBe(true);
  });

  test('the site stands up with no WebGL at all', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as any;
      const real = proto.getContext;
      proto.getContext = function (type: string, ...rest: any[]) {
        if (/webgl/i.test(type)) return null;
        return real.call(this, type, ...rest);
      };
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/');
    await page.waitForTimeout(600);

    expect(await page.locator('html').getAttribute('data-gl')).toBe('off');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.pkg__price').first()).toHaveText(/\$3,500/);
    await expect(page.locator('.work-card a[href="/demos/atlas"]')).toBeVisible();
    await expect(page.locator('.work-card__kind').first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);

    await context.close();
  });

  test('the copy tells the truth with JavaScript off', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('machine that brings customers in');
    for (const price of ['$3,500', '$8,500', '$600']) {
      await expect(page.getByText(price, { exact: false }).first()).toBeVisible();
    }
    /* Concept builds are labelled on every surface, in every state. */
    expect(await page.locator('.work-card__kind').count()).toBe(2);
    await expect(page.locator('form.contact button[type=submit]')).toBeVisible();

    /* And the claims that were cut stay cut. */
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const dead of ['48 hrs', '48 hours', 'spots left', 'halo', 'sell while you sleep']) {
      expect(body, `"${dead}" is back on the page`).not.toContain(dead);
    }

    await context.close();
  });
});
