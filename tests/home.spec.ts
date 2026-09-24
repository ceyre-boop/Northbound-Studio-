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
