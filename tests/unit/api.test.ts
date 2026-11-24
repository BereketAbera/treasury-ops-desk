import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient, sendWithRetry, type RequestLogEntry } from '@/lib/api'
import type { RetryPolicy } from '@/lib/retry'
import { fakeFetch, sampleBody, samplePayout } from './helpers'

const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 700, factor: 2, maxDelayMs: 6000, jitter: 0 }
const noSleep = async () => {}

afterEach(() => vi.useRealTimers())

describe('api client', () => {
  it('sends the idempotency key, a correlation ID and the attempt number as headers', async () => {
    const { fetch, calls } = fakeFetch([{ status: 201, body: samplePayout() }])
    const client = createApiClient({ fetch })
    await client.request({ method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'key-1', correlationId: 'cor_abc', attempt: 2 })
    expect(calls[0]?.headers).toMatchObject({
      'Idempotency-Key': 'key-1',
      'X-Correlation-Id': 'cor_abc',
      'X-Attempt': '2',
      'Content-Type': 'application/json',
    })
    expect(calls[0]?.body).toEqual(sampleBody)
  })

  it('makes a correlation ID when none is given, and sends no idempotency key on reads', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: { items: [] } }])
    const result = await createApiClient({ fetch }).request({ path: '/api/payouts' })
    expect(calls[0]?.headers['X-Correlation-Id']).toMatch(/^cor_[0-9a-f]{20}$/)
    expect(calls[0]?.headers['Idempotency-Key']).toBeUndefined()
    expect(result.correlationId).toBe(calls[0]?.headers['X-Correlation-Id'])
  })

  it('reports a replayed answer from the Idempotent-Replayed header', async () => {
    const { fetch } = fakeFetch([{ status: 201, body: samplePayout(), headers: { 'Idempotent-Replayed': 'true' } }])
    const result = await createApiClient({ fetch }).request({ method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'key-1' })
    expect(result).toMatchObject({ kind: 'ok', replayed: true })
  })

  it('classes 503 as retryable and 422 as final, keeping the field errors', async () => {
    const { fetch } = fakeFetch([
      { status: 503, body: { code: 'service_unavailable', message: 'Down.' } },
      { status: 422, body: { code: 'validation_failed', message: 'Bad.', fields: { account: 'Not recognised.' } } },
    ])
    const client = createApiClient({ fetch })
    expect(await client.request({ path: '/a' })).toMatchObject({ kind: 'error', status: 503, failure: 'retryable' })
    expect(await client.request({ path: '/b' })).toMatchObject({
      kind: 'error',
      status: 422,
      failure: 'final',
      error: { fields: { account: 'Not recognised.' } },
    })
  })

  it('classes by status before looking at the body: a gateway 504 with an HTML page is retryable, not final', async () => {
    const { fetch } = fakeFetch([
      { status: 504, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      { status: 502, headers: { 'Content-Type': 'text/html' } },
      { status: 404, headers: { 'Content-Type': 'text/html' } },
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    ])
    const client = createApiClient({ fetch })
    expect(await client.request({ path: '/a' })).toMatchObject({ kind: 'error', status: 504, failure: 'retryable', error: { code: 'not_json' } })
    expect(await client.request({ path: '/b' })).toMatchObject({ kind: 'error', status: 502, failure: 'retryable' })
    expect(await client.request({ path: '/c' })).toMatchObject({ kind: 'error', status: 404, failure: 'final' })
    expect(await client.request({ path: '/d' })).toMatchObject({ kind: 'error', status: 500, failure: 'unknown' })
  })

  it('treats a 2xx that is not JSON as an unknown outcome', async () => {
    const { fetch } = fakeFetch([{ status: 200, headers: { 'Content-Type': 'text/html' } }])
    expect(await createApiClient({ fetch }).request({ method: 'POST', path: '/api/payouts', body: sampleBody })).toMatchObject({
      kind: 'error',
      status: 200,
      failure: 'unknown',
      error: { code: 'not_json' },
    })
  })

  it('sendWithRetry sends a non-JSON 504 again with the same key and stops at the first success', async () => {
    const { fetch, calls } = fakeFetch([{ status: 504, headers: { 'Content-Type': 'text/html' } }, { status: 201, body: samplePayout() }])
    const outcome = await sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'key-1' }, policy, { sleep: noSleep })
    expect(outcome.attempts).toBe(2)
    expect(outcome.result.kind).toBe('ok')
    expect(calls.map((call) => call.headers['Idempotency-Key'])).toEqual(['key-1', 'key-1'])
  })

  it('returns a timeout when no answer arrives in time', async () => {
    vi.useFakeTimers()
    const { fetch } = fakeFetch([{ status: 0, hang: true }])
    const pending = createApiClient({ fetch }).request({ path: '/api/payouts', timeoutMs: 4000, correlationId: 'cor_t' })
    await vi.advanceTimersByTimeAsync(4000)
    expect(await pending).toEqual({ kind: 'timeout', correlationId: 'cor_t', timeoutMs: 4000 })
  })

  it('returns a network result when the connection drops', async () => {
    const { fetch } = fakeFetch([{ status: 0, drop: true }])
    expect(await createApiClient({ fetch }).request({ path: '/api/payouts' })).toMatchObject({ kind: 'network' })
  })

  it('logs each request when it starts and when it finishes', async () => {
    const started: RequestLogEntry[] = []
    const finished: RequestLogEntry[] = []
    const { fetch } = fakeFetch([{ status: 201, body: samplePayout(), headers: { 'Idempotent-Replayed': 'true' } }])
    const client = createApiClient({ fetch, onStart: (entry) => started.push(entry), onFinish: (entry) => finished.push(entry) })
    await client.request({ method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'key-1', correlationId: 'cor_log' })
    expect(started[0]).toMatchObject({ status: 'pending', method: 'POST', path: '/api/payouts', correlationId: 'cor_log', idempotencyKey: 'key-1', attempt: 1 })
    expect(finished[0]).toMatchObject({ status: 201, replayed: true })
    expect(finished[0]?.durationMs).not.toBeNull()
  })
})

