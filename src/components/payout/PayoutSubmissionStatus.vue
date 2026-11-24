<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubmissionStatus from '@/components/SubmissionStatus.vue'
import { DsBanner, DsButton } from '@/ds'
import { formatMoney } from '@/lib/currencies'
import type { SubmissionState } from '@/lib/submission'
import type { Payout } from '@/lib/types'

// The shared submission region, with what the payout form says before a submit and after an accepted one.

defineProps<{ state: SubmissionState<Payout> }>()

const emit = defineEmits<{
  retry: []
  check: []
  resend: []
  startNew: []
}>()

const region = ref<{ focus: () => void } | null>(null)

defineExpose({ focus: () => region.value?.focus() })
</script>

<template>
  <SubmissionStatus ref="region" :state="state" what="payout" @retry="emit('retry')" @check="emit('check')" @resend="emit('resend')">
    <template #idle>
      <DsBanner tone="neutral" title="Nothing sent yet">
        <p>The result of your submit appears here: accepted, failed with a reason, or unknown.</p>
      </DsBanner>
    </template>

    <template #accepted>
      <DsBanner
        v-if="state.phase === 'accepted'"
        tone="success"
        :title="state.how === 'replay' ? 'Already received, not sent twice' : state.how === 'status-check' ? 'Received' : 'Payout accepted'"
        announce="status"
      >
        <p v-if="state.how === 'replay'">
          The same request went out more than once with one idempotency key. The API answered with the first result,
          marked as a replay, so one payout exists: <span class="mono">{{ state.result.id }}</span
          >.
        </p>
        <p v-else-if="state.how === 'status-check'">
          The status check found payout <span class="mono">{{ state.result.id }}</span> under this idempotency key. It
          was recorded before the answer was lost. Nothing needs resending.
        </p>
        <template v-else>
          <p>
            <span class="mono">{{ state.result.id }}</span> for {{ formatMoney(state.result.target) }} to
            {{ state.result.beneficiary.name }}<template v-if="state.attempts > 1">, on attempt {{ state.attempts }}</template>.
          </p>
          <p>It shows in the instruction table as awaiting confirmation until the list catches up, a few seconds from now.</p>
        </template>
        <template #actions>
          <RouterLink class="ds-button ds-button--primary ds-button--md" :to="{ path: '/', query: { selected: state.result.id } }">View in the instruction table</RouterLink>
          <DsButton @click="emit('startNew')">New payout</DsButton>
        </template>
      </DsBanner>
    </template>
  </SubmissionStatus>
</template>
