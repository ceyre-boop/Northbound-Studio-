# Gumroad listing — draft, not published

Price: **$2,000** (Colin, 2026-11-05).
Demo link: **left blank until the demo project is deployed** (see README step 1).

---

## Title

The Booking Engine for trade businesses — a book-and-pay-the-deposit flow for your website

## Subtitle

Six questions, a price, and a deposit paid on Stripe. For heating and cooling, plumbing, electrical, roofing, any trade that books visits. One config file, no monthly software.

## Description

Your customers already know what's wrong. This gives them somewhere to say it at nine at night, see what the visit costs, and hold a spot with a deposit, without a phone call and without a form that goes into a void.

**What a customer sees.** Six screens, one question each: what's going on, where, how soon, when, who to ask for, confirm. Then the price, in plain words, and a button that takes them to Stripe's card page. Nothing to download, nothing to sign up for.

**What you get.** An email the moment the deposit is paid, with the job, the address, the time they asked for and the number to call. The customer gets a confirmation. Estimates and anything you'd rather quote in person take no payment and arrive as a request you confirm by phone.

**What's inside the download.**
- The booking page (one HTML file) and its script.
- `engine.config.json`: your business name, phone, hours, service area, accent colour, and every service with what's due now and the whole price. Prices are in cents. Edit this one file and the whole thing is yours.
- Four example configs: heating and cooling, plumbing, electrical, roofing. Start from the one closest to your trade.
- Two small server functions: one creates the Stripe checkout for the price in *your* config (nothing a customer types can change it), one verifies the payment with Stripe and sends the two emails.
- A thirty-minute setup guide and a plain-language licence.

**What it needs.** A free Vercel account to host it, a Stripe account for the card page, and a free Resend account for the emails. Five settings to paste in. The guide walks you through each one, including a test booking with Stripe's test card before you take real money.

**What it is not.** It is not a scheduling calendar. It takes the customer's preferred day and time window and you confirm the slot by phone, which is how most trades actually run. It stores nothing but what lands in your inbox and your Stripe dashboard.

**Honest notes.** The demo business, Summit Heating & Air, is invented, and so are the three businesses in the example configs. The prices in them are examples, not advice. This is source code you edit, not an app you install; if you'd rather have it set up for you, that's a commission at northbound-dev.com.

## Licence line (shown on the listing)

One business, yours to keep and change. Not for resale or redistribution as a template.

## Tags

trades, contractor, hvac, plumbing, electrical, roofing, booking, deposit, stripe, website template, vercel

## Cover image

A phone-width screenshot of the confirm screen ("Hold your spot." with the price and the pay button) on the accent colour. Make it from the deployed demo, not a mock.

## Files to upload

`nb-engine-trades.zip` from `bun scripts/templates.ts` in the studio repo.
