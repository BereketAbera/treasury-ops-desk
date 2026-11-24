<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { DsBanner, DsButton, DsCopyButton, DsIcon, DsStatusBadge } from '@/ds'
import { failureOf, sendWithRetry } from '@/lib/api'
import { parseBatchCsv, type BatchRow } from '@/lib/batchCsv'
import { formatDateTime, plural } from '@/lib/format'
import { api } from '@/lib/http'
import { newCorrelationId, newIdempotencyKey } from '@/lib/ids'
import { SUBMIT_POLICY } from '@/lib/retry'
import { findRoute, routeLabel } from '@/lib/routes'
import { countBatch, type Batch } from '@/lib/types'
import { useSimulateStore } from '@/stores/simulate'

const route = useRoute()
const router = useRouter()
const simulate = useSimulateStore()

const fileName = ref('')
const rows = ref<BatchRow[]>([])
const fileProblem = ref('')
const idempotencyKey = ref(newIdempotencyKey())
const sending = ref(false)
const attemptText = ref('')
const failure = ref<{ kind: 'retryable' | 'final' | 'unknown'; message: string; correlationId: string } | null>(null)
const recent = ref<Batch[]>([])

const valid = computed(() => rows.value.filter((row) => row.item !== null))
const invalid = computed(() => rows.value.filter((row) => row.item === null))

function load(text: string, name: string) {
  const parsed = parseBatchCsv(text)
  fileName.value = name
  failure.value = null
  // A new file is a new intent, so it gets a new batch key.
  idempotencyKey.value = newIdempotencyKey()
  if (parsed.ok) {
    rows.value = parsed.rows
    fileProblem.value = ''
  } else {
    rows.value = []
    fileProblem.value = parsed.problem
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 500_000) {
    rows.value = []
    fileProblem.value = 'The file is larger than 500 KB. Split it into smaller batches.'
    return
  }
  load(await file.text(), file.name)
}

async function loadSample() {
  const response = await fetch('/sample-batch.csv')
  if (!response.ok) {
    fileProblem.value = 'The sample file could not be loaded.'
    return
  }
  load(await response.text(), 'sample-batch.csv')
}

function removeInvalid() {
  rows.value = valid.value
}

async function submit() {
  if (sending.value || valid.value.length === 0 || invalid.value.length > 0) return
  sending.value = true
  failure.value = null
  const correlationId = newCorrelationId()
  const { result } = await sendWithRetry<Batch>(
    api,
    {
      method: 'POST',
      path: '/api/batches',
      body: { items: valid.value.map((row) => row.item) },
      idempotencyKey: idempotencyKey.value,
      correlationId,
    },
    SUBMIT_POLICY,
    {
      onAttempt: (attempt) => (attemptText.value = `Sending, attempt ${attempt}.`),
      onBackoff: (info) =>
        (attemptText.value = `Attempt ${info.failedAttempt} failed with status ${info.status}. Attempt ${info.nextAttempt} goes out in ${(info.delayMs / 1000).toFixed(1)} seconds.`),
    },
  )
  sending.value = false
  attemptText.value = ''
  if (result.kind === 'ok') {
    await router.push(`/batches/${result.data.id}`)
    return
  }
  const kind = failureOf(result) ?? 'unknown'
  failure.value = {
    kind,
    correlationId,
    message:
      result.kind === 'error'
        ? `${result.error.message} (${result.status})`
        : 'No answer arrived. The batch may or may not have been received.',
  }
  if (kind === 'unknown') await loadRecent()
}

async function loadRecent() {
  const result = await api.request<{ items: Batch[] }>({ path: '/api/batches' })
  if (result.kind === 'ok') recent.value = result.data.items
}

function batchBadge(batch: Batch) {
  const counts = countBatch(batch)
  const status = counts.booked === counts.total ? 'booked' : counts.booked === 0 ? 'failed' : 'partially_completed'
  return { status, label: `${counts.booked} of ${counts.total} booked` } as const
}

onMounted(async () => {
  if (route.query.sample === '1') {
    const query = { ...route.query }
    delete query.sample
    await router.replace({ query })
    await loadSample()
  }
  await loadRecent()
})
</script>

