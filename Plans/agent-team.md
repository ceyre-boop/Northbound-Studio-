# Northbound Agent Team

Three agents. Each one owns a field, and each field has three jobs.
Every job is a fixed recipe: the same trigger, the same steps, and the same output every time. No improvising.

Colin is the CEO. He taps approvals on the Molly Needs list and personally does only new or experimental work (post automation, videos).

| Agent | Field | Jobs |
|---|---|---|
| **Sales** | Getting customers | Find, Reach, Close |
| **Kitchen** | Making the product | Intake, Build + Test, Launch |
| **Care** | Keeping customers | Keep Running, Grow, Report |

Work moves Sales → Kitchen → Care, recorded in one shared pipeline file (one row per lead or client, with its stage).

---

## Agent 1: Sales

### Job 1: Find (every morning)
1. Search Google Maps for "[business type] [city]", rotating types and cities.
2. Keep only businesses with a public contact, and a website that's missing, breaks on a phone, or is outdated.
3. Write their single worst website problem in one line.
4. Drop duplicates, opt-outs, past clients, and anyone contacted in the last 90 days.
- **Output:** 20 leads added to the pipeline.

### Job 2: Reach (after Find)
1. Fill the approved email template with the business name and its problem.
2. Send from `ceyre@northbound-dev.com`, within the daily cap (start at 10).
3. Follow up on day 4 and day 10, then stop.
4. Every email has the postal address and opt-out line. Opt-outs are permanent.
5. Social DMs are drafted only, and Colin taps send.
- **Output:** sends logged; bounces and opt-outs handled. Pauses itself if spam complaints spike.

### Job 3: Close (whenever a reply comes in)
1. Sort the reply: yes / question / wants a preview / not now / no.
2. Question → answer from the menu only.
3. Wants a preview → Kitchen builds a free homepage preview from their public info, and Sales sends it.
4. Yes → send the $250 deposit link (it redirects to the intake form).
5. Not now → recheck in 90 days. No → stop.
6. Anything off the menu → Colin's Needs list.
- **Output:** a deposit paid moves the client to Kitchen.

---

## Agent 2: Kitchen

### Job 1: Intake (when the deposit and form are in)
1. Check all 10 intake answers.
2. Missing anything → ask the client on day 1, 2 and 4.
3. Form complete → **start the 7-day clock**.
4. Turn the answers into `client.json`, which maps to the template's blanks.
- **Output:** a client file ready to build.

### Job 2: Build + Test (day 1–3)
1. Fill the universal template from `client.json`. No custom code.
2. Write the copy from the client's facts only, with nothing invented.
3. Prepare the photos and logo, then deploy a private preview.
4. Run the test checklist: phone and desktop layouts, speed, every link, click-to-call, no placeholder text, and **the contact form sends a real test message that arrives**.
5. Any check fails → fix it and test again. Nothing moves on until every check passes.
- **Output:** a tested preview link.

### Job 3: Launch (day 4–7)
1. Send the client the preview; apply their one round of edits; re-run the tests.
2. **Queue the site for Colin's one-tap go-live approval.**
3. Connect the domain and SSL, then go live.
4. Send the $250 balance link plus the $49/mo subscription, and the handover email (live link, walkthrough video, how to request edits).
5. Past day 7 → apply the $100 off automatically and tell the client.
- **Output:** a live, paid site, handed to Care.

---

## Agent 3: Care

### Job 1: Keep Running (always on)
1. Uptime check every few minutes, backups, SSL renewals.
2. Site down → roll back or fix, then tell the client. Escalate to Colin after an hour.
3. Edit requests → do anything under 30 minutes a month; bigger asks go to Sales as an upsell.
4. Failed $49 payment → reminders on day 1, 3 and 7; escalate at 30 days.
- **Output:** every site up and every edit done.

### Job 2: Grow (by client age)
1. Day 30 → ask for a Google review and one referral.
2. Day 45–60 → offer one other Northbound service.
3. Referrals go to Sales as warm leads.
4. When 2 of 3 quotes are closing → tell Colin it's time for the next price rung.
- **Output:** reviews, referrals and upsells logged.

### Job 3: Report (9:30pm daily, plus Sunday)
1. Read the pipeline and Stripe (read-only).
2. Nightly digest to Colin: sent, replies, deposits, sites in build, launches, MRR, and anything stuck.
3. Flag any build 2 days from its 7-day deadline.
4. Sunday scoreboard (outcomes only), plus the monthly revenue and tax set-aside.
- **Output:** one message. Colin reads it in under a minute.

---

## Colin's one-tap approvals (Molly Needs list)
1. A new email template, before its first send
2. Each site, before it goes live
3. Anything off the menu: custom work, discounts, refunds
4. Social DMs

Items over 3 days old go to the top of the digest. Over 7 days, the agent takes the safe default (don't send, don't launch) and reports it.

## Hard rules
- **Never move money.** Agents send payment links only.
- **Nothing fake:** no invented reviews, results, or numbers.
- **Verified leads only.** Postal address and opt-out line in every email; opt-outs are permanent.
- **No automated social DMs.**
- **Nothing goes live** without the tests passing and Colin's tap.
- **No secrets in chat or code. Nothing gets deleted.**

## Build order: one agent at a time
1. **Sales.** Live when real leads come in daily, emails send, and a reply gets the deposit link.
2. **Kitchen.** Live when the universal template exists and one real site launches.
3. **Care.** Live when the first site has run a month, with one edit and one digest done.

Until an agent is live, its jobs are done by hand, the way `Plans/the-line.md` describes.
