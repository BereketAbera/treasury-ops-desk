import { computed, ref, shallowRef } from 'vue'
import { failureOf, sendWithRetry, type ApiClient, type RetryHooks } from './api'
import { newCorrelationId, newIdempotencyKey } from './ids'
import { SUBMIT_POLICY, type RetryPolicy } from './retry'
import type { Batch, Payout } from './types'

// The life of one submit: a payout, a batch, or a retry of either. One
// idempotency key covers the whole life: automatic retries, manual retries and
// the resend after a status check all carry it, so the API can never do the
// work twice.

export type SubmissionState<T = unknown> =
  | { phase: 'idle' }
  | { phase: 'sending'; attempt: number; maxAttempts: number }
  | { phase: 'backoff'; failedAttempt: number; nextAttempt: number; delayMs: number; status: number }
  | { phase: 'accepted'; result: T; attempts: number; how: AcceptedHow }
  | { phase: 'retryable'; status: number; message: string; attempts: number; correlationId: string }
  | {
      phase: 'final'
      status: number
      code: string
      message: string
      fields: Record<string, string>
      correlationId: string
    }
  | { phase: 'unknown'; reason: UnknownReason; correlationId: string | null; checkFailed: boolean }
  | { phase: 'checking'; correlationId: string }
  | { phase: 'not-received'; correlationId: string }

export type Phase = SubmissionState['phase']
export type AcceptedHow = 'answer' | 'replay' | 'status-check'
export type UnknownReason = 'timeout' | 'network' | 'server-error' | 'key-used' | 'reload'

/** A request went out and its outcome is not settled: nothing else may be sent for it. */
export const UNRESOLVED_PHASES: readonly Phase[] = ['sending', 'backoff', 'unknown', 'checking', 'retryable']

/** What the API knows about an idempotency key. */
export interface KeyLookup {
  key: string
  received: boolean
  payout: Payout | null
  batch: Batch | null
  /** The lines a batch retry sent. */
  retried: number[] | null
}

/** Where a submit goes, and how to find its result in the answer to a status check. */
export interface SubmitTarget<T> {
  path: string
  pick: (lookup: KeyLookup) => T | null
}

export interface BatchRetryResult {
  batch: Batch
  retried: number[]
}

export const PAYOUT_TARGET: SubmitTarget<Payout> = { path: '/api/payouts', pick: (lookup) => lookup.payout ?? null }
export const BATCH_TARGET: SubmitTarget<Batch> = { path: '/api/batches', pick: (lookup) => lookup.batch ?? null }

export function payoutRetryTarget(payoutId: string): SubmitTarget<Payout> {
  return { path: `/api/payouts/${encodeURIComponent(payoutId)}/retry`, pick: PAYOUT_TARGET.pick }
}

export function batchRetryTarget(batchId: string): SubmitTarget<BatchRetryResult> {
  return {
    path: `/api/batches/${encodeURIComponent(batchId)}/retry`,
    pick: (lookup) => (lookup.batch ? { batch: lookup.batch, retried: lookup.retried ?? [] } : null),
  }
}

export interface SubmissionDeps<T> {
  client: ApiClient
  target: SubmitTarget<T>
  policy?: RetryPolicy
  sleep?: RetryHooks['sleep']
  random?: RetryHooks['random']
  /** Start from an earlier key, for example one restored after a reload. */
  idempotencyKey?: string
  /** The restored key may already have been sent: start in "outcome unknown". */
  mayHaveBeenSent?: boolean
  /** Attempts already sent with the restored key, so the count and X-Attempt carry on. */
  attempts?: number
  /** The correlation ID of the last send with the restored key. */
  correlationId?: string | null
  /** Called at once on every change of state, also while no page is showing this submit. */
  onChange?: (state: SubmissionState<T>) => void
}

