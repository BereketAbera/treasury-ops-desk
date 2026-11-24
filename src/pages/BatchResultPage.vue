<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { DsAmount, DsBanner, DsButton, DsCopyButton, DsStatusBadge, type StatusName } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { formatDateTime, plural } from '@/lib/format'
import { api } from '@/lib/http'
import { newCorrelationId, newUuid } from '@/lib/ids'
import { countBatch, type Batch, type BatchItem } from '@/lib/types'

const route = useRoute()
const batch = ref<Batch | null>(null)
const loadState = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')
const busy = ref<'retry' | number | null>(null)
const notice = ref<{ tone: 'success' | 'danger' | 'warning'; text: string; correlationId?: string } | null>(null)

async function load(id: string) {
  loadState.value = 'loading'
  notice.value = null
  const result = await api.request<Batch>({ path: `/api/batches/${encodeURIComponent(id)}` })
  if (result.kind === 'ok') {
    batch.value = result.data
    loadState.value = 'ready'
  } else {
    batch.value = null
    loadState.value = result.kind === 'error' && result.status === 404 ? 'missing' : 'failed'
  }
}

watch(
  () => String(route.params.id),
  (id) => void load(id),
  { immediate: true },
)

const counts = computed(() => (batch.value ? countBatch(batch.value) : { total: 0, booked: 0, rejected: 0, unknown: 0 }))
const booked = computed(() => batch.value?.items.filter((item) => item.status === 'booked') ?? [])
const rejected = computed(() => batch.value?.items.filter((item) => item.status === 'rejected') ?? [])
const unknown = computed(() => batch.value?.items.filter((item) => item.status === 'outcome_unknown') ?? [])
const retryable = computed(() => rejected.value.filter((item) => item.failure?.retryable))
const notRetryable = computed(() => rejected.value.filter((item) => !item.failure?.retryable))

const badge = computed<{ status: StatusName; label: string }>(() => {
  const { booked: done, total } = counts.value
  const status: StatusName = done === total ? 'booked' : done === 0 ? 'failed' : 'partially_completed'
  return { status, label: `${done} of ${total} booked` }
})

async function retryRejected() {
  if (!batch.value || busy.value !== null || retryable.value.length === 0) return
  busy.value = 'retry'
  notice.value = null
  const correlationId = newCorrelationId()
  const bookedBefore = counts.value.booked
  // Only the rejected lines go out. Each gets a new item key: the old key would return the same rejection.
  const items = retryable.value.map((item) => ({ line: item.line, itemKey: newUuid() }))
  const result = await api.request<{ batch: Batch; retried: number[] }>({
    method: 'POST',
    path: `/api/batches/${batch.value.id}/retry`,
    body: { items },
    correlationId,
  })
  busy.value = null
  if (result.kind === 'ok') {
    batch.value = result.data.batch
    const nowBooked = result.data.batch.items.filter((item) => result.data.retried.includes(item.line) && item.status === 'booked').length
    notice.value = {
      tone: nowBooked === items.length ? 'success' : 'warning',
      text: `Retried ${plural(items.length, 'instruction')}: ${nowBooked} booked. The ${bookedBefore} booked earlier were not sent again.`,
    }
  } else {
    notice.value = {
      tone: 'danger',
      text: result.kind === 'error' ? `${result.error.message} (${result.status})` : 'No answer arrived for the retry. Reload this page to see the state of each line before trying again.',
      correlationId,
    }
  }
}

async function checkItem(item: BatchItem) {
  if (!batch.value || busy.value !== null) return
  busy.value = item.line
  notice.value = null
  const correlationId = newCorrelationId()
  const result = await api.request<{ batch: Batch; line: number; received: boolean }>({
    method: 'POST',
    path: `/api/batches/${batch.value.id}/items/${item.line}/status-check`,
    correlationId,
  })
  busy.value = null
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
}
</script>

