<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BatchArrival from '@/components/BatchArrival.vue'
import SubmissionStatus from '@/components/SubmissionStatus.vue'
import { DsAmount, DsBanner, DsButton, DsCopyButton, DsIcon, DsStatusBadge } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { parseBatchCsv, type BatchRow } from '@/lib/batchCsv'
import { formatDateTime, plural } from '@/lib/format'
import { api } from '@/lib/http'
import { findRoute, routeLabel } from '@/lib/routes'
import { progressText, type AcceptedHow } from '@/lib/submission'
import { batchBadge, type Batch } from '@/lib/types'
import { useSimulateStore } from '@/stores/simulate'
import { useSubmitsStore } from '@/stores/submits'

const route = useRoute()
const router = useRouter()
const simulate = useSimulateStore()
const submits = useSubmitsStore()

// The submit belongs to the store, not to this page: leaving, reloading or asking for a new batch finds
// the same one, with the same key, until its outcome is known.
const submission = submits.batch()
const state = submission.state
const askedForNewBatch = ref(false)
const showUnresolvedNotice = computed(() => askedForNewBatch.value && ['unknown', 'checking'].includes(state.value.phase))

const fileInput = ref<HTMLInputElement | null>(null)
const statusRegion = ref<{ focus: () => void } | null>(null)
const dragging = ref(false)
const fileName = ref(submission.draft()?.fileName ?? '')
const rows = ref<BatchRow[]>(submission.draft()?.rows ?? [])
const fileProblem = ref('')
const recent = ref<Batch[]>([])

const valid = computed(() => rows.value.filter((row) => row.item !== null))
const invalid = computed(() => rows.value.filter((row) => row.item === null))

/** No file can be chosen and nothing can be submitted: a submit, or a retry of an earlier batch, has no known outcome. */
const locked = computed(() => submission.locked.value || submits.unresolvedRetryOf !== null)
const progress = computed(() => (state.value.phase === 'sending' || state.value.phase === 'backoff' ? progressText(state.value) : ''))

// The region at the top opens when there is something to decide. While a first send is on its way, the line
// beside Submit says so, and the page does not move.
const statusOpen = ref(state.value.phase !== 'idle')
/** A batch accepted while another page was open. */
const arrived = ref<{ batch: Batch; how: AcceptedHow } | null>(null)

async function onPhase() {
  const current = state.value
  if (current.phase === 'accepted') {
    startNew()
    await router.push({ path: `/batches/${current.result.id}`, state: { arrival: current.how } })
    return
  }
  if (current.phase === 'idle') statusOpen.value = false
  if (['retryable', 'final', 'unknown', 'checking', 'not-received'].includes(current.phase)) {
    statusOpen.value = true
    await nextTick()
    if (current.phase !== 'checking') statusRegion.value?.focus()
  }
  if (current.phase === 'unknown') await loadRecent()
}

if (state.value.phase === 'accepted') {
  arrived.value = { batch: state.value.result, how: state.value.how }
  startNew()
  statusOpen.value = false
}
watch(() => state.value.phase, onPhase)
onBeforeUnmount(() => submits.release(submission))

function startNew() {
  submission.startNew()
  fileName.value = ''
  rows.value = []
  fileProblem.value = ''
}

function load(text: string, name: string) {
  if (locked.value) return
  const parsed = parseBatchCsv(text)
  // A new file is a new intent, so it gets a new batch key.
  startNew()
  fileName.value = name
  if (parsed.ok) rows.value = parsed.rows
  else fileProblem.value = parsed.problem
}

