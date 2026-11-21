# Build 01: Buddy onboarding + dashboard v0

Read first: `Plans/agent-team.md`, `Plans/dashboard.md`, `Plans/the-line.md` (step 3, the intake questions), `Plans/pricing-engine.md`.
Do Build 00 first.

**Goal:** when a real client pays the deposit, Buddy emails them within minutes and keeps the conversation going until everything needed to build their site is in. Colin can watch it happen live and answer Buddy's questions by iMessage.

## Where it runs
Colin's Mac (a Mac mini later). Every AI step runs through Claude Code on Colin's Max plan, headless (`claude -p`). No paid API keys for the AI. A small always-on worker on the Mac runs it, kept alive with launchd.

- **Payments:** the worker polls Stripe's events API every minute for `checkout.session.completed`, using the Stripe key from the Mac's `.env`. This avoids opening a tunnel to the Mac, and Stripe keeps the events, so nothing paid while the Mac was off gets lost.
- **Email:** the worker reads and sends from `ceyre@northbound-dev.com`. Find out how that inbox is hosted and pick the simplest way to read and send. Before building, ask Colin anything you need, such as credentials or app passwords. Secrets live only in `.env` on the Mac.

## Buddy's onboarding job
1. A new paid deposit → create the client file: `~/northbound/clients/<client-slug>.md`, private, never in this repo.
2. Within minutes, send the onboarding email:
   - Signed "Buddy from Northbound," in an upbeat-robot voice: eager, a little playful, still professional.
   - Thanks them, says what happens next, and asks for the intake info (the 10 questions in `the-line.md` step 3) in a friendly, short way.
   - Explains domains: they buy their own (Squarespace or anywhere else), Buddy walks them through it, and Northbound sets the DNS.
3. Every reply from that client → Buddy reads the whole client file and the thread, answers what they actually asked, and asks for whatever is still missing.
4. All info complete → start the 7-day clock (it only counts days Northbound is working), write `client.json` for Site Builder, and tell the client the build has started.
5. Buddy follows every rule in `agent-team.md`: the refund rule, no invented promises, honesty if asked whether it's an AI, and handling hard emails itself.

## Dashboard v0
- **Event log:** every state change and action, timestamped to the second. Plain files on the Mac: the last 30 days in a working log, then moved to a long-term archive file kept forever.
- **Live activity screen** on localhost: each agent's state (Working / Talking / Waiting on Colin / Idle / Error / Offline), what it's doing and for which client, with a timeline to the second.
- **Questions by iMessage:** when Buddy is stuck after 3 tries, it texts Colin's phone from the Mac's Messages app. The text has the question, 2–4 numbered choices (recommended first), and "or type your own." Colin's reply is read back and carried out. Anything that moves money or can't be undone gets a confirm text first ("reply Y").

## Test before calling it done
- Run a full fake client in Stripe test mode end to end: deposit → onboarding email → three replies (one missing photos, one asking a question, one completing the info) → `client.json` written → clock started.
- Send one test question to Colin's iMessage and have him answer it.
- The activity screen shows all of it, to the second.

## Rules
No secrets in code or chat. Client files never go in this public repo. Nothing gets deleted.

## Report back (short)
What's running, how to see the dashboard, what Colin had to provide, and the results of the end-to-end test.