<template>
  <div class="page batch">
    <header>
      <h1 id="page-title" tabindex="-1">New batch</h1>
      <p class="page__lead">
        Upload a CSV of payout instructions. Each line is checked here first, then booked by the API one by one. Some can
        be booked while others fail, and the result page says which.
      </p>
    </header>

    <DsBanner v-if="!simulate.isNormal" tone="warning" :title="`Simulate is set to: ${simulate.scenario.label}`" data-testid="simulate-banner">
      <p>{{ simulate.scenario.watch }}</p>
    </DsBanner>

    <section class="card batch__step" aria-labelledby="batch-file-heading">
      <h2 id="batch-file-heading">1. Choose a file</h2>
      <div class="batch__file">
        <label class="batch__label" for="batch-file">Batch file (CSV)</label>
        <p id="batch-file-hint" class="muted">Columns: reference, beneficiary, bank, account, route, amount, purpose. Up to 1,000 lines.</p>
        <input id="batch-file" class="batch__input" type="file" accept=".csv,text/csv" aria-describedby="batch-file-hint" @change="onFile" />
      </div>
      <div class="batch__actions">
        <DsButton icon="upload" data-testid="load-sample" @click="loadSample">Load the sample batch (12 lines)</DsButton>
        <a href="/sample-batch.csv" download>Download the sample file</a>
      </div>
      <DsBanner v-if="fileProblem" tone="danger" title="This file cannot be used" announce="alert">
        <p>{{ fileProblem }}</p>
      </DsBanner>
    </section>

    <section v-if="rows.length > 0" class="card batch__step" aria-labelledby="batch-check-heading">
      <h2 id="batch-check-heading">2. Check the instructions</h2>
      <p data-testid="batch-check-summary">
        <strong>{{ fileName }}</strong
        >: {{ plural(rows.length, 'instruction') }}, {{ valid.length }} valid, {{ invalid.length }} with problems.
      </p>
      <div class="table-scroll" role="region" aria-label="Instructions in the file" tabindex="0">
        <table class="plain-table">
          <thead>
            <tr>
              <th scope="col" class="right">Line</th>
              <th scope="col">Reference</th>
              <th scope="col">Beneficiary</th>
              <th scope="col">Route</th>
              <th scope="col" class="right">Amount</th>
              <th scope="col">Check</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.line">
              <td class="right num">{{ row.line }}</td>
              <td class="mono">{{ row.draft.reference }}</td>
              <td>{{ row.draft.beneficiaryName }}</td>
              <td>{{ findRoute(row.draft.routeId) ? routeLabel(findRoute(row.draft.routeId)!) : row.draft.routeId }}</td>
              <td class="right num">
                {{ row.draft.amount }} <span class="muted">{{ findRoute(row.draft.routeId)?.target }}</span>
              </td>
              <td>
                <span v-if="row.item" class="batch__ok"><DsIcon name="check-circle" :size="14" /> Valid</span>
                <ul v-else class="batch__problems">
                  <li v-for="problem in row.problems" :key="problem"><DsIcon name="x-circle" :size="14" /> {{ problem }}</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="batch__actions">
        <DsButton variant="primary" :loading="sending" :disabled="invalid.length > 0 || valid.length === 0" data-testid="submit-batch" @click="submit">
          Submit batch of {{ valid.length }}
        </DsButton>
        <DsButton v-if="invalid.length > 0" @click="removeInvalid">Remove the {{ plural(invalid.length, 'line') }} with problems</DsButton>
        <p v-if="invalid.length > 0" class="muted">A batch is only sent when every line is valid.</p>
        <p v-else class="muted batch__key">
          Batch idempotency key <span class="mono">{{ idempotencyKey }}</span>
          <DsCopyButton :value="idempotencyKey" label="Copy idempotency key" />
        </p>
      </div>
      <p class="ds-visually-hidden" role="status">{{ attemptText }}</p>
      <p v-if="attemptText" class="muted" aria-hidden="true">{{ attemptText }}</p>

      <DsBanner
        v-if="failure"
        :tone="failure.kind === 'final' ? 'danger' : failure.kind === 'unknown' ? 'unknown' : 'warning'"
        :title="failure.kind === 'unknown' ? 'We could not confirm this batch' : 'The batch was not accepted'"
        announce="alert"
      >
        <p>{{ failure.message }}</p>
        <p v-if="failure.kind === 'unknown'">Do not upload it again. Look for it under Recent batches below. Submitting again from this page reuses the same key, so it cannot be booked twice.</p>
        <p v-else-if="failure.kind === 'retryable'">Nothing was booked. Submitting again reuses the same idempotency key.</p>
        <p v-else>Sending the same batch again will not help.</p>
        <p class="batch__key">
          Correlation ID <span class="mono">{{ failure.correlationId }}</span>
          <DsCopyButton :value="failure.correlationId" label="Copy correlation ID" />
        </p>
      </DsBanner>
    </section>

    <section v-if="recent.length > 0" class="card batch__step" aria-labelledby="batch-recent-heading">
      <h2 id="batch-recent-heading">Recent batches</h2>
      <div class="table-scroll" role="region" aria-label="Recent batches" tabindex="0">
        <table class="plain-table">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Created</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="batch in recent" :key="batch.id">
              <td>
                <RouterLink :to="`/batches/${batch.id}`" class="mono">{{ batch.id }}</RouterLink>
              </td>
              <td class="num">{{ formatDateTime(batch.createdAt) }}</td>
              <td><DsStatusBadge :status="batchBadge(batch).status" :label="batchBadge(batch).label" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style lang="scss">
.batch {
  &__step {
    display: grid;
    gap: var(--space-3);
  }

  &__file {
    display: grid;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
  }

  &__label {
    font-weight: var(--font-weight-bold);
  }

  &__input {
    max-width: 100%;
    font: inherit;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
  }

  &__key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);

    .mono {
      overflow-wrap: anywhere;
    }
  }

  &__ok {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-success-text);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xs);
  }

  &__problems {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--color-danger-text);
    font-size: var(--font-size-sm);
  }
}
</style>
