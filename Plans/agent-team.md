# Northbound Agent Team

Agreed with Colin on 2026-11-21. This replaces the earlier Sales/Kitchen/Care draft.

Colin is the CEO. Agents run the business fully automatically and Colin corrects after the fact. He personally works only on new and experimental automations, the post automation, and the videos.

Agents run because **real clients do something**, not on a schedule. The only exception is cold outreach, which runs when Colin presses a button.

---

## The team

| Agent | Woken by | Job |
|---|---|---|
| **Buddy** | Payment taken · client email or reply · edit request · Site Builder or Automation Builder finishing | The client's only point of contact. Communicates, onboards, updates, upsells, and asks about bottlenecks |
| **Site Builder** | Buddy has everything needed to build | Builds the site the way the client asked, tests it, deploys it, and connects their domain until it's live |
| **Automation Builder** | Buddy logs a client bottleneck | Builds a custom automation for that company, and turns repeat ones into Northbound products |
| **Lead button** | Colin presses it | Finds verified leads and sends the cold email |

---

## Buddy: the voice of Northbound

Built fresh (Genie is a reference only). Signs every email "Buddy from Northbound."

**On payment taken (Stripe webhook):**
1. Send the onboarding email right away.
2. Carry on the conversation until everything the build needs is in: the intake answers, logo, photos, and domain.
3. Start the 7-day clock when the info is complete, then hand off to Site Builder.

**During the build:** send the client short updates, and answer their questions.

**Domains:** explain that the client buys their own domain (Squarespace or anywhere else), and walk them through it step by step. Northbound then sets the DNS to point at their site. Northbound never pays for a client's domain.

**After launch, always in contact:**
- Edit requests → small ones go to Site Builder; bigger ones get quoted as upsells.
- Check-ins, review and referral asks.
- Upsell Northbound services when they fit the client's business.
- **Ask every client what slows their business down.** Each bottleneck gets logged and handed to Automation Builder.

**Buddy's rules:**
- Must be excellent at communicating: warm, clear, short, and always answering what the client actually asked.
- Sells the menu at the pricing engine's price. **Off-menu asks (an app, a logo, ads, SEO): Buddy says yes and quotes them,** after Site Builder or Automation Builder confirms it can be built and estimates the work. Buddy never invents discounts, deadlines or terms beyond the written rules.
- Never claims results, reviews or numbers Northbound doesn't have.
- If a client asks directly whether they're talking to a person or an AI, Buddy answers honestly.
- Moves no money except the one refund the refund rule allows. Otherwise Buddy only sends payment links.

## Site Builder

**Northbound's coder and developer for everything,** including northbound-dev.com itself. It edits and ships any Northbound code without asking Colin.

1. Builds from the universal template, customized however the client asked.
2. Tests everything before going live: phone and desktop layouts, speed, links, click-to-call, no placeholder text, and the contact form actually delivering a real test message.
3. Deploys it, sets DNS on the client's domain, and confirms the site loads publicly over SSL.
4. Reports back to Buddy, who tells the client and sends the balance and care-plan links.

Nothing goes live if a test fails.

## Automation Builder

1. Takes each bottleneck Buddy logs and designs an automation that fixes it for that specific company.
2. Builds it and tests it, then hands it to Buddy to present to the client as an offer.
3. When the same bottleneck shows up for several clients, it packages that automation as a Northbound product.
4. Doesn't wait for Colin. Colin joins only on new or experimental ones (TABOOST-style tools).

## Lead button

Colin presses it. It finds verified small businesses and sends the approved cold email: postal address and opt-out line in every email, opt-outs permanent, follow-ups on day 4 and day 10. Replies go to Buddy.

---

## Where it runs

**Colin's Mac**, moving to a Mac mini soon.

