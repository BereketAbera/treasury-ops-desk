import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogEntry } from '@/lib/api'
import { connectRequestLog } from '@/lib/http'
import { consume, getScenario, setScenario } from '@/mocks/scenario'
import { usePayoutsStore } from '@/stores/payouts'
import { usePrefsStore } from '@/stores/prefs'
import { POLL_LIMIT, useRequestLogStore } from '@/stores/requestLog'
import { useSimulateStore } from '@/stores/simulate'
import { fakeFetch, samplePayout } from './helpers'

beforeEach(() => {
  sessionStorage.clear()
  setScenario('normal')
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  connectRequestLog(null)
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
    vi.stubGlobal('fetch', fetch)
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
    vi.stubGlobal('fetch', fetch)
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
    vi.stubGlobal('fetch', fetch)
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
    vi.stubGlobal('fetch', fake.fetch)
    connectRequestLog({ onStart: (item) => seen.push(item), onFinish: () => {} })
    await Promise.all([store.sync(), store.sync()])
    expect(fake.calls).toHaveLength(1)
    expect(seen[0]?.background).toBe(true)
  })

  it('replaces one payout after an action on it', async () => {
    const store = usePayoutsStore()
    const { fetch } = fakeFetch([{ status: 200, body: { items: [samplePayout({ status: 'outcome_unknown' })], asOf: '2026-11-24T10:00:00.000Z' } }])
    vi.stubGlobal('fetch', fetch)
    await store.sync()
    store.replace(samplePayout({ status: 'sent' }))
    expect(store.rows[0]?.status).toBe('sent')
  })
})

describe('payouts store: nothing loaded yet', () => {
  it('reports "never loaded", not "stale", when the first sync fails', async () => {
    const store = usePayoutsStore()
    const { fetch } = fakeFetch([
      { status: 503, body: { code: 'service_unavailable', message: 'Down.' } },
      { status: 200, body: { items: [samplePayout()], asOf: '2026-11-24T10:00:20.000Z' } },
    ])
    vi.stubGlobal('fetch', fetch)
    expect(await store.sync()).toBe(false)
    expect(store.loaded).toBe(false)
    expect(store.neverLoaded).toBe(true)
    expect(store.rows).toHaveLength(0)

    await store.sync()
    expect(store.neverLoaded).toBe(false)
    expect(store.rows).toHaveLength(1)
  })
})

describe('request log store', () => {
  const poll = (id: number, overrides: Partial<RequestLogEntry> = {}) =>
    entry({ id, startedAt: 1000 + id, method: 'GET', background: true, status: 200, idempotencyKey: null, ...overrides })

  it('adds a request when it starts and updates it when it finishes', () => {
    const log = useRequestLogStore()
    log.onStart(entry())
    expect(log.entries[0]?.status).toBe('pending')
    log.onFinish(entry({ status: 201, durationMs: 180 }))
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]).toMatchObject({ status: 201, durationMs: 180 })
  })

  it('keeps table sync polls apart from the requests the operator made', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ id: 1, status: 201 }))
    log.onFinish(poll(2))
    expect(log.entries).toHaveLength(1)
    expect(log.polls).toHaveLength(1)
    expect(log.foregroundCount).toBe(1)
  })

  it('never lets polls push out a request the operator made, however many polls arrive', () => {
    const log = useRequestLogStore()
    log.setLimits({ user: 3, polls: 2 })
    log.onFinish(entry({ id: 1, status: 201, correlationId: 'cor_user' }))
    for (let id = 2; id < 500; id += 1) {
      log.onStart(poll(id, { status: 'pending' }))
      log.onFinish(poll(id))
    }
    expect(log.entries.map((item) => item.correlationId)).toEqual(['cor_user'])
    expect(log.polls).toHaveLength(2)
    expect(log.foregroundCount).toBe(1)
    expect(log.pollSummary).toEqual({ count: 498, lastStatus: 200, lastAt: 1499 })
  })

  it('caps the operator list on its own, dropping the oldest first', () => {
    const log = useRequestLogStore()
    log.setLimits({ user: 3 })
    for (let id = 1; id <= 5; id += 1) log.onFinish(entry({ id, startedAt: id, status: 201 }))
    expect(log.entries.map((item) => item.id)).toEqual([5, 4, 3])
  })

  it('keeps a small number of polls by default and counts all of them', () => {
    const log = useRequestLogStore()
    for (let id = 1; id <= POLL_LIMIT + 30; id += 1) log.onFinish(poll(id, { status: id % 2 ? 200 : 503 }))
    expect(log.polls).toHaveLength(POLL_LIMIT)
    expect(log.pollSummary.count).toBe(POLL_LIMIT + 30)
    expect(log.pollSummary.lastStatus).toBe(503)
  })

  it('mirrors finished requests to sessionStorage and clears them', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ status: 503 }))
    log.onFinish(poll(9))
    const saved = () => JSON.parse(sessionStorage.getItem('qc.requestlog.v2') ?? '{}')
    expect(saved()).toMatchObject({ pollCount: 1 })
    expect(saved().entries).toHaveLength(1)
    log.clear()
    expect(log.entries).toHaveLength(0)
    expect(saved()).toEqual({ entries: [], polls: [], pollCount: 0 })
  })

  it('restores a saved log after a reload', () => {
    const first = useRequestLogStore()
    first.onFinish(entry({ status: 201 }))
    first.onFinish(poll(2))
    setActivePinia(createPinia())
    const second = useRequestLogStore()
    expect(second.entries).toHaveLength(1)
    expect(second.pollSummary.count).toBe(1)
  })

  it('writes nothing to localStorage', () => {
    const log = useRequestLogStore()
    log.onFinish(entry({ status: 201 }))
    usePrefsStore().density = 'compact'
    expect(localStorage.length).toBe(0)
  })
})

describe('values read back from sessionStorage', () => {
  const hostile = ['{}', '[]', '"text"', '42', 'null', '{"entries":{}}', '{"entries":[{"id":"x"}],"polls":[],"pollCount":0}', '{not json']

  it('starts the request log empty when the stored log has the wrong shape', () => {
    for (const raw of hostile) {
      sessionStorage.setItem('qc.requestlog.v2', raw)
      setActivePinia(createPinia())
      const log = useRequestLogStore()
      expect(log.entries, raw).toEqual([])
      expect(log.polls, raw).toEqual([])
      expect(() => log.onFinish(entry({ status: 201 })), raw).not.toThrow()
    }
  })

  it('falls back to the default preferences when the stored ones have the wrong shape', () => {
    for (const raw of [...hostile, '{"density":"huge","noteDismissed":false}', '{"density":"compact","noteDismissed":"yes"}', '{"density":"__proto__"}']) {
      sessionStorage.setItem('qc.prefs.v1', raw)
      setActivePinia(createPinia())
      const prefs = usePrefsStore()
      expect(prefs.density, raw).toBe('default')
      expect(prefs.noteDismissed, raw).toBe(false)
    }
  })

  it('keeps valid stored preferences', () => {
    sessionStorage.setItem('qc.prefs.v1', '{"density":"compact","noteDismissed":true}')
    setActivePinia(createPinia())
    expect(usePrefsStore()).toMatchObject({ density: 'compact', noteDismissed: true })
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