describe('sendWithRetry', () => {
  it('retries a 503 with the same idempotency key and the same correlation ID', async () => {
    const { fetch, calls } = fakeFetch([{ status: 503 }, { status: 503 }, { status: 201, body: samplePayout() }])
    const delays: number[] = []
    const outcome = await sendWithRetry(
      createApiClient({ fetch }),
      { method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'key-1' },
      policy,
      { sleep: async (ms) => void delays.push(ms) },
    )
    expect(outcome.result.kind).toBe('ok')
    expect(outcome.attempts).toBe(3)
    expect(new Set(calls.map((call) => call.headers['Idempotency-Key']))).toEqual(new Set(['key-1']))
    expect(new Set(calls.map((call) => call.headers['X-Correlation-Id'])).size).toBe(1)
    expect(calls.map((call) => call.headers['X-Attempt'])).toEqual(['1', '2', '3'])
    expect(delays).toEqual([700, 1400])
  })

  it('stops after the last attempt and returns the retryable failure', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 503 }))
    const outcome = await sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', idempotencyKey: 'key-1' }, policy, { sleep: noSleep })
    expect(calls).toHaveLength(3)
    expect(outcome.result).toMatchObject({ kind: 'error', status: 503, failure: 'retryable' })
  })

  it('does not retry a final answer', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 422, body: { code: 'validation_failed', message: 'Bad.' } }))
    const outcome = await sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', idempotencyKey: 'key-1' }, policy, { sleep: noSleep })
    expect(calls).toHaveLength(1)
    expect(outcome.result).toMatchObject({ kind: 'error', failure: 'final' })
  })

  it('does not resend after a timeout: the outcome is unknown', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = fakeFetch(() => ({ status: 0, hang: true }))
    const pending = sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', idempotencyKey: 'key-1', timeoutMs: 4000 }, policy, {
      sleep: noSleep,
    })
    await vi.advanceTimersByTimeAsync(4000)
    const outcome = await pending
    expect(outcome.result.kind).toBe('timeout')
    expect(calls).toHaveLength(1)
  })

  it('continues the attempt count on a manual retry', async () => {
    const { fetch, calls } = fakeFetch([{ status: 201, body: samplePayout() }])
    const outcome = await sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', idempotencyKey: 'key-1' }, policy, {
      sleep: noSleep,
      firstAttempt: 4,
    })
    expect(calls[0]?.headers['X-Attempt']).toBe('4')
    expect(outcome.attempts).toBe(4)
  })

  it('reports each backoff with the next attempt number', async () => {
    const { fetch } = fakeFetch([{ status: 503 }, { status: 201, body: samplePayout() }])
    const seen: unknown[] = []
    await sendWithRetry(createApiClient({ fetch }), { method: 'POST', path: '/api/payouts', idempotencyKey: 'key-1' }, policy, {
      sleep: noSleep,
      onBackoff: (info) => seen.push(info),
    })
    expect(seen).toEqual([{ failedAttempt: 1, nextAttempt: 2, delayMs: 700, status: 503 }])
  })
})
