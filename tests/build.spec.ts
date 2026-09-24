/* The guided build — build.html.
 *
 * One spec per bullet of the plan's verification section: every step
 * advances and goes back; the multi-select minimum; the spec sheet is right
 * for three named answer paths; localStorage restore; URL restore; Reserve
 * carries the spec into checkout; no-JS shows the plain form; no horizontal
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

  test('the price never appears before the worth question is answered', async ({ page }) => {
    await fresh(page);
    for (let i = 0; i < 3; i++) {
      const text = await page.locator('#panel, #say').allInnerTexts();
      expect(text.join(' ')).not.toMatch(/\$\d/);
      await answer(page, ROOFER[i]);
      await page.locator('#panel [data-nav="next"]').click();
    }
    await expect(page.locator('#step-label')).toHaveText('Step 4 of 8');
    expect((await page.locator('#panel').innerText())).not.toMatch(/\$4,250|\$1,750|\$600/);
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

test.describe('guided build — the spec sheet', () => {
  test('roofer: Engine, Bearing, the parts, the payback in jobs, $2,125 now and $2,125 on delivery', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const sheet = page.locator('#panel');
    await expect(sheet.locator('.pkg-opt[aria-pressed="true"]')).toContainText('Engine');
    await expect(sheet.locator('.pkg-opt[data-pkg="engine"] em')).toHaveText('Our pick from your answers');
    await expect(sheet.locator('.price').first()).toContainText('$4,250');
    await expect(sheet.locator('.price .was').first()).toHaveText('$8,500');
    const parts = await sheet.locator('.parts .t').allInnerTexts();
    expect(parts).toEqual(['A custom site', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests']);
    await expect(sheet).toContainText('Keeping it running');
    await expect(sheet).toContainText('$300/mo');
    await expect(sheet.locator('.payback')).toHaveText('At $1,000–$5,000 a job, this build is between 1 and 5 new jobs.');
    await expect(sheet).toContainText('$2,125 now, $2,125 on delivery.');
    await expect(sheet).toContainText('50% up front, always. No deposit, no work.');
    await expect(sheet.locator('#reserve')).toHaveText('Reserve my build — $2,125 now');
    await expect(sheet).toContainText('Your build for Rivera Roofing');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/spots? (left|remaining)|hurry|countdown|hours left|ends (today|soon)/i);
  });

  test('café: Beacon, Review requests flagged as not included, payback in orders, $875 now and $875 on delivery', async ({ page }) => {
    await fresh(page);
    await walk(page, CAFE);
    const sheet = page.locator('#panel');
    await expect(sheet.locator('.pkg-opt[aria-pressed="true"]')).toContainText('Beacon');
    await expect(sheet.locator('.price').first()).toContainText('$1,750');
    const parts = await sheet.locator('.parts .t').allInnerTexts();
    expect(parts).toEqual(['A custom site', 'Brand identity', 'Local SEO']);
    await expect(sheet).toContainText('Not in Beacon: Review requests');
    await expect(sheet).not.toContainText('Keeping it running');
    await expect(sheet.locator('.payback')).toHaveText('At $200–$1,000 an order, this build is between 2 and 9 new orders.');
    await expect(sheet).toContainText('$875 now, $875 on delivery.');
    await expect(sheet.locator('#reserve')).toHaveText('Reserve my build — $875 now');
  });

  test('shop, not sure what it wants: Cheap and Clean, $600 in full, payback at under $200', async ({ page }) => {
    await fresh(page);
    await walk(page, SHOP);
    const sheet = page.locator('#panel');
    await expect(sheet.locator('.pkg-opt[aria-pressed="true"]')).toContainText('Cheap and Clean');
    await expect(sheet.locator('.price').first()).toContainText('$600');
    await expect(sheet.locator('.price .was')).toHaveCount(0);
    expect(await sheet.locator('.parts .t').allInnerTexts()).toEqual(['A custom site']);
    await expect(sheet.locator('.payback')).toHaveText('At under $200 a customer, this build is at least 4 new customers.');
    await expect(sheet).toContainText('$600 in full');
    await expect(sheet).toContainText('you picked Dark');
    await expect(sheet.locator('#reserve')).toHaveAttribute('href', /checkout\.html\?buy=clean&s=/);
  });

  test('the customer can overrule the package, and the sheet says what falls out', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    await page.locator('.pkg-opt[data-pkg="beacon"]').click();
    const sheet = page.locator('#panel');
    await expect(sheet.locator('.pkg-opt[aria-pressed="true"]')).toContainText('Beacon');
    await expect(sheet).toContainText('Not in Beacon: Booking flow, Quote flow');
    await expect(sheet).toContainText('Engine includes them');
    await expect(sheet.locator('#reserve')).toHaveText('Reserve my build — $875 now');
    await expect(sheet.locator('#reserve')).toHaveAttribute('href', /buy=beacon/);
  });

  test('"not sure" on worth gives no payback line and no invented number', async ({ page }) => {
    await fresh(page);
    await walk(page, [ROOFER[0], ROOFER[1], ROOFER[2], { value: '_' }, ROOFER[4], ROOFER[5], ROOFER[6]]);
    await expect(page.locator('.payback')).toHaveText("Tell us what one customer is worth and we'll do the arithmetic here.");
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

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link);
    await expect(other.locator('#step-label')).toHaveText('Step 8 of 8');
    await expect(other.locator('#panel')).toContainText('Restored from your link');
    await expect(other.locator('#panel')).toContainText('Your build for Rivera Roofing');
    await expect(other.locator('.pkg-opt[aria-pressed="true"]')).toContainText('Engine');
    await expect(other.locator('.payback')).toHaveText('At $1,000–$5,000 a job, this build is between 1 and 5 new jobs.');
    await expect(other.locator('#phone')).toHaveAttribute('data-look', 'industrial');
    await expect(other.locator('#phone [data-p="brand"]')).toHaveText('Rivera Roofing');
    // The query is consumed, so a reload does not clobber later edits.
    expect(new URL(other.url()).search).toBe('');
    await other.locator('#panel [data-nav="back"]').click();
    await expect(other.locator('#panel [data-value="industrial"]')).toHaveAttribute('aria-pressed', 'true');
    await ctx.close();
  });

  test('a link that cannot be read falls back to a fresh step 1', async ({ page }) => {
    await page.goto('/build.html?s=garbage');
    await expect(page.locator('#step-label')).toHaveText('Step 1 of 8');
  });
});

test.describe('guided build — into checkout', () => {
  test('Reserve carries the package and the spec into checkout, priced as the deposit', async ({ page }) => {
    await fresh(page);
    await walk(page, ROOFER);
    const href = await page.locator('#reserve').getAttribute('href');
    expect(href).toMatch(/^checkout\.html\?buy=engine&s=1tc33ny5/);
    await page.locator('#reserve').click();
    await expect(page).toHaveURL(/checkout\.html\?buy=engine/);
    await expect(page.locator('h1')).toHaveText('Engine');
    await expect(page.locator('input[name="buy"]')).toHaveValue('engine');
    await expect(page.locator('#spec')).toHaveValue(/^1tc33ny5e\.Rivera/);
    await expect(page.locator('#total')).toHaveText('$2,125.00');
    await expect(page.locator('#balance-row')).toBeVisible();
    await expect(page.locator('#balance')).toHaveText('$2,125.00');
    await expect(page.locator('#build-card')).toBeVisible();
    expect(await page.locator('#build-parts li').allInnerTexts()).toContain('Booking flow');
    await expect(page.locator('input[name="bearing"]')).toBeChecked();
    await expect(page.locator('#monthly')).toHaveText('$300.00');
    await expect(page.locator('input[name="care"]')).toBeHidden();
    await expect(page.locator('body')).toContainText('$2,125 now, $2,125 on delivery. 50% up front, always. No deposit, no work.');
    await expect(page.locator('.back')).toHaveAttribute('href', /build\.html\?s=/);
  });

  test('a Cheap and Clean build reaches checkout as the whole $600, no balance row', async ({ page }) => {
    await fresh(page);
    await walk(page, SHOP);
    await page.locator('#reserve').click();
    await expect(page).toHaveURL(/checkout\.html\?buy=clean/);
    await expect(page.locator('h1')).toHaveText('Cheap and Clean');
    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#balance-row')).toBeHidden();
    await expect(page.locator('input[name="care"]')).toBeVisible();
    await expect(page.locator('#build-card')).toBeVisible();
    await expect(page.locator('input[name="bearing"]')).not.toBeChecked();
  });

  test('checkout without a spec is exactly what it was', async ({ page }) => {
    await page.goto('/checkout.html');
    await expect(page.locator('h1')).toHaveText('Cheap and Clean');
    await expect(page.locator('#build-card')).toBeHidden();
    await expect(page.locator('#spec')).toHaveValue('');
    await expect(page.locator('#total')).toHaveText('$600.00');
    await expect(page.locator('#balance-row')).toBeHidden();
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
    await expect(form.locator('select[name="package"] option')).toHaveCount(5);
    await expect(form.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('header a[href="tel:+14705738908"]')).toBeVisible();
    await expect(page.locator('footer a[href="tel:+14705738908"]')).toBeVisible();
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
    await page.locator('#email-toggle').click();
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

  test('the homepage sends every quote CTA here', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero a.btn-primary')).toHaveAttribute('href', 'build.html');
    await expect(page.locator('a', { hasText: 'Get a quote for Beacon' })).toHaveAttribute('href', 'build.html');
    await expect(page.locator('a', { hasText: 'Get a quote for Engine' })).toHaveAttribute('href', 'build.html');
    await expect(page.locator('#quote form')).toHaveCount(1);
  });
});
