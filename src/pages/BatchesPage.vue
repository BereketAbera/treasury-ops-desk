<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DsBanner, DsIcon, DsStatusBadge } from '@/ds'
import { formatDateTime } from '@/lib/format'
import { api } from '@/lib/http'
import { batchBadge, batchSummary, type Batch } from '@/lib/types'

const batches = ref<Batch[]>([])
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
const correlationId = ref('')

async function load() {
  loadState.value = 'loading'
  const result = await api.request<{ items: Batch[] }>({ path: '/api/batches' })
  correlationId.value = result.correlationId
  if (result.kind === 'ok') {
    batches.value = result.data.items
    loadState.value = 'ready'
  } else {
    loadState.value = 'failed'
  }
}

onMounted(load)
</script>

<template>
  <div class="page batches">
    <header class="batches__head">
      <div>
        <h1 id="page-title" tabindex="-1">Batches</h1>
        <p class="page__lead">Every batch uploaded in this tab, newest first, with what happened to its instructions.</p>
      </div>
      <RouterLink to="/batches/new" class="ds-button ds-button--primary ds-button--md">
        <DsIcon name="plus" />
        <span>New batch</span>
      </RouterLink>
    </header>

    <p v-if="loadState === 'loading'" class="muted" role="status">Loading batches.</p>

    <DsBanner v-else-if="loadState === 'failed'" tone="danger" title="The batches could not be loaded" announce="alert">
      <p>The API did not answer. Reload the page to try again.</p>
      <p class="muted">Correlation ID <span class="mono">{{ correlationId }}</span></p>
    </DsBanner>

    <DsBanner v-else-if="batches.length === 0" tone="neutral" title="No batches yet" data-testid="batches-empty">
      <p>Upload a CSV of payout instructions, or load the sample of 12 lines, and the batch is listed here.</p>
      <template #actions>
        <RouterLink to="/batches/new?sample=1" class="ds-button ds-button--secondary ds-button--md">Open the sample batch</RouterLink>
      </template>
    </DsBanner>

    <section v-else class="card" aria-labelledby="batches-list-heading">
      <h2 id="batches-list-heading" class="ds-visually-hidden">Batch list</h2>
      <div class="table-scroll" role="region" aria-label="Batches table" tabindex="0">
        <table class="plain-table plain-table--cards" data-testid="batches-table">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Submitted</th>
              <th scope="col">Result</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="batch in batches" :key="batch.id">
              <td data-label="Batch">
                <RouterLink :to="`/batches/${batch.id}`" class="mono">{{ batch.id }}</RouterLink>
              </td>
              <td class="num" data-label="Submitted">{{ formatDateTime(batch.createdAt) }}</td>
              <td data-label="Result"><DsStatusBadge :status="batchBadge(batch).status" :label="batchBadge(batch).label" /></td>
              <td class="plain-table__wide" data-label="Summary">{{ batchSummary(batch) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style lang="scss">
.batches {
  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }
}
</style>
