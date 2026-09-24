/* The new homepage — the plain, no-WebGL page that now lives at "/".
 *
 * One spec per acceptance line from the home-swap-v1 brief. Where a bullet
 * names an exact price or phone number, the test asserts against that
 * string verbatim rather than a paraphrase.
 */
import { test, expect } from '@playwright/test';
import { GOOGLE_REVIEW_URL } from '../js/config.js';

test.describe('homepage — pricing', () => {
  test('the three prices are present: $600, $3,500, $8,500', async ({ page }) => {
    await page.goto('/');
    const body = await page.locator('body').innerText();
    expect(body).toContain('$600');
    expect(body).toContain('$3,500');
    expect(body).toContain('$8,500');
  });

  test('Bearing is not one of the three price cards, but is reachable', async ({ page }) => {
    await page.goto('/');
    const cardTitles = await page.locator('.pkg h3').allInnerTexts();
    expect(cardTitles).toEqual(['Cheap and Clean', 'Beacon', 'Engine']);
    expect(cardTitles).not.toContain('Bearing');

    // The "Keeping it running" block still names it and links to an account.
    const keeping = page.locator('#bearing');
    await expect(keeping).toContainText('Keeping it running');
    await expect(keeping).toContainText('Bearing');
    await expect(keeping.locator('a[href="account.html"]')).toHaveCount(1);
  });
});

test.describe('homepage — chrome', () => {
  test('header and footer both carry the tappable phone number', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header a[href="tel:+14705738908"]').first()).toBeVisible();
    await expect(page.locator('footer a[href="tel:+14705738908"]').first()).toBeVisible();
  });

  test('"Buy it now" goes to checkout.html', async ({ page }) => {
    await page.goto('/');
    const buy = page.locator('a', { hasText: 'Buy it now' });
    await expect(buy).toHaveAttribute('href', /checkout\.html/);
  });

  test('no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/');
    expect(errors).toEqual([]);
  });

  test('the page works fully with JavaScript disabled', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a', { hasText: 'Buy it now' })).toBeVisible();
    const cardTitles = await page.locator('.pkg h3').allInnerTexts();
    expect(cardTitles).toEqual(['Cheap and Clean', 'Beacon', 'Engine']);
    await ctx.close();
  });
});

