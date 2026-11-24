# Payout desk

A sample internal tool for a treasury operations team that sends cross-border payouts. The company on screen, Quillmere Commercial, is fictional, and so is every beneficiary, bank, account, amount and rate.

Sample by Bereket A.

## What it shows

- **A dense instruction table.** 60 seeded payouts, nine columns, sortable, filterable by status, route and target currency, text search, sticky header, keyboard row navigation, a detail panel, loading and empty states, three row heights, and a card layout on phones with a "Sort by" select and 15 cards at a time. Filters, sort and the selected row live in the URL, and every value read from the URL is checked against a list of allowed values.
- **A form with hard validation.** Decimal places per currency (2 for NGN, KES, ZAR, GHS and USD; 0 for UGX, RWF and XOF; 6 for USDC), limits per route, account format per route, a purpose code above a threshold, and a rate that expires on a countdown and locks Submit until it is refreshed. The decimal separator is a point; a comma is accepted only as a thousands separator in a valid position, so `1000,50` is a problem and never 100,050. Errors are tied to fields and summarised at the top with links.
- **Idempotent submits.** A form gets one `Idempotency-Key` when it opens. Double clicks send one request. Every retry carries the same key, and the mock API returns the first result for a repeated key.
- **Unknown outcomes.** A timeout does not offer "try again". The form says the outcome is unknown, checks status by idempotency key, and resolves to "received" or "not received, safe to resend". An unresolved submit is kept across a reload and when a new form is asked for.
- **Retries with backoff.** A temporary failure (503, 429, 502, 504) is retried up to three times with a growing wait and a visible attempt count. The resend is safe because it carries the same key. A 422 or 409 is final and gets no retry button. The status decides the class before the body is read, so a gateway's HTML 504 is still temporary.
- **Eventual consistency.** An accepted payout appears in the table at once as "awaiting confirmation" and settles through polling. The table shows when it last synced and marks itself out of date when a sync fails.
- **Partial batch failure.** A batch of 12 can come back as 9 booked, 2 rejected and 1 outcome unknown. The result page groups them, explains each group, and retries only the rejected lines. A reference names one payout in a batch as well: a line whose reference exists is rejected as "Reference already used". Line numbers are the uploaded file's own. `/batches` lists every batch.
- **A request log.** Every request carries `X-Correlation-Id`. A drawer lists method, path, status, duration, attempt, correlation ID and idempotency key, with copy buttons. The table's sync polls are folded into one summary line and can never push out a request the operator made. Error messages show the correlation ID.
- **A small component library** in `src/ds/`, documented in Storybook at `/storybook/`.
- **A Simulate control** that makes the mock API slow, time out a payout or a batch, fail with 503, expire a rate early, fail part of a batch, or stop the table sync.

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
- `src/demo/index.ts` is the one door between the app and the Simulate control. App code imports demo behaviour from there and from nowhere else under `src/mocks`.
- Everything read back from `sessionStorage` passes a shape check first. A value that fails it is dropped for the default.

## Design tokens

`tokens/tokens.json` is the single source. `pnpm tokens` (run by `dev` and `build`) writes three files into `src/ds/tokens/`: SCSS variables, CSS custom properties, and a typed object for the Storybook token pages. Components read the custom properties. SCSS variables are used only where a custom property cannot go, such as a media query.

## Where things are

| Path | What |
| --- | --- |
| `src/ds/` | Component library: tokens, components, stories |
| `src/lib/` | Money, validation, retry policy, API client, submit state machine, URL and storage guards, CSV parser |
| `src/demo/` | Demo only: the boundary to the Simulate control |
| `src/mocks/` | Mock API: handlers, data, seed, scenarios |
| `src/stores/` | Pinia stores: payouts, request log, simulate, preferences |
| `design/` | The script and the Inkscape commands that make the mark, the favicon and the social card. See `DESIGN-NOTES.md` |
| `src/generated/` | `test-counts.json`, written by `scripts/test-counts.mjs` |
| `src/pages/`, `src/components/` | The app's screens |
| `tests/unit`, `tests/component`, `tests/e2e` | Tests |

## Tests

```sh
pnpm lint            # ESLint, includes a rule that rejects v-html
pnpm typecheck       # vue-tsc, strict
pnpm test            # Vitest: unit tests and Vue Test Utils component tests
pnpm test:e2e        # Playwright against the local production build on port 3401 (run pnpm build first)
pnpm test:e2e:live   # the same Playwright suite against the deployed address
pnpm test:counts     # count the tests and write src/generated/test-counts.json (also run by pnpm build)
```

Chromium runs the whole end-to-end suite. Firefox and WebKit run the tests tagged `@smoke`: one pass through the first visit, the happy submit, the timeout and status check, the partial batch, and the accessibility check of the table at desktop and phone width. Install the browsers once with `pnpm exec playwright install chromium firefox webkit`.

The test counts on the "How it works" page are not typed in. `scripts/test-counts.mjs` runs the Vitest suite, asks Playwright to list its tests, and writes the numbers to `src/generated/test-counts.json`, which the page reads. `pnpm build` runs it first, and stops if a unit test fails.

`.github/workflows/ci.yml` is a GitHub Actions workflow that runs lint, typecheck, the unit and component tests and the build.

The end-to-end suite covers the happy submit, double submit, 503 then retry with the same key, timeout then status check, an unresolved submit kept across a reload and a new form, rate expiry, decimal commas, partial batch and retry of only the rejected lines, a batch whose answer is lost, duplicate references in a batch, filters kept in the URL across a reload, hostile values in the URL and in storage, a reload during a polling outage, visible rows at 1024 by 768 and with text-spacing overrides, axe on every page, and on a phone: no sideways scroll at 390 pixels, visible focus on every Tab stop, and 44 pixel touch targets. It fails on any Content-Security-Policy violation in the console. `vite preview` applies the headers from `vercel.json`, so the policy is tested locally as well.

To run the suite against another address: `E2E_BASE_URL=https://example.test pnpm exec playwright test`.

## Security notes

- API data is rendered as text only. There is no `v-html`.
- `vercel.json` sets a Content-Security-Policy for the app (same-origin scripts, styles and connections, no inline script, no `eval`, no framing) and a looser one for `/storybook/`: Storybook's shell uses inline script, and the stories compile their templates in the browser, which needs `eval`. The app's policy allows neither.
- `vercel.json` also sets caching: HTML and the worker script are always revalidated, and the hashed files under `/assets/` are cached for a year as immutable.
- Amounts are integer minor units end to end: a `bigint` in code, an integer string in props, storage and request bodies.
