# Northbound templates — read me first

You have the source of one of the studio's concept builds, as it runs on
northbound-dev.com. Both are Astro 5 sites deployed on Vercel, with all the
words, prices and hours in one JSON file. Nothing here needs a page builder,
a database or a monthly plugin.

`NORTHBOUND.txt` in this folder says which template this is and which commit
it was built from.

| Template | What it is | The one file to edit | Needs |
|---|---|---|---|
| **Atlas** | A trades or home-services site built around one job: booking the call. Home, services (one page per service), service area, about, financing, book. A storm banner you can switch on, a sticky call bar on phones, and a booking form that posts to a server route, which logs the booking before it sends it anywhere so a dead mail service never loses a lead. | `src/content/content.json` | A JSON mail endpoint (`FORM_ENDPOINT`) |
| **Vector** | A small shop with real card checkout. Home, shop, one page per product, a story page, an order page. The cart lives in the browser and survives a refresh; prices are re-derived on the server from the catalogue, so a tampered cart cannot pay less; a webhook verifies each paid order with Stripe. | `src/content/content.json` | A Stripe account (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) |

## Thirty minutes to your own site

1. **Install Bun** (bun.sh) or Node 20+. Then, in this folder:
   `bun install` and `bun run dev`. The site is at the address it prints.
2. **Make it yours.** Open `src/content/content.json`. Business name, phone,
   hours, services or products, the about text: it is all there, and the site
   rebuilds as you save. Replace the images in `public/`.
3. **Take the demo label off.** Every page carries a bar that says the
   business is fictional, because on our site it is. In
   `src/layouts/Base.astro`, delete the `<FictionBar … />` line and its
   import. Then delete `src/components/FictionBar.astro`.
4. **Serve from the root.** The demo lived at `/demos/<name>`. In
   `astro.config.mjs`, set `base: '/'` (or remove the `base` line).
5. **Let search engines in.** The demo told them to stay out. In
   `vercel.json`, delete the `X-Robots-Tag: noindex` header.
6. **Deploy.** Push this folder to a Git repository, import it at vercel.com
   (the free tier is enough), add the environment variables below, deploy.
   Point your domain at it in the Vercel dashboard.

### Atlas: the booking form

The form posts to `src/pages/api/book.ts`, which logs the booking, then
forwards it as JSON to `FORM_ENDPOINT`. Any service that accepts a JSON POST
works: a Formspree form id, a Zapier or Make webhook, your own endpoint. Set
`FORM_ENDPOINT` in the Vercel project's environment variables. Until it is
set, the route answers 503 and every booking is still in the function log.

### Vector: Stripe

1. In Stripe, copy a secret key into `STRIPE_SECRET_KEY`.
2. `src/pages/api/checkout.ts` refuses any key that is not a test key. That
   guard is there because the demo invites strangers to pay. When you are
   ready to take real money, delete the `sk_test_` check (it is one `if`,
   commented) and use your live key.
3. Add a webhook endpoint in Stripe pointing at `https://your-site/api/webhook`
   for the `checkout.session.completed` event, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
4. Prices are in cents in `content.json` (`1800` is $18.00). Variants and
   their upcharges are next to each product.

## What this is not

It is not a page builder. You edit a text file and push to Git. If that is
not for you, the studio builds it for you: northbound-dev.com, "Start your
build".

## Help

A question about setup: hello@northbound-dev.com. Changing the build for you
is a commission, not support, and the site says what those cost.

License: LICENSE.md, in this folder. Short version: one business, yours to
keep and change, not yours to resell.
