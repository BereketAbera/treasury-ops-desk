import { delay, http, HttpResponse } from 'msw'
import { isMinorString } from '@/ds/utils/money'
import { feeFor, sourceForTarget } from '@/lib/currencies'
import { findRoute, isPurposeCode, type PayoutRoute } from '@/lib/routes'
import type { Batch, BatchItem, BatchItemInput, CreatePayoutBody, Failure, Payout, Quote } from '@/lib/types'
import { REFERENCE_PATTERN } from '@/lib/validation'
import { advance, db, resetDb, save, schedule, visiblePayouts } from './db'
import { consume, isActive } from './scenario'
import { externalReferenceFor, mulberry32 } from './seed'

// A mock of the payout API. Rules checked here are checked again on purpose:
// the browser's validation is a convenience, the API's answer is the truth.

export const QUOTE_TTL_MS = 30_000
export const SHORT_QUOTE_TTL_MS = 6_000

const random = mulberry32(Date.now() % 100_000)

function correlationOf(request: Request): string {
  return request.headers.get('X-Correlation-Id') ?? 'cor_missing'
}

function json(request: Request, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return HttpResponse.json(body as Record<string, unknown>, {
    status,
    headers: { 'X-Correlation-Id': correlationOf(request), 'Cache-Control': 'no-store', ...headers },
  })
}

function fail(
  request: Request,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return json(request, { code, message, fields, correlationId: correlationOf(request) }, status, headers)
}

async function latency(): Promise<void> {
  await delay(isActive('slow') ? 1_900 + Math.floor(random() * 400) : 120 + Math.floor(random() * 200))
}

const REJECTIONS: Record<string, Failure> = {
  rate_expired: {
    code: 'rate_expired',
    message: 'The rate expired before this item was booked.',
    retryable: true,
    nextStep: 'Retry: the item is booked at a fresh rate.',
  },
  rail_unavailable: {
    code: 'rail_unavailable',
    message: 'The payout rail for this currency did not respond.',
    retryable: true,
    nextStep: 'Retry: nothing was booked for this item.',
  },
  account_not_found: {
    code: 'account_not_found',
    message: 'The beneficiary bank does not recognise this account.',
    retryable: false,
    nextStep: 'Correct the account and upload the item in a new batch.',
  },
  validation_failed: {
    code: 'validation_failed',
    message: 'The item did not pass validation.',
    retryable: false,
    nextStep: 'Correct the item and upload it in a new batch.',
  },
}

interface PayoutInput {
  reference: string
  beneficiary: { name: string; bank: string; account: string }
  routeId: string
  targetAmountMinor: string
  purposeCode: string | null
}

type Checked = { ok: true; route: PayoutRoute; target: bigint } | { ok: false; fields: Record<string, string> }

function checkInput(input: Partial<PayoutInput>): Checked {
  const fields: Record<string, string> = {}
  const route = findRoute(String(input.routeId ?? ''))
  if (!REFERENCE_PATTERN.test(String(input.reference ?? ''))) fields.reference = 'The reference is missing or malformed.'
  if (!input.beneficiary?.name?.trim()) fields.beneficiaryName = 'The beneficiary name is required.'
  if (!input.beneficiary?.bank?.trim()) fields.bank = 'The beneficiary bank is required.'
  if (!route) {
    fields.routeId = 'This route does not exist.'
    return { ok: false, fields }
  }
  const account = String(input.beneficiary?.account ?? '')
  if (!route.account.pattern.test(account)) fields.account = `Not a valid ${route.account.label.toLowerCase()} on this route.`
  else if (/0000$/.test(account)) fields.account = REJECTIONS.account_not_found!.message

  let target = 0n
  if (!isMinorString(input.targetAmountMinor)) {
    fields.amount = 'The amount must be an integer count of minor units.'
  } else {
    target = BigInt(input.targetAmountMinor)
    if (target < route.minMinor || target > route.maxMinor) fields.amount = 'The amount is outside the limits of this route.'
    else if (target >= route.purposeThresholdMinor && !input.purposeCode) {
      fields.purposeCode = 'A purpose code is required for this amount.'
    }
  }
  if (input.purposeCode && !isPurposeCode(input.purposeCode)) fields.purposeCode = 'Unknown purpose code.'
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, route, target }
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function createPayout(
  input: PayoutInput,
  route: PayoutRoute,
  target: bigint,
  rate: string,
  meta: { idempotencyKey: string; correlationId: string; now: number },
): Payout {
  const state = db(meta.now)
  const source = sourceForTarget(target, rate, route.source, route.target)
  const at = new Date(meta.now).toISOString()
  const payout: Payout = {
    id: `PO-${state.nextPayoutNumber}`,
    reference: input.reference,
    createdAt: at,
    updatedAt: at,
    beneficiary: { ...input.beneficiary },
    routeId: route.id,
    source: { currency: route.source, amountMinor: source.toString() },
    target: { currency: route.target, amountMinor: target.toString() },
    rate,
    fee: { currency: route.source, amountMinor: feeFor(source, route.feeBasisPoints).toString() },
    status: 'processing',
    purposeCode: input.purposeCode,
    failure: null,
    externalReference: externalReferenceFor(route, random),
    idempotencyKey: meta.idempotencyKey,
    correlationId: meta.correlationId,
    timeline: [{ status: 'processing', at, note: 'Accepted by the API.' }],
  }
  state.nextPayoutNumber += 1
  state.payouts.push(payout)
  schedule(payout.id, meta.now)
  return payout
}

