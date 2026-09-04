# TABOOST Platform — Red-Team Security Audit & Remediation Plan

## Context

Colin asked for a full red-team check of the creator platform, worried that the
Firebase rules were "still open to read and write to anyone." This is not the
Northbound-Studio repo (that's a static marketing site with no Firebase) — the
audited code lives in **`~/TABOOST_Platfrom/`**, GitHub repo
`ceyre-boop/TABOOST_Platfrom`.

**Domain split (corrected):** Colin's live creator app is **talent.taboost.me**,
which is a **separate site/repo** — none of this repo's files exist there (they
404) and its root does not reference the `taboost-platform` Firebase project. This
repo instead deploys to **live.taboost.me**, which is *still live* and confirmed
**serving creator PII publicly** (`data/creators_full.json` → HTTP 200, 554KB,
unauthenticated). So there are two exposures to separate: (1) the shared Firestore
project `taboost-platform` — open to the internet regardless of domain; (2) this
repo's live.taboost.me GitHub Pages deployment leaking committed PII. The
talent.taboost.me codebase was NOT audited here and should be checked separately —
critically, whether it points at the same `taboost-platform` project (if so, the
Firestore lockdown protects it too).

**The concern is confirmed and it is live right now.** During recon I made
unauthenticated REST calls to the production Firestore (`taboost-platform`) with
no login and no token, and read real creator records. This is an active,
internet-facing exposure of creator PII, not a theoretical risk. I stopped after
proving access on one record per collection — I did not exfiltrate the dataset.

The intended outcome: (1) stop the live exposure immediately, (2) fix the
structural problems that let it happen, (3) leave a verifiable locked-down state.

> **Boundary note:** I did **not** test writes — writing to the production DB is a
> mutation I won't do without Colin, and it becomes moot once rules are locked.
> Write-open is inferred (see F1), not proven.

---

## What I confirmed LIVE (unauthenticated, from a plain shell)

| Collection | Unauth REST read | Contents observed |
|---|---|---|
| `creators` | **HTTP 200** | email, TikTok creatorId, username, role, claimed — with `nextPageToken` (pageable through all ~823) |
| `users` | **HTTP 200** | account docs incl. `role` field |
| `payouts` | **HTTP 200** | money/payout records |
| `admins` | **HTTP 200** | admin docs |

`admins` being world-readable is the tell: the **fully-open "test mode" ruleset
(`allow read, write: if true`) is what's deployed** — not any of the stricter
`.rules` files in the repo. Endpoint used (read-only, safe to re-run for
verification):
```
curl -s "https://firestore.googleapis.com/v1/projects/taboost-platform/databases/(default)/documents/admins?pageSize=1" -w "\nHTTP %{http_code}\n"
```

---

## Findings, ranked

### F0 — CRITICAL: Plaintext creator passwords are in public git history
`data/passwords.json` was committed in **6 commits** (verified: `git log --all` on
`data/passwords.json` → 6) and never purged — commit `85c678e3` only *renamed* it
to `data/config.secure`. On a **public** repo, every historical creator password
is retrievable today via `git show <sha>:data/passwords.json` (an earlier revision
used one shared password `Taboost2026!` for all creators). The homegrown
`login.html` reads these plaintext passwords client-side. **Mitigating checks I
ran:** the current `config.secure` is **not** live (`https://live.taboost.me/data/config.secure`
→ 404) and the RTDB is **locked** (`...firebaseio.com/.json` → 401) — so those two
specific paths are not currently exposed. The git-history leak is. Requires:
rotate all creator passwords, purge history (`git filter-repo`), retire the
homegrown login entirely.

### F1 — CRITICAL: Production Firestore is world-readable (and almost certainly world-writable)
Live-proven above. Anyone who knows the project ID `taboost-platform` (it's
hardcoded in 15+ public HTML pages) reads every creator's email, earnings,
payouts, and account role with a single unauthenticated HTTP request. The
deployed ruleset permits `read, write: if true`, so a malicious actor can also
overwrite records, escalate their own `role` to `admin`, or wipe collections.
**This is the emergency.**

### F2 — CRITICAL: Working admin password committed in public source
`login.html:91` and `simple-login.html:285` hardcode
`marco@taboost.me` / `Taboost2026!Admin` in plaintext, served at
`https://live.taboost.me/login.html` and readable via View Source. `README.md`
additionally publishes login creds on the repo front page. Contradicts the repo's
own CLAUDE.md rule 4.

### F3 — CRITICAL: Creator PII committed to a public repo and served unauthenticated
`data/current.csv`, `data/creators.json`, `data/history.csv`, monthly agency
reports, and `data/agents.csv` (personal emails) are git-tracked and fetchable at
`https://live.taboost.me/data/...` with no auth. `js/data.js` embeds the full
roster. Repo is **public** (confirmed: `gh repo view` → `"isPrivate":false`).

