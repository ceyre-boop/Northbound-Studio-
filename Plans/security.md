# Security: what stops a script running up a bill on northbound-dev.com

Written 2026-11-26 after the "10 ways your vibe-coded app gets a huge bill" review. The full checklist, used for every Northbound repo, is `~/northbound/dont-hack-me.md`.

## In the code (lib/guard.ts)
- **Form posts** (quote, account, checkout): at most 5 in 10 minutes and 20 a day per IP. Over that, the visitor gets a 429 with the phone number. Nothing is emailed and no Stripe session is made.
- **Courtesy emails** (the "we got it" email to the address the visitor typed):
  - at most one a day per address, and 60 an hour per server instance;
  - the email carries no text the visitor typed, only a checked first name, so nobody can use our DKIM-signed domain to send their own message;
  - the studio's copy still has everything.
- **License checks** (`/api/license`): 60 per 10 minutes per IP and 10 for `portal`. After 10 unknown keys from one IP in 10 minutes, the endpoint stops asking Stripe. That protects the Stripe search rate limit real customers need. The launcher keeps its last signed answer for 3 days, so a short outage locks nobody out.
- **License admin**: a 256-bit token, compared in constant time. After 10 wrong tokens in 10 minutes, the IP is locked out.
- **Source files**: `/api/*.ts`, `/lib/*`, `/README.md` and `/brand-src/*` used to be served as plain files because the output directory is the repo root. They now redirect to `/`.

These counters live in each server instance's memory. They stop a single script cold, but a spread-out attack can reach several instances. The layer that holds across instances is the Vercel Firewall.

## Vercel Firewall rules (staged as drafts; publishing them is Colin's call)
The project is on Hobby, and Hobby allows one rate-limit rule. So it's one rule covering every API POST: 30 per 10 minutes per IP. It's staged, not live:
```
vercel firewall rules inspect "API posts: 30 per 10 min per IP"
#   path is any of /api/quote, /api/account, /api/checkout, /api/license, /api/license-admin; method POST
#   30 requests / 600 s per IP, then 429
vercel firewall diff
vercel firewall publish --yes      # Colin
```
Blocked and rate-limited requests are not billed by Vercel.

## Account settings only Colin can change
- **Resend:** a daily sending cap, and an alert on bounces and complaints. One spam run can get the domain suspended.
- **Stripe:** Radar rules (block payments with high risk scores), and an alert on disputes.
- **Vercel:** the project is on Hobby. Hobby doesn't bill overages, but the site pauses when the included bandwidth runs out. On Pro, turn on Spend Management with a hard cap before anything else.
- **Anthropic console:** a monthly spend limit on the Northbound key, set at the $100 budget.
