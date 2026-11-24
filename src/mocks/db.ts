import type { Batch, Payout, Quote } from '@/lib/types'
import { buildSeed } from './seed'

// The mock API's data. It lives in memory and is mirrored to sessionStorage, so
// it survives a reload and disappears with the tab. Nothing here is sensitive.

export const DB_STORAGE_KEY = 'kc.db.v1'

/** How long the list endpoint lags behind a write. */
export const READ_LAG_MS = 4_000
export const SENT_AFTER_MS = 9_000
export const COMPLETED_AFTER_MS = 22_000

interface Schedule {
  /** The list endpoint leaves the payout out until this time. */
  visibleAt: number
  sentAt: number | null
  completedAt: number | null
}

interface KeyRecord {
  fingerprint: string
  payoutId?: string
  batchId?: string
}

export interface DbState {
  version: 1
  payouts: Payout[]
  schedules: Record<string, Schedule>
  keys: Record<string, KeyRecord>
  batches: Batch[]
  quotes: Quote[]
  nextPayoutNumber: number
  nextBatchNumber: number
}

let state: DbState | null = null

function fresh(now: number): DbState {
  return {
    version: 1,
    payouts: buildSeed(now),
    schedules: {},
    keys: {},
    batches: [],
    quotes: [],
    nextPayoutNumber: 48261,
    nextBatchNumber: 301,
  }
}

function read(): DbState | null {
  try {
    const raw = sessionStorage.getItem(DB_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DbState
    return parsed.version === 1 && Array.isArray(parsed.payouts) ? parsed : null
  } catch {
    return null
  }
}

export function save(): void {
  if (!state) return
  try {
    sessionStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the data still works in memory for this page.
  }
}

export function db(now: number = Date.now()): DbState {
  if (!state) {
    state = read() ?? fresh(now)
    save()
  }
  return state
}

export function resetDb(now: number = Date.now()): DbState {
  state = fresh(now)
  save()
  return state
}

/** Moves scheduled payouts forward. Called on every read, like a clock tick. */
export function advance(now: number): void {
  const current = db(now)
  let changed = false
  for (const payout of current.payouts) {
    const schedule = current.schedules[payout.id]
    if (!schedule) continue
    if (payout.status === 'processing' && schedule.sentAt !== null && now >= schedule.sentAt) {
      payout.status = 'sent'
      payout.updatedAt = new Date(schedule.sentAt).toISOString()
      payout.timeline.push({ status: 'sent', at: payout.updatedAt })
      changed = true
    }
    if (payout.status === 'sent' && schedule.completedAt !== null && now >= schedule.completedAt) {
      payout.status = 'completed'
      payout.updatedAt = new Date(schedule.completedAt).toISOString()
      payout.timeline.push({ status: 'completed', at: payout.updatedAt })
      changed = true
    }
  }
  if (changed) save()
}

export function visiblePayouts(now: number): Payout[] {
  const current = db(now)
  return current.payouts
    .filter((payout) => (current.schedules[payout.id]?.visibleAt ?? 0) <= now)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function schedule(payoutId: string, now: number, lag: number = READ_LAG_MS): void {
  db(now).schedules[payoutId] = {
    visibleAt: now + lag,
    sentAt: now + SENT_AFTER_MS,
    completedAt: now + COMPLETED_AFTER_MS,
  }
}