function referenceTaken(reference: string): boolean {
  return db().payouts.some((payout) => payout.reference === reference)
}

function makeQuote(route: PayoutRoute, target: bigint, now: number): Quote {
  const source = sourceForTarget(target, route.rate, route.source, route.target)
  const ttl = consume('short-quote') ? SHORT_QUOTE_TTL_MS : QUOTE_TTL_MS
  return {
    id: `QT-${Math.floor(100000 + random() * 900000)}`,
    routeId: route.id,
    rate: route.rate,
    source: { currency: route.source, amountMinor: source.toString() },
    target: { currency: route.target, amountMinor: target.toString() },
    fee: { currency: route.source, amountMinor: feeFor(source, route.feeBasisPoints).toString() },
    expiresAt: now + ttl,
  }
}

function bookItem(batch: Batch, item: BatchItem, now: number): void {
  const checked = checkInput(item)
  if (!checked.ok) {
    const accountProblem = checked.fields.account === REJECTIONS.account_not_found!.message
    item.status = 'rejected'
    item.failure = accountProblem
      ? REJECTIONS.account_not_found!
      : { ...REJECTIONS.validation_failed!, message: Object.values(checked.fields)[0] ?? 'The item did not pass validation.' }
    return
  }
  const payout = createPayout(item, checked.route, checked.target, checked.route.rate, {
    idempotencyKey: item.itemKey,
    correlationId: batch.correlationId,
    now,
  })
  item.status = 'booked'
  item.failure = null
  item.payoutId = payout.id
}

