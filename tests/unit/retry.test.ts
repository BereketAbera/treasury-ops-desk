import { describe, expect, it } from 'vitest'
import { backoffDelay, classifyStatus, POLL_POLICY, shouldRetry, SUBMIT_POLICY, type RetryPolicy } from '@/lib/retry'

const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 700, factor: 2, maxDelayMs: 6000, jitter: 0 }

describe('classifyStatus', () => {
  it('treats 2xx as ok', () => {
    expect(classifyStatus(200)).toBe('ok')
    expect(classifyStatus(201)).toBe('ok')
  })

  it('treats 503, 502, 504 and 429 as retryable', () => {
    for (const status of [503, 502, 504, 429]) expect(classifyStatus(status)).toBe('retryable')
  })

  it('treats 422, 409 and other 4xx as final', () => {
    for (const status of [422, 409, 400, 404]) expect(classifyStatus(status)).toBe('final')
  })

  it('treats 500 as an unknown outcome, not as a safe retry', () => {
    expect(classifyStatus(500)).toBe('unknown')
  })
})

describe('backoffDelay', () => {
  it('doubles the wait after each failure', () => {
    expect([1, 2, 3].map((failed) => backoffDelay(failed, policy))).toEqual([700, 1400, 2800])
  })

  it('never waits longer than the cap', () => {
    expect(backoffDelay(10, policy)).toBe(6000)
    expect(backoffDelay(10, POLL_POLICY)).toBe(15000)
  })

  it('spreads the wait by the jitter share, inside the bounds', () => {
    const jittered = { ...policy, jitter: 0.2 }
    expect(backoffDelay(1, jittered, () => 0)).toBe(560)
    expect(backoffDelay(1, jittered, () => 1)).toBe(840)
    expect(backoffDelay(1, jittered, () => 0.5)).toBe(700)
  })
})

describe('shouldRetry', () => {
  it('retries a retryable failure until the attempts run out', () => {
    expect(shouldRetry('retryable', 1, SUBMIT_POLICY)).toBe(true)
    expect(shouldRetry('retryable', 2, SUBMIT_POLICY)).toBe(true)
    expect(shouldRetry('retryable', 3, SUBMIT_POLICY)).toBe(false)
  })

  it('never retries a final answer or an unknown outcome', () => {
    expect(shouldRetry('final', 1, SUBMIT_POLICY)).toBe(false)
    expect(shouldRetry('unknown', 1, SUBMIT_POLICY)).toBe(false)
  })
})
