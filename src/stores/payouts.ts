import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ApiClient } from '@/lib/api'
import { api as defaultApi } from '@/lib/http'
import { backoffDelay, POLL_POLICY } from '@/lib/retry'
import type { Payout, PayoutListResponse } from '@/lib/types'

export interface PayoutRow extends Payout {
  /** Accepted by the API, but not yet in the list it serves. */
  awaitingConfirmation: boolean
}

export type SyncState = 'never' | 'ok' | 'failing'

export const POLL_INTERVAL_MS = 3_000

export const usePayoutsStore = defineStore('payouts', () => {
  const items = ref<Payout[]>([])
  /** Payouts this browser saw accepted. Shown at once, until the list catches up. */
  const accepted = ref<Payout[]>([])
  const loaded = ref(false)
  const syncState = ref<SyncState>('never')
  const lastSyncedAt = ref<number | null>(null)
  const failedSyncs = ref(0)
  const nextTryInMs = ref<number | null>(null)
  const lastError = ref<{ status: number | null; correlationId: string } | null>(null)

  let client: ApiClient = defaultApi
  let timer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let inFlight: Promise<boolean> | null = null

  const rows = computed<PayoutRow[]>(() => {
    const known = new Set(items.value.map((item) => item.id))
    const waiting = accepted.value.filter((item) => !known.has(item.id))
    return [
      ...waiting.map((item) => ({ ...item, awaitingConfirmation: true })),
      ...items.value.map((item) => ({ ...item, awaitingConfirmation: false })),
    ]
  })

  const isStale = computed(() => syncState.value === 'failing')

  async function sync(): Promise<boolean> {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const result = await client.request<PayoutListResponse>({ path: '/api/payouts', background: true })
      if (result.kind === 'ok') {
        items.value = result.data.items
        const known = new Set(result.data.items.map((item) => item.id))
        accepted.value = accepted.value.filter((item) => !known.has(item.id))
        loaded.value = true
        syncState.value = 'ok'
        lastSyncedAt.value = Date.parse(result.data.asOf)
        failedSyncs.value = 0
        lastError.value = null
        return true
      }
      failedSyncs.value += 1
      syncState.value = 'failing'
      lastError.value = { status: result.kind === 'error' ? result.status : null, correlationId: result.correlationId }
      return false
    })()
    try {
      return await inFlight
    } finally {
      inFlight = null
    }
  }

  function schedule(delayMs: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(async () => {
      if (!polling) return
      const ok = await sync()
      if (!polling) return
      const delay = ok ? POLL_INTERVAL_MS : backoffDelay(failedSyncs.value, POLL_POLICY)
      nextTryInMs.value = ok ? null : delay
      schedule(delay)
    }, delayMs)
  }

  function startPolling() {
    if (polling) return
    polling = true
    schedule(0)
  }

  function stopPolling() {
    polling = false
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** Shows a payout the API just accepted, before the list endpoint includes it. */
  function addAccepted(payout: Payout) {
    if (!accepted.value.some((item) => item.id === payout.id)) accepted.value = [payout, ...accepted.value]
  }

  /** Replaces one payout after an action on it returned the new state. */
  function replace(payout: Payout) {
    items.value = items.value.map((item) => (item.id === payout.id ? payout : item))
  }

  function clear() {
    items.value = []
    accepted.value = []
    loaded.value = false
    syncState.value = 'never'
    lastSyncedAt.value = null
    failedSyncs.value = 0
    nextTryInMs.value = null
    lastError.value = null
  }

  /** For tests: swap the API client. */
  function useClient(next: ApiClient) {
    client = next
  }

  return {
    items,
    accepted,
    rows,
    loaded,
    syncState,
    isStale,
    lastSyncedAt,
    failedSyncs,
    nextTryInMs,
    lastError,
    sync,
    startPolling,
    stopPolling,
    addAccepted,
    replace,
    clear,
    useClient,
  }
})
