<script setup lang="ts">
import { computed, ref } from 'vue'
import { DsBanner, DsButton, DsCopyButton } from '@/ds'
import { DEFAULT_TIMEOUT_MS } from '@/lib/api'
import { focusInView } from '@/lib/focus'
import { progressText, type SubmissionState } from '@/lib/submission'
import { SUBMIT_POLICY } from '@/lib/retry'

// What happened to a submit, in one region: failed with a reason, unknown, or not received. Each
// state says whether sending again is safe, and offers only the action that is. The payout form, the
// batch form and both retries use it, so an unknown outcome is handled the same way everywhere.

const props = defineProps<{
  state: SubmissionState
  /** What was sent. */
  what: 'payout' | 'batch' | 'retry'
}>()

const emit = defineEmits<{
  /** Send again with the same key, after a temporary failure. */
  retry: []
  /** Look the submit up by its idempotency key. */
  check: []
  /** Send again with the same key, after the check found nothing. */
  resend: []
}>()

defineSlots<{
  /** Before anything was sent. */
  idle?: () => unknown
  /** The result of an accepted submit. */
  accepted?: () => unknown
}>()

const timeoutSeconds = DEFAULT_TIMEOUT_MS / 1000
const root = ref<HTMLElement | null>(null)
const progress = computed(() => progressText(props.state))
const doubt = computed(() => `The ${props.what} may or may not have been received.`)

defineExpose({
  /** Moves focus to the result, so it is read out and the next action is one Tab away. */
  focus: () => focusInView(root.value),
})
</script>

<template>
  <div ref="root" class="submission" tabindex="-1" data-testid="submission-status" :data-phase="state.phase">
    <p class="ds-visually-hidden" role="status">{{ progress }}</p>

    <slot v-if="state.phase === 'idle'" name="idle" />
    <slot v-else-if="state.phase === 'accepted'" name="accepted" />

    <DsBanner v-else-if="state.phase === 'sending' || state.phase === 'backoff' || state.phase === 'checking'" tone="info" :title="state.phase === 'checking' ? 'Checking status' : 'Sending'">
      <p data-testid="attempt-line">{{ progress }}</p>
      <p v-if="state.phase !== 'checking'" class="muted">
        Up to {{ SUBMIT_POLICY.maxAttempts }} attempts go out on their own, with a longer wait each time. Every attempt carries the same idempotency key.
      </p>
    </DsBanner>

    <DsBanner v-else-if="state.phase === 'retryable'" tone="warning" :title="`Temporary failure: the service answered ${state.status}`" announce="alert">
      <p>{{ state.attempts }} attempts failed. {{ state.message }}</p>
      <p>A retry is safe. It carries the same idempotency key, so the {{ what }} cannot be made twice.</p>
      <p class="submission__id">
        Correlation ID <span class="mono">{{ state.correlationId }}</span>
        <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
      </p>
      <template #actions>
        <DsButton variant="primary" data-testid="retry-same-key" @click="emit('retry')">Retry with the same key</DsButton>
      </template>
    </DsBanner>

    <DsBanner v-else-if="state.phase === 'final'" tone="danger" :title="`Not accepted (${state.status})`" announce="alert">
      <p>{{ state.message }}</p>
      <p>Sending the same request again will not help. <template v-if="what === 'payout'">Correct the form, then submit.</template></p>
      <p class="submission__id">
        Correlation ID <span class="mono">{{ state.correlationId }}</span>
        <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
      </p>
    </DsBanner>

    <DsBanner v-else-if="state.phase === 'unknown'" tone="unknown" :title="`We could not confirm this ${what}`" announce="alert">
      <p v-if="state.reason === 'reload'">{{ what === 'retry' ? 'This page was left while a retry' : 'This form was left while a submit' }} was unresolved. {{ doubt }}</p>
      <p v-else-if="state.reason === 'timeout'">No answer arrived within {{ timeoutSeconds }} seconds. {{ doubt }}</p>
      <p v-else-if="state.reason === 'server-error'">The API failed part way and gave no usable answer. {{ doubt }}</p>
      <p v-else-if="state.reason === 'key-used'">The API already holds a different request under this idempotency key, so an earlier send did arrive.</p>
      <p v-else>The connection failed before an answer arrived. {{ doubt }}</p>
      <p><strong>Do not resend. Check status.</strong> The check looks the {{ what }} up by its idempotency key.</p>
      <p v-if="state.checkFailed">The status check did not get a usable answer. Try the check again.</p>
      <p v-if="state.correlationId" class="submission__id">
        Correlation ID <span class="mono">{{ state.correlationId }}</span>
        <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
      </p>
      <template #actions>
        <DsButton variant="primary" data-testid="check-status" @click="emit('check')">Check status</DsButton>
      </template>
    </DsBanner>

    <DsBanner v-else-if="state.phase === 'not-received'" tone="warning" title="Not received, safe to resend" announce="alert">
      <p>The API has no {{ what }} under this idempotency key, so the request never arrived. Resending cannot pay twice: it carries the same key.</p>
      <p class="submission__id">
        Correlation ID <span class="mono">{{ state.correlationId }}</span>
        <DsCopyButton :value="state.correlationId" label="Copy correlation ID" />
      </p>
      <template #actions>
        <DsButton variant="primary" data-testid="resend" @click="emit('resend')">Resend with the same key</DsButton>
      </template>
    </DsBanner>
  </div>
</template>

<style lang="scss">
.submission {
  scroll-margin: var(--space-3);

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: var(--radius-md);
  }

  &__id {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);

    .mono {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
}
</style>
