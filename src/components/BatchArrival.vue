<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DsBanner } from '@/ds'
import type { AcceptedHow } from '@/lib/submission'

// How a batch came to be accepted, when that was not a plain answer to its submit.

defineProps<{
  how: AcceptedHow
  batchId: string
  /** Adds a link to the result, for the page that is not the result. */
  link?: boolean
}>()
</script>

<template>
  <DsBanner
    tone="success"
    :title="how === 'replay' ? 'Already received, not sent twice' : how === 'status-check' ? 'Received' : 'Batch accepted'"
    announce="status"
    data-testid="batch-arrival"
  >
    <p v-if="how === 'replay'">
      The same request went out more than once with one idempotency key. The API answered with the first result, marked as
      a replay, so one batch exists: <span class="mono">{{ batchId }}</span
      >.
    </p>
    <p v-else-if="how === 'status-check'">
      The status check found batch <span class="mono">{{ batchId }}</span> under its idempotency key. It was recorded before
      the answer was lost. Nothing needs resending.
    </p>
    <p v-else>
      Batch <span class="mono">{{ batchId }}</span> was accepted while another page was open.
    </p>
    <template v-if="link" #actions>
      <RouterLink class="ds-button ds-button--secondary ds-button--md" :to="`/batches/${batchId}`">View the batch result</RouterLink>
    </template>
  </DsBanner>
</template>
