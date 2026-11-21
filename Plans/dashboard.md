# Northbound Dashboard (localhost on the Mac)

Agreed with Colin on 2026-11-21. Built by Colin as a localhost front end; everything runs on the Mac.

**The idea:** the dashboard works the way the planning chat did. The agents talk to each other and solve what they can. When they can't agree or don't know what Colin wants, they ask him simple multiple-choice questions. He answers, and the work gets done with nothing else needed from him.

---

## 1. Questions for Colin (the main screen)

**Before asking Colin,** agents try to settle it among themselves: they message each other, check the client file and the plans, and look at past answers. Only an unresolved question reaches Colin.

**Every question card:**
- Says which agent is asking and for which client, in one line.
- Asks one clear question that makes sense on its own, without reading anything else.
- Gives 2–4 choices, with the recommended one first and marked "(Recommended)". A short line under each choice says what happens if he picks it.
- Has an "Other" box so Colin can type his own answer.
- Groups up to 4 related questions on one card, like the planning chat did.

**After Colin answers:**
1. The answer goes to the agent that asked, gets written to the client file, and is saved as a rule if it applies beyond this one case.
2. The agent carries it out right away.
3. The card flips to **Done**, with one line saying what was actually done.

**Agents learn from answers.** Before asking a new question, an agent checks whether Colin already answered something like it, so he's never asked the same thing twice.

While a question waits, only the work for that one client pauses. Everything else keeps running.

**Settled:**
- **When agents escalate:** after 3 rounds of agents messaging each other without agreeing, the question goes to Colin.
- **Alert:** a phone push notification for every new question card.
- **Answering away from the Mac:** questions also arrive by text message. Colin replies with the choice number (or types his own answer), and that counts exactly like answering on the dashboard.
- **Home screen:** the dashboard opens on live agent activity, with an open-questions badge always visible.

- **Texting:** iMessage, sent and read by the Mac's Messages app on Colin's number. Free.
- **Big answers get a confirm text first.** Before anything that moves money or can't be undone (a refund, a price change, a full rebuild), the agent texts back something like "Refunding <client>'s $250 — reply Y" and waits for the Y.

## 2. Agent activity (to the second)

Each agent logs every state change with a timestamp to the second:

| State | Meaning |
|---|---|
| Working | Doing a job; shows which job and which client |
| Talking | Messaging another agent |
| Waiting on Colin | Has an open question card |
| Idle | Nothing to do |
| Error | Something broke; rolling back or retrying |
| Offline | Mac or agent not running |

The screen shows:
- A live status light for each agent, with what it's doing right now.
- A timeline per agent of every working and idle stretch, to the second.
- Active time vs idle time per day and week, and uptime %.

## 3. Performance metrics

**Buddy:** reply time (seconds from client email to answer), emails sent, open conversations, quotes sent, quote → yes rate, upsells, refunds issued, hard emails handled.

**Site Builder:** sites built, time from complete info to preview, test pass rate on the first try, revision rounds per client, % launched within the 7-day clock, rollbacks.

**Automation Builder:** bottlenecks logged, automations built, time to build, automations sold, monthly revenue from automations.

**Lead button:** leads found, emails sent, reply rate, bounce and opt-out rate.

**Every agent:** jobs done, average time per job, success / retry / failure rate, agent-to-agent messages, questions sent to Colin, and how long each question waited for an answer.

**Business:** revenue, MRR, clients by stage, the pricing engine's current price and results, and Max plan usage.

## 4. Data
- One append-only event log on the Mac: every agent action, state change, message, question and answer, timestamped to the second. Plain files, no database service.
  - **Short-term:** the last 30 days, in a working log the dashboard reads live.
  - **Long-term:** anything older than 30 days is moved into a long-term archive file on the Mac and kept forever.
- The client files and the pricing log, from `Plans/agent-team.md` and `Plans/pricing-engine.md`.
- The dashboard only reads these. It never needs its own copy of the truth.
