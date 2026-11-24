import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RequestLogEntry } from '@/lib/api'
import { isRecord, readSession, writeSession } from '@/lib/storage'

const STORAGE_KEY = 'qc.requestlog.v2'

/** Requests the operator caused. Table sync polls never count against this. */
export const USER_LIMIT = 200
/** The most recent table sync polls kept for the "show" toggle. */
export const POLL_LIMIT = 20

export interface PollSummary {
  /** Polls seen in this tab, including the ones no longer listed. */
  count: number
  lastStatus: RequestLogEntry['status'] | null
  lastAt: number | null
}

interface Saved {
  entries: RequestLogEntry[]
  polls: RequestLogEntry[]
  pollCount: number
}

const STATUS_WORDS = ['timeout', 'network error', 'pending']

function isEntry(value: unknown): value is RequestLogEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'number' &&
    typeof value.startedAt === 'number' &&
    typeof value.method === 'string' &&
    typeof value.path === 'string' &&
    (typeof value.status === 'number' || STATUS_WORDS.includes(value.status as string)) &&
    (value.durationMs === null || typeof value.durationMs === 'number') &&
    typeof value.attempt === 'number' &&
    typeof value.correlationId === 'string' &&
    (value.idempotencyKey === null || typeof value.idempotencyKey === 'string') &&
    typeof value.replayed === 'boolean' &&
    typeof value.background === 'boolean'
  )
}

function isSaved(value: unknown): value is Saved {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntry) &&
    Array.isArray(value.polls) &&
    value.polls.every(isEntry) &&
    typeof value.pollCount === 'number' &&
    Number.isFinite(value.pollCount)
  )
}

export const useRequestLogStore = defineStore('requestLog', () => {
  const saved = readSession<Saved>(STORAGE_KEY, { entries: [], polls: [], pollCount: 0 }, isSaved)
  /** Requests the operator caused, newest first. */
  const entries = ref<RequestLogEntry[]>(saved.entries)
  /** The latest table sync polls, newest first. Kept apart so they can never push an operator's request out. */
  const polls = ref<RequestLogEntry[]>(saved.polls)
  const pollCount = ref(saved.pollCount)
  const isOpen = ref(false)
  const showBackground = ref(false)
  const limits = ref({ user: USER_LIMIT, polls: POLL_LIMIT })

  function persist() {
    writeSession(STORAGE_KEY, { entries: entries.value, polls: polls.value, pollCount: pollCount.value } satisfies Saved)
  }

  function listFor(entry: RequestLogEntry) {
    return entry.background ? polls : entries
  }

  function put(entry: RequestLogEntry) {
    const list = listFor(entry)
    const limit = entry.background ? limits.value.polls : limits.value.user
    const index = list.value.findIndex((item) => item.id === entry.id && item.startedAt === entry.startedAt)
    if (index === -1) {
      list.value = [entry, ...list.value].slice(0, limit)
      if (entry.background) pollCount.value += 1
    } else {
      list.value.splice(index, 1, entry)
    }
  }

  function onStart(entry: RequestLogEntry) {
    put(entry)
  }

  function onFinish(entry: RequestLogEntry) {
    put(entry)
    persist()
  }

  function clear() {
    entries.value = []
    polls.value = []
    pollCount.value = 0
    persist()
  }

  /** For tests: lower the caps. */
  function setLimits(next: { user?: number; polls?: number }) {
    limits.value = { ...limits.value, ...next }
  }

  const pollSummary = computed<PollSummary>(() => {
    const last = polls.value.find((entry) => entry.status !== 'pending') ?? polls.value[0]
    return { count: pollCount.value, lastStatus: last?.status ?? null, lastAt: last?.startedAt ?? null }
  })
  /** What the rail shows: requests the operator caused. */
  const foregroundCount = computed(() => entries.value.length)

  return { entries, polls, pollSummary, foregroundCount, isOpen, showBackground, onStart, onFinish, clear, setLimits }
})
