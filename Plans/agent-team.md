# Northbound Agent Team

Northbound runs on AI agents. Colin is the CEO: he makes small corrections, approves with one tap, and personally does only new or experimental work (post automation, videos).

Every agent follows **The Line** (`Plans/the-line.md`): door → menu → order → kitchen → pickup → beyond.

---

## The CEO (Colin)

**Does himself:** new and experimental work only (post automation, the story videos, new products).

**Approves with one tap** (each one lands on the Molly dashboard Needs list):
1. A new outreach template, before its first send
2. Each client site, before it goes live
3. Anything off the menu: custom requests, discounts, refunds
4. Social DMs, which agents draft and Colin taps to send (see Hard rules)

**Never has to:** find leads, write emails, answer FAQs, chase intake forms, build sites, test them, launch them, host them, or send invoices.

---

## The team

| # | Agent | Line step | Handles | Hands off to |
|---|---|---|---|---|
| 0 | **Chief of Staff** | All | Runs the pipeline, routes work, digest, escalations | Everyone |
| 1 | **Scout** | Door | Finds and verifies leads, spots each site's worst problem | Outreach |
| 2 | **Outreach** | Door | Sends first emails and follow-ups, handles opt-outs | Closer |
| 3 | **Closer** | Order | Answers replies, sends the deposit link and intake form | Intake |
| 4 | **Intake** | Order | Checks forms, chases missing items, starts the 7-day clock | Builder |
| 5 | **Builder** | Kitchen | Builds the site from the universal template | QA |
| 6 | **QA** | Kitchen | Tests everything and blocks launch if anything fails | Launch |
| 7 | **Launch** | Pickup | Preview, one edit round, domain, balance plus subscription, handover | Care |
| 8 | **Care** | Beyond | Hosting, uptime, monthly edits, failed payments | Growth |
| 9 | **Growth** | Beyond | Reviews, referrals, upsells | Closer |
| 10 | **Books** | All | Revenue tracking, MRR, tax set-aside (read-only) | Chief of Staff |

---

## 0. Chief of Staff

The manager. It never does client work itself.

- Keeps one pipeline record per lead or client, with its stage on The Line and who has it.
- Moves work between agents and reruns any agent that fails or stalls.
- Watches the guarantee: alerts if any build is 2 days from its 7-day deadline.
- Sends the 9:30pm digest to Colin: sent, replies, deposits, sites in build, launches, MRR, and anything stuck.
- Puts every approval on the Molly Needs list (max 6). Items over 3 days go to the top of the digest; over 7 days, it takes the safe default (don't send, don't launch) and reports it.
- Weekly scoreboard, counting outcomes only: emails sent, replies, deposits, launches, MRR, churn.

## 1. Scout

- Searches Google Maps and directories for small businesses anywhere.
- Keeps only leads verified from a public source, with a real business email or contact.
- Scores each website: no site, breaks on a phone, outdated, slow, broken form.
- Writes down the single worst problem in one line. That's the hook for the email.
- Removes duplicates, past clients, opt-outs, and anyone contacted in the last 90 days.
- Output: a daily list of 20 qualified leads, each with its problem.

## 2. Outreach

- Fills the approved email template with each lead's name and problem.
- Sends from `ceyre@northbound-dev.com` only, capped per day (start at 10, raise once deliverability is proven).
- Follow-ups on day 4 and day 10, then stops.
- Every email includes the postal address and opt-out line. Opt-outs are honored immediately and permanently.
- **Social DMs: draft only.** It writes them and queues them for Colin to tap send, because automated DMs get accounts banned.
- Watches bounce and spam rates and pauses itself if they spike.

## 3. Closer

