import { beforeEach, describe, expect, it } from 'vitest'
import { armScenarioFromQuery, getScenario, setScenario, withDuplicateSubmit } from '@/demo'
import { createApiClient } from '@/lib/api'
import { createSubmission } from '@/lib/submission'
import { DB_STORAGE_KEY, isDbState, resetDb } from '@/mocks/db'
import { loadScenario } from '@/mocks/scenario'
import { fakeFetch, sampleBody, samplePayout } from './helpers'

beforeEach(() => {
  sessionStorage.clear()
  setScenario('normal')
})

describe('demo boundary: the Simulate control', () => {
  it('arms a scenario from a link and ignores anything that is not one', () => {
    expect(armScenarioFromQuery('fail-503')).toBe(true)
    expect(getScenario()).toEqual({ id: 'fail-503', shotsLeft: 3 })
    for (const value of ['__proto__', 'nope', ['fail-503'], undefined, 7]) expect(armScenarioFromQuery(value)).toBe(false)
    expect(getScenario().id).toBe('fail-503')
  })

  it('sends an accepted payout submit twice with one key while "Duplicate submit" is armed, once', async () => {
    const fake = fakeFetch([
      { status: 201, body: samplePayout() },
      { status: 201, body: samplePayout(), headers: { 'Idempotent-Replayed': 'true' } },
      { status: 201, body: samplePayout({ id: 'PO-48262' }) },
    ])
    setScenario('duplicate')
    const client = withDuplicateSubmit(createApiClient({ fetch: fake.fetch }))
    const submission = createSubmission({ client, sleep: async () => {} })
    await submission.submit(sampleBody)
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1]?.headers['Idempotency-Key']).toBe(fake.calls[0]?.headers['Idempotency-Key'])
    expect(fake.calls.map((call) => call.headers['X-Attempt'])).toEqual(['1', '2'])
    expect(submission.state.value).toMatchObject({ phase: 'accepted', how: 'replay', payout: { id: 'PO-48261' }, attempts: 2 })
    expect(submission.attempts.value).toBe(2)
    expect(getScenario().id).toBe('normal')

    await client.request({ method: 'POST', path: '/api/payouts', body: sampleBody, idempotencyKey: 'another' })
    expect(fake.calls).toHaveLength(3)
  })

  it('passes every other request straight through', async () => {
    const fake = fakeFetch(() => ({ status: 200, body: {} }))
    setScenario('duplicate')
    const client = withDuplicateSubmit(createApiClient({ fetch: fake.fetch }))
    await client.request({ path: '/api/payouts' })
    await client.request({ method: 'POST', path: '/api/quotes', body: {} })
    expect(fake.calls).toHaveLength(2)
    expect(getScenario().id).toBe('duplicate')
  })

  it('falls back to "normal" when the stored scenario has the wrong shape', () => {
    for (const raw of ['[]', '"text"', 'null', '{"id":"__proto__"}', '{"id":"fail-503","shotsLeft":"many"}', '{bad']) {
      setScenario('normal')
      sessionStorage.setItem('qc.scenario.v1', raw)
      expect(() => loadScenario(), raw).not.toThrow()
      expect(['normal', 'fail-503'], raw).toContain(getScenario().id)
      expect(Number.isInteger(getScenario().shotsLeft), raw).toBe(true)
    }
  })
})

describe('mock data read back from sessionStorage', () => {
  it('accepts its own saved state', () => {
    const state = resetDb(Date.parse('2026-11-24T12:00:00Z'))
    expect(isDbState(JSON.parse(sessionStorage.getItem(DB_STORAGE_KEY) ?? 'null'))).toBe(true)
    expect(state.payouts).toHaveLength(60)
  })

  it('rejects a state with the wrong shape, so the seed is used instead of a crash', () => {
    const good = JSON.parse(JSON.stringify(resetDb(Date.parse('2026-11-24T12:00:00Z'))))
    const broken = [
      {},
      [],
      null,
      'text',
      { ...good, version: 2 },
      { ...good, payouts: {} },
      { ...good, payouts: [{}] },
      { ...good, payouts: [{ ...good.payouts[0], target: { currency: 'NGN', amountMinor: '12.5' } }] },
      { ...good, batches: 'none' },
      { ...good, batches: [{ id: 'BT-1' }] },
      { ...good, keys: [] },
      { ...good, quotes: null },
      { ...good, nextPayoutNumber: '48261' },
    ]
    for (const value of broken) expect(isDbState(value), JSON.stringify(value)?.slice(0, 60)).toBe(false)
  })
})
