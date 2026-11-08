# The Line — Northbound's door-to-beyond playbook

Run Northbound like a grocery store: one product, the same steps every time, from first contact to repeat customer.
Market it as websites (easiest yes). Everything else Northbound does is sold later, to people already paying.

Rule: one step at a time. A step gets built only when the step before it is working.

| # | Step | Status |
|---|------|--------|
| 1 | Door | Ready (messages written) |
| 2 | Menu | Locked |
| 3 | Order | Defined; build when first client says yes |
| 4 | Kitchen | Not started (universal template) |
| 5 | Pickup | Not started |
| 6 | Beyond | Not started |

---

## 1. Door — 20 messages a day

- Sell to small businesses anywhere; Northbound is online.
- Find them: Google Maps → "[business type] [city]". Keep listings with no website, a site that breaks on a phone, or one that looks 10+ years old.
- Write down the single worst problem for each. That problem goes in the message (it replaces the mockup until the template exists).
- Send by hand. No automated DMs: LinkedIn, Instagram and Facebook ban accounts for it. Automate the prep later, only after the manual reply rate is known.

### Email (Gmail — saved as a draft template)

Subject: Quick fix for {Business}'s website

> Hi {Name},
>
> I was looking up {Business} and noticed {specific problem, e.g. the site doesn't fit on a phone screen / no website shows up on Google}. Most people find businesses on their phone now, so that's likely costing you calls.
>
> I build websites for small businesses: live in 7 days, $500, plus $49/month that covers hosting and any small changes. You send me your info, I handle everything else.
>
> Want me to show you what your new homepage could look like? No charge, no call needed.
>
> Colin Eyre
> Northbound Studio | northbound-dev.com
> {your mailing address}
>
> If you're not interested, just reply "no thanks" and I won't follow up.

Keep the mailing address and the opt-out line: US law requires both in cold sales email.

### DM (social media)

> Hi! I came across {Business} and noticed {specific problem}. I build small-business websites: live in 7 days, $500 + $49/mo for hosting and edits. Want to see what yours could look like? No charge. – Colin, Northbound Studio

---

## 2. Menu — one item, no custom quotes

**The Northbound Site — $500, live in 7 days or $100 off**
- $250 to start, $250 at launch
- Up to 5 pages, built from the universal template
- Fast and phone-ready
- Domain connected (or help buying one)
- Contact form and click-to-call
- One round of edits before launch

**Care plan — $49/mo**
- Hosting, security, updates
- Small edits, up to 30 minutes a month
- Cancel anytime with 30 days' notice; client keeps their words and photos

**Not on the menu (upsells later):** online stores, booking systems, logo design, extra pages.

**Price ladder:** clients 1–3 at $500 → 4–6 at $750 → 7–10 at $1,000 → then raise 20% whenever 2 of 3 quotes close; step back a rung when fewer than 1 in 4 close.

---

## 3. Order — a yes becomes a paid order and a filled-in intake sheet

### Flow
1. They say yes → send the Stripe Payment Link: "Northbound Site, deposit, $250."
2. Stripe's after-payment setting redirects them straight to the intake form.
3. The form lands in the inbox. **The 7-day clock starts when the form is complete, not at payment** — protects the guarantee from slow photo senders.
4. Launch day → second link: $250 balance + $49/mo subscription starting that day.

No secret Stripe key is needed: Payment Links are plain URLs.

### Intake form (Tally — free, allows photo uploads)
1. Business name and your name
2. Phone, email, address (or "online only")
3. What should visitors do? Call / Book / Order / Get a quote / Visit
4. In one sentence: what you do and who it's for
5. Your 3–6 main services or products, one line each
6. Three reasons customers pick you (years in business, licensed, family-owned, etc.)
7. Hours and the area you serve
8. Logo and 5–15 photos (upload)
9. Links to your Google reviews and social accounts
10. Do you own a domain? If yes, which; if no, want help buying one?

Every answer fills a blank in the template: Q3 → the button, Q5 → service cards, Q6 → trust strip, Q8 → gallery. That is what makes step 4 repeatable.

### To do (Colin — accounts)
- [ ] Create the Tally form with the 10 questions
- [ ] Create the Stripe Payment Link ($250 deposit) with after-payment redirect to the Tally form
- [ ] Hand both URLs back to wire the "Start your site" button into the site

---

## 4. Kitchen — the universal template (not started)

One template for every small business; only the words, photos and button label change per client.

Homepage sections (swap in italics):
1. Top bar — logo, phone, one action button (*button label*)
2. Hero — headline, real photo, action button (*headline, photo*)
3. Trust strip — 3–4 quick facts (*from intake Q6*)
4. What we do — 3–6 cards (*from intake Q5*)
5. Gallery (*intake Q8*)
6. Reviews — real Google reviews only
7. How it works — 3 steps (*per business*)
8. Find us — hours, map, area (*optional; online-only businesses swap for Shop/Contact*)
9. Final action — button + short contact form
10. Footer — contact, socials

Target: 2–3 hours of Colin's time per site.

## 5. Pickup (not started)
Day 7: live link, a one-minute video walkthrough, one round of edits.

## 6. Beyond (not started)
- $49/mo care plan covers hosting and small edits
- Day 30: ask for a Google review and one referral
- Day 45–60: offer one other Northbound service to clients already paying
