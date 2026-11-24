<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BatchArrival from '@/components/BatchArrival.vue'
import SubmissionStatus from '@/components/SubmissionStatus.vue'
import { DsAmount, DsBanner, DsButton, DsCopyButton, DsStatusBadge, type StatusName } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { focusInView } from '@/lib/focus'
import { formatDateTime, plural } from '@/lib/format'
import { api } from '@/lib/http'
import { newCorrelationId, newUuid } from '@/lib/ids'
import type { AcceptedHow, BatchRetryResult } from '@/lib/submission'
import { batchBadge, countBatch, type Batch, type BatchItem } from '@/lib/types'
import { useSubmitsStore } from '@/stores/submits'

const route = useRoute()
const submits = useSubmitsStore()
const batch = ref<Batch | null>(null)
const loadState = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')
const checking = ref<number | null>(null)
const notice = ref<{ tone: 'success' | 'danger' | 'warning'; text: string; correlationId?: string } | null>(null)
/** Set by the form that submitted this batch, when the answer was a replay or came from a status check. */
const arrival = ref<AcceptedHow | null>(null)

const batchId = computed(() => String(route.params.id))
// A retry is a submit like any other: one key, kept by the store until its outcome is known.
const retry = shallowRef(submits.batchRetry(batchId.value))
const retryState = computed(() => retry.value.state.value)
const statusRegion = ref<{ focus: () => void } | null>(null)

async function load(id: string) {
  loadState.value = 'loading'
  notice.value = null
  const how: unknown = window.history.state?.arrival
  arrival.value = how === 'replay' || how === 'status-check' ? how : null
  const result = await api.request<Batch>({ path: `/api/batches/${encodeURIComponent(id)}` })
  if (result.kind === 'ok') {
    batch.value = result.data
    loadState.value = 'ready'
  } else {
    batch.value = null
    loadState.value = result.kind === 'error' && result.status === 404 ? 'missing' : 'failed'
  }
  void onRetryPhase(false)
}

watch(
  batchId,
  (id, previous) => {
    if (previous !== undefined) {
      submits.release(retry.value)
      retry.value = submits.batchRetry(id)
    }
    void load(id)
  },
  { immediate: true },
)
onBeforeUnmount(() => submits.release(retry.value))

const counts = computed(() => (batch.value ? countBatch(batch.value) : { total: 0, booked: 0, rejected: 0, unknown: 0 }))
const booked = computed(() => batch.value?.items.filter((item) => item.status === 'booked') ?? [])
const rejected = computed(() => batch.value?.items.filter((item) => item.status === 'rejected') ?? [])
const unknown = computed(() => batch.value?.items.filter((item) => item.status === 'outcome_unknown') ?? [])
const retryable = computed(() => rejected.value.filter((item) => item.failure?.retryable))
const notRetryable = computed(() => rejected.value.filter((item) => !item.failure?.retryable))

const badge = computed<{ status: StatusName; label: string }>(() => batchBadge(batch.value ?? { items: [] }))

// After an action removes the button that had focus (the rejected group disappears once it is retried),
// focus goes to the page heading instead of falling back to the top of the document.
async function focusHeading() {
  await nextTick()
  focusInView(document.getElementById('page-title'))
}

async function retryRejected() {
  if (checking.value !== null || retry.value.locked.value || retryable.value.length === 0) return
  notice.value = null
  arrival.value = null
  // Only the rejected lines go out. Each gets a new item key: the old key would return the same rejection.
  const body = { items: retryable.value.map((item) => ({ line: item.line, itemKey: newUuid() })) }
  retry.value.holdDraft(body)
  await retry.value.submit(body)
}

function resendRetry() {
  return retry.value.retry(retry.value.draft() ?? undefined)
}

function retryNotice(result: BatchRetryResult, how: AcceptedHow): NonNullable<typeof notice.value> {
  const nowBooked = result.batch.items.filter((item) => result.retried.includes(item.line) && item.status === 'booked').length
  const before = countBatch(result.batch).booked - nowBooked
  const lead = { answer: '', replay: 'Already received, not sent twice. ', 'status-check': 'The status check found this retry. It was received before the answer was lost. ' }[how]
  return {
    tone: nowBooked === result.retried.length ? 'success' : 'warning',
    text: `${lead}Retried ${plural(result.retried.length, 'instruction')}: ${nowBooked} booked. The ${before} booked earlier were not sent again.`,
  }
}

async function onRetryPhase(moveFocus: boolean) {
  const current = retryState.value
  if (current.phase === 'accepted') {
    batch.value = current.result.batch
    notice.value = retryNotice(current.result, current.how)
    retry.value.startNew()
    if (moveFocus) await focusHeading()
  } else if (current.phase === 'final') {
    notice.value = { tone: 'danger', text: `${current.message} (${current.status})`, correlationId: current.correlationId }
    retry.value.startNew()
    if (moveFocus) await focusHeading()
  } else if (moveFocus && ['retryable', 'unknown', 'not-received'].includes(current.phase)) {
    await nextTick()
    statusRegion.value?.focus()
  }
}

