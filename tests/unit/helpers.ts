import type { Payout } from '@/lib/types'

export interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export interface Reply {
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** Never answer: wait for the abort signal. */
  hang?: boolean
  /** Reject like a dropped connection. */
  drop?: boolean
}

/** A fetch stand-in that records each call and answers from a queue. */
export function fakeFetch(replies: Reply[] | ((call: Call, index: number) => Reply)) {
  const calls: Call[] = []
  const fetchImpl = ((url: string, init: RequestInit = {}) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    const index = calls.length
    calls.push(call)
    const reply = typeof replies === 'function' ? replies(call, index) : (replies[index] ?? { status: 500 })
    if (reply.hang) {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }
    if (reply.drop) return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve({
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      headers: new Headers({ 'Content-Type': 'application/json', ...reply.headers }),
      json: async () => reply.body ?? {},
    })
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}

export function samplePayout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'PO-48261',
    reference: 'INV-30001',
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
    beneficiary: { name: 'Adaeze Okonkwo Supplies', bank: 'Quayside Trust Bank', account: '0123456781' },
    routeId: 'USDC-NGN',
    source: { currency: 'USDC', amountMinor: '1548232172' },
    target: { currency: 'NGN', amountMinor: '245000000' },
    rate: '1582.45',
    fee: { currency: 'USDC', amountMinor: '6192929' },
    status: 'processing',
    purposeCode: null,
    failure: null,
    externalReference: null,
    idempotencyKey: 'key-1',
    correlationId: 'cor_1',
    timeline: [{ status: 'processing', at: '2026-11-24T10:00:00.000Z' }],
    ...overrides,
  }
}

export const sampleBody = {
  reference: 'INV-30001',
  beneficiary: { name: 'Adaeze Okonkwo Supplies', bank: 'Quayside Trust Bank', account: '0123456781' },
  routeId: 'USDC-NGN',
  targetAmountMinor: '245000000',
  quoteId: 'QT-100001',
  purposeCode: null,
}
