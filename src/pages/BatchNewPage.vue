<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { DsAmount, DsBanner, DsButton, DsCopyButton, DsIcon, DsStatusBadge } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { failureOf, sendWithRetry } from '@/lib/api'
import { parseBatchCsv, type BatchRow } from '@/lib/batchCsv'
import { formatDateTime, plural } from '@/lib/format'
import { api } from '@/lib/http'
import { newCorrelationId, newIdempotencyKey } from '@/lib/ids'
import { SUBMIT_POLICY } from '@/lib/retry'
import { findRoute, routeLabel } from '@/lib/routes'
import { batchBadge, type Batch } from '@/lib/types'
import { useSimulateStore } from '@/stores/simulate'

const route = useRoute()
const router = useRouter()
const simulate = useSimulateStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
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

async function readFile(file: File | undefined) {
  if (!file) return
  if (file.size > 500_000) {
    rows.value = []
    fileName.value = file.name
    fileProblem.value = 'The file is larger than 500 KB. Split it into smaller batches.'
    return
  }
  load(await file.text(), file.name)
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  await readFile(input.files?.[0])
  // Clear the input, so choosing the same file again is still a change.
  input.value = ''
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  await readFile(event.dataTransfer?.files[0])
}

/** A short run tag, so each load of the sample has references no earlier load used. */
function runTag(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function loadSample() {
  const response = await fetch('/sample-batch.csv')
  if (!response.ok) {
    fileProblem.value = 'The sample file could not be loaded.'
    return
  }
  // A reference names one payout, so the same file cannot be booked twice. The sample is given
  // fresh references on each load: BAT-1001 in the file becomes BAT-<run>-1001 here.
  const tag = runTag()
  const text = (await response.text()).replace(/^BAT-(\d+),/gm, `BAT-${tag}-$1,`)
  load(text, 'sample-batch.csv')
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

function amountOf(row: BatchRow) {
  const target = findRoute(row.draft.routeId)?.target
  return row.item && target ? { minor: row.item.targetAmountMinor, currency: target, decimals: decimalsOf(target) } : null
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
      <p><RouterLink to="/batches">All batches</RouterLink></p>
    </header>

    <DsBanner v-if="!simulate.isNormal" tone="warning" :title="`Simulate is set to: ${simulate.scenario.label}`" data-testid="simulate-banner">
      <p>{{ simulate.scenario.watch }}</p>
    </DsBanner>

    <section class="card batch__step" aria-labelledby="batch-file-heading">
      <h2 id="batch-file-heading">1. Choose a file</h2>
      <div
        class="batch__drop"
        :class="{ 'batch__drop--over': dragging }"
        data-testid="batch-drop"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <p id="batch-file-label" class="batch__label">Batch file (CSV)</p>
        <p id="batch-file-hint" class="muted">Columns: reference, beneficiary, bank, account, route, amount, purpose. Up to 1,000 lines.</p>
        <div class="batch__pick">
          <DsButton icon="upload" aria-describedby="batch-file-label batch-file-hint" data-testid="choose-file" @click="fileInput?.click()">Choose a CSV file</DsButton>
          <span class="batch__file-name" data-testid="file-name">{{ fileName || 'No file chosen' }}</span>
          <span class="muted batch__drop-hint">or drop a file here</span>
        </div>
        <!-- The native control is hidden and kept out of the tab order. The button above opens it. -->
        <input ref="fileInput" id="batch-file" hidden type="file" accept=".csv,text/csv" aria-label="Batch file (CSV)" @change="onFile" />
      </div>
      <div class="batch__actions">
        <DsButton data-testid="load-sample" @click="loadSample">Load the sample batch (12 lines)</DsButton>
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
        <table class="plain-table plain-table--cards">
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
              <td class="right num" data-label="Line in the file">{{ row.line }}</td>
              <td class="mono" data-label="Reference">{{ row.draft.reference }}</td>
              <td data-label="Beneficiary">{{ row.draft.beneficiaryName }}</td>
              <td data-label="Route">{{ findRoute(row.draft.routeId) ? routeLabel(findRoute(row.draft.routeId)!) : row.draft.routeId }}</td>
              <td class="right num" data-label="Amount">
                <!-- A valid amount is shown the way every other amount is. A problem amount is shown as typed. -->
                <DsAmount v-if="amountOf(row)" v-bind="amountOf(row)!" />
                <template v-else>{{ row.draft.amount }} <span class="muted">{{ findRoute(row.draft.routeId)?.target }}</span></template>
              </td>
              <td :class="{ 'plain-table__wide': !row.item }" data-label="Check">
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
        <p v-if="failure.kind === 'unknown'">
          Do not upload the file again: a new upload gets a new key. Look for the batch under Recent batches below. Submitting
          again from this page is safe, because it reuses the same key and the API returns the first result.
        </p>
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
      <div class="table-scroll" role="region" aria-label="Recent batches table" tabindex="0">
        <table class="plain-table plain-table--cards">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Created</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="batch in recent" :key="batch.id">
              <td data-label="Batch">
                <RouterLink :to="`/batches/${batch.id}`" class="mono">{{ batch.id }}</RouterLink>
              </td>
              <td class="num" data-label="Created">{{ formatDateTime(batch.createdAt) }}</td>
              <td data-label="Result"><DsStatusBadge :status="batchBadge(batch).status" :label="batchBadge(batch).label" /></td>
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

  &__drop {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4);
    border: 1px dashed var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-canvas);
    font-size: var(--font-size-sm);

    &--over {
      border-style: solid;
      border-color: var(--color-primary);
      background: var(--color-row-selected);
    }
  }

  &__label {
    font-weight: var(--font-weight-bold);
  }

  &__pick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin-top: var(--space-2);
  }

  &__file-name {
    min-width: 0;
    font-weight: var(--font-weight-medium);
    overflow-wrap: anywhere;
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
      white-space: normal;
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