- Events wait until the Mac is on. Colin works about 12 hours a day; a client who emails overnight gets answered the next day, and that's fine at this volume.
- Payments are still recorded by Stripe and the site's existing webhook, so no money event is ever lost.
- Revisit this when there are enough clients for the wait to matter.

## Settled decisions
- Fully automatic. No approval taps; Colin corrects afterward.
- Clients buy their own domains; Northbound only sets the DNS.
- Buddy signs as "Buddy from Northbound," in an upbeat-robot voice: eager, a little playful, still professional.
- Buddy sends from and reads `ceyre@northbound-dev.com` (the same address as cold outreach).
- Buddy is built fresh, not on Genie's code.
- Cold outreach runs only when Colin presses the button.
- **Buddy handles every email itself**, including angry clients, refunds, cancellations and legal threats.
- **Refund rule (the only one Buddy may apply):** the full $250 deposit back if the client cancels before the build starts. No refund once the site is live. The $49/mo plan cancels with 30 days' notice, and the client keeps their words and photos. Late launch → $100 off, automatically.
  - Buddy may issue that refund through Stripe. It moves no other money.
  - On a legal threat, Buddy stays calm and polite, admits no fault, and makes no legal promises.
  - Every hard email is flagged on the dashboard.
- **Hosting:** all client sites live on Colin's Vercel. If a client cancels, they get their words and photos, not the code.
- **Client memory:** one file per client in a private folder on the Mac (later the Mac mini). Every agent reads and writes it, and it's never in the public repo.
- **Revisions:** Site Builder redesigns until the client is happy. There's no cap on rounds.
- **AI cost:** everything runs on Colin's Claude Max plan on the Mac. There are no extra API bills.
- **Automation pricing:** $100–$300/mo per automation, with no setup fee. Price depends on how niche it is:
  - Broad (e.g. Gmail triage) → around $100/mo.
  - Niche (e.g. creating and posting videos) → up to $300/mo.
  - Hyper-specific to one company → a one-time build fee upfront, then the regular monthly price.
- **7-day clock:** counts only days Northbound is working. It pauses while the client is reviewing or answering, so unlimited revisions don't break the "$100 off if late" promise.
- **Northbound's own site:** Site Builder may change anything except the brand: the logo, Buddy's design, and the core look.
- **When something breaks:** the agent rolls back to the last working version, retries once, then flags it red on the dashboard.
- **Agents message each other directly.** Every message is also copied into that client's file, so the dashboard shows the full conversation.
- **Reply speed:** while the Mac is on, Buddy answers client emails within minutes.
- **Design work agents can't do well (logos, brand design):** goes to Colin's art student. Agents handle everything else.
- **Non-payment:** Buddy sends reminders on day 1, 3 and 7. The site or automation pauses at day 14.
- **Positioning shift (2026-11-21):** automations are now Northbound's main product and its portfolio; websites are the side offer.
- **Front door:** cold emails, the site and the reels lead with automations. Websites are offered second.
- **Off-menu quotes:** a fixed project price = Builder's estimated hours × $95/hr when agents do the work, or $150/hr for any part Colin builds himself (experimental or hyper-specific work). $250 minimum per job. Quoted as a fixed price, never billed as hours. Goes into the pricing engine once there's data.
- **Art student:** paid per design job. Buddy handles the client side.
- **Portfolio:** client automations and sites are shown without names ("a roofing company"), with real measured results only.
- **Visibility:** a live dashboard that Colin builds as a localhost front end on the Mac, showing every client, their stage, and every agent action.

## Build order: one at a time, each one live before the next
1. **Buddy, onboarding only + dashboard v0, built together:** payment → onboarding email → conversation until the info is complete. Dashboard v0 is only the event log, the live activity screen, and question texts by iMessage. Metrics and the full question cards come after Buddy works live.
2. **Site Builder:** info complete → live site on the client's domain.
3. **Buddy, after launch:** edits, check-ins, upsells, bottleneck questions.
4. **Automation Builder.**
5. **Lead button.**
