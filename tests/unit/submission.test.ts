import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api'
import type { RetryPolicy } from '@/lib/retry'
import { createSubmission } from '@/lib/submission'
import { fakeFetch, sampleBody, samplePayout, type Reply } from './helpers'

const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 700, factor: 2, maxDelayMs: 6000, jitter: 0 }
const sleep = async () => {}

function setup(replies: Reply[] | ((call: { url: string; method: string }, index: number) => Reply)) {
  const fake = fakeFetch(replies)
  const submission = createSubmission({ client: createApiClient({ fetch: fake.fetch }), policy, sleep })
  const posts = () => fake.calls.filter((call) => call.method === 'POST')
  return { submission, calls: fake.calls, posts }
}

afterEach(() => vi.useRealTimers())

describe('payout submission', () => {
  it('makes one idempotency key when the form opens and keeps it for the submit', async () => {
    const { submission, posts } = setup([{ status: 201, body: samplePayout() }])
    const key = submission.idempotencyKey.value
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    await submission.submit(sampleBody)
    expect(posts()[0]?.headers['Idempotency-Key']).toBe(key)
    expect(submission.state.value).toMatchObject({ phase: 'accepted', how: 'answer', attempts: 1 })
  })

  it('sends one request when submit is called three times in a row', async () => {
    const { submission, posts } = setup([{ status: 201, body: samplePayout() }])
    const results = await Promise.all([submission.submit(sampleBody), submission.submit(sampleBody), submission.submit(sampleBody)])
    expect(results).toEqual([true, false, false])
    expect(posts()).toHaveLength(1)
  })

  it('ignores a submit once the payout is accepted', async () => {
    const { submission, posts } = setup([{ status: 201, body: samplePayout() }])
    await submission.submit(sampleBody)
    expect(await submission.submit(sampleBody)).toBe(false)
    expect(posts()).toHaveLength(1)
  })

  it('after three 503s offers a retry that reuses the key and gets a new correlation ID', async () => {
    const { submission, posts } = setup([{ status: 503 }, { status: 503 }, { status: 503 }, { status: 201, body: samplePayout() }])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'retryable', status: 503, attempts: 3 })
    expect(submission.locked.value).toBe(true)

    await submission.retry()
    expect(submission.state.value).toMatchObject({ phase: 'accepted', attempts: 4 })
    expect(new Set(posts().map((call) => call.headers['Idempotency-Key'])).size).toBe(1)
    const correlationIds = posts().map((call) => call.headers['X-Correlation-Id'])
    expect(new Set(correlationIds.slice(0, 3)).size).toBe(1)
    expect(correlationIds[3]).not.toBe(correlationIds[0])
    expect(posts().map((call) => call.headers['X-Attempt'])).toEqual(['1', '2', '3', '4'])
  })

  it('treats 422 as final, keeps the field errors, and lets a corrected form submit with the same key', async () => {
    const { submission, posts } = setup([
      { status: 422, body: { code: 'validation_failed', message: 'Not accepted.', fields: { account: 'Not recognised.' } } },
      { status: 201, body: samplePayout() },
    ])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'final', status: 422, fields: { account: 'Not recognised.' } })
    expect(submission.locked.value).toBe(false)
    expect(await submission.retry()).toBe(false)

    await submission.submit({ ...sampleBody, beneficiary: { ...sampleBody.beneficiary, account: '0234567812' } })
    expect(submission.state.value.phase).toBe('accepted')
    expect(posts()[1]?.headers['Idempotency-Key']).toBe(posts()[0]?.headers['Idempotency-Key'])
  })

  it('lands in outcome unknown after a timeout and refuses a blind resend', async () => {
    vi.useFakeTimers()
    const { submission, posts } = setup([{ status: 0, hang: true }])
    const pending = submission.submit(sampleBody)
    await vi.advanceTimersByTimeAsync(4000)
    await pending
    expect(submission.state.value).toMatchObject({ phase: 'unknown', reason: 'timeout' })
    expect(await submission.submit(sampleBody)).toBe(false)
    expect(await submission.retry()).toBe(false)
    expect(posts()).toHaveLength(1)
  })

  it('resolves an unknown outcome to received through a status check by key', async () => {
    const { submission, calls, posts } = setup((call) =>
      call.method === 'POST' ? { status: 0, drop: true } : { status: 200, body: { key: 'k', received: true, payout: samplePayout() } },
    )
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'unknown', reason: 'network' })
    await submission.checkStatus()
    expect(calls[1]?.url).toBe(`/api/idempotency-keys/${submission.idempotencyKey.value}`)
    expect(submission.state.value).toMatchObject({ phase: 'accepted', how: 'status-check' })
    expect(posts()).toHaveLength(1)
  })

  it('resolves to not received, and only then resends with the same key', async () => {
    let posted = 0
    const { submission, posts } = setup((call) => {
      if (call.method === 'GET') return { status: 200, body: { key: 'k', received: false, payout: null } }
      posted += 1
      return posted === 1 ? { status: 0, drop: true } : { status: 201, body: samplePayout() }
    })
    await submission.submit(sampleBody)
    await submission.checkStatus()
    expect(submission.state.value.phase).toBe('not-received')
    await submission.retry()
    expect(submission.state.value).toMatchObject({ phase: 'accepted', how: 'answer' })
    expect(posts()).toHaveLength(2)
    expect(posts()[1]?.headers['Idempotency-Key']).toBe(posts()[0]?.headers['Idempotency-Key'])
  })

  it('stays unknown when the status check itself fails', async () => {
    const { submission } = setup((call) => (call.method === 'POST' ? { status: 0, drop: true } : { status: 503 }))
    await submission.submit(sampleBody)
    await submission.checkStatus()
    expect(submission.state.value).toMatchObject({ phase: 'unknown', checkFailed: true })
  })

  it('treats a 500 as an unknown outcome', async () => {
    const { submission, posts } = setup([{ status: 500, body: { code: 'internal', message: 'Failed part way.' } }])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'unknown', reason: 'server-error' })
    expect(posts()).toHaveLength(1)
  })

  it('treats a success that cannot be read as an unknown outcome, never as a reason to resend', async () => {
    const { submission, posts } = setup([{ status: 200, headers: { 'Content-Type': 'text/html' } }])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'unknown', reason: 'server-error' })
    expect(posts()).toHaveLength(1)
  })

  it('retries a gateway 504 that is not JSON with the same key, like any temporary failure', async () => {
    const { submission, posts } = setup([{ status: 504, headers: { 'Content-Type': 'text/html' } }, { status: 201, body: samplePayout() }])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'accepted', attempts: 2 })
    expect(new Set(posts().map((call) => call.headers['Idempotency-Key'])).size).toBe(1)
  })

  it('reports a replay when the API answers with the replay header', async () => {
    const { submission } = setup([{ status: 201, body: samplePayout(), headers: { 'Idempotent-Replayed': 'true' } }])
    await submission.submit(sampleBody)
    expect(submission.state.value).toMatchObject({ phase: 'accepted', how: 'replay', payout: { id: 'PO-48261' } })
  })

  it('starts in outcome unknown when a restored key may already have been sent', () => {
    const { fetch } = fakeFetch([])
    const submission = createSubmission({ client: createApiClient({ fetch }), idempotencyKey: 'restored-key', mayHaveBeenSent: true })
    expect(submission.idempotencyKey.value).toBe('restored-key')
    expect(submission.state.value).toMatchObject({ phase: 'unknown', reason: 'reload' })
  })

  it('carries the attempt count of a restored submit on, in the count and in X-Attempt', async () => {
    const fake = fakeFetch((call) =>
      call.method === 'GET' ? { status: 200, body: { key: 'restored-key', received: false, payout: null } } : { status: 201, body: samplePayout() },
    )
    const submission = createSubmission({ client: createApiClient({ fetch: fake.fetch }), policy, sleep, idempotencyKey: 'restored-key', mayHaveBeenSent: true, attempts: 2 })
    expect(submission.attempts.value).toBe(2)
    await submission.checkStatus()
    await submission.retry(sampleBody)
    const post = fake.calls.find((call) => call.method === 'POST')
    expect(post?.headers['X-Attempt']).toBe('3')
    expect(post?.headers['Idempotency-Key']).toBe('restored-key')
    expect(submission.attempts.value).toBe(3)
  })

  it('makes a new key on reset', async () => {
    const { submission } = setup([{ status: 201, body: samplePayout() }])
    const first = submission.idempotencyKey.value
    await submission.submit(sampleBody)
    submission.reset()
    expect(submission.idempotencyKey.value).not.toBe(first)
    expect(submission.state.value.phase).toBe('idle')
    expect(submission.attempts.value).toBe(0)
  })
})
