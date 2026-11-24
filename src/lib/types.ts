import type { CurrencyCode, Money } from './currencies'

export type PayoutStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'processing'
  | 'sent'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'returned'
  | 'cancelled'
  | 'outcome_unknown'

export const PAYOUT_STATUSES: PayoutStatus[] = [
  'draft',
  'awaiting_approval',
  'processing',
  'sent',
  'completed',
  'failed',
  'rejected',
  'returned',
  'cancelled',
  'outcome_unknown',
]

export interface Failure {
  code: string
  message: string
  retryable: boolean
  nextStep: string
}

export interface TimelineEvent {
  status: PayoutStatus
  at: string
  note?: string
}

export interface Payout {
  /** Assigned by the API, for example PO-48213. */
  id: string
  /** The operator's own reference, unique per payout. */
  reference: string
  createdAt: string
  updatedAt: string
  beneficiary: { name: string; bank: string; account: string }
  routeId: string
  source: Money
  target: Money
  /** Target units per one source unit, decimal string. */
  rate: string
  fee: Money
  status: PayoutStatus
  purposeCode: string | null
  failure: Failure | null
  /** Bank trace or on-chain hash, once the payout has been sent. */
  externalReference: string | null
  idempotencyKey: string
  correlationId: string
  timeline: TimelineEvent[]
}

export interface Quote {
  id: string
  routeId: string
  rate: string
  source: Money
  target: Money
  fee: Money
  /** Epoch milliseconds. */
  expiresAt: number
}

export interface CreatePayoutBody {
  reference: string
  beneficiary: { name: string; bank: string; account: string }
  routeId: string
  targetAmountMinor: string
  quoteId: string
  purposeCode: string | null
}

export interface PayoutListResponse {
  items: Payout[]
  asOf: string
}

export type BatchItemStatus = 'booked' | 'rejected' | 'outcome_unknown'

export interface BatchItemInput {
  /** One key per item, made in the browser. */
  itemKey: string
  reference: string
  beneficiary: { name: string; bank: string; account: string }
  routeId: string
  targetAmountMinor: string
  purposeCode: string | null
}

export interface BatchItem extends BatchItemInput {
  line: number
  target: Money
  status: BatchItemStatus
  payoutId: string | null
  failure: Failure | null
  attempts: number
}

export interface Batch {
  id: string
  createdAt: string
  idempotencyKey: string
  correlationId: string
  items: BatchItem[]
}

export interface BatchCounts {
  total: number
  booked: number
  rejected: number
  unknown: number
}

export function countBatch(batch: Pick<Batch, 'items'>): BatchCounts {
  const count = (status: BatchItemStatus) => batch.items.filter((item) => item.status === status).length
  return {
    total: batch.items.length,
    booked: count('booked'),
    rejected: count('rejected'),
    unknown: count('outcome_unknown'),
  }
}

export type { CurrencyCode, Money }
