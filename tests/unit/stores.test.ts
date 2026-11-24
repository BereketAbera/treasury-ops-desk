import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiClient, type RequestLogEntry } from '@/lib/api'
import { consume, getScenario, setScenario } from '@/mocks/scenario'
import { usePayoutsStore } from '@/stores/payouts'
import { usePrefsStore } from '@/stores/prefs'
import { useRequestLogStore } from '@/stores/requestLog'
import { useSimulateStore } from '@/stores/simulate'
import { fakeFetch, samplePayout } from './helpers'

beforeEach(() => {
  sessionStorage.clear()
  setScenario('normal')
  setActivePinia(createPinia())
})

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: 1,
    startedAt: 1000,
    method: 'POST',
    path: '/api/payouts',
    status: 'pending',
    durationMs: null,
    attempt: 1,
    correlationId: 'cor_1',
    idempotencyKey: 'key-1',
    replayed: false,
    background: false,
    ...overrides,
  }
}

describe('payouts store', () => {
  it('loads the list and records when it synced', async () => {
    const store = usePayoutsStore()
    const { fetch } = fakeFetch([{ status: 200, body: { items: [samplePayout()], asOf: '2026-11-24T10:00:05.000Z' } }])
    store.useClient(createApiClient({ fetch }))
    expect(await store.sync()).toBe(true)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]?.awaitingConfirmation).toBe(false)
    expect(store.syncState).toBe('ok')
    expect(store.lastSyncedAt).toBe(Date.parse('2026-11-24T10:00:05.000Z'))
  })

  it('shows an accepted payout at once, marked awaiting confirmation, until the list includes it', async () => {
    const store = usePayoutsStore()
    const older = samplePayout({ id: 'PO-48200' })
    const fresh = samplePayout({ id: 'PO-48261' })
    const { fetch } = fakeFetch([
      { status: 200, body: { items: [older], asOf: '2026-11-24T10:00:00.000Z' } },
      { status: 200, body: { items: [older], asOf: '2026-11-24T10:00:03.000Z' } },
      { status: 200, body: { items: [{ ...fresh, status: 'sent' }, older], asOf: '2026-11-24T10:00:06.000Z' } },
    ])
    store.useClient(createApiClient({ fetch }))
    await store.sync()
    store.addAccepted(fresh)
    expect(store.rows.map((row) => [row.id, row.awaitingConfirmation])).toEqual([
      ['PO-48261', true],
      ['PO-48200', false],
    ])

    await store.sync()
    expect(store.rows[0]).toMatchObject({ id: 'PO-48261', awaitingConfirmation: true })

    await store.sync()
    expect(store.rows[0]).toMatchObject({ id: 'PO-48261', awaitingConfirmation: false, status: 'sent' })
    expect(store.accepted).toHaveLength(0)
  })

  it('does not add the same accepted payout twice', () => {
    const store = usePayoutsStore()
    store.addAccepted(samplePayout())
    store.addAccepted(samplePayout())
    expect(store.rows).toHaveLength(1)
  })

  it('keeps the last rows and marks them stale when a sync fails', async () => {
    const store = usePayoutsStore()
    const { fetch } = fakeFetch([
      { status: 200, body: { items: [samplePayout()], asOf: '2026-11-24T10:00:00.000Z' } },
      { status: 503, body: { code: 'service_unavailable', message: 'Down.' } },
      { status: 503, body: { code: 'service_unavailable', message: 'Down.' } },
      { status: 200, body: { items: [samplePayout()], asOf: '2026-11-24T10:00:20.000Z' } },
    ])
    store.useClient(createApiClient({ fetch }))
    await store.sync()
    expect(await store.sync()).toBe(false)
    await store.sync()
    expect(store.isStale).toBe(true)
    expect(store.failedSyncs).toBe(2)
    expect(store.rows).toHaveLength(1)
    expect(store.lastSyncedAt).toBe(Date.parse('2026-11-24T10:00:00.000Z'))
    expect(store.lastError).toMatchObject({ status: 503 })

    await store.sync()
    expect(store.isStale).toBe(false)
    expect(store.failedSyncs).toBe(0)
  })

  it('marks sync requests as background and shares one in-flight request', async () => {
    const store = usePayoutsStore()
    const fake = fakeFetch(() => ({ status: 200, body: { items: [], asOf: '2026-11-24T10:00:00.000Z' } }))
    const seen: RequestLogEntry[] = []
    store.useClient(createApiClient({ fetch: fake.fetch, onStart: (item) => seen.push(item) }))
    await Promise.all([store.sync(), store.sync()])
    expect(fake.calls).toHaveLength(1)
    expect(seen[0]?.background).toBe(true)
  })

  it('replaces one payout after an action on it', async () => {
    const store = usePayoutsStore()
    const { fetch } = fakeFetch([{ status: 200, body: { items: [samplePayout({ status: 'outcome_unknown' })], asOf: '2026-11-24T10:00:00.000Z' } }])
    store.useClient(createApiClient({ fetch }))
    await store.sync()
    store.replace(samplePayout({ status: 'sent' }))
    expect(store.rows[0]?.status).toBe('sent')
  })
})

describe('request log store', () => {
  it('adds a request when it starts and updates it when it finishes', () => {
    const log = useRequestLogStore()
    log.onStart(entry())
    expect(log.entries[0]?.status).toBe('pending')
    log.onFinish(entry({ status: 201, durationMs: 180 }))
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]).toMatchObject({ status: 201, durationMs: 180 })
  })

  it('hides background sync requests until asked', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ id: 1, status: 201 }))
    log.onFinish(entry({ id: 2, method: 'GET', background: true, status: 200, idempotencyKey: null }))
    expect(log.visible).toHaveLength(1)
    expect(log.foregroundCount).toBe(1)
    log.showBackground = true
    expect(log.visible).toHaveLength(2)
  })

  it('mirrors finished requests to sessionStorage and clears them', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ status: 503 }))
    expect(JSON.parse(sessionStorage.getItem('kc.requestlog.v1') ?? '[]')).toHaveLength(1)
    log.clear()
    expect(log.entries).toHaveLength(0)
    expect(JSON.parse(sessionStorage.getItem('kc.requestlog.v1') ?? '[]')).toHaveLength(0)
  })

  it('writes nothing to localStorage', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ status: 201 }))
    usePrefsStore().density = 'compact'
    expect(localStorage.length).toBe(0)
  })
})

describe('simulate store', () => {
  it('follows the mock API scenario and returns to normal when a one-shot scenario has fired', () => {
    const simulate = useSimulateStore()
    expect(simulate.isNormal).toBe(true)
    simulate.set('timeout-received')
    expect(simulate.current).toBe('timeout-received')
    expect(consume('timeout-received')).toBe(true)
    expect(simulate.current).toBe('normal')
  })

  it('fails three requests for the 503 scenario, then stops', () => {
    const simulate = useSimulateStore()
    simulate.set('fail-503')
    expect([consume('fail-503'), consume('fail-503'), consume('fail-503'), consume('fail-503')]).toEqual([true, true, true, false])
    expect(simulate.current).toBe('normal')
  })

  it('keeps a sticky scenario on until it is changed', () => {
    const simulate = useSimulateStore()
    simulate.set('polling-outage')
    expect(consume('fail-503')).toBe(false)
    expect(getScenario().id).toBe('polling-outage')
    simulate.set('normal')
    expect(simulate.isNormal).toBe(true)
  })
})