export const handlers = [
  http.get('/api/health', ({ request }) => json(request, { ok: true })),

  http.get('/api/payouts', async ({ request }) => {
    await latency()
    if (isActive('polling-outage')) {
      return fail(request, 503, 'service_unavailable', 'The payout list is temporarily unavailable.')
    }
    const now = Date.now()
    advance(now)
    return json(request, { items: visiblePayouts(now), asOf: new Date(now).toISOString() })
  }),

  http.post('/api/quotes', async ({ request }) => {
    await latency()
    const body = (await request.json()) as { routeId?: string; targetAmountMinor?: string }
    const route = findRoute(String(body.routeId ?? ''))
    if (!route) return fail(request, 422, 'validation_failed', 'This route does not exist.', { routeId: 'Choose a route.' })
    if (!isMinorString(body.targetAmountMinor)) {
      return fail(request, 422, 'validation_failed', 'The amount must be an integer count of minor units.', {
        amount: 'Enter a valid amount.',
      })
    }
    const target = BigInt(body.targetAmountMinor)
    if (target < route.minMinor || target > route.maxMinor) {
      return fail(request, 422, 'validation_failed', 'The amount is outside the limits of this route.', {
        amount: 'The amount is outside the limits of this route.',
      })
    }
    const now = Date.now()
    const quote = makeQuote(route, target, now)
    const state = db(now)
    state.quotes = [...state.quotes.filter((item) => item.expiresAt > now - 600_000), quote]
    save()
    return json(request, quote, 201)
  }),

  http.post('/api/payouts', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key')
    const body = (await request.json()) as Partial<CreatePayoutBody>

    // The request is lost on the way in: nothing is recorded and no answer is sent.
    if (consume('timeout-lost')) {
      await delay('infinite')
      return undefined
    }
    await latency()
    if (!key) return fail(request, 400, 'idempotency_key_required', 'Send an Idempotency-Key header with every payout.')
    if (consume('fail-503')) {
      return fail(request, 503, 'service_unavailable', 'The payout service is temporarily unavailable. Nothing was recorded.', undefined, {
        'Retry-After': '1',
      })
    }

    const now = Date.now()
    const state = db(now)
    const print = fingerprint(body)
    const known = state.keys[key]
    if (known?.payoutId) {
      if (known.fingerprint !== print) {
        return fail(request, 409, 'idempotency_key_reused', 'This idempotency key was already used for a different payout.')
      }
      const original = state.payouts.find((payout) => payout.id === known.payoutId)
      return json(request, original, 201, { 'Idempotent-Replayed': 'true' })
    }

    const checked = checkInput(body)
    if (!checked.ok) {
      return fail(request, 422, 'validation_failed', 'The payout was not accepted. Correct the marked fields.', checked.fields)
    }
    const quote = state.quotes.find((item) => item.id === body.quoteId)
    if (!quote || quote.routeId !== checked.route.id || quote.target.amountMinor !== checked.target.toString()) {
      return fail(request, 422, 'quote_mismatch', 'The rate does not belong to this route and amount. Get a new rate.')
    }
    if (quote.expiresAt <= now) {
      return fail(request, 422, 'quote_expired', 'The rate expired before the payout arrived. Refresh the rate and submit again.')
    }
    if (referenceTaken(String(body.reference))) {
      return fail(request, 409, 'duplicate_reference', `A payout with reference ${String(body.reference)} already exists.`, {
        reference: 'This reference is already used by another payout.',
      })
    }

    const payout = createPayout(body as PayoutInput, checked.route, checked.target, quote.rate, {
      idempotencyKey: key,
      correlationId: correlationOf(request),
      now,
    })
    state.keys[key] = { fingerprint: print, payoutId: payout.id }
    save()

    // The payout is recorded, but the answer is lost on the way back.
    if (consume('timeout-received')) {
      await delay('infinite')
      return undefined
    }
    return json(request, payout, 201)
  }),

  http.get('/api/idempotency-keys/:key', async ({ request, params }) => {
    await latency()
    const state = db()
    const record = state.keys[String(params.key)]
    const payout = record?.payoutId ? (state.payouts.find((item) => item.id === record.payoutId) ?? null) : null
    return json(request, { key: params.key, received: payout !== null, payout })
  }),

  http.post('/api/payouts/:id/status-check', async ({ request, params }) => {
    await latency()
    const now = Date.now()
    const state = db(now)
    const payout = state.payouts.find((item) => item.id === params.id)
    if (!payout) return fail(request, 404, 'not_found', 'No payout with this ID.')
    if (payout.status === 'outcome_unknown') {
      const at = new Date(now).toISOString()
      const route = findRoute(payout.routeId)
      payout.status = 'sent'
      payout.updatedAt = at
      payout.externalReference = route ? externalReferenceFor(route, random) : null
      payout.timeline.push({ status: 'sent', at, note: 'Status check: the rail confirms the payment was sent once.' })
      save()
    }
    return json(request, payout)
  }),

  http.post('/api/payouts/:id/retry', async ({ request, params }) => {
    await latency()
    const now = Date.now()
    const state = db(now)
    const payout = state.payouts.find((item) => item.id === params.id)
    if (!payout) return fail(request, 404, 'not_found', 'No payout with this ID.')
    if (payout.status !== 'failed' || !payout.failure?.retryable) {
      return fail(request, 409, 'not_retryable', 'This payout cannot be retried in its current state.')
    }
    const at = new Date(now).toISOString()
    payout.status = 'processing'
    payout.failure = null
    payout.updatedAt = at
    payout.timeline.push({ status: 'processing', at, note: 'Retried by an operator.' })
    schedule(payout.id, now, 0)
    save()
    return json(request, payout)
  }),

  http.get('/api/batches', async ({ request }) => {
    await latency()
    return json(request, { items: [...db().batches].reverse() })
  }),

  http.get('/api/batches/:id', async ({ request, params }) => {
    await latency()
    const batch = db().batches.find((item) => item.id === params.id)
    return batch ? json(request, batch) : fail(request, 404, 'not_found', 'No batch with this ID.')
  }),

  http.post('/api/batches', async ({ request }) => {
    await latency()
    const key = request.headers.get('Idempotency-Key')
    if (!key) return fail(request, 400, 'idempotency_key_required', 'Send an Idempotency-Key header with every batch.')
    const body = (await request.json()) as { items?: BatchItemInput[] }
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0 || items.length > 1000) {
      return fail(request, 422, 'validation_failed', 'A batch needs between 1 and 1,000 instructions.')
    }
    const now = Date.now()
    const state = db(now)
    const print = fingerprint(body)
    const known = state.keys[key]
    if (known?.batchId) {
      if (known.fingerprint !== print) {
        return fail(request, 409, 'idempotency_key_reused', 'This idempotency key was already used for a different batch.')
      }
      return json(request, state.batches.find((batch) => batch.id === known.batchId), 201, { 'Idempotent-Replayed': 'true' })
    }

    const partial = consume('partial-batch')
    const batch: Batch = {
      id: `BT-${state.nextBatchNumber}`,
      createdAt: new Date(now).toISOString(),
      idempotencyKey: key,
      correlationId: correlationOf(request),
      items: [],
    }
    state.nextBatchNumber += 1
    items.forEach((input, index) => {
      const route = findRoute(input.routeId)
      const item: BatchItem = {
        ...input,
        line: index + 1,
        target: { currency: route?.target ?? 'USD', amountMinor: isMinorString(input.targetAmountMinor) ? input.targetAmountMinor : '0' },
        status: 'booked',
        payoutId: null,
        failure: null,
        attempts: 1,
      }
      if (partial && (index === 3 || index === 8)) {
        item.status = 'rejected'
        item.failure = index === 3 ? REJECTIONS.rail_unavailable! : REJECTIONS.rate_expired!
      } else {
        bookItem(batch, item, now)
        // Booked on the API side, but the rail never confirmed it to the batch.
        if (partial && index === 6 && item.status === 'booked') item.status = 'outcome_unknown'
      }
      batch.items.push(item)
    })
    state.batches.push(batch)
    state.keys[key] = { fingerprint: print, batchId: batch.id }
    save()
    return json(request, batch, 201)
  }),

  http.post('/api/batches/:id/retry', async ({ request, params }) => {
    await latency()
    const body = (await request.json()) as { items?: { line: number; itemKey: string }[] }
    const now = Date.now()
    const batch = db(now).batches.find((item) => item.id === params.id)
    if (!batch) return fail(request, 404, 'not_found', 'No batch with this ID.')
    const requested = Array.isArray(body.items) ? body.items : []
    const retried: number[] = []
    for (const entry of requested) {
      const item = batch.items.find((candidate) => candidate.line === entry.line)
      // Only rejected items with a retryable reason are sent again. Booked items are never touched.
      if (!item || item.status !== 'rejected' || !item.failure?.retryable) continue
      item.itemKey = entry.itemKey
      item.attempts += 1
      bookItem(batch, item, now)
      retried.push(item.line)
    }
    save()
    return json(request, { batch, retried })
  }),

  http.post('/api/batches/:id/items/:line/status-check', async ({ request, params }) => {
    await latency()
    const batch = db().batches.find((item) => item.id === params.id)
    const item = batch?.items.find((candidate) => candidate.line === Number(params.line))
    if (!batch || !item) return fail(request, 404, 'not_found', 'No such batch item.')
    if (item.status === 'outcome_unknown') {
      item.status = item.payoutId ? 'booked' : 'rejected'
      save()
    }
    return json(request, { batch, line: item.line, received: item.payoutId !== null })
  }),

  http.post('/api/demo/reset', async ({ request }) => {
    await latency()
    resetDb(Date.now())
    return json(request, { ok: true })
  }),
]
