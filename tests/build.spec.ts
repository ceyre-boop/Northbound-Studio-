/* The guided build — build.html.
 *
 * One spec per bullet of the plan's verification section: every step
 * advances and goes back; the multi-select minimum; the summary is right
 * for three named answer paths and never shows a price or an old tier;
 * localStorage restore; URL restore; "Start your site" carries the spec into
 * checkout; no-JS shows the plain form; no horizontal
 * scroll at 390px; CLS 0; zero console errors. Plus the guard that the step 1
 * shipped in the HTML is the step 1 the module renders, so the takeover
 * cannot move anything on the page.
 */
import { test, expect, type Page } from '@playwright/test';

type Step = { value: string | string[]; name?: string };

async function fresh(page: Page) {
  await page.goto('/build.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#step-label')).toHaveText('Step 1 of 8');
}

async function answer(page: Page, step: Step) {
  const values = Array.isArray(step.value) ? step.value : [step.value];
  for (const v of values) await page.locator(`#panel [data-value="${v}"]`).click();
  if (step.name) await page.fill('#biz-name', step.name);
}

async function walk(page: Page, path: Step[]) {
  for (let i = 0; i < path.length; i++) {
    await expect(page.locator('#step-label')).toHaveText(`Step ${i + 1} of 8`);
    await answer(page, path[i]);
    await page.locator('#panel [data-nav="next"]').click();
  }
  await expect(page.locator('#step-label')).toHaveText('Step 8 of 8');
}

/* Three named paths, and what each must add up to. */
/* The one dollar figure the page may carry is the guarantee, "$100 off". */
const noPrice = (text: string) => text.replace(/\$100 off/g, '');
const OLD_MENU = /Beacon|Engine|Bearing|Cheap and Clean|founding/i;
const ROOFER: Step[] = [
  { value: 'trades', name: 'Rivera Roofing' }, { value: 'call' }, { value: ['jobs', 'quotes'] },
  { value: '1k-5k' }, { value: 'nobody' }, { value: 'you' }, { value: 'industrial' },
];
const CAFE: Step[] = [
  { value: 'food', name: 'Ledge Coffee' }, { value: 'hope' }, { value: ['found'] },
  { value: '200-1k' }, { value: 'me' }, { value: 'me' }, { value: 'editorial' },
];
const SHOP: Step[] = [
  { value: 'shop' }, { value: 'call' }, { value: ['_'] },
  { value: 'u200' }, { value: 'me' }, { value: 'me' }, { value: 'dark' },
];