export function createSubmission<B, T>(deps: SubmissionDeps<T>) {
  const policy = deps.policy ?? SUBMIT_POLICY
  const idempotencyKey = ref(deps.idempotencyKey ?? newIdempotencyKey())
  const attempts = ref(Math.max(0, Math.floor(deps.attempts ?? 0)))
  const state = shallowRef<SubmissionState<T>>(
    deps.mayHaveBeenSent
      ? { phase: 'unknown', reason: 'reload', correlationId: deps.correlationId ?? null, checkFailed: false }
      : { phase: 'idle' },
  )
  const lastCorrelationId = ref(deps.correlationId ?? null)
  let lastBody: B | null = null

  const busy = computed(() => ['sending', 'backoff', 'checking'].includes(state.value.phase))
  const unresolved = computed(() => UNRESOLVED_PHASES.includes(state.value.phase))
  /** While true, the form must not be edited or submitted. */
  const locked = computed(() => busy.value || ['accepted', 'unknown', 'not-received', 'retryable'].includes(state.value.phase))

  function set(next: SubmissionState<T>): void {
    state.value = next
    deps.onChange?.(next)
  }

  async function send(body: B): Promise<void> {
    lastBody = body
    // One correlation ID per operator action. Every automatic attempt of this action shares it.
    const correlationId = newCorrelationId()
    lastCorrelationId.value = correlationId
    const options = {
      method: 'POST' as const,
      path: deps.target.path,
      body,
      idempotencyKey: idempotencyKey.value,
      correlationId,
    }
    const { result, attempts: made } = await sendWithRetry<T>(deps.client, options, policy, {
      firstAttempt: attempts.value + 1,
      sleep: deps.sleep,
      random: deps.random,
      onAttempt: (attempt) => {
        attempts.value = attempt
        set({ phase: 'sending', attempt, maxAttempts: policy.maxAttempts })
      },
      onBackoff: (info) => {
        set({ phase: 'backoff', ...info })
      },
    })
    attempts.value = made

    if (result.kind === 'ok') {
      set({ phase: 'accepted', result: result.data, attempts: attempts.value, how: result.replayed ? 'replay' : 'answer' })
      return
    }

    const failure = failureOf(result)
    // The API holds another request under this key, so an earlier send did arrive: that is for a status check to settle.
    const keyUsed = result.kind === 'error' && result.error.code === 'idempotency_key_reused'
    if (result.kind === 'error' && failure === 'retryable') {
      set({ phase: 'retryable', status: result.status, message: result.error.message, attempts: attempts.value, correlationId })
    } else if (result.kind === 'error' && failure === 'final' && !keyUsed) {
      set({
        phase: 'final',
        status: result.status,
        code: result.error.code,
        message: result.error.message,
        fields: result.error.fields ?? {},
        correlationId,
      })
    } else {
      const reason = keyUsed ? 'key-used' : result.kind === 'error' ? 'server-error' : result.kind
      set({ phase: 'unknown', reason, correlationId, checkFailed: false })
    }
  }

  /** Submits. Ignored while a submit is in flight or its outcome is unresolved. */
  async function submit(body: B): Promise<boolean> {
    if (state.value.phase !== 'idle' && state.value.phase !== 'final') return false
    set({ phase: 'sending', attempt: attempts.value + 1, maxAttempts: policy.maxAttempts })
    await send(body)
    return true
  }

  /** Sends the same body again with the same key. Only offered when that is known to be safe. */
  async function retry(body?: B): Promise<boolean> {
    if (state.value.phase !== 'retryable' && state.value.phase !== 'not-received') return false
    const again = body ?? lastBody
    if (!again) return false
    set({ phase: 'sending', attempt: attempts.value + 1, maxAttempts: policy.maxAttempts })
    await send(again)
    return true
  }

  /** Asks the API whether it has seen this idempotency key. */
  async function checkStatus(): Promise<void> {
    if (state.value.phase !== 'unknown') return
    const previous = state.value
    const correlationId = newCorrelationId()
    set({ phase: 'checking', correlationId })
    const result = await deps.client.request<KeyLookup>({
      path: `/api/idempotency-keys/${encodeURIComponent(idempotencyKey.value)}`,
      correlationId,
    })
    const lookup = result.kind === 'ok' ? result.data : null
    const found = lookup?.received === true ? deps.target.pick(lookup) : null
    if (found) set({ phase: 'accepted', result: found, attempts: attempts.value, how: 'status-check' })
    else if (lookup?.received === false) set({ phase: 'not-received', correlationId })
    // No answer, or one that does not say yes or no, settles nothing.
    else set({ ...previous, correlationId, checkFailed: true })
  }

  /** Starts a new intent: a new key, no attempts. */
  function reset(): void {
    idempotencyKey.value = newIdempotencyKey()
    attempts.value = 0
    lastCorrelationId.value = null
    lastBody = null
    set({ phase: 'idle' })
  }

  return { state, idempotencyKey, attempts, lastCorrelationId, busy, unresolved, locked, submit, retry, checkStatus, reset }
}

/** The attempt in flight, or the wait before the next one, as a sentence. */
export function progressText(state: SubmissionState): string {
  if (state.phase === 'sending') return `Sending, attempt ${state.attempt}.`
  if (state.phase === 'backoff') {
    return `Attempt ${state.failedAttempt} failed with status ${state.status}. Attempt ${state.nextAttempt} goes out in ${(state.delayMs / 1000).toFixed(1)} seconds.`
  }
  return state.phase === 'checking' ? 'Checking status by idempotency key.' : ''
}
