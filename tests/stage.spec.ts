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

const ACTS = ['northlight', 'drift', 'solution', 'offerings'];

/* Scrubbing the page drives four shader systems through every seam, and CI
   runs them on a software rasteriser. The default 30s is not a meaningful
   budget for that; these tests are checking correctness, not speed. */
test.describe.configure({ timeout: 180_000 });

/** Walk the whole document in n steps, letting each frame actually run. */
async function scrub(page, steps = 24, settle = 50) {
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
    await page.waitForTimeout(600);

    const seen = new Set<string>();
    let maxLive = 0;

    /* Visit each act's own measured window rather than stepping the document
       in fixed increments. The windows are derived from where the sections
       actually sit, so a fixed step can stride straight over a short one and
       report a working act as never having run. */
    for (const id of ACTS) {
      await page.evaluate((actId) => {
        const w = window.NB_STAGE.debug().windows[actId];
        const h = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, h * ((w[0] + w[1]) / 2));
      }, id);
      await page.waitForFunction(
        (actId) => !!window.NB_STAGE.budget().acts[actId],
        id,
        { timeout: 20_000 }
      ).catch(() => {});
      await page.waitForTimeout(500);

      const d = await page.evaluate(() => window.NB_STAGE.debug());
      maxLive = Math.max(maxLive, d.resources.live);
      const b = await page.evaluate(() => window.NB_STAGE.budget());
      Object.keys(b.acts).forEach((k) => seen.add(k));
    }

    /* And once more across every seam, where two acts share the frame. */
    await scrub(page, 24, 50);
    const d2 = await page.evaluate(() => window.NB_STAGE.debug());
    maxLive = Math.max(maxLive, d2.resources.live);

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

    /* Park inside an act's own window rather than at the end of the document.
       Acts now end with their sections, so past the last one the canvas is
       legitimately empty — the closing section has its own content and never
       wanted a canvas behind it. Scrubbing to the bottom and demanding pixels
       tests the opposite of what the design says. */
    await page.evaluate(() => {
      const w = window.NB_STAGE.debug().windows.offerings;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, h * (w[0] + 0.4 * (w[1] - w[0])));
    });
    /* Wait for paint, do not sleep for it. The act at this scroll position is
       imported and initialised lazily, so for the first few hundred
       milliseconds after the jump the canvas is legitimately still empty. A
       fixed sleep turns that startup window into a coin flip — this test
       failed about one run in five on a warm machine and never on a slow one,
       which is exactly the signature of a race being asserted as a state.
       Probing until it paints asserts what the test actually means: that the
       still frame arrives, not that it had arrived by an arbitrary deadline. */
    const painted = await page
      .waitForFunction(() => {
        const c = document.getElementById('nb-stage') as HTMLCanvasElement;
        const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
        const px = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < px.length; i += 4) if (px[i] | px[i + 1] | px[i + 2] | px[i + 3]) return true;
        return false;
      }, { timeout: 8_000 })
      .then(() => true, () => false);
    expect(painted, 'the canvas is empty in reduced motion — drawStill() rendered nothing').toBe(true);
  });

  test('reduced motion still follows the scroll, and still stops when you do', async ({ page }) => {
    /* The bug this guards was shipped and visible: the stage decided a still
       frame was stale only when the SET of live acts changed, never when the
       scroll position did. So the offerings procession — six screens, twelve
       panels on a helix — composed one frame on entry and held that single
       photograph for the whole section. On a machine with Reduce Motion on
       system-wide, which is the default here, the main section of the site
       was a photograph.
     *
     * Both halves matter and they pull against each other, so both are
     * asserted here. Scrolling MUST repaint: scroll is the visitor's own
     * motion and a page that ignores it is broken, not considerate. Standing
     * still MUST NOT: that is the whole promise of the mode, and it is what
     * keeps the idle cost at literally zero GL calls. */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 10_000 });
    expect(await page.evaluate(() => window.NB_STAGE.mode)).toBe('reduced');

    const at = (f: number) =>
      page.evaluate((frac) => {
        const w = window.NB_STAGE.debug().windows.offerings;
        const h = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, h * (w[0] + frac * (w[1] - w[0])));
      }, f);

    /* A cheap fingerprint of the canvas: summing bytes is enough to tell one
       composition from another and costs a fraction of shipping the pixels. */
    const fingerprint = () =>
      page.evaluate(() => {
        const c = document.getElementById('nb-stage') as HTMLCanvasElement;
        const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
        const px = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let h = 0;
        for (let i = 0; i < px.length; i += 997) h = (h * 31 + px[i]) | 0;
        return h;
      });

    await at(0.30);
    await page.waitForTimeout(1500);

    const moving: number[] = [];
    for (let i = 0; i < 4; i++) {
      await at(0.30 + i * 0.05);
      await page.waitForTimeout(500);
      moving.push(await fingerprint());
    }
    expect(
      new Set(moving).size,
      'the procession did not move as the page was scrolled in reduced motion — the still frame is not being recomposed'
    ).toBeGreaterThan(1);

    const resting: number[] = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(700);
      resting.push(await fingerprint());
    }
    expect(
      new Set(resting).size,
      'the canvas kept changing while the page was not being scrolled — something is animating at a visitor who asked for no motion'
    ).toBe(1);
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