test.describe('guided build — the flow', () => {
  test('every step advances, and every step goes back with its answer kept', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    for (let i = 7; i >= 1; i--) {
      await page.locator('#panel [data-nav="back"]').click();
      await expect(page.locator('#step-label')).toHaveText(`Step ${i} of 8`);
      const s = ROOFER[i - 1];
      const values = Array.isArray(s.value) ? s.value : [s.value];
      for (const v of values) await expect(page.locator(`#panel [data-value="${v}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#panel [data-nav="next"]')).toBeEnabled();
    }
    await expect(page.locator('#panel [data-nav="back"]')).toBeDisabled();
    await expect(page.locator('#biz-name')).toHaveValue('Rivera Roofing');
  });

  test('the multi-select needs at least one answer, and "not sure yet" clears the others', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER.slice(0, 2)).catch(() => {});
    await expect(page.locator('#step-label')).toHaveText('Step 3 of 8');
    const next = page.locator('#panel [data-nav="next"]');
    await expect(next).toBeDisabled();
    await page.locator('#panel [data-value="jobs"]').click();
    await expect(next).toBeEnabled();
    await page.locator('#panel [data-value="jobs"]').click();
    await expect(next).toBeDisabled();
    await page.locator('#panel [data-value="jobs"]').click();
    await page.locator('#panel [data-value="orders"]').click();
    await page.locator('#panel [data-value="_"]').click();
    await expect(page.locator('#panel [data-value="jobs"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#panel [data-value="orders"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#panel [data-value="_"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(next).toBeEnabled();
  });

  test('no price and no old tier appears on any step, the summary included', async ({ page }) => {
    await fresh(page);
    for (let i = 0; i <= ROOFER.length; i++) {
      const text = (await page.locator('#panel, #say').allInnerTexts()).join(' ');
      expect(noPrice(text), `step ${i + 1}`).not.toMatch(/\$\s?\d/);
      expect(text, `step ${i + 1}`).not.toMatch(OLD_MENU);
      if (i === ROOFER.length) break;
      await answer(page, ROOFER[i]);
      await page.locator('#panel [data-nav="next"]').click();
    }
    await expect(page.locator('#step-label')).toHaveText('Step 8 of 8');
  });

  test('the worth question asks in dollars, and its answers carry no dollar sign', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER.slice(0, 3)).catch(() => {});
    await expect(page.locator('#step-label')).toHaveText('Step 4 of 8');
    await expect(page.locator('#q')).toHaveText('What is one new customer worth to you, in dollars?');
    expect(await page.locator('#panel .opt:not(.opt-unsure)').allInnerTexts()).toEqual(['Under 200', '200 to 1,000', '1,000 to 5,000', 'More than 5,000']);
  });

  test('the preview phone builds as the answers land', async ({ page }) => {
    await fresh(page);
    const phone = page.locator('#phone');
    await expect(phone.locator('[data-p="brand"]')).toHaveText('Your business');
    await answer(page, ROOFER[0]);
    await expect(phone.locator('[data-p="brand"]')).toHaveText('Rivera Roofing');
    await expect(phone.locator('[data-p="hero"]')).toContainText('Repairs and installs');
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[1]);
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[2]);
    await expect(phone.locator('[data-p="cta"]')).toHaveText('Book a time');
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[3]);
    await page.locator('#panel [data-nav="next"]').click();
    await expect(phone.locator('[data-p="night"]')).toBeHidden();
    await answer(page, ROOFER[4]);
    await expect(phone.locator('[data-p="night"]')).toBeVisible();
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[5]);
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[6]);
    await expect(phone).toHaveAttribute('data-look', 'industrial');
  });

  test('Buddy has a line for every step and reacts to an answer', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#say')).toHaveText('Start with what you do. Everything after this is in your words, not ours.');
    await answer(page, ROOFER[0]);
    await expect(page.locator('#say')).toContainText('For a trade');
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[1]);
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[2]);
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, ROOFER[3]);
    await page.locator('#panel [data-nav="next"]').click();
    await answer(page, { value: 'nobody' });
    await expect(page.locator('#say')).toHaveText("That's the one that costs you. An enquiry that waits overnight usually doesn't wait.");
    await expect(page.locator('.buddy-img img.is-on')).toHaveAttribute('data-pose', 'thinking');
  });

  test('the options work from the keyboard', async ({ page }) => {
    await fresh(page);
    await page.locator('#panel [data-value="trades"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel [data-value="trades"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#panel [data-nav="next"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-label')).toHaveText('Step 2 of 8');
    await expect(page.locator('#q')).toBeFocused();
  });
});

test.describe('guided build — the summary', () => {
  test('roofer: the one offer, the site covered, everything else quoted separately, one button', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const sheet = page.locator('#panel');
    await expect(sheet).toContainText('Your build for Rivera Roofing');
    await expect(sheet.locator('#offer-card h2')).toHaveText('The Northbound Site');
    await expect(sheet.locator('#offer-card')).toContainText('Up to 5 pages, built from one template');
    await expect(sheet.locator('#offer-card')).toContainText("Unlimited revisions until you're happy");
    await expect(sheet.locator('#offer-card')).toContainText('Live in 7 days or $100 off');
    await expect(sheet.locator('#offer-card')).toContainText('In the look you picked: Industrial.');
    await expect(sheet.locator('#care-card')).toContainText("Hosting, security, updates and small edits, billed monthly from launch. Cancel with 30 days' notice.");
    expect(await sheet.locator('.parts .t').allInnerTexts()).toEqual(['A custom site']);
    await expect(sheet.locator('#extra-note')).toContainText('Quoted separately: Booking flow, Quote flow, Payments, Lead capture, Automated follow-up, Reminders, Review requests.');
    // One way forward, and it names no price.
    await expect(sheet.locator('a.reserve')).toHaveCount(1);
    await expect(sheet.locator('#reserve')).toHaveText('Start your site');
    await expect(sheet.locator('#reserve')).toHaveAttribute('href', /^checkout\.html\?s=1tc33ny5c\.Rivera/);
    // Nothing left of the package picker, the price or the payback sum.
    await expect(sheet.locator('.pkg-opt, .price, .payback')).toHaveCount(0);
    const text = await sheet.innerText();
    expect(noPrice(text)).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(OLD_MENU);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/spots? (left|remaining)|hurry|countdown|hours left|ends (today|soon)/i);
  });

  test('café: the leftovers are named as quoted separately, not dropped', async ({ page }) => {
    await fresh(page);
    await walk(page, CAFE);
    const sheet = page.locator('#panel');
    await expect(sheet.locator('#offer-card h2')).toHaveText('The Northbound Site');
    expect(await sheet.locator('.parts .t').allInnerTexts()).toEqual(['A custom site']);
    await expect(sheet.locator('#extra-note')).toContainText('Quoted separately: Brand identity, Review requests, Local SEO.');
    await expect(sheet.locator('#reserve')).toHaveText('Start your site');
    expect(noPrice(await sheet.innerText())).not.toMatch(/\$\s?\d/);
  });

  test('shop, not sure what it wants: just the site, nothing to quote separately', async ({ page }) => {
    await fresh(page);
    await walk(page, SHOP);
    const sheet = page.locator('#panel');
    expect(await sheet.locator('.parts .t').allInnerTexts()).toEqual(['A custom site']);
    await expect(sheet.locator('#extra-note')).toHaveCount(0);
    await expect(sheet.locator('#offer-card')).toContainText('In the look you picked: Dark.');
    await expect(sheet.locator('#reserve')).toHaveText('Start your site');
    await expect(sheet.locator('#reserve')).toHaveAttribute('href', /^checkout\.html\?s=1rc01mm2c$/);
  });

  test('the recap and the send block are folded on a phone and open on a desktop', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const wide = (await page.viewportSize())!.width > 860;
    for (const id of ['#fold-answers', '#fold-send']) {
      const d = page.locator(id);
      await expect(d.locator('summary')).toBeVisible();
      expect(await d.evaluate((el: HTMLDetailsElement) => el.open)).toBe(wide);
    }
    await expect(page.locator('#fold-answers .answers-list li')).toHaveCount(7);
    await expect(page.locator('#fold-send #email-form')).toHaveCount(1);
  });

  test('Copy the link says what it did', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await fresh(page);
    await walk(page, ROOFER);
    await page.locator('#fold-send').evaluate((d: HTMLDetailsElement) => { d.open = true; });
    await page.locator('#copy-link').click();
    await expect(page.locator('#copy-status')).toHaveText('Link copied — it restores this exact build.');
  });

  test('the recap says what a customer is worth without a dollar sign', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    await expect(page.locator('#fold-answers .answers-list')).toContainText('One customer is worth, in dollars: 1,000 to 5,000');
  });
});

test.describe('guided build — saved and restored', () => {
  test('localStorage: the build is waiting after a reload, and picking it up lands on the right step', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER.slice(0, 3)).catch(() => {});
    await expect(page.locator('#step-label')).toHaveText('Step 4 of 8');
    await page.reload();
    await expect(page.locator('#step-label')).toHaveText('Step 1 of 8');
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Your build is waiting. You got to step 4 of 8.');
    await toast.locator('[data-toast="resume"]').click();
    await expect(page.locator('#step-label')).toHaveText('Step 4 of 8');
    await expect(page.locator('#phone [data-p="brand"]')).toHaveText('Rivera Roofing');
    await expect(page.locator('#phone [data-p="cta"]')).toHaveText('Book a time');
    await page.locator('#panel [data-nav="back"]').click();
    await expect(page.locator('#panel [data-value="jobs"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Start over" from the toast forgets the build', async ({ page }) => {
    await fresh(page);
    await answer(page, ROOFER[0]);
    await page.reload();
    await page.locator('#toast [data-toast="fresh"]').click();
    await expect(page.locator('#toast')).toBeHidden();
    await page.reload();
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#biz-name')).toHaveValue('');
  });

  test('the link restores the whole build on a device that has never seen it', async ({ page, browser }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const link = await page.locator('#link-field').inputValue();
    expect(link).toMatch(/\/build\.html\?s=1tc33ny5/);
    expect(link).toContain('Rivera');
    // The raw URL is not painted on the sheet; the copy button is the way to it.
    expect(await page.locator('#panel').innerText()).not.toContain('build.html?s=');
    await expect(page.locator('#link-field')).toHaveAttribute('data-build-link', link);

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link);
    await expect(other.locator('#step-label')).toHaveText('Step 8 of 8');
    await expect(other.locator('#panel')).toContainText('Restored from your link');
    await expect(other.locator('#panel')).toContainText('Your build for Rivera Roofing');
    await expect(other.locator('#offer-card h2')).toHaveText('The Northbound Site');
    await expect(other.locator('#reserve')).toHaveText('Start your site');
    await expect(other.locator('#phone')).toHaveAttribute('data-look', 'industrial');
    await expect(other.locator('#phone [data-p="brand"]')).toHaveText('Rivera Roofing');
    // The query is consumed, so a reload does not clobber later edits.
    expect(new URL(other.url()).search).toBe('');
    await other.locator('#panel [data-nav="back"]').click();
    await expect(other.locator('#panel [data-value="industrial"]')).toHaveAttribute('aria-pressed', 'true');
    await ctx.close();
  });

  test('a link saved under the old menu still opens, as the one offer', async ({ page }) => {
    for (const old of ['1tc33ny5e.Rivera%2520Roofing', '1fhg2mm3b', '1rc01mm2c']) {
      await page.goto('/build.html?s=' + old);
      await expect(page.locator('#step-label')).toHaveText('Step 8 of 8');
      await expect(page.locator('#offer-card h2')).toHaveText('The Northbound Site');
      await expect(page.locator('#reserve')).toHaveAttribute('href', /^checkout\.html\?s=1[a-z0-9_]{7}c/);
    }
  });

  test('a link that cannot be read falls back to a fresh step 1', async ({ page }) => {
    await page.goto('/build.html?s=garbage');
    await expect(page.locator('#step-label')).toHaveText('Step 1 of 8');
  });
});

test.describe('guided build — into checkout', () => {
  test('"Start your site" carries the spec into checkout, and checkout shows what they told us', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const href = await page.locator('#reserve').getAttribute('href');
    expect(href).toMatch(/^checkout\.html\?s=1tc33ny5c/);
    expect(href).not.toContain('buy=');
    await page.locator('#reserve').click();
    await expect(page).toHaveURL(/checkout\.html\?s=1tc33ny5c/);
    await expect(page.locator('#spec')).toHaveValue(/^1tc33ny5c\.Rivera/);
    await expect(page.locator('#build-card')).toBeVisible();
    const parts = await page.locator('#build-parts li').allInnerTexts();
    expect(parts).toContain('A custom site');
    expect(parts).toContain('Booking flow');
    await expect(page.locator('#build-extra')).toBeVisible();
    await expect(page.locator('#build-extra')).toContainText('Quoted separately: Booking flow, Quote flow');
    await expect(page.locator('#build-answers')).toContainText('Rivera Roofing');
    await expect(page.locator('#build-card')).not.toContainText(OLD_MENU);
    await expect(page.locator('#build-change')).toHaveAttribute('href', /build\.html\?s=1tc33ny5c/);
    await expect(page.locator('.back')).toHaveAttribute('href', /build\.html\?s=/);
  });

  test('a site-only build reaches checkout with nothing to quote separately', async ({ page }) => {
    await fresh(page);
    await walk(page, SHOP);
    await page.locator('#reserve').click();
    await expect(page).toHaveURL(/checkout\.html\?s=1rc01mm2c/);
    await expect(page.locator('#build-card')).toBeVisible();
    expect(await page.locator('#build-parts li').allInnerTexts()).toEqual(['A custom site']);
    await expect(page.locator('#build-extra')).toBeHidden();
  });

  test('checkout without a spec shows no build card and carries no code', async ({ page }) => {
    await page.goto('/checkout.html');
    await expect(page.locator('#build-card')).toBeHidden();
    await expect(page.locator('#spec')).toHaveValue('');
  });
});

test.describe('guided build — the page itself', () => {
  test('without JavaScript the plain quote form is what you get, and the flow is not', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/build.html');
    await expect(page.locator('#flow')).toBeHidden();
    const form = page.locator('#quote form');
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/quote');
    // One offer: nothing to choose, no review field, and no price in the form.
    await expect(form.locator('select[name="package"]')).toHaveCount(0);
    await expect(form.locator('input[type="hidden"][name="package"]')).toHaveValue('site');
    await expect(form.locator('[name="review_name"]')).toHaveCount(0);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(OLD_MENU);
    await expect(form.locator('button[type="submit"]')).toBeVisible();
    // The phone number came off the site (email and review only); the
    // header and footer carry the address instead.
    await expect(page.locator('header a[href^="mailto:"]')).toBeVisible();
    await expect(page.locator('footer a[href^="mailto:"]')).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await ctx.close();
  });

  test('with JavaScript the plain form is out of the way and the flow is in', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#quote')).toBeHidden();
    await expect(page.locator('#flow')).toBeVisible();
  });

  test('the step 1 shipped in the HTML is the step 1 the module renders', async ({ page }) => {
    const raw = await (await page.request.get('/build.html')).text();
    const m = raw.match(/<div class="panel" id="panel" aria-live="polite">([\s\S]*?)<\/div>\s*<\/div>\s*<aside/);
    expect(m).not.toBeNull();
    // innerHTML serialises a boolean attribute as disabled=""; the source writes it bare.
    const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/> </g, '><').replace(/disabled=""/g, 'disabled').trim();
    await fresh(page);
    const rendered = await page.locator('#panel').innerHTML();
    expect(norm(rendered)).toBe(norm(m![1]));
  });

  test('no horizontal scroll at 390px, on any step', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fresh(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (let i = 0; i < ROOFER.length; i++) {
      await answer(page, ROOFER[i]);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.locator('#panel [data-nav="next"]').click();
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
    await page.locator('#fold-send summary').click();
    await page.locator('#email-toggle').click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  for (const [name, url] of [['a fresh visit', '/build.html'], ['a restore from a link', '/build.html?s=1tc33ny5e.Rivera%2520Roofing']] as const) {
    test(`CLS is zero on ${name}`, async ({ page }) => {
      type Shift = { value: number; sources: string[] };
      await page.addInitScript(() => {
        const w = window as unknown as { __shifts: Shift[] };
        w.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number; sources: { node: Element | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
            if (e.hadRecentInput) continue;
            w.__shifts.push({
              value: e.value,
              sources: e.sources.map((s) => `${s.node ? `${s.node.tagName}#${s.node.id}.${s.node.className}` : '?'} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}`),
            });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const shifts = await page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts);
      const cls = shifts.reduce((n, s) => n + s.value, 0);
      expect(cls, shifts.map((s) => `${s.value.toFixed(4)}: ${s.sources.join(' | ')}`).join('\n')).toBe(0);
    });
  }

  test('zero console errors through the whole flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await fresh(page);
    await walk(page, ROOFER);
    await page.locator('#fold-send').evaluate((d: HTMLDetailsElement) => { d.open = true; });
    await page.locator('#email-toggle').click();
    await page.locator('#copy-link').click();
    await page.locator('#reserve').click();
    await expect(page).toHaveURL(/checkout\.html/);
    expect(errors).toEqual([]);
  });

  test('the look thumbnails are real images that load', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER.slice(0, 6)).catch(() => {});
    await expect(page.locator('#step-label')).toHaveText('Step 7 of 8');
    const imgs = page.locator('.look img');
    await expect(imgs).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect.poll(() => imgs.nth(i).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(300);
    }
  });

});
