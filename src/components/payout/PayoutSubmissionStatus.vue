<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DsBanner, DsButton, DsCopyButton } from '@/ds'
import { DEFAULT_TIMEOUT_MS } from '@/lib/api'
import { formatMoney } from '@/lib/currencies'
import type { SubmissionState } from '@/lib/submission'

// What happened to the submit, in one region: accepted, failed with a reason, or unknown.
// Each state says whether sending again is safe, and offers only the action that is.

defineProps<{
  state: SubmissionState
  /** The attempt in flight or the wait before the next one, as a sentence. */
  sendingText: string
}>()

const emit = defineEmits<{
  /** Send again with the same key, after a temporary failure. */
  retry: []
  /** Look the payout up by its idempotency key. */
  check: []
  /** Send again with the same key, after the check found nothing. */
  resend: []
  startNew: []
}>()

const timeoutSeconds = DEFAULT_TIMEOUT_MS / 1000
const root = ref<HTMLElement | null>(null)

defineExpose({
  /** Moves focus to the result, so it is read out and the next action is one Tab away. */
  focus: () => root.value?.focus(),
})
</script>

<template>
    <div ref="root" class="payout__status" tabindex="-1" data-testid="submission-status" :data-phase="state.phase">
      <p class="ds-visually-hidden" role="status">{{ sendingText }}</p>

      <DsBanner v-if="state.phase === 'idle'" tone="neutral" title="Nothing sent yet">
        <p>The result of your submit appears here: accepted, failed with a reason, or unknown.</p>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'sending' || state.phase === 'backoff' || state.phase === 'checking'" tone="info" :title="state.phase === 'checking' ? 'Checking status' : 'Sending'">
        <p data-testid="attempt-line">{{ sendingText }}</p>
        <p class="muted">Up to 3 attempts go out on their own, with a longer wait each time. Every attempt carries the same idempotency key.</p>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'accepted' && state.how === 'replay'" tone="success" title="Already received, not sent twice" announce="status">
        <p>
          The same request went out twice with one idempotency key. The API answered the second one with the first
          result, marked as a replay, so one payout exists: <span class="mono">{{ state.payout.id }}</span
          >.
        </p>
        <template #actions>
          <RouterLink class="ds-button ds-button--primary ds-button--md" :to="{ path: '/', query: { selected: state.payout.id } }">View in the instruction table</RouterLink>
          <DsButton @click="emit('startNew')">New payout</DsButton>
        </template>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'accepted' && state.how === 'status-check'" tone="success" title="Received" announce="status">
        <p>
          The status check found payout <span class="mono">{{ state.payout.id }}</span> under this idempotency key. It
          was recorded before the answer was lost. Nothing needs resending.
        </p>
        <template #actions>
          <RouterLink class="ds-button ds-button--primary ds-button--md" :to="{ path: '/', query: { selected: state.payout.id } }">View in the instruction table</RouterLink>
          <DsButton @click="emit('startNew')">New payout</DsButton>
        </template>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'accepted'" tone="success" title="Payout accepted" announce="status">
        <p>
          <span class="mono">{{ state.payout.id }}</span> for {{ formatMoney(state.payout.target) }} to
          {{ state.payout.beneficiary.name }}<template v-if="state.attempts > 1">, on attempt {{ state.attempts }}</template>.
        </p>
        <p>It shows in the instruction table as awaiting confirmation until the list catches up, a few seconds from now.</p>
        <template #actions>
          <RouterLink class="ds-button ds-button--primary ds-button--md" :to="{ path: '/', query: { selected: state.payout.id } }">View in the instruction table</RouterLink>
          <DsButton @click="emit('startNew')">New payout</DsButton>
        </template>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'retryable'" tone="warning" :title="`Not sent: the service answered ${state.status}`" announce="alert">
        <p>{{ state.attempts }} attempts failed. {{ state.message }}</p>
        <p>A retry is safe. It carries the same idempotency key, so the payout cannot be made twice.</p>
        <p class="payout__cid">
          Correlation ID <span class="mono">{{ state.correlationId }}</span>
          <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
        </p>
        <template #actions>
          <DsButton variant="primary" data-testid="retry-same-key" @click="emit('retry')">Retry with the same key</DsButton>
        </template>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'final'" tone="danger" :title="`Not accepted (${state.status})`" announce="alert">
        <p>{{ state.message }}</p>
        <p>Sending the same request again will not help. Correct the form, then submit.</p>
        <p class="payout__cid">
          Correlation ID <span class="mono">{{ state.correlationId }}</span>
          <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
        </p>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'unknown'" tone="unknown" title="We could not confirm this payout" announce="alert">
        <p v-if="state.reason === 'reload'">This form was left while a submit was unresolved. The payout may or may not have been received.</p>
        <p v-else-if="state.reason === 'timeout'">No answer arrived within {{ timeoutSeconds }} seconds. The payout may or may not have been received.</p>
        <p v-else-if="state.reason === 'server-error'">The API failed part way and gave no usable answer. The payout may or may not have been received.</p>
        <p v-else>The connection failed before an answer arrived. The payout may or may not have been received.</p>
        <p><strong>Do not resend. Check status.</strong> The check looks the payout up by its idempotency key.</p>
        <p v-if="state.checkFailed">The status check did not get an answer either. Try the check again.</p>
        <p v-if="state.correlationId" class="payout__cid">
          Correlation ID <span class="mono">{{ state.correlationId }}</span>
          <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
        </p>
        <template #actions>
          <DsButton variant="primary" data-testid="check-status" @click="emit('check')">Check status</DsButton>
        </template>
      </DsBanner>

      <DsBanner v-else-if="state.phase === 'not-received'" tone="warning" title="Not received, safe to resend" announce="alert">
        <p>The API has no payout under this idempotency key, so the request never arrived. Resending cannot pay twice: it carries the same key.</p>
        <p class="payout__cid">
          Correlation ID <span class="mono">{{ state.correlationId }}</span>
          <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
        </p>
        <template #actions>
          <DsButton variant="primary" data-testid="resend" @click="emit('resend')">Resend with the same key</DsButton>
        </template>
      </DsBanner>
    </div>
</template>
