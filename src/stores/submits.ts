import { defineStore } from 'pinia'
import { computed, shallowReactive } from 'vue'
import { withDuplicateSubmit } from '@/demo'
import { isBatchRow, type BatchRow } from '@/lib/batchCsv'
import { api } from '@/lib/http'
import { clearSession, dropSession, isRecord, readSession, sessionKeys, writeSession, type Guard } from '@/lib/storage'
import {
  BATCH_TARGET,
  batchRetryTarget,
  createSubmission,
  PAYOUT_TARGET,
  payoutRetryTarget,
  UNRESOLVED_PHASES,
  type BatchRetryResult,
  type SubmissionState,
  type SubmitTarget,
} from '@/lib/submission'
import type { Batch, BatchItemInput, CreatePayoutBody, Payout, Quote } from '@/lib/types'
import { FIELD_ORDER, type PayoutDraft } from '@/lib/validation'
import { usePayoutsStore } from './payouts'

// Every submit the operator has started, kept in one place and not in a page. Leaving a page, going
// back to it or reloading it finds the same submit, with the same key, until its outcome is known.
// While it is not known, the pages that could send it again are locked and offer a status check.

const PREFIX = 'qc.form.'
const RETRY_PREFIX = `${PREFIX}batch-retry.`

/** What the payout form needs to show and to resend a submit: its fields, and the rate it was sent with. */
export type PayoutFormDraft = PayoutDraft & { quote?: Quote | null }

export interface BatchFormDraft {
  fileName: string
  rows: BatchRow[]
}

export interface BatchRetryBody {
  items: { line: number; itemKey: string }[]
}

interface Saved<D> {
  idempotencyKey: string
  draft: D
  /** A request with this key went out and its outcome is not known yet. */
  sent: boolean
  /** Attempts sent with this key so far. */
  attempts: number
  /** Correlation ID of the last send, to quote to support. */
  correlationId?: string | null
}

function isQuote(value: unknown): value is Quote {
  const money = (part: unknown) => isRecord(part) && typeof part.currency === 'string' && typeof part.amountMinor === 'string' && /^\d+$/.test(part.amountMinor)
  return isRecord(value) && typeof value.id === 'string' && typeof value.routeId === 'string' && typeof value.rate === 'string' && typeof value.expiresAt === 'number' && [value.source, value.target, value.fee].every(money)
}

function isPayoutFormDraft(value: unknown): value is PayoutFormDraft {
  return isRecord(value) && FIELD_ORDER.every((field) => typeof value[field] === 'string') && (value.quote === undefined || value.quote === null || isQuote(value.quote))
}

function isBatchFormDraft(value: unknown): value is BatchFormDraft {
  return isRecord(value) && typeof value.fileName === 'string' && Array.isArray(value.rows) && value.rows.every(isBatchRow)
}

function isBatchRetryBody(value: unknown): value is BatchRetryBody {
  return isRecord(value) && Array.isArray(value.items) && value.items.every((item) => isRecord(item) && typeof item.line === 'number' && typeof item.itemKey === 'string')
}

/** What is in storage may be from an older build or edited by hand. Anything off and it starts empty. */
function savedGuard<D>(isDraft: Guard<D>): Guard<Saved<D> | null> {
  return (value): value is Saved<D> | null =>
    value === null ||
    (isRecord(value) &&
      typeof value.idempotencyKey === 'string' &&
      value.idempotencyKey.length > 0 &&
      typeof value.sent === 'boolean' &&
      typeof value.attempts === 'number' &&
      Number.isInteger(value.attempts) &&
      value.attempts >= 0 &&
      (value.correlationId === undefined || value.correlationId === null || typeof value.correlationId === 'string') &&
      isDraft(value.draft))
}

interface TrackOptions<T, D> {
  storageKey: string
  target: SubmitTarget<T>
  isDraft: Guard<D>
  onAccepted?: (result: T) => void
}