watch(
  () => retryState.value.phase,
  () => void onRetryPhase(true),
)

async function checkItem(item: BatchItem) {
  if (!batch.value || checking.value !== null || retry.value.busy.value) return
  checking.value = item.line
  notice.value = null
  const correlationId = newCorrelationId()
  const result = await api.request<{ batch: Batch; line: number; received: boolean }>({
    method: 'POST',
    path: `/api/batches/${batch.value.id}/items/${item.line}/status-check`,
    correlationId,
  })
  checking.value = null
  if (result.kind === 'ok') {
    batch.value = result.data.batch
    notice.value = result.data.received
      ? { tone: 'success', text: `Line ${item.line} was received and is booked. It was not sent again.` }
      : { tone: 'warning', text: `Line ${item.line} was not received. It is now listed as rejected.` }
  } else {
    notice.value = {
      tone: 'danger',
      text: result.kind === 'error' ? `${result.error.message} (${result.status})` : 'No answer arrived for the status check. Try the check again.',
      correlationId,
    }
  }
  void focusHeading()
}
</script>

<template>
  <div class="page result">
    <!-- One heading element for every state of the page, so the focus it gets on arrival is never lost. -->
    <header class="result__head">
      <div>
        <h1 id="page-title" tabindex="-1">
          <template v-if="loadState === 'loading'">Batch result</template>
          <template v-else-if="loadState !== 'ready' || !batch">Batch not found</template>
          <template v-else>Batch <span class="mono">{{ batch.id }}</span></template>
        </h1>
        <p v-if="loadState === 'loading'" class="muted" role="status">Loading the batch.</p>
        <p v-else-if="batch" class="muted">Submitted {{ formatDateTime(batch.createdAt) }}</p>
      </div>
      <DsStatusBadge v-if="loadState === 'ready' && batch" :status="badge.status" :label="badge.label" data-testid="batch-badge" />
    </header>

    <template v-if="loadState !== 'loading' && (loadState !== 'ready' || !batch)">
      <DsBanner :tone="loadState === 'missing' ? 'neutral' : 'danger'" :title="loadState === 'missing' ? 'There is no batch with this ID' : 'The batch could not be loaded'">
        <p v-if="loadState === 'missing'">Batches live in this browser tab only. Resetting the demo data or opening a new tab removes them.</p>
        <p v-else>The API did not answer. Reload the page to try again.</p>
        <template #actions>
          <RouterLink to="/batches" class="ds-button ds-button--secondary ds-button--md">Go to batches</RouterLink>
        </template>
      </DsBanner>
    </template>

    <template v-else-if="batch">
      <p class="result__line" data-testid="batch-summary">
        {{ plural(counts.total, 'instruction') }}: <strong>{{ counts.booked }} booked</strong>, <strong>{{ counts.rejected }} rejected</strong>,
        <strong>{{ counts.unknown }} outcome unknown</strong>.
      </p>

      <BatchArrival v-if="arrival" :how="arrival" :batch-id="batch.id" />

      <SubmissionStatus
        v-if="retryState.phase !== 'idle' && retryState.phase !== 'accepted'"
        ref="statusRegion"
        :state="retryState"
        what="retry"
        @retry="resendRetry"
        @check="retry.checkStatus()"
        @resend="resendRetry"
      />

      <DsBanner v-if="notice" :tone="notice.tone" announce="status" data-testid="batch-notice">
        <p>{{ notice.text }}</p>
        <p v-if="notice.correlationId" class="result__ids">
          Correlation ID <span class="mono">{{ notice.correlationId }}</span>
          <DsCopyButton :value="notice.correlationId" label="Copy correlation ID" />
        </p>
      </DsBanner>

      <section v-if="rejected.length > 0" class="card result__group" aria-labelledby="group-rejected" data-testid="group-rejected">
        <div class="result__group-head">
          <h2 id="group-rejected">Rejected ({{ rejected.length }})</h2>
          <DsButton
            v-if="retryable.length > 0"
            variant="primary"
            icon="refresh"
            :loading="retry.busy.value"
            :disabled="retry.locked.value && !retry.busy.value"
            data-testid="retry-rejected"
            @click="retryRejected"
          >
            Retry the {{ retryable.length }} rejected
          </DsButton>
        </div>
        <p v-if="retry.unresolved.value">A retry of rejected lines has gone out and its outcome is not known yet, so a line listed here may have been booked since.</p>
        <p v-else>
          These were not booked and no money moved for them. The reason is next to each one.
          <template v-if="retryable.length > 0">
            Retry sends only {{ retryable.length === 1 ? 'this line' : `these ${retryable.length} lines` }}. The booked
            lines are not sent again.
          </template>
          <template v-if="notRetryable.length > 0">
            {{ plural(notRetryable.length, 'line') }} cannot be retried as {{ notRetryable.length === 1 ? 'it is' : 'they are' }}: correct the data and upload
            {{ notRetryable.length === 1 ? 'it' : 'them' }} in a new batch.
          </template>
        </p>
        <div class="table-scroll" role="region" aria-label="Rejected instructions" tabindex="0">
          <table class="plain-table plain-table--cards result__table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col" class="result__col-name">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col" class="result__col-reason">Reason</th>
                <th scope="col" class="result__col-next">Next step</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in rejected" :key="item.line">
                <td class="right num" data-label="Line in the file">{{ item.line }}</td>
                <td class="mono" data-label="Reference">{{ item.reference }}</td>
                <td class="result__name" data-label="Beneficiary">{{ item.beneficiary.name }}</td>
                <td class="right" data-label="Amount"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td class="plain-table__wide" data-label="Reason">
                  <DsStatusBadge status="rejected" :label="!item.failure?.retryable ? 'Rejected, final' : retry.unresolved.value ? 'Rejected, retry sent' : 'Rejected, can retry'" />
                  <span class="result__reason">{{ item.failure?.message }} <code>{{ item.failure?.code }}</code></span>
                </td>
                <td class="plain-table__wide" data-label="Next step">
                  {{ item.failure?.retryable && retry.unresolved.value ? 'Check the status of the retry first.' : item.failure?.nextStep }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="unknown.length > 0" class="card result__group" aria-labelledby="group-unknown" data-testid="group-unknown">
        <h2 id="group-unknown">Outcome unknown ({{ unknown.length }})</h2>
        <p>
          The API did not confirm {{ unknown.length === 1 ? 'this line' : 'these lines' }}. It may have been booked. Do not
          resend it: check status first, so the beneficiary cannot be paid twice.
        </p>
        <div class="table-scroll" role="region" aria-label="Instructions with unknown outcome" tabindex="0">
          <table class="plain-table plain-table--cards result__table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col" class="result__col-name">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in unknown" :key="item.line">
                <td class="right num" data-label="Line in the file">{{ item.line }}</td>
                <td class="mono" data-label="Reference">{{ item.reference }}</td>
                <td class="result__name" data-label="Beneficiary">{{ item.beneficiary.name }}</td>
                <td class="right" data-label="Amount"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td data-label="Status"><DsStatusBadge status="outcome_unknown" /></td>
                <td data-label="Action">
                  <DsButton size="sm" :loading="checking === item.line" data-testid="check-item" @click="checkItem(item)">Check status</DsButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="booked.length > 0" class="card result__group" aria-labelledby="group-booked" data-testid="group-booked">
        <h2 id="group-booked">Booked ({{ booked.length }})</h2>
        <p>These were accepted and each one is now a payout in the instruction table. They are never sent again by a retry.</p>
        <div class="table-scroll" role="region" aria-label="Booked instructions" tabindex="0">
          <table class="plain-table plain-table--cards result__table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col" class="result__col-name">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col">Payout</th>
                <th scope="col" class="right">Attempts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in booked" :key="item.line">
                <td class="right num" data-label="Line in the file">{{ item.line }}</td>
                <td class="mono" data-label="Reference">{{ item.reference }}</td>
                <td class="result__name" data-label="Beneficiary">{{ item.beneficiary.name }}</td>
                <td class="right" data-label="Amount"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td data-label="Payout">
                  <RouterLink v-if="item.payoutId" class="mono" :to="{ path: '/', query: { selected: item.payoutId } }">{{ item.payoutId }}</RouterLink>
                </td>
                <td class="right num" data-label="Attempts">{{ item.attempts }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card result__group" aria-labelledby="group-ids">
        <h2 id="group-ids">Identifiers</h2>
        <dl class="kv">
          <dt>Batch idempotency key</dt>
          <dd class="result__ids">
            <span class="mono">{{ batch.idempotencyKey }}</span>
            <DsCopyButton :value="batch.idempotencyKey" label="Copy idempotency key" />
          </dd>
          <dt>Correlation ID</dt>
          <dd class="result__ids">
            <span class="mono">{{ batch.correlationId }}</span>
            <DsCopyButton :value="batch.correlationId" label="Copy correlation ID" />
          </dd>
        </dl>
        <p class="result__links">
          <RouterLink to="/batches/new">Upload another batch</RouterLink>
          <RouterLink to="/batches">All batches</RouterLink>
        </p>
      </section>
    </template>
  </div>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.result {
  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__line {
    font-size: var(--font-size-lg);
  }

  &__group {
    display: grid;
    gap: var(--space-3);
  }

  &__group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  // The name stays on one line and the two text columns share what is left.
  &__name {
    white-space: nowrap;
  }

  &__col-reason {
    width: 30%;
  }

  &__col-next {
    width: 28%;
  }

  &__reason {
    display: block;
    margin-top: 2px;
  }

  &__ids {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;

    .mono {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
  }
}

@media (max-width: t.$breakpoint-phone) {
  .result {
    &__name {
      white-space: normal;
    }

    &__group .kv {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;

      dd {
        margin-bottom: var(--space-2);
      }
    }
  }
}
</style>
