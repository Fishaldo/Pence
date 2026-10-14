# Pence

Pence is the test version of Briv (Fishaldo/Briv): everyday spending in pounds, receipts and alerts in, where the pay went and real UK deals out. It is a web app people use on their phones today, so new ideas can be tried before they go into Briv.

Briv sets the standard. Pence copies Briv's logic rather than having its own.

## What is here

| Folder | What it is |
|---|---|
| `src/routes` | One file per screen or web address. |
| `src/components/pence` | The screens. `capture/` is Add, split into the form, the review steps and Say it. |
| `src/server` | Server functions the screens call. `ledger/` holds spends, alerts, receipts, statements, places, the profile and the sample month, one file each. |
| `src/lib/core` | **Briv's logic, copied exactly**: categories, UK dates and paydays, pay periods, alerts and statements, shops and money sent, the budget, offers rules. Never edited here. |
| `src/lib/spend` | Pence's own helpers: reading files and images. |
| `migrations` | Database changes, applied in order on each deploy. |
| `scripts` | `sync-core.mjs` (the copy of Briv's logic), `ci-walkthrough.mjs` (the phone-sized walkthrough), and the Grok app-builder's own tools. |

## Changing a rule

1. Change it in Briv's `packages/core`, with a test, and merge it there.
2. Here: `node scripts/sync-core.mjs --write --commit <the Briv commit>`.
3. `npm test` checks the copy still matches the pinned commit. A hand edit in `src/lib/core` fails the check.

## Working on it

```sh
npm ci
npm run dev          # the app on http://localhost:8080, with a local database
npm test             # the core copy, the app-builder's tests and Pence's own tests
npm run typecheck
npm run lint
npm run build
```

Every push runs `.github/workflows/check.yml`: install, tests, type check, lint, build, then the app is started twice (dev server and built app on Postgres) and walked through on a phone-sized screen. Logs and screenshots go to the `ci-results` branch. The check fails if any step fails, a walkthrough step misses, or the browser logs an error.

## Not here on purpose

- Build output (`.vercel/output`) is made by each build and is not kept in git.
- A few of the app-builder's own tests check that a project still has the blank template's defaults (sign-in off, no name). Pence changed those on purpose, so `scripts/platform-tests.mjs` leaves them out by name; every other one runs.