<template>
  <div class="page result">
    <template v-if="loadState === 'loading'">
      <h1 id="page-title" tabindex="-1">Batch result</h1>
      <p class="muted" role="status">Loading the batch.</p>
    </template>

    <template v-else-if="loadState !== 'ready' || !batch">
      <h1 id="page-title" tabindex="-1">Batch not found</h1>
      <DsBanner :tone="loadState === 'missing' ? 'neutral' : 'danger'" :title="loadState === 'missing' ? 'There is no batch with this ID' : 'The batch could not be loaded'">
        <p v-if="loadState === 'missing'">Batches live in this browser tab only. Resetting the demo data or opening a new tab removes them.</p>
        <p v-else>The API did not answer. Reload the page to try again.</p>
        <template #actions>
          <RouterLink to="/batches/new" class="ds-button ds-button--secondary ds-button--md">Go to batches</RouterLink>
        </template>
      </DsBanner>
    </template>

    <template v-else>
      <header class="result__head">
        <div>
          <h1 id="page-title" tabindex="-1">
            Batch <span class="mono">{{ batch.id }}</span>
          </h1>
          <p class="muted">Submitted {{ formatDateTime(batch.createdAt) }}</p>
        </div>
        <DsStatusBadge :status="badge.status" :label="badge.label" data-testid="batch-badge" />
      </header>

      <p class="result__line" data-testid="batch-summary">
        {{ plural(counts.total, 'instruction') }}: <strong>{{ counts.booked }} booked</strong>, <strong>{{ counts.rejected }} rejected</strong>,
        <strong>{{ counts.unknown }} outcome unknown</strong>.
      </p>

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
          <DsButton v-if="retryable.length > 0" variant="primary" icon="refresh" :loading="busy === 'retry'" data-testid="retry-rejected" @click="retryRejected">
            Retry the {{ retryable.length }} rejected
          </DsButton>
        </div>
        <p>
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
          <table class="plain-table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col">Reason</th>
                <th scope="col">Next step</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in rejected" :key="item.line">
                <td class="right num">{{ item.line }}</td>
                <td class="mono">{{ item.reference }}</td>
                <td>{{ item.beneficiary.name }}</td>
                <td class="right"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td>
                  <DsStatusBadge status="rejected" :label="item.failure?.retryable ? 'Rejected, can retry' : 'Rejected, final'" />
                  <span class="result__reason">{{ item.failure?.message }} <code>{{ item.failure?.code }}</code></span>
                </td>
                <td>{{ item.failure?.nextStep }}</td>
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
          <table class="plain-table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in unknown" :key="item.line">
                <td class="right num">{{ item.line }}</td>
                <td class="mono">{{ item.reference }}</td>
                <td>{{ item.beneficiary.name }}</td>
                <td class="right"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td><DsStatusBadge status="outcome_unknown" /></td>
                <td>
                  <DsButton size="sm" :loading="busy === item.line" data-testid="check-item" @click="checkItem(item)">Check status</DsButton>
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
          <table class="plain-table">
            <thead>
              <tr>
                <th scope="col" class="right">Line</th>
                <th scope="col">Reference</th>
                <th scope="col">Beneficiary</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col">Payout</th>
                <th scope="col" class="right">Attempts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in booked" :key="item.line">
                <td class="right num">{{ item.line }}</td>
                <td class="mono">{{ item.reference }}</td>
                <td>{{ item.beneficiary.name }}</td>
                <td class="right"><DsAmount :minor="item.target.amountMinor" :currency="item.target.currency" :decimals="decimalsOf(item.target.currency)" /></td>
                <td>
                  <RouterLink v-if="item.payoutId" class="mono" :to="{ path: '/', query: { selected: item.payoutId } }">{{ item.payoutId }}</RouterLink>
                </td>
                <td class="right num">{{ item.attempts }}</td>
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
        <p><RouterLink to="/batches/new">Upload another batch</RouterLink></p>
      </section>
    </template>
  </div>
</template>

<style lang="scss">
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

  &__reason {
    display: block;
    margin-top: 2px;
  }

  &__ids {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);

    .mono {
      overflow-wrap: anywhere;
    }
  }
}
</style>
