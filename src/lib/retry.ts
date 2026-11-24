// What to do after an answer, or after no answer.
//
//   retryable  A temporary failure (503, 429, 502, 504). It does not prove the
//              work was not done, so the resend is only safe because it carries
//              the same idempotency key. Sent again after a backoff.
//   final      The server gave its answer and will give it again (422, 409,
//              other 4xx). Sending the same request again cannot help.
//   unknown    No usable answer (timeout, dropped connection, 500, a 2xx that
//              cannot be read). The work may or may not have happened. Check
//              status before sending anything.

export type FailureClass = 'retryable' | 'final' | 'unknown'

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  factor: number
  maxDelayMs: number
  /** Share of the delay that may be added or removed at random, 0 to 1. */
  jitter: number
}

export const SUBMIT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 700,
  factor: 2,
  maxDelayMs: 6_000,
  jitter: 0.2,
}

export const POLL_POLICY: RetryPolicy = {
  maxAttempts: Number.POSITIVE_INFINITY,
  baseDelayMs: 3_000,
  factor: 2,
  maxDelayMs: 15_000,
  jitter: 0,
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504])

export function classifyStatus(status: number): 'ok' | FailureClass {
  if (status >= 200 && status < 300) return 'ok'
  // A 500 means the server failed part way: treat it like no answer at all.
  if (status === 500) return 'unknown'
  if (RETRYABLE_STATUSES.has(status)) return 'retryable'
  return 'final'
}

/**
 * Delay before the next attempt. `failedAttempts` is how many attempts have
 * failed so far (1 after the first failure).
 */
export function backoffDelay(failedAttempts: number, policy: RetryPolicy, random: () => number = Math.random): number {
  const exponential = policy.baseDelayMs * policy.factor ** Math.max(0, failedAttempts - 1)
  const capped = Math.min(exponential, policy.maxDelayMs)
  const spread = capped * policy.jitter
  const jittered = capped - spread + random() * spread * 2
  return Math.round(Math.min(jittered, policy.maxDelayMs))
}

export function shouldRetry(failure: FailureClass, attemptsMade: number, policy: RetryPolicy): boolean {
  return failure === 'retryable' && attemptsMade < policy.maxAttempts
}
