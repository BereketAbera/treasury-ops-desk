import { computed, ref } from 'vue'
import { failureOf, sendWithRetry, type ApiClient, type RetryHooks } from './api'
import { newCorrelationId, newIdempotencyKey } from './ids'
import { SUBMIT_POLICY, type RetryPolicy } from './retry'
import type { CreatePayoutBody, Payout } from './types'

// The life of one payout submit. One idempotency key covers the whole life:
// automatic retries, manual retries and the resend after a status check all
// carry it, so the API can never create the payout twice.

export type SubmissionState =
  | { phase: 'idle' }
  | { phase: 'sending'; attempt: number; maxAttempts: number }
  | { phase: 'backoff'; failedAttempt: number; nextAttempt: number; delayMs: number; status: number }
  | { phase: 'accepted'; payout: Payout; attempts: number; how: 'answer' | 'replay' | 'status-check' }
  | { phase: 'retryable'; status: number; message: string; attempts: number; correlationId: string }
  | {
      phase: 'final'
      status: number
      code: string
      message: string
      fields: Record<string, string>
      correlationId: string
    }
  | { phase: 'unknown'; reason: 'timeout' | 'network' | 'server-error' | 'reload'; correlationId: string | null; checkFailed: boolean }
  | { phase: 'checking'; correlationId: string }
  | { phase: 'not-received'; correlationId: string }

export interface SubmissionDeps {
  client: ApiClient
  policy?: RetryPolicy
  sleep?: RetryHooks['sleep']
  random?: RetryHooks['random']
  /** True when the Simulate control asks for the request to be sent twice. */
  takeDuplicate?: () => boolean
  /** Start from an earlier key, for example one restored after a reload. */
  idempotencyKey?: string
  /** The restored key may already have been sent: start in "outcome unknown". */
  mayHaveBeenSent?: boolean
}

interface KeyLookup {
  key: string
  received: boolean
  payout: Payout | null
}

export function createSubmission(deps: SubmissionDeps) {
  const policy = deps.policy ?? SUBMIT_POLICY
  const idempotencyKey = ref(deps.idempotencyKey ?? newIdempotencyKey())
  const attempts = ref(0)
  const state = ref<SubmissionState>(
    deps.mayHaveBeenSent
      ? { phase: 'unknown', reason: 'reload', correlationId: null, checkFailed: false }
      : { phase: 'idle' },
  )
  let lastBody: CreatePayoutBody | null = null

  const busy = computed(() => ['sending', 'backoff', 'checking'].includes(state.value.phase))
  /** While true, the form must not be edited or submitted. */
  const locked = computed(() => busy.value || ['accepted', 'unknown', 'not-received', 'retryable'].includes(state.value.phase))

  async function send(body: CreatePayoutBody): Promise<void> {
    lastBody = body
    // One correlation ID per operator action. Every automatic attempt of this action shares it.
    const correlationId = newCorrelationId()
    const options = {
      method: 'POST' as const,
      path: '/api/payouts',
      body,
      idempotencyKey: idempotencyKey.value,
      correlationId,
    }
    const { result, attempts: made } = await sendWithRetry<Payout>(deps.client, options, policy, {
      firstAttempt: attempts.value + 1,
      sleep: deps.sleep,
      random: deps.random,
      onAttempt: (attempt) => {
        attempts.value = attempt
        state.value = { phase: 'sending', attempt, maxAttempts: policy.maxAttempts }
      },
      onBackoff: (info) => {
        state.value = { phase: 'backoff', ...info }
      },
    })
    attempts.value = made

    if (result.kind === 'ok') {
      if (!result.replayed && deps.takeDuplicate?.()) {
        // Simulated duplicate: the same request goes out again with the same key.
        attempts.value += 1
        state.value = { phase: 'sending', attempt: attempts.value, maxAttempts: policy.maxAttempts }
        const second = await deps.client.request<Payout>({ ...options, attempt: attempts.value })
        if (second.kind === 'ok') {
          state.value = {
            phase: 'accepted',
            payout: second.data,
            attempts: attempts.value,
            how: second.replayed ? 'replay' : 'answer',
          }
          return
        }
      }
      state.value = { phase: 'accepted', payout: result.data, attempts: attempts.value, how: result.replayed ? 'replay' : 'answer' }
      return
    }

    const failure = failureOf(result)
    if (result.kind === 'error' && failure === 'retryable') {
      state.value = { phase: 'retryable', status: result.status, message: result.error.message, attempts: attempts.value, correlationId }
    } else if (result.kind === 'error' && failure === 'final') {
      state.value = {
        phase: 'final',
        status: result.status,
        code: result.error.code,
        message: result.error.message,
        fields: result.error.fields ?? {},
        correlationId,
      }
    } else {
      state.value = {
        phase: 'unknown',
        reason: result.kind === 'timeout' ? 'timeout' : result.kind === 'network' ? 'network' : 'server-error',
        correlationId,
        checkFailed: false,
      }
    }
  }

  /** Submits the payout. Ignored while a submit is in flight or its outcome is unresolved. */
  async function submit(body: CreatePayoutBody): Promise<boolean> {
    if (state.value.phase !== 'idle' && state.value.phase !== 'final') return false
    state.value = { phase: 'sending', attempt: attempts.value + 1, maxAttempts: policy.maxAttempts }
    await send(body)
    return true
  }

  /** Sends the same body again with the same key. Only offered when that is known to be safe. */
  async function retry(body?: CreatePayoutBody): Promise<boolean> {
    if (state.value.phase !== 'retryable' && state.value.phase !== 'not-received') return false
    const again = body ?? lastBody
    if (!again) return false
    state.value = { phase: 'sending', attempt: attempts.value + 1, maxAttempts: policy.maxAttempts }
    await send(again)
    return true
  }

  /** Asks the API whether it has seen this idempotency key. */
  async function checkStatus(): Promise<void> {
    if (state.value.phase !== 'unknown') return
    const previous = state.value
    const correlationId = newCorrelationId()
    state.value = { phase: 'checking', correlationId }
    const result = await deps.client.request<KeyLookup>({
      path: `/api/idempotency-keys/${encodeURIComponent(idempotencyKey.value)}`,
      correlationId,
    })
    if (result.kind === 'ok' && result.data.received && result.data.payout) {
      state.value = { phase: 'accepted', payout: result.data.payout, attempts: attempts.value, how: 'status-check' }
    } else if (result.kind === 'ok') {
      state.value = { phase: 'not-received', correlationId }
    } else {
      state.value = { ...previous, correlationId, checkFailed: true }
    }
  }

  /** Starts a new intent: a new key, no attempts. */
  function reset(): void {
    idempotencyKey.value = newIdempotencyKey()
    attempts.value = 0
    lastBody = null
    state.value = { phase: 'idle' }
  }

  return { state, idempotencyKey, attempts, busy, locked, submit, retry, checkStatus, reset }
}

export type Submission = ReturnType<typeof createSubmission>