test.describe('checkout — add-ons and total', () => {
  /* Two numbers, and they are not the same number (see the comment above
     the .totals block in checkout.html): the build is $600 once, due today,
     no matter what monthly add-ons are ticked — those bill next month, and
     api/checkout.ts's summary keeps them split the same way. The old version
     of this test expected #total itself to climb with each add-on, which
     matched neither the page nor the server; it was a pre-existing failure
     fixed here to assert the actually-correct behaviour instead. */
  test('due today stays $600 no matter what is ticked; the monthly line is what updates', async ({ page }) => {
    await page.goto('/checkout.html');
    const care = page.locator('input[name="care"]');
    const bearing = page.locator('input[name="bearing"]');
    await expect(care).toHaveCount(1);
    await expect(bearing).toHaveCount(1);

    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#monthly-row')).toBeHidden();

    await care.check();
    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#monthly')).toHaveText('$49.00');
    await expect(page.locator('#monthly-row')).toBeVisible();

    // Bearing's founding price is $300/mo the first month on either term.
    await bearing.check();
    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#monthly')).toHaveText('$349.00');

    await care.uncheck();
    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#monthly')).toHaveText('$300.00');
  });

  test('Bearing term choice changes what happens after month one, not the next-month charge', async ({ page }) => {
    await page.goto('/checkout.html');
    await page.locator('input[name="bearing"]').check();

    // Default term is the 12-month commitment.
    await expect(page.locator('input[name="bearing_term"][value="12"]')).toBeChecked();
    await expect(page.locator('#monthly')).toHaveText('$300.00');
    await expect(page.locator('#then')).toContainText('locked at $300/mo for the full 12-month term');

    await page.locator('input[name="bearing_term"][value="mtm"]').check();
    await expect(page.locator('#monthly')).toHaveText('$300.00');
    await expect(page.locator('#then')).toContainText('then $600/mo after');
  });

  test('the review link and the review-name field are present, the field empty and not yet required', async ({ page }) => {
    await page.goto('/checkout.html');
    const link = page.locator('a', { hasText: 'Leave your Google review' });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', GOOGLE_REVIEW_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    const name = page.locator('input[name="review_name"]');
    await expect(name).toHaveCount(1);
    await expect(name).toHaveValue('');
    await expect(name).not.toHaveAttribute('required', '');
    await expect(page.locator('label[for="f-review-name"]')).toHaveText('The name your review is posted under');
    await expect(page.locator('#founding-claim')).toContainText('we check it ourselves before finalising');
    await expect(page.locator('input[name="founding_agree"]')).toHaveCount(0);
  });

  test('still posts with JavaScript disabled, including the Bearing term, the review link and the review name', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/checkout.html');
    const form = page.locator('form#order');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/checkout');
    await expect(form.locator('input[name="buy"]')).toHaveValue('clean');
    await expect(form.locator('input[name="care"]')).toHaveCount(1);
    await expect(form.locator('input[name="bearing"]')).toHaveCount(1);
    await expect(form.locator('input[name="bearing_term"]')).toHaveCount(2);
    await expect(form.locator('input[name="bearing_term"][value="12"]')).toBeChecked();
    await expect(form.locator('a', { hasText: 'Leave your Google review' })).toHaveAttribute('href', GOOGLE_REVIEW_URL);
    await expect(form.locator('input[name="review_name"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await ctx.close();
  });
});

/* The founding claim: a review, not a checkbox. The server refuses founding
   pricing without the review name; the browser has to refuse it first,
   because a server refusal on a native POST throws away everything typed. */
test.describe('founding pricing — claimed with a review', () => {
  const STALE = /isn't live yet|nothing to review today|once (your|our) Google (Business )?[Pp]rofile is live/;

  for (const path of ['/', '/studio.html', '/checkout.html', '/account.html']) {
    test(`${path} no longer says the profile isn't live`, async ({ page }) => {
      await page.goto(path);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(STALE);
      expect(body).not.toMatch(/verified automatically|checked automatically/i);
    });
  }

  test('the quote form has the review link (new tab) and the name field; the field is only required for a founding package', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#quote form');
    const link = form.locator('a', { hasText: 'Leave your Google review' });
    await expect(link).toHaveAttribute('href', GOOGLE_REVIEW_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    await expect(form.locator('#founding-claim')).toContainText('We check it ourselves before finalising the quote');
    const name = form.locator('input[name="review_name"]');
    await expect(name).toHaveValue('');
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(false);
    await form.locator('#f-package').selectOption('engine');
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(true);
    await form.locator('#f-package').selectOption('clean');
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(false);
  });

  test('the quote form blocks the submit in the browser while a founding package is picked and the name is empty', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#quote form');
    await form.locator('#f-name').fill('Jamie Rivera');
    await form.locator('#f-phone').fill('5551234567');
    await form.locator('#f-email').fill('jamie@example.com');
    await form.locator('#f-package').selectOption('bearing');
    const name = form.locator('input[name="review_name"]');
    let requests = 0;
    page.on('request', (r) => { if (r.url().includes('/api/quote')) requests++; });
    await form.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$|\/#/);
    expect(requests).toBe(0);
    expect(await name.evaluate((el: HTMLInputElement) => el.validationMessage)).toContain('leave your Google review');
    await expect(name).toBeFocused();
    await expect(form.locator('#founding-claim')).toHaveClass(/is-required/);
    await name.fill('Jamie R.');
    expect(await name.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
    await expect(form.locator('#founding-claim')).not.toHaveClass(/is-empty/);
    // Everything typed is still there — nothing was posted, nothing was lost.
    await expect(form.locator('#f-name')).toHaveValue('Jamie Rivera');
  });

  test('checkout blocks the submit while Bearing is ticked and the name is empty, and clears once it is filled', async ({ page }) => {
    await page.goto('/checkout.html');
    await page.locator('#f-name').fill('Jamie Rivera');
    await page.locator('#f-business').fill('Rivera Roofing');
    await page.locator('#f-email').fill('jamie@example.com');
    await page.locator('#f-phone').fill('5551234567');
    const name = page.locator('input[name="review_name"]');
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(false);
    await page.locator('input[name="bearing"]').check();
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(true);
    await expect(page.locator('#founding-claim')).toHaveClass(/is-required/);
    let requests = 0;
    page.on('request', (r) => { if (r.url().includes('/api/checkout')) requests++; });
    await page.locator('button.pay').click();
    await expect(page).toHaveURL(/checkout\.html/);
    expect(requests).toBe(0);
    expect(await name.evaluate((el: HTMLInputElement) => el.validationMessage)).toContain('We check it ourselves');
    await name.fill('Jamie R.');
    expect(await name.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
    await page.locator('input[name="bearing"]').uncheck();
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(false);
  });

  test('checkout for Engine (from the guided build) requires the name for the package itself, and says so', async ({ page }) => {
    await page.goto('/checkout.html?buy=engine&s=1tc33ny5e.Rivera%20Roofing');
    await expect(page.locator('h1')).toHaveText('Engine');
    const name = page.locator('input[name="review_name"]');
    expect(await name.evaluate((el: HTMLInputElement) => el.required)).toBe(true);
    await expect(page.locator('#founding-note')).toContainText('Needed for Engine at the founding price, and for Bearing.');
    await expect(page.locator('#founding-note')).toContainText('we check it ourselves before finalising');
  });

  test('with JavaScript off the quote form still has the link and the field, and posts natively', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    const form = page.locator('#quote form');
    await expect(form).toHaveAttribute('action', '/api/quote');
    await expect(form.locator('a', { hasText: 'Leave your Google review' })).toHaveAttribute('href', GOOGLE_REVIEW_URL);
    await expect(form.locator('input[name="review_name"]')).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeVisible();
    await ctx.close();
  });
});

/* The twelve panels as an order: real toggle buttons, a sticky Continue,
   and the existing checkout carrying exactly what was clicked. */
test.describe('the twelve — a selectable order', () => {
  const TWELVE = ['A custom site', 'Brand identity', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard', 'Local SEO', 'AI intake'];
  const offer = (page: import('@playwright/test').Page, name: string) => page.locator(`.offer[data-part="${name}"]`);

  test('twelve real toggle buttons, unpressed, each named by its title and described by its line', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('#offerings-list button.offer');
    await expect(buttons).toHaveCount(12);
    expect(await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('data-part')))).toEqual(TWELVE);
    for (let i = 0; i < 12; i++) {
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'false');
      await expect(buttons.nth(i)).toHaveAttribute('type', 'button');
    }
    await expect(offer(page, 'Booking flow')).toHaveAccessibleName('Booking flow');
    await expect(offer(page, 'Booking flow')).toHaveAccessibleDescription(/pick a time themselves/);
    await expect(page.locator('#offerings-list')).toHaveClass(/is-live/);
    await expect(page.locator('#pick-continue')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/has-pick/);
  });

  test('click selects with an accent border and a check; click again deselects', async ({ page }) => {
    await page.goto('/');
    const b = offer(page, 'Payments');
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(await b.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(rgb(accent));
    expect(await b.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('""');
    expect(await b.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe(rgb(accent));
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(await b.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(rgb(accent));
    expect(await b.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
  });

  test('Enter and Space toggle from the keyboard, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const b = offer(page, 'Local SEO');
    await b.focus();
    await page.keyboard.press('Enter');
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    // Keyboard focus draws a ring: an outline with width, not "none".
    await expect(b).toBeFocused();
    const ring = await b.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    // Tab moves on to the next panel, so the twelve are one keyboard walk.
    await page.keyboard.press('Tab');
    await expect(offer(page, 'AI intake')).toBeFocused();
  });

  test('Continue appears fixed bottom-left when one is picked, counts the picks, and goes when the last is unpicked', async ({ page }) => {
    await page.goto('/');
    const go = page.locator('#pick-continue');
    await expect(go).toBeHidden();
    await offer(page, 'A custom site').click();
    await expect(go).toBeVisible();
    await expect(go).toContainText('Continue');
    await expect(page.locator('#pick-count')).toHaveText('1');
    await expect(go).toHaveAttribute('aria-label', 'Continue to checkout with 1 part — Cheap and Clean');
    expect(await go.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    const vp = page.viewportSize()!;
    const box = (await go.boundingBox())!;
    expect(box.x).toBeLessThan(vp.width / 2);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.y + box.height).toBeGreaterThan(vp.height - 80);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('body')).toHaveClass(/has-pick/);
    await offer(page, 'Booking flow').click();
    await offer(page, 'AI intake').click();
    await expect(page.locator('#pick-count')).toHaveText('3');
    await expect(go).toHaveAttribute('aria-label', 'Continue to checkout with 3 parts — Engine');
    for (const n of ['A custom site', 'Booking flow', 'AI intake']) await offer(page, n).click();
    await expect(go).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/has-pick/);
  });

  test('Continue carries the picks into the existing checkout: the package they add up to, and the parts exactly as clicked', async ({ page }) => {
    await page.goto('/');
    for (const n of ['A custom site', 'Booking flow', 'AI intake']) await offer(page, n).click();
    const go = page.locator('#pick-continue');
    await expect(go).toHaveAttribute('href', 'checkout.html?buy=engine&s=21l1e');
    await go.click();
    await expect(page).toHaveURL(/checkout\.html\?buy=engine&s=21l1e/);
    await expect(page.locator('h1')).toHaveText('Engine');
    await expect(page.locator('input[name="buy"]')).toHaveValue('engine');
    await expect(page.locator('#spec')).toHaveValue('21l1e');
    await expect(page.locator('#total')).toHaveText('$2,125.00');
    await expect(page.locator('#build-card')).toBeVisible();
    expect(await page.locator('#build-parts li').allInnerTexts()).toEqual(['A custom site', 'Booking flow']);
    await expect(page.locator('#build-extra')).toBeVisible();
    await expect(page.locator('#build-extra')).toHaveText("Not in Engine: AI intake — ask us and we'll quote it on its own.");
    await expect(page.locator('#build-answers')).toHaveText('Picked from the twelve on the homepage: A custom site, Booking flow, AI intake.');
    await expect(page.locator('#build-answers')).not.toContainText('Not sure yet');
    /* Back to the twelve, carrying the picks: landing on an empty set of
       panels would make "change it" mean "start again". */
    await expect(page.locator('.back')).toHaveAttribute('href', /^\/\?s=.+#offerings$/);
    await expect(page.locator('#build-change')).toHaveAttribute('href', /^\/\?s=.+#offerings$/);
    await expect(page.locator('input[name="bearing"]')).not.toBeChecked();
    // Engine is founding-priced, so the review name is required here.
    expect(await page.locator('input[name="review_name"]').evaluate((el: HTMLInputElement) => el.required)).toBe(true);
  });

  test('one pick that is only the site is Cheap and Clean at $600; two Beacon parts are Beacon', async ({ page }) => {
    await page.goto('/');
    await offer(page, 'A custom site').click();
    await expect(page.locator('#pick-continue')).toHaveAttribute('href', 'checkout.html?buy=clean&s=2001c');
    await offer(page, 'Brand identity').click();
    await offer(page, 'Local SEO').click();
    await expect(page.locator('#pick-continue')).toHaveAttribute('href', /buy=beacon/);
    await page.locator('#pick-continue').click();
    await expect(page.locator('h1')).toHaveText('Beacon');
    await expect(page.locator('#total')).toHaveText('$875.00');
    expect(await page.locator('#build-parts li').allInnerTexts()).toEqual(['A custom site', 'Brand identity', 'Local SEO']);
    await expect(page.locator('#build-extra')).toBeHidden();
  });

  test('with JavaScript off the twelve still read, and there is no Continue', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    const buttons = page.locator('#offerings-list .offer');
    await expect(buttons).toHaveCount(12);
    expect(await page.locator('#offerings-list .t').allInnerTexts()).toEqual(TWELVE);
    await expect(offer(page, 'Reminders')).toBeVisible();
    await expect(offer(page, 'Reminders')).toContainText('Fewer no-shows');
    await expect(page.locator('#offerings-list')).not.toHaveClass(/is-live/);
    await expect(page.locator('#pick-continue')).toBeHidden();
    await ctx.close();
  });

  test('at 390px: no horizontal scroll with three picked, every panel and Continue are 44px tap targets, and the footer is still reachable under Continue', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    for (const n of ['A custom site', 'Booking flow', 'AI intake']) await offer(page, n).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const n of TWELVE) {
      const b = (await offer(page, n).boundingBox())!;
      expect(b.height, `${n} tap target`).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeLessThanOrEqual(390);
    }
    const go = page.locator('#pick-continue');
    const gb = (await go.boundingBox())!;
    expect(gb.height).toBeGreaterThanOrEqual(44);
    expect(gb.x + gb.width).toBeLessThanOrEqual(390);
    // Scroll to the very bottom: Continue and the footer's phone link must not overlap.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const tel = (await page.locator('footer a[href="tel:+14705738908"]').boundingBox())!;
    const cb = (await go.boundingBox())!;
    const overlap = tel.y < cb.y + cb.height && tel.y + tel.height > cb.y && tel.x < cb.x + cb.width && tel.x + tel.width > cb.x;
    expect(overlap, 'Continue sits on the footer phone link').toBe(false);
    expect(tel.y + tel.height).toBeLessThanOrEqual(cb.y + 1);
  });

  test('the checkout entry on the price cards is a full-width CTA, 44px or taller', async ({ page }) => {
    await page.goto('/');
    const buy = page.locator('.pkg a', { hasText: 'Buy it now' });
    const card = page.locator('.pkg').first();
    const b = (await buy.boundingBox())!;
    const c = (await card.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThan(c.width * 0.8);
  });

  /* The homepage has one pre-existing layout shift, present on main before
     any of this: the header's brand and phone pill re-flow when Syne
     arrives (0.00003 at 1280, where the pill slides 5px; 0.22 at 390, where
     the header wraps to two rows and pushes the hero down). That is the font
     swap in .site-header and nothing else, so this test measures everything
     else: no shift may name a node outside the header, and picking three
     panels — the toggles, the fixed Continue, the reserved padding — may
     add no shift at all. */
  test('the panels and Continue add no layout shift: nothing outside the header shifts on load, nothing at all after picking three', async ({ page }) => {
    type Shift = { value: number; sources: string[]; inHeader: boolean };
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: Shift[] };
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number; sources: { node: Element | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
          if (e.hadRecentInput) continue;
          w.__shifts.push({
            value: e.value,
            sources: e.sources.map((s) => `${s.node ? `${s.node.tagName}#${s.node.id}.${s.node.className}` : '?'} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}`),
            // The header's own re-flow pushes everything under it; a shift is "the header's" if the header itself moved in it.
            inHeader: e.sources.some((s) => !!s.node && !!s.node.closest && !!s.node.closest('.site-header')),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const read = () => page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts);
    const onLoad = await read();
    const outsideHeader = onLoad.filter((s) => !s.inHeader);
    expect(outsideHeader.reduce((n, s) => n + s.value, 0), outsideHeader.map((s) => `${s.value.toFixed(4)}: ${s.sources.join(' | ')}`).join('\n')).toBe(0);

    await offer(page, 'A custom site').scrollIntoViewIfNeeded();
    for (const n of ['A custom site', 'Booking flow', 'AI intake']) await offer(page, n).click();
    await page.waitForTimeout(1000);
    const after = (await read()).slice(onLoad.length);
    expect(after.reduce((n, s) => n + s.value, 0), after.map((s) => `${s.value.toFixed(4)}: ${s.sources.join(' | ')}`).join('\n')).toBe(0);
  });
});