### F4 — HIGH: Public webhook secret on an "Anyone"-access endpoint tied to cash claims
`js/creator-dashboard.js:421-422` ships `CASHBACK_WEBHOOK_URL` +
`CASHBACK_WEBHOOK_SECRET` (`5240e7f1-2ead-4b00-af55-7dfd4f9a670e`) in client JS.
The backing Apps Script (`scripts/cashback-claim-email.gs`) is deployed
"Who has access: Anyone", so the public secret lets anyone forge unlimited
"creator claimed $X" emails to marco@taboost.me. Code acknowledges it's
notify-only and to verify before paying — but it's still a spoofing/nuisance
vector. Move the secret server-side or make the endpoint verify against Firestore.

### F4b — MEDIUM: Third-party API keys stored in Firestore, pulled into the browser
`marco_config/keys` holds an OpenAI key, Monday token, and Discord webhook URLs;
`admin/dashboard.html` reads them into client JS and calls OpenAI directly with
`Bearer ${appCfg.openaiKey}`. Any XSS on the admin page, or anyone satisfying
`isAdmin()`, exfiltrates the OpenAI key. Use scoped keys; proxy the calls
server-side. (No live key *values* are committed — placeholders only.)

### F5 — HIGH: No deployed-rules source of truth
No `firebase.json` / `.firebaserc` in the repo. Four competing `.rules` files
exist (two dangerously open: `firestore-setup.rules`, `firestore-import.rules`),
and **nothing records or enforces which is live** — which is exactly how the open
one ended up deployed. CLAUDE.md even tells contributors to test changes in the
permissive `firestore-setup.rules`.

### F6 — MEDIUM: Admin pages have no real access control
Every "admin" page (`dashboard.html`, `admin.html`, `command-center.html`, all
import/cleanup tools) is a public static file. Guards are either absent or
client-side only (`localStorage.taboost_user.role==='admin'`, trivially forged in
devtools). Data protection depends *entirely* on Firestore rules — which is why
F1 is catastrophic. `admins/` writable-by-any-authenticated-user in
`firestore-import.rules` is a direct privilege-escalation path given
`signup.html` lets roster names self-register.

### F7 — MEDIUM: No `storage.rules`, no `database.rules.json`
The Storage bucket and the configured RTDB (`taboost-platform-default-rtdb`) have
**no version-controlled policy** in the repo. I verified the RTDB currently
**denies** unauth reads (401) — good — but that policy is set by hand in the
console and unreviewable. Add both rule files to the repo so they're pinned.

### F8 — LOW/HOUSEKEEPING
Missing security headers (no CSP/X-Frame-Options on GitHub Pages); ~22,800
committed `node_modules` files; duplicate full site tree under `uk/` and a stale
second working copy at `TABOOST_Platfrom/TABOOST_Platfrom/`; `.gitignore` lacks
`*.pem`/`*.key`/`*service-account*` patterns; admin role is decided client-side by
email string (`user.email === 'marco@taboost.me'`) in 6+ files — UI-only, but
should align with the rules' `role`-based check.

> **Live-probe corrections to earlier assumptions:** RTDB is **locked** (401, not
> open) and `config.secure` is **404** (not currently served). The active
> exposures are F0 (git-history passwords), F1 (Firestore wide open), F2/F3
> (committed creds + PII in a public repo).

---

## Remediation plan

### Step 0 — EMERGENCY: lock the live rules (do first, needs Colin)
No `firebase` CLI or `gcloud` is installed on this machine, so the fastest stop is
the **Firebase console** (~60 seconds), which Colin can do now:
Firebase Console → project `taboost-platform` → Firestore → Rules → paste the
strict ruleset → Publish.

**Use `TABOOST_Platfrom/TABOOST_Platfrom/firestore-production.rules`** (the
canonical newer file — matches the live collections `creators`/`creatorRoster`/
`ukCreators`/`payouts`/`cashbackClaims`/`marco_config`). Do **NOT** use
`firestore.rules` — it references a stale schema (`roster`, `creatorData`) that
doesn't match the app and would break it.

⚠️ **Shared project:** `taboost-platform` is also used by TABOOST-Shop. The
canonical file's own comment warns the deployed ruleset must also include Shop's
`tapBonusClaims` rule — dropping it breaks Shop. Before publishing I'll confirm
the current live ruleset's `tapBonusClaims` block (from the Shop repo or console)
and merge it in, so we lock down without breaking Shop.

Alternative if Colin prefers I do it from here: I install `firebase-tools`
(`bunx firebase-tools`), he runs `firebase login` in a `!` shell (interactive), I
add a `firebase.json` pinning the merged production ruleset and deploy
`firebase deploy --only firestore:rules`. Slower; console is faster for an active
breach.

### Step 1 — Pick and pin ONE ruleset (fixes F5)
Consolidate to a single `firestore.rules`, delete `firestore-setup.rules` and
`firestore-import.rules` (or move to a clearly-marked `/dangerous-dev-only/`), add
`firebase.json` + `.firebaserc` so the deployed rules are version-controlled and
`firebase deploy` is reproducible. Review `firestore-production.rules`'
`creatorRoster: allow read: if true` — confirm the roster (usernames+CIDs) is
genuinely OK to be public; if not, tighten.

