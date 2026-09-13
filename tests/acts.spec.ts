/* Each act gets its own ceiling, asserted here rather than in the shared
 * harness.
 *
 * The reason is coordination, not tidiness. Four departments wrote these acts
 * in parallel, and a single aggregate frame gate tells you only that the page
 * got slower — it does not tell you whose shader did it, and it turns every
 * regression into an argument. A per-act ceiling names the owner in the
 * failure message.
 *
 * The numbers below are command-submission time, measured by the Stage's own
 * bracket around each act's update() and draw(). They are not GPU execution
 * time; EXT_disjoint_timer_query is unavailable on most targets and nothing
 * here pretends otherwise. What they catch is an act that starts doing far
 * more work than it used to, which is the regression that actually happens.
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const CEILING_MS: Record<string, number> = {
  northlight: 5,
  drift: 6,
  solution: 9,
  /* The procession replaced the dissolve act: twelve loops, a spring lattice
     and a sheet of glass, against the dissolve's single fullscreen triangle. */
  offerings: 9,
};

/** Park the scroll in the middle of an act's window and wait until it has
 *  actually reported a frame.
 *
 *  The windows come from the Stage, not from a copy kept here. They are
 *  measured from where each section really sits, so a hardcoded table in the
 *  test goes stale the moment the copy changes length — and a test that parks
 *  in the wrong place reports a perfectly good act as blank. */
async function dwell(page, id: string) {
  await page.evaluate((actId) => {
    const S: any = (window as any).NB_STAGE;
    const w = S.debug().windows[actId];
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * ((w[0] + w[1]) / 2));
  }, id);

  await page.waitForFunction(
    (actId) => !!(window as any).NB_STAGE?.budget().acts[actId],
    id,
    { timeout: 20_000 }
  ).catch(() => {});
  await page.waitForTimeout(900);
}

test.describe('the acts', () => {

  for (const [id, ceiling] of Object.entries(CEILING_MS)) {
    test(`${id} stays under ${ceiling}ms`, async ({ page }) => {
      await page.goto('/?motion=full');
      await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 10_000 });
      await dwell(page, id);

      const b = await page.evaluate(() => (window as any).NB_STAGE.budget());
      const act = b.acts[id];
      expect(act, `${id} never reported a frame — it failed to load, or its window is wrong`).toBeTruthy();
      expect(
        act.p95,
        `${id} p95 is ${act.p95.toFixed(2)}ms against a ${ceiling}ms ceiling`
      ).toBeLessThan(ceiling);
    });
  }

  /* An act that quietly fell back is an act nobody notices is missing. The
     fallback path is correct behaviour on a machine that cannot run the act;
     it is a bug on a machine that can. */
  test('no act silently fell back on a machine that can run it', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });

    await page.goto('/?motion=full');
    await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 10_000 });
    for (const id of Object.keys(CEILING_MS)) await dwell(page, id);

    const fellBack = await page.$$eval('[data-act][data-act-state="static"]', (els) =>
      els.map((e) => e.getAttribute('data-act'))
    );
    expect(fellBack, `these acts fell back: ${fellBack.join(', ')}\n${warnings.join('\n')}`).toEqual([]);
  });

  /* Reduce Motion is on system-wide on the machine this site is built on, so
     the still path is the one most likely to be seen and least likely to be
     checked. Every act owes a composed frame here, not a blank one. */
  test('every act composes a still frame under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 10_000 });

    for (const id of Object.keys(CEILING_MS)) {
      await dwell(page, id);
      /* Scan the whole canvas, not the centre. Act III paints its type band
         at about 55-71% of the height and nothing at all in the middle, so a
         centre sample calls a perfectly composed frame blank. */
      const painted = await page.evaluate(() => {
        const c = document.getElementById('nb-stage') as HTMLCanvasElement;
        const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
        const px = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < px.length; i += 4) if (px[i] | px[i + 1] | px[i + 2] | px[i + 3]) return true;
        return false;
      });
      expect(painted, `${id} rendered nothing in reduced motion — drawStill() is blank`).toBe(true);
    }
  });

  /* The commercial content of the page must survive every visual treatment.
     Act III turns its own heading into a texture; it may never take the prices
     with it. */
  test('the prices stay readable through the type treatment', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 10_000 });
    await dwell(page, 'solution');

    for (const price of ['$3,500', '$8,500', '$600']) {
      const el = page.locator('.pkg__price', { hasText: price }).first();
      await expect(el).toBeVisible();
      const opacity = await el.evaluate((n) => getComputedStyle(n).opacity);
      const color = await el.evaluate((n) => getComputedStyle(n).color);
      expect(Number(opacity), `${price} is faded to ${opacity}`).toBeGreaterThan(0.85);
      expect(color, `${price} is transparent`).not.toMatch(/rgba\(.*,\s*0\)/);
    }
  });
});