- Reads every reply and sorts it: interested, question, not now, no, angry.
- Answers questions only from the menu (price, timeline, what's included, care plan). Never invents terms.
- "Show me what it'd look like" → asks Builder for a free one-page homepage preview from the lead's public info, then sends it.
- "Yes" → sends the $250 Stripe deposit link, which redirects to the Tally intake form.
- Anything off the menu (custom features, discounts, phone calls) → escalates to Colin.
- "No" or "not now" → logs it; Growth can recheck in 90 days.

## 4. Intake

- Triggers when the deposit and intake form are both in.
- Checks all 10 answers. Missing photos or logo → chases the client (day 1, 2, 4).
- **Starts the 7-day clock only when the form is complete.**
- Turns the answers into one client file (`client.json`) that maps directly to the template's blanks.
- Opens the project and hands it to Builder.

## 5. Builder

- Builds from the universal template only, with no custom code on the menu product.
- Fills every section from `client.json`: button, hero, trust strip, services, gallery, reviews, how it works, find us, contact.
- Writes the copy in the client's voice, using only their facts. No invented reviews, numbers, or awards.
- Optimizes and resizes the photos and logo.
- Deploys a private preview link.
- Target: preview ready by day 3.

## 6. QA

Nothing launches until every check passes.

- Phone and desktop layouts
- Speed (Lighthouse)
- Every link works
- **The contact form actually delivers.** It sends a real test message and confirms it landed (Northbound's own form once silently didn't).
- Click-to-call works
- No placeholder text left
- Every claim on the page traces back to the intake form
- Fails → back to Builder with the exact problem. Passes → to Launch.

## 7. Launch

- Sends the client the preview and collects their one round of edits, which Builder applies and QA rechecks.
- **Queues the final site for Colin's one-tap approval.**
- Connects the domain (or walks the client through buying one), SSL included.
- Goes live, then sends the $250 balance link plus the $49/mo subscription.
- Handover email: live link, a one-minute walkthrough video, and how to request edits.
- Late against the 7-day promise → applies the $100 off automatically and tells the client.

## 8. Care

- Hosting, SSL renewals, backups, and uptime checks every few minutes.
- Site down → fixes or rolls back, then tells the client. Escalates to Colin only if it's down more than an hour.
- Edit requests by email → handles anything under 30 minutes a month; bigger asks go to Closer as an upsell.
- Failed $49 payment → reminder emails on days 1, 3, and 7. Unpaid at 30 days → escalates before anything is shut off.
- Cancellations → hands the client their words and photos, as promised.

## 9. Growth

- Day 30: asks for a Google review and one referral.
- Day 45–60: offers one other Northbound service (automations, booking, store).
- Referrals → straight to Closer as warm leads.
- Tracks churn and the reasons clients give.
- Runs the price ladder: tells Colin when it's time to raise prices (2 of 3 quotes closing).

## 10. Books

- Read-only on Stripe: reconciles deposits, balances, and subscriptions.
- Tracks revenue, MRR, churn, and the cost to deliver each site (AI and hosting spend).
- Monthly summary, and a running tax set-aside amount.
- **Never moves money.** Refunds are Colin's tap.

---

## Hard rules for every agent

- **Never move money.** Agents send payment links only. Refunds and discounts are Colin's call.
- **No fake anything.** No invented results, reviews, testimonials, or performance numbers, on client sites or on Northbound's.
- **Leads must be verified from a public source.** Every cold email has the postal address and opt-out line; opt-outs are honored forever.
- **No automated social DMs.** Drafts only.
- **Nothing goes live without QA passing and Colin's tap.**
- **No secrets in chat or code.** Keys live in hosting settings and `.env`.
- **Nothing gets deleted.** Archive, don't delete.
- **Stay on the menu.** Anything else escalates.

---

## Build order: one agent at a time

Each agent goes live and works for real before the next one gets built. Order follows the money.

| # | Build | Live when |
|---|---|---|
| 1 | Scout | 20 real, verified leads a day show up in a list |
| 2 | Outreach | It sends with caps, follow-ups and opt-outs working, and the bounce rate is low |
| 3 | Closer | It answers a real reply correctly and sends the deposit link |
| 4 | Intake | One real form gets checked and becomes `client.json` |
| 5 | Builder + QA | The universal template exists, and one site builds and passes every check |
| 6 | Launch | First client goes live and pays the balance |
| 7 | Care | First site monitored for a month, with one edit handled |
| 8 | Chief of Staff | The digest and Needs list cover everything above |
| 9 | Growth | First review or referral asked for |
| 10 | Books | First month reconciled |

Until an agent exists, Colin (or chat) does that step by hand, the way The Line describes.