### Step 2 — Purge committed secrets & rotate (fixes F0, F2, F4)
- **Rotate every creator password** and the `marco@taboost.me` admin password —
  both password sets have been public (F0 history + F2 source). Live Firebase Auth
  creators sign in through `firebase-login.html`, so rotation = force-reset via
  Firebase Auth; the plaintext `passwords.json` set is legacy but was reused, so
  treat any creator who reused it as compromised.
- **Purge git history** of `data/passwords.json` (`git filter-repo`), then
  force-push. Deletion-going-forward is not enough on a public repo.
- Delete hardcoded creds from `login.html`, `simple-login.html`, `js/auth.js`,
  `README.md`; retire the homegrown login path entirely (`firebase-login.html` is
  the real one). Remove the `console.log(... 'Password:', password)` leak.
- **Rotate the cashback webhook secret** (F4) and move it server-side; consider
  rotating/ restricting the Firebase Web API key in GCP (HTTP-referrer + API
  allowlist) since Apps Script uses it against Identity Toolkit endpoints.

### Step 3 — Decide on public-repo PII (fixes F3)
**Hosting constraint (confirmed):** the site is served by **GitHub Pages**, which
on the free plan only publishes **public** repos. So "make the repo private" is
not free — it takes `live.taboost.me` **offline** unless paired with GitHub Pro
(paid) or a hosting move. The Google Apps Script email flow is independent of
GitHub and unaffected; users just reach those forms through the site.

**CHOSEN: 3b — keep public, strip PII.** Remove all `data/*.csv`,
`data/creators*.json`, roster dumps, and the PII embedded in `js/data.js` from git
*and* the served site; the dashboards load creator data only from locked-down
Firestore at runtime (creator sees own doc, admin sees all). Keeps GitHub Pages
hosting and the Apps Script email flow untouched.

Because the PII + passwords have been public, this REQUIRES a git history rewrite
(`git filter-repo` on `data/passwords.json`, the PII CSVs, and `js/data.js`
history) + force-push + password rotation — deletion going forward is not enough.
Anything a page genuinely needs at load time that isn't sensitive (e.g. public
roster usernames) can stay; earnings/emails/discord handles/payouts must move
behind auth.

### Step 4 — Real access control (fixes F6)
Keep client redirects as UX, but make Firestore rules the enforcement (Step 1
already does the heavy lifting). Ensure no collection is readable/writable without
an authenticated, role-checked identity. Verify `role` cannot be self-escalated
(the `request.resource.data.role == resource.data.role` guard in
`firestore-production.rules` is the right pattern — carry it into the final rules).

### Step 5 — Housekeeping (fixes F7)
Un-track `node_modules`, remove `uk/` duplicate tree, extend `.gitignore`.

---

## Verification (how we'll know it's fixed)

1. **Re-run the exact breach probe** after Step 0 — every collection must return
   `403 PERMISSION_DENIED` instead of 200:
   ```
   for c in creators users payouts admins; do
     curl -s "https://firestore.googleapis.com/v1/projects/taboost-platform/databases/(default)/documents/$c?pageSize=1" -w " [$c] HTTP %{http_code}\n" -o /dev/null
   done
   ```
2. **Authenticated creator test** — a logged-in creator can read only their own
   `creators/{uid}` doc, and gets denied on another creator's doc and on
   `payouts`/`admins`/`users`. Verify via the live app with the Interceptor skill
   (real Chrome, logged-in session).
3. **Source scan** — `grep -rE "Taboost2026|password === |config.secure"` returns
   nothing in shipped pages; `curl https://live.taboost.me/login.html | grep -i password` shows no creds.
4. **Repo state** — `gh repo view` shows intended visibility; `git ls-files data/`
   shows no PII CSVs (if Step 3b chosen).
5. **Rules pinned** — `firebase.json` present, `firebase deploy --only firestore:rules --dry-run` matches the intended file.

---

## Decisions locked in
- **Scope:** Full remediation (F0–F8).
- **Repo/hosting:** Keep public on GitHub Pages, strip all PII from git + served
  site (Step 3b). No hosting move.
- **Live lockdown:** Confirmed the deployed ruleset is fully-open read+write. I'll
  produce the paste-ready merged strict ruleset; Colin publishes it in the console
  (fastest), or I deploy via CLI if he runs `firebase login`. This is Step 0 and
  happens first.

## Execution order (once approved)
1. **Step 0** — lock live Firestore (paste-ready ruleset handed to Colin).
2. **Step 1** — pin the ruleset in `firebase.json`/`.firebaserc`, delete the
   dangerous `firestore-setup.rules`/`firestore-import.rules`.
3. **Step 2** — rotate creator + admin passwords, purge `passwords.json` history,
   delete hardcoded creds + homegrown login, rotate cashback webhook secret.
4. **Step 3b** — strip PII from git + served site, history rewrite, force-push.
5. **Steps 4–5** — real access-control alignment + housekeeping.
6. **Verification** — re-run the breach probe (expect 403 everywhere) + logged-in
   creator isolation test via Interceptor.