async function readFile(file: File | undefined) {
  if (!file || locked.value) return
  if (file.size > 500_000) {
    startNew()
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
  if (locked.value) return
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
  if (!locked.value) rows.value = valid.value
}

function body() {
  return { items: rows.value.flatMap((row) => (row.item ? [row.item] : [])) }
}

async function submit() {
  if (locked.value || valid.value.length === 0 || invalid.value.length > 0) return
  submission.holdDraft({ fileName: fileName.value, rows: rows.value })
  await submission.submit(body())
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
    // A new sample is a new batch. While an earlier one is unresolved, that one is shown instead.
    if (locked.value) askedForNewBatch.value = true
    else await loadSample()
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

    <DsBanner v-if="showUnresolvedNotice" tone="unknown" title="One submit is still unresolved. Check its status first." announce="status" data-testid="unresolved-notice">
      <p>
        A new batch was asked for, but the earlier submit below has no known outcome. It is kept here, with its idempotency
        key, until its status is checked. Nothing was discarded and nothing was sent again.
      </p>
    </DsBanner>

    <SubmissionStatus
      v-if="statusOpen"
      ref="statusRegion"
      :state="state"
      what="batch"
      @retry="submission.retry(body())"
      @check="submission.checkStatus()"
      @resend="submission.retry(body())"
    />

    <DsBanner v-if="submits.unresolvedRetryOf" tone="unknown" title="A retry is still unresolved. Check its status first." announce="status" data-testid="unresolved-retry">
      <p>
        The retry of rejected lines in batch
        <RouterLink class="mono" :to="`/batches/${submits.unresolvedRetryOf}`">{{ submits.unresolvedRetryOf }}</RouterLink> has no known outcome. Open that
        batch and check the status of its retry. A new batch can be sent after that.
      </p>
    </DsBanner>

    <BatchArrival v-if="arrived" :how="arrived.how" :batch-id="arrived.batch.id" link />

    <DsBanner v-if="!simulate.isNormal" tone="warning" :title="`Simulate is set to: ${simulate.scenario.label}`" data-testid="simulate-banner">
      <p>{{ simulate.scenario.watch }}</p>
    </DsBanner>

    <section class="card batch__step" aria-labelledby="batch-file-heading">
      <h2 id="batch-file-heading">1. Choose a file</h2>
      <div
        class="batch__drop"
        :class="{ 'batch__drop--over': dragging && !locked }"
        data-testid="batch-drop"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <p id="batch-file-label" class="batch__label">Batch file (CSV)</p>
        <p id="batch-file-hint" class="muted">Columns: reference, beneficiary, bank, account, route, amount, purpose. Up to 1,000 lines.</p>
        <div class="batch__pick">
          <DsButton icon="upload" :disabled="locked" aria-describedby="batch-file-label batch-file-hint" data-testid="choose-file" @click="fileInput?.click()">Choose a CSV file</DsButton>
          <span class="batch__file-name" data-testid="file-name">{{ fileName || 'No file chosen' }}</span>
          <span v-if="!locked" class="muted batch__drop-hint">or drop a file here</span>
        </div>
        <!-- The native control is hidden and kept out of the tab order. The button above opens it. -->
        <input ref="fileInput" id="batch-file" hidden type="file" accept=".csv,text/csv" aria-label="Batch file (CSV)" :disabled="locked" @change="onFile" />
      </div>
      <div class="batch__actions">
        <DsButton :disabled="locked" data-testid="load-sample" @click="loadSample">Load the sample batch (12 lines)</DsButton>
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
        <DsButton
          variant="primary"
          :loading="submission.busy.value"
          :disabled="invalid.length > 0 || valid.length === 0 || (locked && !submission.busy.value)"
          data-testid="submit-batch"
          @click="submit"
        >
          Submit batch of {{ valid.length }}
        </DsButton>
        <DsButton v-if="invalid.length > 0" @click="removeInvalid">Remove the {{ plural(invalid.length, 'line') }} with problems</DsButton>
        <p v-if="invalid.length > 0" class="muted">A batch is only sent when every line is valid.</p>
        <p v-else class="muted batch__key">
          Batch idempotency key <span class="mono" data-testid="idempotency-key">{{ submission.idempotencyKey.value }}</span>
          <DsCopyButton :value="submission.idempotencyKey.value" label="Copy idempotency key" />
        </p>
      </div>
      <p v-if="locked && !submission.busy.value" class="muted">Locked until this submit is resolved.</p>
      <p v-if="!statusOpen" class="ds-visually-hidden" role="status">{{ progress }}</p>
      <p v-if="progress" class="muted" aria-hidden="true">{{ progress }}</p>
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