function track<B, T, D>(options: TrackOptions<T, D>) {
  const saved = readSession<Saved<D> | null>(options.storageKey, null, savedGuard(options.isDraft))
  let draft: D | null = saved?.draft ?? null
  // Set when its page has let go of it: work that page still had pending must not touch what the next one keeps.
  let closed = false

  function persist(state: SubmissionState<T>): void {
    if (closed) return
    if (state.phase === 'accepted' || draft === null) return dropSession(options.storageKey)
    writeSession(options.storageKey, {
      idempotencyKey: submission.idempotencyKey.value,
      draft,
      sent: UNRESOLVED_PHASES.includes(state.phase),
      attempts: submission.attempts.value,
      correlationId: submission.lastCorrelationId.value,
    } satisfies Saved<D>)
  }

  const submission = createSubmission<B, T>({
    // withDuplicateSubmit is demo only: it sends an accepted payout submit twice while that scenario is armed.
    client: withDuplicateSubmit(api),
    target: options.target,
    idempotencyKey: saved?.idempotencyKey,
    mayHaveBeenSent: saved?.sent === true,
    attempts: saved?.attempts,
    correlationId: saved?.correlationId,
    onChange: (state) => {
      persist(state)
      if (state.phase === 'accepted') options.onAccepted?.(state.result)
    },
  })

  return {
    ...submission,
    submit: (body: B) => (closed ? Promise.resolve(false) : submission.submit(body)),
    retry: (body?: B) => (closed ? Promise.resolve(false) : submission.retry(body)),
    close: () => {
      closed = true
    },
    storageKey: options.storageKey,
    /** What was entered, as it was restored or last saved. */
    draft: () => draft,
    /** Keeps what is entered, so a reload can show it and a resend can carry it. */
    saveDraft(next: D): void {
      draft = next
      persist(submission.state.value)
    },
    /** Sets what is entered without writing it: it is written when a submit starts. */
    holdDraft(next: D | null): void {
      draft = next
    },
    /** A new intent: a new key, nothing entered, nothing kept. */
    startNew(): void {
      draft = null
      submission.reset()
    },
  }
}

type Tracked<B, T, D> = ReturnType<typeof track<B, T, D>>
type AnyTracked = Tracked<never, unknown, unknown>

export type PayoutSubmit = Tracked<CreatePayoutBody, Payout, PayoutFormDraft>
export type BatchSubmit = Tracked<{ items: BatchItemInput[] }, Batch, BatchFormDraft>
export type BatchRetrySubmit = Tracked<BatchRetryBody, BatchRetryResult, BatchRetryBody>
export type PayoutRetrySubmit = Tracked<Record<string, never>, Payout, Record<string, never>>

export const useSubmitsStore = defineStore('submits', () => {
  const live = shallowReactive(new Map<string, AnyTracked>())

  /** The submit kept under this key if there is one, or one restored from storage, or a new one. */
  function open<B, T, D>(options: TrackOptions<T, D>): Tracked<B, T, D> {
    const known = live.get(options.storageKey)
    if (known) return known as unknown as Tracked<B, T, D>
    const opened = track<B, T, D>(options)
    live.set(options.storageKey, opened as unknown as AnyTracked)
    return opened
  }

  function payout(): PayoutSubmit {
    return open({ storageKey: `${PREFIX}payout.v2`, target: PAYOUT_TARGET, isDraft: isPayoutFormDraft, onAccepted: (result) => usePayoutsStore().addAccepted(result) })
  }

  function batch(): BatchSubmit {
    return open({ storageKey: `${PREFIX}batch.v1`, target: BATCH_TARGET, isDraft: isBatchFormDraft })
  }

  function batchRetry(batchId: string): BatchRetrySubmit {
    return open({ storageKey: `${RETRY_PREFIX}${batchId}`, target: batchRetryTarget(batchId), isDraft: isBatchRetryBody })
  }

  function payoutRetry(payoutId: string): PayoutRetrySubmit {
    return open({
      storageKey: `${PREFIX}payout-retry.${payoutId}`,
      target: payoutRetryTarget(payoutId),
      isDraft: isRecord as Guard<Record<string, never>>,
      onAccepted: (result) => usePayoutsStore().replace(result),
    })
  }

  /** A page is done showing a submit. An unresolved one is kept for the next page that asks for it. */
  function release(submit: { storageKey: string; unresolved: { value: boolean }; close: () => void }): void {
    if (submit.unresolved.value) return
    submit.close()
    live.delete(submit.storageKey)
  }

  // Retries that were unresolved when the page was reloaded. Their lines must not go out in a new batch either.
  for (const key of sessionKeys(RETRY_PREFIX)) release(batchRetry(key.slice(RETRY_PREFIX.length)))

  /** The batch with a retry whose outcome is not known, if there is one. */
  const unresolvedRetryOf = computed(() => {
    const found = [...live.values()].find((submit) => submit.storageKey.startsWith(RETRY_PREFIX) && submit.unresolved.value)
    return found ? found.storageKey.slice(RETRY_PREFIX.length) : null
  })

  /** A request is on its way for some submit. */
  const busy = computed(() => [...live.values()].some((submit) => submit.busy.value))

  /** The data they were about is gone. */
  function clear(): void {
    for (const submit of live.values()) submit.close()
    live.clear()
    clearSession(PREFIX)
  }

  return { payout, batch, batchRetry, payoutRetry, release, unresolvedRetryOf, busy, clear }
})
