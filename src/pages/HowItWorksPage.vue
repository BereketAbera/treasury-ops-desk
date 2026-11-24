<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DsStatusBadge } from '@/ds'
import { TEST_COUNTS } from '@/lib/testCounts'
</script>

<template>
  <div class="page how">
    <header>
      <h1 id="page-title" tabindex="-1">How it works</h1>
      <p class="page__lead">
        Payout desk is a sample internal tool for a treasury operations team. This page says what is real, what is
        simulated, and why a few things are built the way they are. Sample by Bereket A.
      </p>
    </header>

    <nav class="how__toc" aria-label="On this page">
      <a href="#real">Real and simulated</a>
      <a href="#answers">What the screen does with each answer</a>
      <a href="#production">What production would use</a>
      <a href="#security">Security notes</a>
      <a href="#tests">Tests</a>
      <a href="#api-notes">Component API notes</a>
      <a href="#sources">Sources</a>
    </nav>

    <section id="real" class="card how__section">
      <h2>Real and simulated</h2>
      <div class="table-scroll" role="region" aria-label="Real and simulated parts" tabindex="0">
        <table class="plain-table">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Real</th>
              <th scope="col">Simulated</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Requests</th>
              <td>
                Every call is a real <code>fetch</code> to <code>/api/...</code> with <code>Idempotency-Key</code>,
                <code>X-Correlation-Id</code> and <code>X-Attempt</code> headers. They show in the browser's Network tab.
              </td>
              <td>A service worker (Mock Service Worker) answers them inside your browser. There is no server.</td>
            </tr>
            <tr>
              <th scope="row">Data</th>
              <td>The rules: integer minor units, decimal places per currency, limits, formats, purpose codes.</td>
              <td>
                Every company, bank, account, amount and rate is invented. The limits, thresholds and account formats are
                examples, not any scheme's real rules.
              </td>
            </tr>
            <tr>
              <th scope="row">State</th>
              <td>Kept in memory and mirrored to <code>sessionStorage</code>, so it survives a reload.</td>
              <td>It ends with the tab. "Reset demo data" restores the 60 seeded instructions.</td>
            </tr>
            <tr>
              <th scope="row">Idempotency</th>
              <td>The mock stores the first result under each key and returns it for a repeat, with <code>Idempotent-Replayed: true</code>.</td>
              <td>Keys are kept for the tab's life. A real API would expire them, often after 24 hours.</td>
            </tr>
            <tr>
              <th scope="row">Eventual consistency</th>
              <td>The table polls every 3 seconds, shows when it last synced, and marks itself out of date when a sync fails.</td>
              <td>The list endpoint leaves a new payout out for 4 seconds, then moves it to sent and completed on a timer.</td>
            </tr>
            <tr>
              <th scope="row">Failures</th>
              <td>The handling: backoff, attempt counts, status checks, partial results.</td>
              <td>The Simulate control decides which failure the mock produces next.</td>
            </tr>
            <tr>
              <th scope="row">Table</th>
              <td>Sort, filters and the selected row are in the URL.</td>
              <td>Sorting and filtering run in the browser because the list is small. A long list would page and filter on the server.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="answers" class="card how__section">
      <h2>What the screen does with each answer</h2>
      <p>The rule: only resend when it is known to be safe, and say which case this is.</p>
      <div class="table-scroll" role="region" aria-label="Handling of each answer" tabindex="0">
        <table class="plain-table">
          <thead>
            <tr>
              <th scope="col">Answer</th>
              <th scope="col">Meaning</th>
              <th scope="col">What the operator sees</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">201</th>
              <td>Accepted.</td>
              <td>The payout appears in the table at once as <DsStatusBadge status="awaiting_confirmation" />, then settles through polling.</td>
            </tr>
            <tr>
              <th scope="row">201 with replay header</th>
              <td>This key was already used. The first result is returned.</td>
              <td>"Already received, not sent twice."</td>
            </tr>
            <tr>
              <th scope="row">503, 429, 502, 504</th>
              <td>The server did not do the work. Retryable.</td>
              <td>Up to 3 attempts with a growing wait and a visible count, then a manual "Retry with the same key".</td>
            </tr>
            <tr>
              <th scope="row">422, 409, other 4xx</th>
              <td>A final answer. The same request will get it again.</td>
              <td>The reason, tied to the fields where possible, and no retry button.</td>
            </tr>
            <tr>
              <th scope="row">Timeout, dropped connection, 500</th>
              <td>No usable answer. The work may or may not have happened.</td>
              <td><DsStatusBadge status="outcome_unknown" /> with "Check status" and no resend, until the check says "received" or "not received, safe to resend".</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        To see a final 422, submit a payout whose account number ends in <code>0000</code>: the mock bank does not
        recognise it. To see a 409, reuse a reference that already exists, for example one from the table.
      </p>
      <p>
        Two IDs travel with a request and they do different jobs. The idempotency key names the intent: one payout, however
        many times it is sent. The correlation ID names one operator action and all its attempts, so support can find it
        in logs. A manual retry is a new action, so it gets a new correlation ID and keeps the key.
      </p>
    </section>

    <section id="production" class="card how__section">
      <h2>What production would use</h2>
      <ul>
        <li>A real payout API behind an authenticated session, in place of the service worker.</li>
        <li>Server push or a shorter poll for status changes. Polling is used here because it is simple to reason about and to fail.</li>
        <li>Real user monitoring and tracing that pick up the same correlation ID, so a request can be followed from the click to the backend logs. The request log drawer stands in for that here.</li>
        <li>Approval by a second person before release. The seeded "awaiting approval" rows show the state, but there is no approve action.</li>
        <li>Server-side paging, sorting and filtering for the table.</li>
        <li>The component library published as a versioned package, with a changelog, in place of a folder in this repository.</li>
      </ul>
    </section>

    <section id="security" class="card how__section">
      <h2>Security notes</h2>
      <ul>
        <li>API data is only ever rendered as text. There is no <code>v-html</code> anywhere, and a lint rule rejects one if it is added.</li>
        <li>
          A Content-Security-Policy header is set for every app route: scripts, styles, fonts and connections from this origin
          only, no inline script, no <code>eval</code>, no framing. Storybook's own shell uses inline script, and the stories
          compile their templates in the browser, which needs <code>eval</code>. So <code>/storybook/</code> has its own looser
          policy, and the app's policy allows neither.
        </li>
        <li>Amounts are integer minor units from the input to the request body: a bigint in code, an integer string on the wire. No float touches money.</li>
        <li>Nothing is written to <code>localStorage</code>. Session state is in <code>sessionStorage</code> and holds only fictional data.</li>
        <li>The mock API checks every rule again. The browser's validation is a convenience and the API's answer is the truth.</li>
        <li>There is no login in this sample, so there is no session cookie and no CSRF token. With cookie sessions, state-changing requests would carry a CSRF token and cookies would be <code>SameSite</code> and <code>HttpOnly</code>.</li>
      </ul>
    </section>

    <section id="tests" class="card how__section">
      <h2>Tests</h2>
      <div class="table-scroll" role="region" aria-label="Test commands" tabindex="0">
        <table class="plain-table">
          <thead>
            <tr>
              <th scope="col">Command</th>
              <th scope="col">What it runs</th>
              <th scope="col" class="right">Tests</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>pnpm test</code></td>
              <td>Vitest unit tests: money parsing and formatting, validation, backoff, the API client's idempotency behaviour, the submit state machine, the stores, the CSV parser.</td>
              <td class="right num">{{ TEST_COUNTS.unit }}</td>
            </tr>
            <tr>
              <td><code>pnpm test</code></td>
              <td>Vue Test Utils component tests: MoneyInput, Field, StatusBadge, DataTable, Countdown, Drawer.</td>
              <td class="right num">{{ TEST_COUNTS.component }}</td>
            </tr>
            <tr>
              <td><code>pnpm test:e2e</code></td>
              <td>Playwright against a local build: every flow on this page, axe on every page, no sideways scroll at 390 pixels.</td>
              <td class="right num">{{ TEST_COUNTS.endToEnd }}</td>
            </tr>
            <tr>
              <td><code>pnpm test:e2e:live</code></td>
              <td>The same Playwright suite against the deployed address.</td>
              <td class="right num">{{ TEST_COUNTS.endToEnd }}</td>
            </tr>
            <tr>
              <td><code>pnpm lint</code>, <code>pnpm typecheck</code></td>
              <td>ESLint and vue-tsc in strict mode.</td>
              <td class="right muted">n/a</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="api-notes" class="card how__section">
      <h2>Component API notes</h2>
      <p>Three decisions in the component library under <code>src/ds/</code>, written for the engineers who would consume it. The components are in <a href="/storybook/">Storybook</a>.</p>

      <h3>1. MoneyInput emits minor units as an integer string, never a number</h3>
      <p>
        <code>v-model</code> is <code>"245000000"</code> for 2,450,000.00 NGN, or <code>null</code> while the text is not a
        valid amount. A JavaScript number cannot hold every amount exactly (0.1 + 0.2 is the usual example, and USDC has six
        decimal places), and JSON has no bigint. A string of digits survives JSON, URLs and storage unchanged, and the
        consumer converts it with <code>BigInt()</code> for arithmetic. The currency's decimal places are a required prop, not
        a guess from the currency code, so a zero-decimal currency such as UGX and a six-decimal asset such as USDC are
        handled by the same rule. Extra decimal places are reported as a problem and never rounded away.
      </p>

      <h3>2. StatusBadge takes a status, not a colour</h3>
      <p>
        The prop is <code>status</code>, a closed union. One file maps each status to a tone, an icon and a label, so a
        consumer cannot ship a colour-only badge or invent a new meaning for purple. An optional <code>label</code> replaces
        the text for cases with counts, such as <DsStatusBadge status="partially_completed" label="9 of 12 booked" />, while
        the tone and icon stay tied to the status. Adding a status is one line in the map and a type error everywhere a
        switch does not handle it yet.
      </p>

      <h3>3. How a breaking change would ship</h3>
      <p>
        The library would follow semantic versioning, with release notes built from Conventional Commits. Take a change to
        DataTable's <code>select</code> event from "the row" to "the row key". Step one, in a minor release: add the new
        event under a new name, keep the old one, and warn in development when the old one is listened to. Step two: a
        migration note with before and after code, and a codemod if the change is mechanical. Step three, in the next major
        release: remove the old event. Consumers get at least one minor release in which both work, so no team has to
        upgrade and migrate in the same change.
      </p>
    </section>

    <section id="sources" class="card how__section">
      <h2>Sources</h2>
      <p>The behaviour follows public API documentation. No vendor's product screen was copied.</p>
      <ul>
        <li><a href="https://docs.stripe.com/api/idempotent_requests" rel="noopener noreferrer">Stripe: idempotent requests</a>, for storing the first result under a key and replaying it.</li>
        <li><a href="https://docs.stripe.com/error-low-level" rel="noopener noreferrer">Stripe: low-level error handling</a>, for treating a 500 as an unknown outcome and the <code>Idempotent-Replayed</code> header.</li>
        <li><a href="https://docs.wise.com/guides/product/send-money/tracking-transfers" rel="noopener noreferrer">Wise: tracking transfers</a>, for an explicit unknown status.</li>
        <li><a href="https://www.airwallex.com/docs/payouts/batch-transfers/create-a-batch-transfer/batch-transfer-statuses" rel="noopener noreferrer">Airwallex: batch transfer statuses</a>, for batch and item statuses and a partially booked batch.</li>
        <li><a href="https://carbondesignsystem.com/patterns/status-indicator-pattern/" rel="noopener noreferrer">Carbon: status indicators</a>, for status that never relies on colour alone.</li>
        <li><a href="https://en.wikipedia.org/wiki/ISO_4217" rel="noopener noreferrer">ISO 4217</a>, for minor units per currency.</li>
      </ul>
      <p><RouterLink to="/">Back to the instruction table</RouterLink></p>
    </section>
  </div>
</template>

<style lang="scss">
.how {
  &__toc {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    font-size: var(--font-size-sm);
  }

  &__section {
    display: grid;
    gap: var(--space-3);

    h3 {
      margin-top: var(--space-2);
    }

    ul {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding-left: var(--space-5);
    }

    p,
    li {
      max-width: 86ch;
    }

    .plain-table th[scope='row'] {
      background: transparent;
      font-size: var(--font-size-sm);
    }
  }
}
</style>
