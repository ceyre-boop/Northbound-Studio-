# Northbound: Settled Decisions

Colin answered every one of these in the 2026-11-21 planning session. **They are final. Do not ask Colin about any of them again.** Ask only about things this file doesn't cover.

If this file conflicts with any other plan, **this file wins.** Detail lives in `agent-team.md`, `pricing-engine.md`, `dashboard.md` and `the-line.md`.

## Business
1. Colin is the CEO. Agents run the business **fully automatically**: no approval taps, and Colin corrects afterward. He personally does only new or experimental work (new automations, post automation, videos).
2. **Automations are the main product, and websites are the side offer.** Cold emails, the site and the reels lead with automations; websites come second.
3. We sell to any small business anywhere, online.
4. The portfolio shows client work **without names** ("a roofing company"), with real measured results only.

## The team: 3 agents + 1 button, woken by real client actions (not schedules)
5. **Buddy** is the only voice clients hear. Woken by a paid deposit, a client email or reply, an edit request, or another agent finishing.
6. **Site Builder** is the coder for everything, including northbound-dev.com. It ships without asking, but **never changes the brand** (logo, Buddy's design, core look).
7. **Automation Builder** builds a fix for every bottleneck Buddy logs, and turns repeat fixes into products. It doesn't wait for Colin.
8. **Lead button:** cold outreach runs only when Colin presses it.
9. Agents **message each other directly.** Every message is also copied into that client's file.
10. They escalate to Colin only after **3 rounds** of not agreeing among themselves.

## Buddy
11. Signs every email **"Buddy from Northbound"** without saying it's an AI. **If a client asks directly, it answers honestly.**
12. Voice: **upbeat robot**. Eager, a little playful, still professional, and a great communicator.
13. Sends from and reads **`ceyre@northbound-dev.com`**.
14. Built fresh. Genie is a reference only.
15. Replies **within minutes** while the Mac is on.
16. Handles **every** email itself: angry clients, refunds, cancellations, legal threats. On a legal threat it stays calm, admits no fault, and makes no legal promises. Every hard email is flagged on the dashboard.
17. Onboarding starts the moment a deposit is paid, and the conversation continues until all the info is in.
18. After launch it stays in contact: check-ins, reviews and referrals, upsells, and **asking every client what slows their business down**.
19. **Off-menu asks** (an app, a logo, ads, SEO): Buddy says yes and quotes them, once a builder confirms it can be done.
20. **Domains:** the client buys their own (Squarespace or anywhere else). Buddy walks them through it, and Site Builder sets the DNS. Northbound never pays for a domain.

## Money
21. **No prices anywhere on the site.** The client first sees the price at checkout. Buddy quotes the same price if asked first. No prices in cold emails.
22. **Website price comes from the pricing engine:** one price per week, testing **$300 / $500 / $750** setup, plus a fixed **$49/mo** care plan. The engine maximizes **lifetime value per quote** (Thompson sampling) and adds a higher price when the top one keeps winning. It never goes below $300. A quoted price is locked for 14 days.
23. **Deposit:** 50% upfront, 50% at launch.
24. **Automations:** **$100–$300/mo**, with **no setup fee**. Broad (e.g. Gmail) → about $100; niche (e.g. making and posting videos) → up to $300; hyper-specific to one company → a one-time build fee, then the monthly price.
25. **Off-menu work:** one fixed price = estimated hours × **$95/hr** (agent work) or **$150/hr** (anything Colin builds himself), with a **$250 minimum**. Always quoted as a fixed price, never billed as hours.
26. **Refund rule (the only one):** the full $250 deposit back if the client cancels before the build starts. No refund once the site is live. The $49/mo cancels with 30 days' notice, and the client keeps their words and photos. Buddy may issue this refund through Stripe; it moves no other money.
27. **Non-payment:** reminders on day 1, 3 and 7, then the site or automation **pauses at day 14**.
28. **Guarantee:** live in 7 days or $100 off. **The clock counts only Northbound's working days**; it pauses while the client reviews or replies.

## Delivery
29. **Unlimited revisions** until the client is happy.
30. Design work the agents can't do well (logos, brand) goes to Colin's **art student**, paid **per job**.
31. Client sites are hosted on **Colin's Vercel**. If a client cancels, they get their content, not the code.
32. When something breaks: **roll back to the last working version, retry once, then flag it red** on the dashboard.

## Where it runs
33. **On Colin's Mac**, moving to a Mac mini soon. Overnight events wait until morning; that's fine at this volume.
34. **Colin's own internal agents and dev** (Buddy, the supervisor, Site/Automation Builder, Lead button) run on **Colin's Claude Max plan** (headless Claude Code), no paid API. **Client-facing automations are different — their AI goes through the API, never the Max plan. See "AI hosting" below.**
35. **Client memory:** one private file per client on the Mac, never in this public repo.

## Dashboard (localhost on the Mac)
36. Opens on **live agent activity**, with each agent's state shown **to the second**, plus performance metrics.
37. Questions to Colin are **multiple choice** (2–4 options, recommended first, "or type your own"), the way the planning chat worked. They arrive as a **phone push and an iMessage from the Mac**, and Colin answers by replying with a number.
38. Anything that moves money or can't be undone gets a **"reply Y" confirm text** first.
39. Agents check past answers so Colin is **never asked the same thing twice**.
40. History is kept in **plain files**: the last 30 days in a working log, then moved to a long-term archive file kept forever. No database service.

## Automations
43. **First 10 automations:** built for **home services first**. The list is in `Plans/automations.md`. **Inbox autopilot is built first.** Post everywhere (already built) is one of the 10. Inbox autopilot v1 supports Gmail and Outlook and starts in draft mode, with auto-send switched on by the owner later. The AI receptionist is the one **cloud** exception, since it has to answer 24/7.
44. **Runs in the client's own accounts** (their Gmail, their socials). Northbound builds and manages it.
45. **Trials only come through Side Gig.** Users earn tokens in the Side Gig app and cash them in for a trial. Northbound then emails a **temporary license key + password, active 24–48 hours** depending on the automation, tied to their account.
46. **Automations ship as an app the client downloads and runs on a computer, on Mac, Windows and Linux.** Phone versions maybe later.
47. **Everyone runs the app, trial users and paying clients alike.** A paying client's monthly license key keeps it on.
48. **License keys come from an off-the-shelf licensing service** (e.g. Keygen or Lemon Squeezy): 24–48 h keys for trials, monthly keys for paid. Side Gig and Stripe both trigger key creation.

## Build order: one at a time
41. Build 00 (remove prices) → Build 01 (Buddy onboarding + dashboard v0, together) → **Automation Builder** → Site Builder → Buddy after launch → Lead button. (Changed 2026-11-21: automations are the main product, so the Automation Builder moves ahead of the Site Builder.)

## Always
42. No secrets in chat or code; they live in `.env` on the Mac. No invented reviews, results or numbers. Cold emails include the postal address and opt-out line, and opt-outs are permanent. Nothing gets deleted.

## AI hosting for client automations (decided 2026-11-21)
49. **Never run a client's automation through Colin's personal Claude Max plan.** Reselling a personal subscription is against Anthropic's terms and risks suspending the account the whole business runs on. Max is for Colin's own internal agents and dev only (item 34).
50. **Client-facing AI goes through the Anthropic API**, under Northbound's own commercial API key, via a small Northbound-run backend (it can live on the Mac mini, or a cloud server). This is the legitimate "we host the AI for you" model, and its billing is completely separate from Colin's Max usage.
51. **Three AI modes for client apps:**
    - **Hosted (default):** the app calls Northbound's backend, which holds the API key. The client signs in once and never sees a key. This is the premium, on-brand experience — the client does almost nothing, Northbound does everything.
    - **BYO-key (optional cheaper tier):** the technical few supply their own Anthropic API key and pay Anthropic directly.
    - **Never** the personal Max plan for any client work.
52. **Every hosted client has a per-client monthly token cap and rate limit, enforced by the backend**, so no client can run up Colin's API bill. The dashboard tracks tokens and cost per client. Use the cheapest model that does the job (e.g. Haiku for routine drafts) to keep margins high — API cost is cents per client per month against a $100–$300 price.
53. The backend is the auth + metering + cap layer between the client apps and the Anthropic API. The client apps must support all three modes above, defaulting to Hosted.
