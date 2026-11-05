/* tests/engine-trades.spec.ts — the booking engine's page, driven.
 *
 * Served from this repo's root at /engines/trades/, where there is no api/, so
 * the final post is intercepted and its body inspected: the browser sends
 * the answers and nothing about price. The price on the last screen is read
 * against engine.config.json. No-JS gets the plain form. No sideways scroll,
 * no console errors.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Playwright runs under Node, where import.meta.dir does not exist; a URL does.
const cfg = JSON.parse(readFileSync(new URL('../engines/trades/engine.config.json', import.meta.url), 'utf8'));
const PAGE = '/engines/trades/index.html'; // not `URL`: that shadows the global class used two lines up
const money = (c: number) => `$${(c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

async function fresh(page: Page) {
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#step-label')).toHaveText('Step 1 of 6');
}
async function walk(page: Page, service: string, urgency: string) {
  await page.locator(`#panel [data-value="${service}"]`).click();
  await page.locator('#panel [data-nav="next"]').click();
  await page.locator('#panel [data-value="House"]').click();
  await page.fill('#f-address', '12 Example St');
  await page.locator('#panel [data-nav="next"]').click();
  await page.locator(`#panel [data-value="${urgency}"]`).click();
  await page.locator('#panel [data-nav="next"]').click();
  await page.fill('#f-day', 'Tuesday');
  await page.locator(`#panel [data-value="${cfg.windows[0]}"]`).click();
  await page.locator('#panel [data-nav="next"]').click();
  await page.fill('#f-name', 'Pat Lee');
  await page.fill('#f-phone', '5550100');
  await page.fill('#f-email', 'pat@example.com');
  await page.locator('#panel [data-nav="next"]').click();
  await expect(page.locator('#step-label')).toHaveText('Step 6 of 6');
}

test.describe('the booking engine', () => {
  test('the page wears the config: name, phone, headline', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#brand')).toHaveText(cfg.business.name);
    await expect(page.locator('#call')).toHaveAttribute('href', cfg.business.phoneHref);
    await expect(page).toHaveTitle(`Book a visit — ${cfg.business.name}`);
  });

  test('Next waits for an answer, and every service in the config is on step 1', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#panel [data-nav="next"]')).toBeDisabled();
    for (const s of cfg.services) await expect(page.locator(`#panel [data-value="${s.key}"]`)).toBeVisible();
  });

  test('a diagnostic today shows the config price plus the after-hours fee, and posts only the answers', async ({ page }) => {
    await fresh(page);
    await walk(page, 'ac-repair', 'today');
    const ac = cfg.services.find((s: { key: string }) => s.key === 'ac-repair');
    await expect(page.locator('#due')).toHaveText(money(ac.due + cfg.afterHours.cents));
    await expect(page.locator('#go')).toContainText(money(ac.due + cfg.afterHours.cents));
    let sent: Record<string, unknown> | null = null;
    await page.route('**/engines/trades/api/book', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: '/engines/trades/booked.html' }) });
    });
    await page.locator('#go').click();
    await expect(page).toHaveURL(/booked\.html$/);
    expect(sent).toMatchObject({ service: 'ac-repair', urgency: 'today', name: 'Pat Lee', phone: '5550100' });
    expect(Object.keys(sent!)).not.toContain('due');
    expect(Object.keys(sent!)).not.toContain('total');
  });

  test('an estimate shows nothing to pay and asks to request the visit', async ({ page }) => {
    await fresh(page);
    await walk(page, 'install', 'flexible');
    await expect(page.locator('#due')).toHaveText('Nothing to pay now');
    await expect(page.locator('#go')).toHaveText('Request my visit');
  });

  test('a refused post keeps the customer on the page with the phone number', async ({ page }) => {
    await fresh(page);
    await walk(page, 'tune-up', 'week');
    await page.route('**/engines/trades/api/book', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Not configured' }) }));
    await page.locator('#go').click();
    await expect(page.locator('#status')).toContainText(cfg.business.phone);
    await expect(page.locator('#go')).toBeEnabled();
  });

  test('answers survive a reload', async ({ page }) => {
    await fresh(page);
    await page.locator('#panel [data-value="heat-repair"]').click();
    await page.locator('#panel [data-nav="next"]').click();
    await page.reload();
    await expect(page.locator('#step-label')).toHaveText('Step 2 of 6');
  });

  test('without JavaScript the plain request form is what you get', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await expect(page.locator('#flow')).toBeHidden();
    const form = page.locator('#plain form');
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('action', 'api/book');
    await expect(form.locator('input[name="phone"]')).toHaveAttribute('required', '');
    await ctx.close();
  });

  test('no horizontal scroll at 390 on any step, zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 390, height: 844 });
    await fresh(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await walk(page, 'duct-cleaning', 'week');
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
