<script setup lang="ts">
import { computed } from 'vue'
import { DsButton, DsCopyButton, DsDrawer, DsIcon, type IconName, type Tone } from '@/ds'
import type { RequestLogEntry } from '@/lib/api'
import { formatClock, formatDuration } from '@/lib/format'
import { shortId } from '@/lib/ids'
import { classifyStatus } from '@/lib/retry'
import { useRequestLogStore } from '@/stores/requestLog'

const log = useRequestLogStore()

interface Result {
  tone: Tone
  icon: IconName
  text: string
}

function resultOf(entry: RequestLogEntry): Result {
  if (entry.status === 'pending') return { tone: 'info', icon: 'progress', text: 'In flight' }
  if (entry.status === 'timeout') return { tone: 'unknown', icon: 'question-circle', text: 'No answer' }
  if (entry.status === 'network error') return { tone: 'unknown', icon: 'question-circle', text: 'No answer' }
  if (entry.replayed) return { tone: 'info', icon: 'copy', text: 'Replay' }
  const outcome = classifyStatus(entry.status)
  if (outcome === 'ok') return { tone: 'success', icon: 'check-circle', text: 'OK' }
  if (outcome === 'retryable') return { tone: 'warning', icon: 'alert-triangle', text: 'Retryable' }
  if (outcome === 'unknown') return { tone: 'unknown', icon: 'question-circle', text: 'Unknown' }
  return { tone: 'danger', icon: 'x-circle', text: 'Final' }
}

const rows = computed(() => log.entries.map((entry) => ({ entry, result: resultOf(entry) })))
const pollRows = computed(() => log.polls.map((entry) => ({ entry, result: resultOf(entry) })))

// The table sync polls every few seconds. All of those requests are folded into this one line.
const pollLine = computed(() => {
  const { count, lastStatus, lastAt } = log.pollSummary
  if (count === 0) return ''
  const last = lastStatus === null || lastAt === null ? '' : `, last ${lastStatus} at ${formatClock(lastAt)}`
  return `Polling: ${count} ${count === 1 ? 'request' : 'requests'}${last}`
})
</script>

<template>
  <DsDrawer :open="log.isOpen" title="Request log" side="bottom" @close="log.isOpen = false">
    <template #header-actions>
      <label class="log__toggle">
        <input v-model="log.showBackground" type="checkbox" />
        <span>Show the last table sync requests</span>
      </label>
      <DsButton size="sm" @click="log.clear()">Clear</DsButton>
    </template>

    <p v-if="pollLine" class="log__polls" data-testid="poll-summary">
      <DsIcon name="refresh" :size="14" />
      <span class="num">{{ pollLine }}</span>
      <span class="muted">Table sync, kept apart from the requests you made.</span>
    </p>
    <p v-if="rows.length === 0 && !(log.showBackground && pollRows.length > 0)" class="log__empty">
      No requests yet. Submit a payout or a batch and each request appears here with its correlation ID.
    </p>
    <div v-else class="table-scroll" role="region" aria-label="Request log entries" tabindex="0">
      <table class="plain-table plain-table--cards log__table" data-testid="request-log">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Method</th>
            <th scope="col">Path</th>
            <th scope="col">Status</th>
            <th scope="col">Result</th>
            <th scope="col" class="right">Duration</th>
            <th scope="col" class="right">Attempt</th>
            <th scope="col">Correlation ID</th>
            <th scope="col">Idempotency key</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ entry, result } in rows" :key="`${entry.startedAt}-${entry.id}`">
            <td class="num" data-label="Time">{{ formatClock(entry.startedAt) }}</td>
            <td data-label="Method">{{ entry.method }}</td>
            <td class="mono" data-label="Path">{{ entry.path }}</td>
            <td class="num" data-label="Status">{{ entry.status }}</td>
            <td data-label="Result">
              <span class="log__result" :class="`log__result--${result.tone}`">
                <DsIcon :name="result.icon" :size="14" />
                {{ result.text }}
              </span>
            </td>
            <td class="right num" data-label="Duration">{{ formatDuration(entry.durationMs) }}</td>
            <td class="right num" data-label="Attempt">{{ entry.attempt }}</td>
            <td data-label="Correlation ID">
              <span class="log__id">
                <span class="mono" :title="entry.correlationId">{{ entry.correlationId }}</span>
                <DsCopyButton :value="entry.correlationId" label="Copy correlation ID" />
              </span>
            </td>
            <td data-label="Idempotency key">
              <span v-if="entry.idempotencyKey" class="log__id">
                <span class="mono" :title="entry.idempotencyKey">{{ shortId(entry.idempotencyKey, 13) }}</span>
                <DsCopyButton :value="entry.idempotencyKey" label="Copy idempotency key" />
              </span>
              <span v-else class="muted">none</span>
            </td>
          </tr>
        </tbody>
        <tbody v-if="log.showBackground" data-testid="poll-rows">
          <tr v-for="{ entry, result } in pollRows" :key="`${entry.startedAt}-${entry.id}`" class="log__poll-row">
            <td class="num" data-label="Time">{{ formatClock(entry.startedAt) }}</td>
            <td data-label="Method">{{ entry.method }}</td>
            <td class="mono" data-label="Path">{{ entry.path }}</td>
            <td class="num" data-label="Status">{{ entry.status }}</td>
            <td data-label="Result">
              <span class="log__result" :class="`log__result--${result.tone}`">
                <DsIcon :name="result.icon" :size="14" />
                {{ result.text }}
              </span>
            </td>
            <td class="right num" data-label="Duration">{{ formatDuration(entry.durationMs) }}</td>
            <td class="right num" data-label="Attempt">{{ entry.attempt }}</td>
            <td data-label="Correlation ID">
              <span class="log__id">
                <span class="mono" :title="entry.correlationId">{{ entry.correlationId }}</span>
                <DsCopyButton :value="entry.correlationId" label="Copy correlation ID" />
              </span>
            </td>
            <td data-label="Idempotency key">
              <span v-if="entry.idempotencyKey" class="log__id">
                <span class="mono" :title="entry.idempotencyKey">{{ shortId(entry.idempotencyKey, 13) }}</span>
                <DsCopyButton :value="entry.idempotencyKey" label="Copy idempotency key" />
              </span>
              <span v-else class="muted">none</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </DsDrawer>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.log {
  &__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);

    input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--color-primary);
    }
  }

  &__empty {
    padding: var(--space-4);
    color: var(--color-muted);
  }

  &__polls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-divider);
    background: var(--color-canvas);
    font-size: var(--font-size-sm);
  }

  &__poll-row td {
    color: var(--color-muted);
  }

  &__table {
    td,
    th {
      padding-top: 5px;
      padding-bottom: 5px;
      white-space: nowrap;
      vertical-align: middle;
    }

    th {
      position: sticky;
      top: 0;
    }
  }

  &__id {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  &__result {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xs);

    &--success {
      color: var(--color-success-text);
    }

    &--warning {
      color: var(--color-warning-text);
    }

    &--danger {
      color: var(--color-danger-text);
    }

    &--info {
      color: var(--color-info-text);
    }

    &--unknown {
      color: var(--color-unknown-text);
    }
  }
}

@media (max-width: t.$breakpoint-phone) {
  .log {
    &__toggle {
      min-height: 44px;
    }

    &__table {
      padding: var(--space-2) var(--space-3);

      td,
      th {
        white-space: normal;
      }
    }

    &__id .mono {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
}
</style>
