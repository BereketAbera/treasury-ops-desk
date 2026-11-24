# Payout desk

A sample internal tool for a treasury operations team that sends cross-border payouts. The company on screen, Kestrel Commercial, is fictional, and so is every beneficiary, bank, account, amount and rate.

Sample by Bereket A.

## What it shows

- **A dense instruction table.** 60 seeded payouts, nine columns, sortable, filterable by status, route and target currency, text search, sticky header, keyboard row navigation, a detail panel, loading and empty states, three row heights, and a card layout on phones. Filters, sort and the selected row live in the URL.
- **A form with hard validation.** Decimal places per currency (2 for NGN, KES, ZAR, GHS and USD; 0 for UGX, RWF and XOF; 6 for USDC), limits per route, account format per route, a purpose code above a threshold, and a rate that expires on a countdown and locks Submit until it is refreshed. Errors are tied to fields and summarised at the top with links.
- **Idempotent submits.** A form gets one `Idempotency-Key` when it opens. Double clicks send one request. Every retry carries the same key, and the mock API returns the first result for a repeated key.
- **Unknown outcomes.** A timeout does not offer "try again". The form says the outcome is unknown, checks status by idempotency key, and resolves to "received" or "not received, safe to resend".
- **Retries with backoff.** A 503 is retried up to three times with a growing wait and a visible attempt count. A 422 or 409 is final and gets no retry button.
- **Eventual consistency.** An accepted payout appears in the table at once as "awaiting confirmation" and settles through polling. The table shows when it last synced and marks itself out of date when a sync fails.
- **Partial batch failure.** A batch of 12 can come back as 9 booked, 2 rejected and 1 outcome unknown. The result page groups them, explains each group, and retries only the rejected lines.
- **A request log.** Every request carries `X-Correlation-Id`. A drawer lists method, path, status, duration, attempt, correlation ID and idempotency key, with copy buttons. Error messages show the correlation ID.
- **A small component library** in `src/ds/`, documented in Storybook at `/storybook/`.
- **A Simulate control** that makes the mock API slow, time out, fail with 503, expire a rate early, fail part of a batch, or stop the table sync.

The "How it works" page in the app lists what is real and what is simulated.

## Stack

Vue 3 (Composition API, `<script setup lang="ts">`), TypeScript in strict mode, Vite, Pinia, Vue Router, SCSS, Vitest, Vue Test Utils, Playwright with axe, Storybook, Mock Service Worker. No UI kit and no CSS framework.

## Run it

Developed with Node 24 and pnpm 10.

```sh
pnpm install
pnpm dev            # http://localhost:3401
pnpm storybook      # also http://localhost:3401, so stop the dev server first
```

The "Components" link in the app points at `/storybook/`, which exists in the production build only.

Production build, with Storybook under `dist/storybook`:

```sh
pnpm build
pnpm preview        # http://localhost:3401
```

## How state works

- The app makes real `fetch` calls to `/api/...`. Mock Service Worker answers them inside the browser, in development and in the production build. The requests and their headers are visible in the browser's Network tab.
- `public/mockServiceWorker.js` is the worker script. The app starts the worker and waits for `/api/health` to answer before it mounts, so a first visit shows data without a reload. If service workers are unavailable, the page shows a plain message.
- The mock API keeps its data in memory and mirrors it to `sessionStorage`, so it survives a reload and ends with the tab. Nothing is written to `localStorage`.
- "Reset demo data" in the top bar restores the seeded data and clears the request log.
- The handlers are in `src/mocks/handlers.ts`, the seed in `src/mocks/seed.ts`, the scenarios in `src/mocks/scenario.ts`.

## Design tokens

`tokens/tokens.json` is the single source. `pnpm tokens` (run by `dev` and `build`) writes three files into `src/ds/tokens/`: SCSS variables, CSS custom properties, and a typed object for the Storybook token pages. Components read the custom properties. SCSS variables are used only where a custom property cannot go, such as a media query.

## Where things are

| Path | What |
| --- | --- |
| `src/ds/` | Component library: tokens, components, stories |
| `src/lib/` | Money, validation, retry policy, API client, submit state machine, CSV parser |
| `src/mocks/` | Mock API: handlers, data, seed, scenarios |
| `src/stores/` | Pinia stores: payouts, request log, simulate, preferences |
| `src/pages/`, `src/components/` | The app's screens |
| `tests/unit`, `tests/component`, `tests/e2e` | Tests |

## Tests

```sh
pnpm lint            # ESLint, includes a rule that rejects v-html
pnpm typecheck       # vue-tsc, strict
pnpm test            # Vitest: unit tests and Vue Test Utils component tests
pnpm test:e2e        # Playwright against the local production build on port 3401 (run pnpm build first)
pnpm test:e2e:live   # the same Playwright suite against the deployed address
```

The end-to-end suite covers the happy submit, double submit, 503 then retry with the same key, timeout then status check, rate expiry, partial batch and retry of only the rejected lines, filters kept in the URL across a reload, axe on every page, and no sideways scroll at 390 pixels. It fails on any Content-Security-Policy violation in the console. `vite preview` applies the headers from `vercel.json`, so the policy is tested locally as well.

To run the suite against another address: `E2E_BASE_URL=https://example.test pnpm exec playwright test`.

## Security notes

- API data is rendered as text only. There is no `v-html`.
- `vercel.json` sets a Content-Security-Policy for the app (same-origin scripts, styles and connections, no inline script, no `eval`, no framing) and a looser one for `/storybook/`: Storybook's shell uses inline script, and the stories compile their templates in the browser, which needs `eval`. The app's policy allows neither.
- Amounts are integer minor units end to end: a `bigint` in code, an integer string in props, storage and request bodies.
